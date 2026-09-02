import { randomUUID } from "node:crypto";
import { mkdir, readFile as fsReadFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Driver-based storage abstraction. Only the "local" driver exists today
 * (files on disk under STORAGE_LOCAL_PATH), but every caller in the app
 * talks to the three functions below, not to fs directly -- so adding a
 * "spaces" driver (S3-compatible object storage) later is a matter of
 * implementing this same StorageDriver interface and switching on
 * STORAGE_DRIVER, with zero changes needed at any call site.
 */
export interface StorageDriver {
  save(bytes: Buffer, ext: string): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

/**
 * storageKey is always a server-generated `${randomUUID()}.${ext}` -- never
 * derived from a user-supplied filename. This guard is defence in depth for
 * read/delete: even if a storageKey from some other source ever reached
 * this code (a bug elsewhere, a hand-crafted DB row, a future caller that
 * forgets the contract), a key containing a path separator or ".." is
 * rejected outright rather than trusted to stay inside the storage dir.
 */
function assertSafeKey(storageKey: string): void {
  if (
    storageKey.includes("/") ||
    storageKey.includes("\\") ||
    storageKey.includes("..") ||
    storageKey.trim() === ""
  ) {
    throw new Error(`Refusing unsafe storage key: ${JSON.stringify(storageKey)}`);
  }
}

/**
 * Resolves storageKey to an absolute path strictly inside the storage base
 * directory. Belt-and-braces on top of assertSafeKey: even if a future
 * change to that function's substring checks had a gap, this confirms the
 * resolved path is still a direct child of the base dir before any fs call
 * touches it.
 */
function resolveInsideBase(baseDir: string, storageKey: string): string {
  assertSafeKey(storageKey);
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, storageKey);
  const relative = path.relative(resolvedBase, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing storage key that escapes the storage directory: ${JSON.stringify(storageKey)}`);
  }
  return resolvedPath;
}

function localBaseDir(): string {
  const configured = process.env.STORAGE_LOCAL_PATH || "./storage/uploads";
  // turbopackIgnore: without it, Turbopack's static analysis treats this
  // env-driven path.resolve() as "the whole project might be read from
  // disk here" and traces every source file (including public/) into the
  // standalone output -- ballooning the production image the Dockerfile
  // otherwise curates carefully (see Dockerfile's explicit node_modules
  // copy comments). The actual directory this resolves to is fixed at
  // deploy time by STORAGE_LOCAL_PATH (an env var, not user input), so
  // there is nothing here for build-time tracing to usefully discover.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

const localDriver: StorageDriver = {
  async save(bytes: Buffer, ext: string): Promise<string> {
    const baseDir = localBaseDir();
    await mkdir(baseDir, { recursive: true });
    const storageKey = `${randomUUID()}.${ext}`;
    const target = resolveInsideBase(baseDir, storageKey);
    await writeFile(target, bytes);
    return storageKey;
  },

  async read(storageKey: string): Promise<Buffer> {
    const target = resolveInsideBase(localBaseDir(), storageKey);
    return fsReadFile(target);
  },

  async delete(storageKey: string): Promise<void> {
    const target = resolveInsideBase(localBaseDir(), storageKey);
    await rm(target, { force: false });
  },
};

function currentDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER || "local";
  switch (driver) {
    case "local":
      return localDriver;
    // A future "spaces" driver (DigitalOcean Spaces / S3-compatible) slots
    // in here, e.g.: case "spaces": return spacesDriver;
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${JSON.stringify(driver)}`);
  }
}

export async function saveFile(bytes: Buffer, ext: string): Promise<string> {
  return currentDriver().save(bytes, ext);
}

export async function readFile(storageKey: string): Promise<Buffer> {
  return currentDriver().read(storageKey);
}

export async function deleteFile(storageKey: string): Promise<void> {
  return currentDriver().delete(storageKey);
}
