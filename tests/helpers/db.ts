import { beforeEach } from "vitest";
import { prisma } from "@/lib/db";

export const ANONYMOUS_CONTRIBUTOR_ID = "anonymous";

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
