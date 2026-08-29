// This file exists to prove that the `next/server` alias in
// vitest.config.mts actually resolves. next@16.3.3 ships no
// package.json#exports field, and next-auth imports "next/server"
// extensionlessly, so without that alias any test that imports
// `@/lib/auth` crashes at module load under Vitest's strict ESM resolver
// (Node's native loader also fails the same way; only Next's own
// bundler tolerates it). Nothing else in the suite imports `@/lib/auth` —
// tests/lib/auth-bootstrap.test.ts deliberately imports the
// next-auth-free `@/lib/auth-roles` instead. Do not delete this file as
// "redundant": if the alias silently breaks, this is the only test that
// will catch it before Task 7's guards or Tasks 12-13's server actions
// fail at import time and look like their own bug.
//
// Deliberately shallow: this is a module-resolution smoke test, not an
// auth behaviour test. It must not invoke a handler or start a server.
import { describe, expect, it } from "vitest";
import { auth, handlers, signIn, signOut } from "@/lib/auth";

describe("@/lib/auth module wiring", () => {
  it("exports handlers with GET and POST route functions", () => {
    expect(handlers).toBeDefined();
    expect(typeof handlers.GET).toBe("function");
    expect(typeof handlers.POST).toBe("function");
  });

  it("exports auth, signIn, and signOut as functions", () => {
    expect(typeof auth).toBe("function");
    expect(typeof signIn).toBe("function");
    expect(typeof signOut).toBe("function");
  });
});
