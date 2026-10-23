#!/usr/bin/env bash
# Deploys the frontend's production build to S3 + CloudFront.
#
# There is no CI/CD for this - deploys are triggered manually by running this script.
# Never uses --delete on the live bucket: nothing currently live is removed as a side effect
# of a sync, so a bad deploy can't accidentally prune a file a rollback would need.
# /assets/ filenames are content-hashed by Vite (e.g. Dashboard-QFAQtO-6.js), so they're
# safe to cache for a year; index.html/sw.js/manifest.webmanifest are the three files a
# client actually re-fetches to discover a new deploy, so they must never be cached.
#
# Usage: ./deploy-frontend.sh [--dry-run]
#   --dry-run   Print what would happen. Every AWS write becomes a read-only --dryrun call
#               (sync/cp support this natively); the CloudFront invalidation and the
#               post-deploy header check are skipped entirely, since nothing was deployed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$FRONTEND_DIR/.." && pwd)"
DIST_DIR="$FRONTEND_DIR/dist"

BUCKET="lifeos-frontend-dev-593110023904"
DISTRIBUTION_ID="E39P84TZAUU8DG"
CLOUDFRONT_DOMAIN="d1t6ezlql25na7.cloudfront.net"
REGION="ap-southeast-2"
BACKUP_ROOT="$HOME/lifeos-backups"
DEPLOY_LOG="$BACKUP_ROOT/deploy-log.txt"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Unknown argument: '$arg'. Usage: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

# Wraps an `aws` call so --dry-run turns every s3 sync/cp into the AWS CLI's own read-only
# --dryrun simulation, without duplicating every command in an if/else.
run_aws() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "    + aws $* --dryrun"
    aws "$@" --dryrun
  else
    echo "    + aws $*"
    aws "$@"
  fi
}

echo "==> [0/7] Checking caller identity and git state..."
CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
echo "    Caller: $CALLER_ARN"
if [[ "$CALLER_ARN" == *:root ]]; then
  if [[ "${ALLOW_ROOT_DEPLOY:-}" != "1" ]]; then
    echo "ERROR: refusing to deploy as the AWS account root user ($CALLER_ARN)." >&2
    echo "       Use an IAM user or role instead - root should never run day-to-day operations." >&2
    echo "       To deliberately deploy as root anyway, run with ALLOW_ROOT_DEPLOY=1." >&2
    exit 1
  fi
  echo "WARNING: deploying as the AWS account root user ($CALLER_ARN) because ALLOW_ROOT_DEPLOY=1 is set." >&2
fi

CURRENT_BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "ERROR: refusing to deploy - current branch is '$CURRENT_BRANCH', not 'main'." >&2
  exit 1
fi
if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
  echo "ERROR: refusing to deploy - working tree is not clean. Commit or stash first:" >&2
  git -C "$REPO_DIR" status --short >&2
  exit 1
fi
GIT_SHORT_HASH="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo "    Branch 'main', working tree clean (at $GIT_SHORT_HASH)."

# Appends one line per call to the deploy log. Only ever called on a real (non-dry) run.
append_deploy_log() {
  mkdir -p "$BACKUP_ROOT"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)  $GIT_SHORT_HASH  $CALLER_ARN  backup=$BACKUP_DIR  $*" >> "$DEPLOY_LOG"
}

echo
echo "LifeOs frontend deploy$( [[ "$DRY_RUN" == true ]] && echo " (DRY RUN - no writes will be made)" )"
echo "  Source:       $FRONTEND_DIR"
echo "  Bucket:       s3://$BUCKET"
echo "  Distribution: $DISTRIBUTION_ID"
echo "  Region:       $REGION"
echo
if [[ "$DRY_RUN" != true ]]; then
  read -r -p "Build and deploy now? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted - nothing was built or uploaded."
    exit 1
  fi
fi

