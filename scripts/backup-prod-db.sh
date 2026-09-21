#!/usr/bin/env bash
# Daily production Postgres backup -> private Backblaze B2 bucket.
#
# WHY a separate private bucket: the media bucket (campushomes-media-production)
# is public-read, so a DB dump placed there would be publicly downloadable.
# Backups MUST land in a private bucket with its own scoped key.
#
# Install on the VPS (host writes, run as festo):
#   cp scripts/backup-prod-db.sh /home/festo/backup-prod-db.sh && chmod +x /home/festo/backup-prod-db.sh
#   install -m600 /dev/null /home/festo/.campushomes-backup.env   # then fill the 4 vars below
#   ( crontab -l 2>/dev/null; echo '30 2 * * * /home/festo/backup-prod-db.sh >> /home/festo/backup-prod-db.log 2>&1' ) | crontab -
#
# /home/festo/.campushomes-backup.env (chmod 600) supplies:
#   B2_BACKUP_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
#   B2_BACKUP_BUCKET=campushomes-db-backups
#   B2_BACKUP_KEY_ID=...
#   B2_BACKUP_APP_KEY=...
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/home/festo/.campushomes-backup.env}"
PG_CONTAINER="${PG_CONTAINER:-campushomes-postgres-production-postgres-1}"
LOCAL_DIR="${LOCAL_DIR:-/home/festo/backups/prod}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

# shellcheck source=/dev/null
source "$ENV_FILE"

mkdir -p "$LOCAL_DIR"
ts=$(date +%Y%m%d-%H%M%S)
file="$LOCAL_DIR/campushomes-${ts}.dump"

# 1. Dump (custom format) straight out of the container. Local-socket trust auth,
#    so no password; superuser reads every table.
docker exec "$PG_CONTAINER" pg_dump -U campushomes -d campushomes -Fc > "$file"

# 2. Structural restore-verify: a corrupt/truncated dump fails here, not at 3am
#    during a real restore.
docker exec -i "$PG_CONTAINER" pg_restore --list < "$file" > /dev/null

size=$(stat -c%s "$file")
[ "$size" -gt 10000 ] || { echo "$(date -Is) FAIL dump too small (${size} bytes)"; exit 1; }

# 3. Upload to the PRIVATE backup bucket. B2 is S3-compatible; a throwaway
#    aws-cli container means no host tooling to install/patch.
docker run --rm \
  -e AWS_ACCESS_KEY_ID="$B2_BACKUP_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$B2_BACKUP_APP_KEY" \
  -e AWS_DEFAULT_REGION="${B2_BACKUP_REGION:-eu-central-003}" \
  -v "$LOCAL_DIR:/data:ro" \
  amazon/aws-cli:latest \
  s3 cp "/data/$(basename "$file")" "s3://${B2_BACKUP_BUCKET}/$(basename "$file")" \
  --endpoint-url "$B2_BACKUP_ENDPOINT"

# 4. Prune local dumps past retention. Remote retention is a B2 lifecycle rule
#    on the bucket (native feature beats a delete loop here).
find "$LOCAL_DIR" -name 'campushomes-*.dump' -mtime +"$RETAIN_DAYS" -delete

echo "$(date -Is) OK $(basename "$file") ${size} bytes -> b2:${B2_BACKUP_BUCKET}"
