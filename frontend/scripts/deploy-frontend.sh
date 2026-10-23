#!/usr/bin/env bash
# Deploys the frontend's production build to S3 + CloudFront.
#
# There is no CI/CD for this — deploys are triggered manually by running this script.
# Never uses --delete: nothing currently live is removed as a side effect of a sync, so a
# bad deploy can't accidentally wipe files a rollback would need. /assets/ filenames are
# content-hashed by Vite (e.g. Dashboard-QFAQtO-6.js), so they're safe to cache forever;
# index.html/sw.js/manifest.webmanifest are the three files a client actually re-fetches to
# discover a new deploy, so they must never be cached — see docs/ARCHITECTURE.md's
# "Deployment" section and the Cache-Control audit that prompted this script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$FRONTEND_DIR/dist"

BUCKET="lifeos-frontend-dev-593110023904"
DISTRIBUTION_ID="E39P84TZAUU8DG"
REGION="ap-southeast-2"

echo "LifeOs frontend deploy"
echo "  Source:       $FRONTEND_DIR"
echo "  Bucket:       s3://$BUCKET"
echo "  Distribution: $DISTRIBUTION_ID"
echo "  Region:       $REGION"
echo
read -r -p "Build and deploy now? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted — nothing was built or uploaded."
  exit 1
fi

echo
echo "==> [1/4] Building production bundle..."
(cd "$FRONTEND_DIR" && npm run build)

echo
echo "==> [2/4] Syncing /assets/ (content-hashed filenames — safe to cache for a year)..."
aws s3 sync "$DIST_DIR/assets/" "s3://$BUCKET/assets/" \
  --region "$REGION" \
  --cache-control "max-age=31536000,immutable"

echo
echo "==> [3/4] Syncing everything else except /assets/ and the three no-cache files..."
aws s3 sync "$DIST_DIR/" "s3://$BUCKET/" \
  --region "$REGION" \
  --exclude "assets/*" \
  --exclude "index.html" \
  --exclude "sw.js" \
  --exclude "manifest.webmanifest"

echo "    Uploading index.html, sw.js, manifest.webmanifest with Cache-Control: no-cache..."
aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/html"
aws s3 cp "$DIST_DIR/sw.js" "s3://$BUCKET/sw.js" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "text/javascript"
aws s3 cp "$DIST_DIR/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
  --region "$REGION" \
  --cache-control "no-cache" \
  --content-type "application/manifest+json"

echo
echo "==> [4/4] Creating CloudFront invalidation (/*)..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region "$REGION"

echo
echo "Deploy complete. Verify at https://d1t6ezlql25na7.cloudfront.net"
