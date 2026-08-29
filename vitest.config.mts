import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load the test environment (not the dev .env) before anything imports Prisma.
// override: true is load-bearing: without it, a DATABASE_URL already present
// in process.env (e.g. from a shell or an earlier "dotenv/config" load) would
// win and tests would silently hit the dev database instead of the test one.
config({ path: ".env.test", override: true, quiet: true });

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