echo
echo "==> [1/7] Backing up the current live bucket..."
if [[ "$DRY_RUN" == true ]]; then
  echo "    (dry run) would back up s3://$BUCKET to $BACKUP_ROOT/s3-backup-<timestamp>/ and verify it"
else
  BACKUP_DIR="$BACKUP_ROOT/s3-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  aws s3 sync "s3://$BUCKET/" "$BACKUP_DIR/" --region "$REGION"

  echo "    Verifying backup against the live bucket..."
  # Per-object sizes are listed and totalled with awk across ALL pages. A JMESPath length() or
  # sum() would return one value PER PAGE, silently undercounting any bucket spanning more
  # than one page. Keys ending in "/" are S3 folder placeholders that `s3 sync` never
  # downloads, so they're excluded.
  # shellcheck disable=SC2016
  BUCKET_TOTALS="$(aws s3api list-objects-v2 --bucket "$BUCKET" --region "$REGION" \
    --query 'Contents[?!ends_with(Key, `/`)].Size' --output text \
    | awk '$0!="None"{for(i=1;i<=NF;i++){if($i!="None"){n++; s+=$i}}} END{print n+0, s+0}')"
  BUCKET_COUNT="${BUCKET_TOTALS%% *}"
  BUCKET_BYTES="${BUCKET_TOTALS##* }"
  BACKUP_COUNT="$(find "$BACKUP_DIR" -type f | wc -l | tr -d ' ')"
  BACKUP_BYTES="$(find "$BACKUP_DIR" -type f -exec stat -f%z {} \; | awk '{sum+=$1} END {print sum+0}')"

  echo "    Bucket: $BUCKET_COUNT objects, $BUCKET_BYTES bytes"
  echo "    Backup: $BACKUP_COUNT objects, $BACKUP_BYTES bytes"

  if [[ "$BUCKET_COUNT" != "$BACKUP_COUNT" || "$BUCKET_BYTES" != "$BACKUP_BYTES" ]]; then
    echo "ERROR: backup verification failed - object/byte count does not match the live bucket." >&2
    echo "       Aborting before any upload. Nothing live has been touched." >&2
    exit 1
  fi
  for required in index.html sw.js manifest.webmanifest assets; do
    if [[ ! -e "$BACKUP_DIR/$required" ]]; then
      echo "ERROR: backup verification failed - '$required' is missing from $BACKUP_DIR." >&2
      exit 1
    fi
  done
  if [[ -z "$(ls -A "$BACKUP_DIR/assets" 2>/dev/null)" ]]; then
    echo "ERROR: backup verification failed - '$BACKUP_DIR/assets' is empty." >&2
    exit 1
  fi

  echo "    Writing checksum manifest..."
  (cd "$BACKUP_DIR" && find . -type f ! -name "SHA256SUMS" -exec shasum -a 256 {} \; > SHA256SUMS)

  echo "    Backup verified OK: $BACKUP_DIR"
fi

echo
echo "==> [2/7] Building production bundle..."
(cd "$FRONTEND_DIR" && npm run build)
if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "ERROR: build did not produce $DIST_DIR/index.html." >&2
  exit 1
fi
echo "    Build OK: $DIST_DIR/index.html exists."

echo
echo "==> [3/7] Syncing /assets/ (content-hashed filenames - safe to cache for a year)..."
run_aws s3 sync "$DIST_DIR/assets/" "s3://$BUCKET/assets/" \
  --region "$REGION" \
  --cache-control "max-age=31536000,immutable"

echo
echo "==> [4/7] Syncing everything else except /assets/ and the three no-cache files..."
run_aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --region "$REGION" \
  --exclude "assets/*" \
  --exclude "index.html" \
  --exclude "sw.js" \
  --exclude "manifest.webmanifest"

echo "    Uploading index.html, sw.js, manifest.webmanifest with Cache-Control: no-cache..."
run_aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/html"
run_aws s3 cp "$DIST_DIR/sw.js" "s3://$BUCKET/sw.js" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/javascript"
run_aws s3 cp "$DIST_DIR/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "application/manifest+json"

