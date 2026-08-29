# Deploying Helping Hands

This is the runbook for running Helping Hands in production on the
DigitalOcean droplet at `146.190.39.48`, served at
`https://helpinghands.augaster.com`. It assumes nothing about what you
already know beyond basic Linux/Docker familiarity.

See `docs/superpowers/specs/2026-08-28-helping-hands-design.md` section 11
for the design rationale behind this setup (why a real domain is required,
why Cloudflare must be DNS-only, etc).

## 1. What's on the droplet

Three containers, defined in `docker-compose.prod.yml`:

- **db** - Postgres 16, data in a named Docker volume, not reachable from
  outside the Docker network (no published port).
- **app** - the Next.js application, built from the `Dockerfile` in this
  repo. On every start it runs pending Prisma migrations and an idempotent
  seed before it starts serving traffic (see `docker/entrypoint.sh`).
- **caddy** - reverse proxy that terminates TLS for
  `helpinghands.augaster.com` and gets its certificate automatically from
  Let's Encrypt.

## 2. One-time droplet setup

SSH into the droplet as a user with sudo access, then:

```bash
sudo apt update && sudo apt upgrade -y

# Docker Engine + Compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in for the group change to take effect, or use `sudo`
# for the docker/docker-compose commands below

# Firewall: allow SSH, HTTP (for the ACME challenge), and HTTPS
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Confirm the domain actually resolves to this droplet before going further
(it should already, per the design spec - the A record is DNS-only, not
proxied through Cloudflare):

```bash
dig +short helpinghands.augaster.com
# must print 146.190.39.48
```

If Cloudflare's proxy (orange cloud) is ever turned on for this record,
Caddy's certificate issuance will break - see the design spec section 11 for
why. Keep it grey-cloud (DNS-only).

## 3. Get the code

```bash
sudo mkdir -p /opt/helpinghands
sudo chown "$USER" /opt/helpinghands
git clone https://github.com/ypratap11/helpinghands.git /opt/helpinghands
cd /opt/helpinghands
```

## 4. Configure secrets

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and fill in every value. `.env.production` is
gitignored - it will never be committed, and must never leave this box
except in a secrets manager you control.

- `POSTGRES_PASSWORD` - generate one: `openssl rand -hex 24`
- `DATABASE_URL` - `postgresql://helping:<same password as POSTGRES_PASSWORD>@db:5432/helping_hands?schema=public`.
  The host is `db` (the compose service name), not `localhost` - the app
  reaches Postgres over the private Docker network.
- `AUTH_SECRET` - generate one: `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - from the existing Google OAuth
  client (the one that already has
  `https://helpinghands.augaster.com/api/auth/callback/google` registered
  as a redirect URI).
- `NEXTAUTH_URL` - leave as `https://helpinghands.augaster.com`.
- `ADMIN_EMAILS` - comma-separated emails that should become ADMIN on their
  first sign-in.
- `TZ` - leave as `Asia/Kolkata`. The application already handles this
  timezone correctly in code regardless of what timezone the container/host
  clock runs in (UTC) - this variable is documented for completeness, not
  because changing the container's clock would "fix" anything.

Double-check permissions so the file isn't world-readable:

```bash
chmod 600 .env.production
```

## 5. Bring the stack up

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First run will: build the app image, start Postgres and wait for its
healthcheck, then start the app (which runs `prisma migrate deploy` and the
seed before serving traffic - watch this happen with the command below),
then start Caddy, which requests a certificate from Let's Encrypt for
`helpinghands.augaster.com`. This can take a minute the first time.

## 6. Verify it's up

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app     # look for
                                                            # "[entrypoint] starting server..."
                                                            # and no migration errors
docker compose -f docker-compose.prod.yml logs caddy | tail -30   # look for
                                                            # certificate obtained, no ACME errors

curl -I https://helpinghands.augaster.com
curl https://helpinghands.augaster.com/api/auth/providers   # should list "google"
```

Then sign in with an account listed in `ADMIN_EMAILS` and confirm you land
on `/admin` with a working dashboard.

## 7. Updating to a new version

```bash
cd /opt/helpinghands
git pull
docker compose -f docker-compose.prod.yml up -d --build app
```

This rebuilds only the `app` image and recreates that one container.
`docker/entrypoint.sh` runs `prisma migrate deploy` and the seed again on
that new container before it starts serving - any new migrations that
shipped in the update are applied automatically, and the seed step is a
no-op if nothing changed. `db` and `caddy` are untouched.

If a deploy goes wrong, roll back the same way: `git checkout <previous
commit-ish>` then re-run the same `up -d --build app` command.

## 8. Backups

`scripts/backup.sh` runs a `pg_dump` against the `db` service, gzips it into
`./backups/`, and deletes anything older than 14 days. Run it once manually
to confirm it works:

```bash
./scripts/backup.sh
ls -lh backups/
```

Then schedule it nightly with cron:

```bash
crontab -e
# add this line (02:15 every night; the server's clock is UTC, which is
# fine - this is just a dump schedule, it has no bearing on the dates
# stored in the ledger, which the application already treats as
# Asia/Kolkata date-only values regardless of server clock):
15 2 * * * cd /opt/helpinghands && ./scripts/backup.sh >> /var/log/helpinghands-backup.log 2>&1
```

`backups/` is gitignored and lives only on the droplet's disk. For real
disaster recovery (droplet lost, not just database corruption) you are
responsible for also copying these files off the box periodically - e.g.
`scp` them somewhere, or point the cron job at a directory that's part of
your own off-box backup routine. This repo does not set that up for you.

**Note:** file-attachment storage (`STORAGE_DRIVER`/`STORAGE_LOCAL_PATH`) is
not implemented in the application yet as of this deployment, so there is
nothing to back up there. When it ships, extend `scripts/backup.sh` to
include the storage directory.

### Restoring a backup

```bash
./scripts/restore.sh backups/helping_hands-20260828-021500.sql.gz
```

This stops the `app` container, drops and recreates the `helping_hands`
database, loads the dump, then starts `app` again (which re-runs migrations
- a no-op if the dump is already current - and the seed). It asks for
confirmation before doing anything destructive.

## 9. Local development is unaffected

Everything above is production-only. Local development still uses
`docker-compose.yml` (Postgres on host port 5433) and `.env`/`.env.test`
exactly as before - nothing in this deployment stack changes that.

## 10. What this runbook does not cover

- Rotating `AUTH_SECRET` or Google OAuth credentials (standard secret
  rotation - update `.env.production` and `docker compose up -d app`).
- Moving to a Cloudflare-proxied setup (see design spec section 11 for what
  that requires - a Cloudflare Origin Certificate and Full-strict SSL mode
  - not implemented here).
- Multi-instance/HA deployment. This stack is one app container, one
  database, one droplet, matching the scale of the organisation it serves.
