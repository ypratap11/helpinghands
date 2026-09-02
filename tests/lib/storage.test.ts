import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Storage tests point STORAGE_LOCAL_PATH at a scratch directory outside the
 * repo (os.tmpdir()) so they never write stray files into the checked-out
 * tree, and remove that directory again afterwards. storage.ts reads
 * process.env.STORAGE_LOCAL_PATH fresh on every call (not once at module
 * load), so stubbing it per-test here is enough -- no dynamic re-import
 * needed.
 */
const testDir = path.join(
  process.env.TEMP || process.env.TMPDIR || "/tmp",
  `hh-storage-test-${randomUUID()}`,
);

const ORIGINAL_STORAGE_LOCAL_PATH = process.env.STORAGE_LOCAL_PATH;
const ORIGINAL_STORAGE_DRIVER = process.env.STORAGE_DRIVER;

beforeEach(() => {
  process.env.STORAGE_LOCAL_PATH = testDir;
  process.env.STORAGE_DRIVER = "local";
});

afterEach(async () => {
  if (ORIGINAL_STORAGE_LOCAL_PATH === undefined) delete process.env.STORAGE_LOCAL_PATH;
  else process.env.STORAGE_LOCAL_PATH = ORIGINAL_STORAGE_LOCAL_PATH;
  if (ORIGINAL_STORAGE_DRIVER === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = ORIGINAL_STORAGE_DRIVER;
  await rm(testDir, { recursive: true, force: true });
});

const { saveFile, readFile, deleteFile } = await import("@/lib/storage");

describe("storage (local driver)", () => {
  it("creates the storage directory if missing", async () => {
    expect(existsSync(testDir)).toBe(false);
    await saveFile(Buffer.from("hello"), "png");
    expect(existsSync(testDir)).toBe(true);
  });

  it("round-trips save -> read -> delete", async () => {
    const bytes = Buffer.from("some file content, could be anything");
    const key = await saveFile(bytes, "png");

    expect(key).toMatch(/\.png$/);
    // storageKey must not be derived from anything user-supplied -- there is
    // no filename parameter to saveFile at all, only bytes + extension.

    const readBack = await readFile(key);
    expect(readBack.equals(bytes)).toBe(true);

    await deleteFile(key);
    await expect(readFile(key)).rejects.toThrow();
  });

  it("generates a random key, not derived from content or a filename", async () => {
    const bytes = Buffer.from("identical content");
    const keyA = await saveFile(bytes, "pdf");
    const keyB = await saveFile(bytes, "pdf");
    expect(keyA).not.toBe(keyB);
  });

  it("rejects a storageKey containing a forward slash on read", async () => {
    await expect(readFile("../evil.png")).rejects.toThrow();
    await expect(readFile("sub/dir.png")).rejects.toThrow();
  });

  it("rejects a storageKey containing a backslash on read", async () => {
    await expect(readFile("sub\\dir.png")).rejects.toThrow();
  });

  it("rejects a storageKey containing .. on read even without a separator", async () => {
    await expect(readFile("..png")).rejects.toThrow();
  });

  it("rejects a path-traversal storageKey on delete too", async () => {
    await expect(deleteFile("../../etc/passwd")).rejects.toThrow();
  });

  it("is idempotent: deleting a key that never existed does not throw", async () => {
    // deleteFile uses rm(force:true) so an already-absent file is treated as a
    // successful delete — this is what stops a missing file from orphaning the
    // DB row it backs when an attachment is removed.
    await mkdir(testDir, { recursive: true });
    await expect(deleteFile("00000000-0000-0000-0000-000000000000.png")).resolves.toBeUndefined();
  });
});
