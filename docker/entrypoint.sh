#!/bin/sh
# Container entrypoint for the `app` service.
#
# Prisma 7 no longer runs `generate` or the seed automatically after
# `migrate deploy`, so this script does both explicitly, in order, before
# the server starts accepting traffic:
#
#   1. prisma migrate deploy   - applies any pending schema migrations.
#   2. docker/seed.mjs         - idempotently ensures the OrgSettings
#                                 singleton and the "Anonymous" contributor
#                                 exist. createContribution() reads the
#                                 OrgSettings row, so the app is broken
#                                 without it.
#   3. exec node server.js     - hands off PID 1 to the Next.js server.
#
# This runs on every container start (not just the first), which is
# intentional: `prisma migrate deploy` and the seed's upserts are both
# idempotent, so re-running them on a restart is a no-op when there is
# nothing new to do, and guarantees a schema change is never left
# unapplied after a redeploy or a host reboot.
set -eu

echo "[entrypoint] running database migrations..."
./node_modules/.bin/prisma migrate deploy --config prisma.config.ts

echo "[entrypoint] applying seed data (idempotent)..."
node docker/seed.mjs

echo "[entrypoint] starting server..."
exec node server.js