echo
if [[ "$DRY_RUN" == true ]]; then
  echo "==> [5/7] (dry run) would create a CloudFront invalidation for /* and wait for it to complete"
else
  echo "==> [5/7] Creating CloudFront invalidation (/*)..."
  INVALIDATION_ID="$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --region "$REGION" \
    --query 'Invalidation.Id' \
    --output text)"
  echo "    Invalidation $INVALIDATION_ID created - waiting for completion..."
  aws cloudfront wait invalidation-completed \
    --distribution-id "$DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID" \
    --region "$REGION"
  echo "    Invalidation completed."
  append_deploy_log status=deployed
fi

echo
if [[ "$DRY_RUN" == true ]]; then
  echo "==> [6/7] (dry run) would verify live Cache-Control headers and bundle hash"
else
  echo "==> [6/7] Verifying live Cache-Control headers..."
  HEADER_CHECK_FAILED=false
  check_header() {
    local path="$1" expected="$2" actual
    actual="$(curl -sI "https://$CLOUDFRONT_DOMAIN/$path" | grep -i '^cache-control:' | tr -d '\r' | cut -d' ' -f2- || true)"
    if [[ "$actual" != "$expected" ]]; then
      echo "    FAIL: /$path - expected Cache-Control '$expected', got '${actual:-<none>}'" >&2
      HEADER_CHECK_FAILED=true
    else
      echo "    OK:   /$path -> $actual"
    fi
  }
  check_header "index.html" "no-cache"
  check_header "sw.js" "no-cache"
  check_header "manifest.webmanifest" "no-cache"

  SAMPLE_ASSET="$(curl -s "https://$CLOUDFRONT_DOMAIN/index.html" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
  if [[ -n "$SAMPLE_ASSET" ]]; then
    check_header "$SAMPLE_ASSET" "max-age=31536000,immutable"
  else
    echo "    WARNING: could not find a sample asset reference in the live index.html to check." >&2
  fi

  if [[ "$HEADER_CHECK_FAILED" == true ]]; then
    echo "ERROR: one or more live Cache-Control headers are wrong after deploy." >&2
  fi

  echo
  echo "==> [7/7] Comparing bundle hash (live vs. local build)..."
  LIVE_BUNDLE="$(curl -s "https://$CLOUDFRONT_DOMAIN/index.html" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
  LOCAL_BUNDLE="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$DIST_DIR/index.html" | head -1 || true)"
  echo "    Live:  ${LIVE_BUNDLE:-<not found>}"
  echo "    Local: ${LOCAL_BUNDLE:-<not found>}"
  BUNDLE_MISMATCH=false
  if [[ "$LIVE_BUNDLE" != "$LOCAL_BUNDLE" ]]; then
    echo "ERROR: live bundle hash does not match the local build." >&2
    BUNDLE_MISMATCH=true
  fi

  if [[ "$HEADER_CHECK_FAILED" == true || "$BUNDLE_MISMATCH" == true ]]; then
    append_deploy_log verified=FAILED
    echo "ERROR: post-deploy verification failed (see above). The new build is already live -" >&2
    echo "       roll back with rollback-frontend.sh if it needs undoing." >&2
    exit 1
  fi
  append_deploy_log verified=ok
fi

echo
VERSIONING_STATUS="$(aws s3api get-bucket-versioning --bucket "$BUCKET" --region "$REGION" --query 'Status' --output text 2>/dev/null || echo "None")"
if [[ "$VERSIONING_STATUS" != "Enabled" ]]; then
  echo "WARNING: S3 versioning is not enabled on $BUCKET (status: $VERSIONING_STATUS)." >&2
  echo "         This script's own backup step is your only protection without it." >&2
fi

echo
echo "Deploy complete. Verify at https://$CLOUDFRONT_DOMAIN"
