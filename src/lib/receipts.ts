import type { PrismaTx } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { financialYearOf } from "@/lib/fy";

/**
 * Allocates the next receipt number for the financial year that `receivedOn`
 * falls in (not today's date, so a back-dated contribution lands in the
 * correct year's sequence).
 *
 * Uses a single atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING so
 * concurrent allocations for the same financial year can never race to the
 * same sequence number. A read-then-write (SELECT lastSequence, then
 * UPDATE +1) would allow two concurrent callers to read the same value and
 * both increment from it, producing a duplicate receipt number — which
 * becomes a duplicate tax-deductible 80G receipt once the group registers.
 */
export async function allocateReceiptNo(
  receivedOn: Date | string,
  prefix: string,
  tx?: PrismaTx,
): Promise<string> {
  const client = tx ?? prisma;
  const fy = financialYearOf(receivedOn);

  const rows = await client.$queryRaw<{ lastSequence: number }[]>`
    INSERT INTO "ReceiptCounter" ("financialYear", "lastSequence")
    VALUES (${fy}, 1)
    ON CONFLICT ("financialYear")
    DO UPDATE SET "lastSequence" = "ReceiptCounter"."lastSequence" + 1
    RETURNING "lastSequence"
  `;

  const sequence = rows[0].lastSequence;
  return `${prefix}/${fy}/${String(sequence).padStart(4, "0")}`;
}
