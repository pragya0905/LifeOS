#!/usr/bin/env bash
# Restores a previous local S3 backup (as produced by deploy-frontend.sh's own backup step,
# or by `aws s3 sync s3://<bucket>/ <dir>/`).
#
# Restores in the SAME three passes deploy-frontend.sh uploads in - assets/ with a one-year
# immutable Cache-Control, everything else with no explicit header, then index.html/sw.js/
# manifest.webmanifest last with Cache-Control: no-cache - because a plain file backup only
# has bytes, not S3 object metadata. A raw recursive copy would silently lose the
# Cache-Control split this app depends on to let clients discover a new deploy quickly while
# still caching hashed assets forever.
#
# Deliberately uses `aws s3 cp --recursive` for every pass, never `aws s3 sync`: sync skips a
# file whose size matches the destination and whose local mtime is not newer than the
# destination's LastModified - exactly the rollback scenario, since the backup is OLDER than
# what's currently live. `cp --recursive` has no such skip logic; it unconditionally
# overwrites every object every time.
#
# Usage: ./rollback-frontend.sh [--dry-run] <backup-dir>
set -euo pipefail

BUCKET="lifeos-frontend-dev-593110023904"
DISTRIBUTION_ID="E39P84TZAUU8DG"
CLOUDFRONT_DOMAIN="d1t6ezlql25na7.cloudfront.net"
REGION="ap-southeast-2"
BACKUP_ROOT="$HOME/lifeos-backups"

DRY_RUN=false
BACKUP_DIR=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    -*)
      echo "Unknown flag: '$arg'." >&2
      exit 1
      ;;
    *)
      if [[ -n "$BACKUP_DIR" ]]; then
        echo "Usage: $0 [--dry-run] <backup-dir>" >&2
        exit 1
      fi
      BACKUP_DIR="$arg"
      ;;
  esac
done

if [[ -z "$BACKUP_DIR" ]]; then
  echo "Usage: $0 [--dry-run] <backup-dir>" >&2
  echo "  <backup-dir> is a local directory previously downloaded via:" >&2
  echo "    aws s3 sync s3://$BUCKET/ <backup-dir>/ --region $REGION" >&2
  exit 1
fi

run_aws() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "    + aws $* --dryrun"
    aws "$@" --dryrun
  else
    echo "    + aws $*"
    aws "$@"
  fi
}

echo "==> [0/5] Checking caller identity and the backup directory..."
CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
echo "    Caller: $CALLER_ARN"
if [[ "$CALLER_ARN" == *:root ]]; then
  echo "ERROR: refusing to roll back as the AWS account root user ($CALLER_ARN)." >&2
  echo "       Use an IAM user or role instead." >&2
  exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "ERROR: '$BACKUP_DIR' is not a directory." >&2
  exit 1
