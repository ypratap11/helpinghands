import { beforeEach } from "vitest";
import { prisma } from "@/lib/db";

export const ANONYMOUS_CONTRIBUTOR_ID = "anonymous";

// JSON.stringify throws a TypeError on any object containing a BigInt
// (a JS platform limitation, not a bug in the data layer). Several money
// aggregates (e.g. public.ts's disbursedPaise) are intentionally typed as
// bigint to avoid float arithmetic on paise, and tests assert on their
// JSON-serialised shape (see tests/data/public.test.ts's anonymisation
// checks). This polyfill only changes how BigInt renders inside
// JSON.stringify — it does not affect equality, arithmetic, or any other
// assertion — so it does not weaken what the tests check.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function (this: bigint) {
  return this.toString();
};

// Belt-and-braces: refuse to operate on anything but the test database, even
// if the vitest.config.mts guard was somehow bypassed. Runs once, at module
// load, before any test's beforeEach (and thus before any TRUNCATE) can run.
const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("helping_hands_test")) {
  throw new Error(
    `Refusing to reset a non-test database. DATABASE_URL points at: ${databaseUrl || "(unset)"}`,
  );
}

/** Order matters only for readability; TRUNCATE ... CASCADE handles the graph. */
const TABLES = [
  "AuditLog",
  "Attachment",
  "Disbursement",
  "Case",
  "Contribution",
  "Contributor",
  "Session",
  "Account",
  "VerificationToken",
  "User",
  "ReceiptCounter",
  "OrgSettings",
];

export async function resetDb(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

export async function seedBaseline(): Promise<void> {
  await prisma.orgSettings.create({ data: { id: "singleton" } });
  await prisma.contributor.create({
    data: { id: ANONYMOUS_CONTRIBUTOR_ID, name: "Anonymous", isSystem: true },
  });
}

beforeEach(async () => {
  await resetDb();
  await seedBaseline();
});
