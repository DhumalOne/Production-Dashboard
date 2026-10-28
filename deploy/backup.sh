#!/usr/bin/env bash
# Nightly database backup (scheduled by server-setup.sh). Keeps 14 days on the server and, when
# BACKUP_UPLOAD_URL is set in .env (an Oracle Object Storage pre-authenticated request URL ending in "/"),
# also uploads each backup off the server.   bash deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; set +a
mkdir -p backups

file="backups/dhumal-$(date +%Y-%m-%d).dump"
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$file.part"
mv "$file.part" "$file"
echo "$(date '+%F %T') backup $file $(du -h "$file" | cut -f1)"

if [ -n "${BACKUP_UPLOAD_URL:-}" ]; then
  curl -fsS -X PUT --upload-file "$file" "${BACKUP_UPLOAD_URL}$(basename "$file")" && echo "uploaded off-server"
fi
find backups -name 'dhumal-*.dump' -mtime +14 -delete