fi
if [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
  echo "ERROR: '$BACKUP_DIR' is empty." >&2
  exit 1
fi
for required in index.html sw.js assets; do
  if [[ ! -e "$BACKUP_DIR/$required" ]]; then
    echo "ERROR: '$BACKUP_DIR' is missing '$required' - this doesn't look like a valid frontend backup." >&2
    exit 1
  fi
done
echo "    Backup directory looks valid: $BACKUP_DIR"

echo
echo "LifeOs frontend rollback$( [[ "$DRY_RUN" == true ]] && echo " (DRY RUN - no writes will be made)" )"
echo "  Restoring from: $BACKUP_DIR"
echo "  Bucket:          s3://$BUCKET"
echo "  Distribution:    $DISTRIBUTION_ID"
echo "  Region:          $REGION"
echo
if [[ "$DRY_RUN" != true ]]; then
  read -r -p "Overwrite the live bucket with this backup now? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted - nothing was uploaded."
    exit 1
  fi
fi

echo
echo "==> [1/5] Backing up the CURRENT live state before restoring over it..."
if [[ "$DRY_RUN" == true ]]; then
  echo "    (dry run) would back up s3://$BUCKET to $BACKUP_ROOT/s3-backup-<timestamp>/ and verify it"
else
  PRE_ROLLBACK_BACKUP_DIR="$BACKUP_ROOT/s3-backup-$(date +%Y%m%d-%H%M%S)-pre-rollback"
  mkdir -p "$PRE_ROLLBACK_BACKUP_DIR"
  aws s3 sync "s3://$BUCKET/" "$PRE_ROLLBACK_BACKUP_DIR/" --region "$REGION"

  BUCKET_SUMMARY="$(aws s3 ls "s3://$BUCKET" --recursive --summarize --region "$REGION")"
  BUCKET_COUNT="$(echo "$BUCKET_SUMMARY" | grep 'Total Objects:' | awk '{print $NF}')"
  BUCKET_BYTES="$(echo "$BUCKET_SUMMARY" | grep 'Total Size:' | awk '{print $NF}')"
  SNAPSHOT_COUNT="$(find "$PRE_ROLLBACK_BACKUP_DIR" -type f | wc -l | tr -d ' ')"
  SNAPSHOT_BYTES="$(find "$PRE_ROLLBACK_BACKUP_DIR" -type f -exec stat -f%z {} \; | awk '{sum+=$1} END {print sum+0}')"

  echo "    Bucket:   $BUCKET_COUNT objects, $BUCKET_BYTES bytes"
  echo "    Snapshot: $SNAPSHOT_COUNT objects, $SNAPSHOT_BYTES bytes"

  if [[ "$BUCKET_COUNT" != "$SNAPSHOT_COUNT" || "$BUCKET_BYTES" != "$SNAPSHOT_BYTES" ]]; then
    echo "ERROR: pre-rollback backup verification failed - object/byte count mismatch." >&2
    echo "       Aborting before any restore. Nothing live has been touched." >&2
    exit 1
  fi
  for required in index.html sw.js manifest.webmanifest assets; do
    if [[ ! -e "$PRE_ROLLBACK_BACKUP_DIR/$required" ]]; then
      echo "ERROR: pre-rollback backup verification failed - '$required' is missing." >&2
      exit 1
    fi
  done
  echo "    Pre-rollback snapshot verified OK: $PRE_ROLLBACK_BACKUP_DIR"
fi

echo
echo "==> [2/5] Restoring /assets/ (immutable, one-year cache)..."
run_aws s3 cp "$BACKUP_DIR/assets/" "s3://$BUCKET/assets/" \
  --recursive \
  --region "$REGION" \
  --cache-control "max-age=31536000,immutable"

echo
echo "==> [3/5] Restoring everything else except /assets/ and the three no-cache files..."
run_aws s3 cp "$BACKUP_DIR/" "s3://$BUCKET/" \
  --recursive \
  --region "$REGION" \
  --exclude "assets/*" \
  --exclude "index.html" \
  --exclude "sw.js" \
  --exclude "manifest.webmanifest"

echo "    Restoring index.html, sw.js, manifest.webmanifest with Cache-Control: no-cache..."
run_aws s3 cp "$BACKUP_DIR/index.html" "s3://$BUCKET/index.html" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/html"
run_aws s3 cp "$BACKUP_DIR/sw.js" "s3://$BUCKET/sw.js" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/javascript"
if [[ -f "$BACKUP_DIR/manifest.webmanifest" ]]; then
  run_aws s3 cp "$BACKUP_DIR/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
    --region "$REGION" \
    --cache-control "no-cache" \
    --content-type "application/manifest+json"
else
  echo "    WARNING: '$BACKUP_DIR/manifest.webmanifest' not found - skipped." >&2
fi

echo
if [[ "$DRY_RUN" == true ]]; then
  echo "==> [4/5] (dry run) would create a CloudFront invalidation for /* and wait for it to complete"
else
  echo "==> [4/5] Creating CloudFront invalidation (/*)..."
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
fi

echo
if [[ "$DRY_RUN" == true ]]; then
  echo "==> [5/5] (dry run) would verify live Cache-Control headers"
else
  echo "==> [5/5] Verifying live Cache-Control headers..."
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
    echo "ERROR: one or more live Cache-Control headers are wrong after rollback." >&2
    exit 1
  fi
fi

echo
echo "Rollback complete. Verify at https://$CLOUDFRONT_DOMAIN"
echo "(The pre-rollback live state was itself backed up above, in case this needs undoing too.)"
