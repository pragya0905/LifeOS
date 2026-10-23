#!/usr/bin/env bash
# Restores a previous local S3 backup (see deploy-frontend.sh's header for why rollback is
# needed: deploys use --sync without --delete, so nothing is pruned, but a bad deploy's new
# object versions still need reverting).
#
# Deliberately uses `aws s3 cp --recursive`, NOT `aws s3 sync`: sync skips a file whose size
# matches the destination and whose local mtime is not newer than the destination's
# LastModified — which is exactly the rollback case (the backup is OLDER than what's
# currently live). If a rolled-back file happens to match the live file's byte size, sync
# would silently skip it and leave the bad content live. `cp --recursive` has no such skip
# logic — it unconditionally overwrites every object.
set -euo pipefail

BUCKET="lifeos-frontend-dev-593110023904"
DISTRIBUTION_ID="E39P84TZAUU8DG"
REGION="ap-southeast-2"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-dir>" >&2
  echo "  <backup-dir> is a local directory previously downloaded via:" >&2
  echo "    aws s3 sync s3://$BUCKET/ <backup-dir>/ --region $REGION" >&2
  exit 1
fi

BACKUP_DIR="$1"
if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Error: '$BACKUP_DIR' is not a directory." >&2
  exit 1
fi

echo "LifeOs frontend rollback"
echo "  Restoring from: $BACKUP_DIR"
echo "  Bucket:          s3://$BUCKET"
echo "  Distribution:    $DISTRIBUTION_ID"
echo "  Region:          $REGION"
echo
read -r -p "Overwrite the live bucket with this backup now? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted — nothing was uploaded."
  exit 1
fi

echo
echo "==> [1/2] Restoring all objects from backup (unconditional overwrite)..."
aws s3 cp "$BACKUP_DIR/" "s3://$BUCKET/" \
  --recursive \
  --region "$REGION"

echo
echo "==> [2/2] Creating CloudFront invalidation (/*)..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region "$REGION"

echo
echo "Rollback complete. Verify at https://d1t6ezlql25na7.cloudfront.net"
