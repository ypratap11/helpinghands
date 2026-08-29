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

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    setupFiles: ["tests/helpers/db.ts"],
    fileParallelism: false,
  },
});
