# syntax=docker/dockerfile:1
#
# Production image for Helping Hands (Next.js 16 / React 19 / Prisma 7).
#
# Three stages:
#   1. builder      - installs ALL deps (incl. devDependencies), generates the
#                      Prisma client, and runs `next build` with
#                      output: "standalone".
#   2. prisma-cli   - installs *only* the `prisma` CLI (and its own
#                      dependency tree) in isolation from the app's
#                      devDependencies (eslint, vitest, playwright, ...).
#                      The CLI is needed at container start to run
#                      `prisma migrate deploy` - Prisma 7 does not ship a
#                      standalone "migration engine" binary you can copy in
#                      on its own, so the full CLI package is required.
#   3. runner       - the actual production image: the Next.js standalone
#                      server, the generated Prisma client + its WASM query
#                      compiler, the prisma CLI (for `migrate deploy` only),
#                      and prisma/ + prisma.config.ts (for the migration
#                      files and datasource config). Runs as a non-root user.
#
# NOTE: Prisma 7 no longer auto-runs `generate` or `seed` after
# `migrate deploy`, so both are handled explicitly - `generate` at build
# time (below) and seeding via docker/seed.mjs at container start
# (see docker/entrypoint.sh).

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
# Stage 1: builder
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Next.js/sharp need glibc compatibility shims on Alpine.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Both `prisma generate` (prisma.config.ts calls env("DATABASE_URL") eagerly
# and fails to even load the config without it) and `next build` (which
# evaluates src/lib/db.ts's module-level `new PrismaPg(...)` while
# collecting page/route data) need DATABASE_URL to be *resolvable* at build
# time, even though neither actually connects to a database. This is a
# placeholder, never a real credential, and is not present in the final
# image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

# Generate the Prisma client (reads prisma/schema.prisma via
# prisma.config.ts). Must happen before `next build` so route handlers that
# import @prisma/client resolve correctly, and so Next's output tracing
# picks up the generated client files.
RUN npx prisma generate

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: prisma-cli (isolated install, keeps devDependencies out of prod)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS prisma-cli
WORKDIR /cli

# Keep this pinned to the same version as package.json's "prisma"
# devDependency (currently ^7.10.0) - the CLI and @prisma/client should stay
# in lockstep.
ARG PRISMA_VERSION=7.10.0
RUN echo '{"name":"prisma-cli-runtime","private":true,"dependencies":{"prisma":"'"$PRISMA_VERSION"'","dotenv":"17.4.2"}}' > package.json \
    && npm install --omit=dev

# ---------------------------------------------------------------------------
# Stage 3: runner
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Next.js standalone server + traced runtime node_modules (includes next,
# react, pg, sharp, and - per verification - the generated Prisma client).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Explicitly copy packages that Next's standalone output tracing gets wrong
# for this dependency graph. Verified by diffing `.next/standalone/node_modules`
# against the builder's real (fully `npm ci`'d) node_modules, checking each
# package's actual `require.resolve()` result rather than assuming presence
# of package.json means the package works:
#
#   - .prisma/client, @prisma/client: tracing DOES include these correctly,
#     but they're copied explicitly anyway as a defense against that
#     tracing behaviour changing across Next versions.
#   - @prisma/adapter-pg, @prisma/driver-adapter-utils, @prisma/debug:
#     imported directly (adapter-pg) or transitively (the other two) by
#     src/lib/db.ts, but tracing drops all three entirely - the app fails
#     at runtime with "Cannot find package '@prisma/adapter-pg'" without
#     this.
#   - postgres-array, xtend: real transitive dependencies of pg/adapter-pg
#     whose main entry file (postgres-array/index.js, xtend/immutable.js)
#     tracing silently drops, leaving only package.json behind - a
#     `require()` of either then fails with "valid main entry" errors.
#     Every other package in the pg/postgres-* family (pg, pg-pool,
#     pg-protocol, pg-types, pgpass, pg-connection-string, pg-int8,
#     pg-cloudflare, postgres-bytea, postgres-date, postgres-interval,
#     split2) resolves fine from tracing alone and is left as-is.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/adapter-pg ./node_modules/@prisma/adapter-pg
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/driver-adapter-utils ./node_modules/@prisma/driver-adapter-utils
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/xtend ./node_modules/xtend

# The prisma CLI, for `migrate deploy` at container start. Merges into the
# node_modules directory above (no filename collisions with the app's own
# runtime deps).
COPY --from=prisma-cli --chown=nextjs:nodejs /cli/node_modules ./node_modules

# Migration files + datasource config, needed by `prisma migrate deploy` at
# runtime (not baked into the client - read fresh from disk each start).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Entrypoint: migrate -> seed -> serve. Plain JS (no tsx/TypeScript needed
# at runtime) - see docker/seed.mjs for why it duplicates prisma/seed.ts
# instead of importing it.
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./docker/entrypoint.sh
COPY --chown=nextjs:nodejs docker/seed.mjs ./docker/seed.mjs
RUN chmod +x ./docker/entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
