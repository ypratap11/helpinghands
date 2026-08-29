#!/usr/bin/env bash
# One-command restore of a backup produced by scripts/backup.sh.
#
# Usage (run from the repo root on the droplet):
#   ./scripts/restore.sh backups/helping_hands-20260828-021500.sql.gz
#
# This DROPS AND RECREATES the `helping_hands` database before loading the
# dump, so it starts from a clean slate rather than merging on top of
# whatever is currently there. The `app` container is stopped first so
# nothing can write to the database mid-restore, and started again
# afterwards (which re-runs `prisma migrate deploy`, a no-op if the restored
# dump is already at the latest schema version, and the idempotent seed).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-backup.sql.gz>" >&2
  exit 1
fi

DUMP_FILE="$1"
if [ ! -f "$DUMP_FILE" ]; then
  echo "[restore] ERROR: ${DUMP_FILE} not found" >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "[restore] this will REPLACE the current helping_hands database with the contents of ${DUMP_FILE}."
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "[restore] aborted."
  exit 1
fi

echo "[restore] stopping app so nothing writes during restore..."
$COMPOSE stop app

echo "[restore] dropping and recreating helping_hands..."
$COMPOSE exec -T db psql -U helping -d postgres -c "DROP DATABASE IF EXISTS helping_hands;"
$COMPOSE exec -T db psql -U helping -d postgres -c "CREATE DATABASE helping_hands OWNER helping;"

echo "[restore] loading dump..."
gunzip -c "$DUMP_FILE" | $COMPOSE exec -T db psql -U helping -d helping_hands

echo "[restore] starting app again (this re-applies migrations, a no-op if the dump is already current, and the idempotent seed)..."
$COMPOSE up -d app

echo "[restore] done. Check 'docker compose -f docker-compose.prod.yml logs -f app' to confirm it came up cleanly."
