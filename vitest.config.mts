import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load the test environment (not the dev .env) before anything imports Prisma.
// override: true is load-bearing: without it, a DATABASE_URL already present
// in process.env (e.g. from a shell or an earlier "dotenv/config" load) would
// win and tests would silently hit the dev database instead of the test one.
const loaded = config({ path: ".env.test", override: true, quiet: true });

// dotenv does not throw when the file is missing; it returns an error object.
// If we don't check it, override: true has nothing to override, and a
// DATABASE_URL already exported in the invoking shell (CI runner, .envrc,
// someone's profile) would silently be used instead — and resetDb() runs
// TRUNCATE CASCADE across every table before every single test.
if (loaded.error) {
  throw new Error(
    "Refusing to run tests: .env.test could not be loaded. " +
      "Tests TRUNCATE every table, so they must never fall back to a DATABASE_URL " +
      "from the ambient environment, which may point at the development database. " +
      "Copy .env.example to .env.test and set DATABASE_URL to the helping_hands_test database.",
  );
}

// next@16.3.3 ships no package.json#exports field, so extensionless deep
// imports like "next/server" and "next/cache" (used internally by
// next-auth, and by Task 12-13's server actions via revalidatePath) cannot
// be resolved by Vitest/Node's strict ESM resolver, even though the target
// files exist and `require()` finds them fine. Next's own bundler
// (Turbopack/webpack) has private resolution logic that tolerates this, so
// the app itself is unaffected — only tooling using standard ESM resolution
// hits it. Alias the two specifiers we need straight to their concrete
// files, built from this config file's own location so the alias works
// regardless of where the repo is checked out (this path contains a space).
const nextServer = fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url));
const nextCache = fileURLToPath(new URL("./node_modules/next/cache.js", import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: "next/server", replacement: nextServer },
      { find: "next/cache", replacement: nextCache },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    setupFiles: ["tests/helpers/db.ts"],
    fileParallelism: false,
    server: {
      deps: {
        // By default Vitest loads node_modules packages via Node's native
        // ESM loader, bypassing Vite's resolver (and therefore the alias
        // above) entirely. next-auth and @auth/core need to go through
        // Vite's resolution so their internal "next/server" import actually
        // hits the alias instead of Node's native (extension-strict)
        // resolver.
        inline: [/next-auth/, /@auth\/core/],
      },
    },
  },
});
