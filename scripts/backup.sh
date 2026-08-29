#!/usr/bin/env bash
# Nightly backup for the production Postgres database.
#
# Usage (run from the repo root on the droplet, where docker-compose.prod.yml
# lives):
#   ./scripts/backup.sh
#
# Suggested cron line (runs at 02:15 server time / UTC every night - see
# docs/DEPLOY.md for why the server clock being UTC doesn't matter here):
#   15 2 * * * cd /opt/helpinghands && ./scripts/backup.sh >> /var/log/helpinghands-backup.log 2>&1
#
# What it does:
#   1. pg_dump's the `db` service (via `docker compose exec`, over the
#      container's local socket - no password needed, matching how the
#      official postgres image's pg_hba.conf trusts local connections).
#   2. Gzips it into ./backups/helping_hands-<UTC timestamp>.sql.gz
#   3. Deletes backups older than 14 days.
#
# NOTE: the design spec also asks for uploaded files to be included in the
# backup routine. As of this deployment, file attachment storage
# (STORAGE_DRIVER/STORAGE_LOCAL_PATH) is not wired up anywhere in the
# application code (src/ has no reference to it) - there is nothing to back
# up yet. If/when that ships, extend this script to also tar the storage
# directory into the same backups/ folder.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
BACKUP_DIR="./backups"
RETENTION_DAYS=14
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/helping_hands-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping database to ${OUT_FILE}..."
$COMPOSE exec -T db pg_dump -U helping --no-owner --format=plain helping_hands | gzip > "$OUT_FILE"

# Sanity check: a truncated/empty dump is worse than no backup at all
# because it can silently satisfy "a backup file exists" while being
# useless - fail loudly instead.
if [ ! -s "$OUT_FILE" ]; then
  echo "[backup] ERROR: ${OUT_FILE} is empty, removing it" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

echo "[backup] wrote $(du -h "$OUT_FILE" | cut -f1) to ${OUT_FILE}"

echo "[backup] pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name 'helping_hands-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "[backup] done."
