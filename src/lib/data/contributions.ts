import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { financialYearOf, financialYearRange, toDateOnly } from "@/lib/fy";
import { allocateReceiptNo } from "@/lib/receipts";

export const contributionSchema = z.object({
  contributorId: z.string().min(1),
  amountPaise: z.number().int().positive("Amount must be greater than zero"),
  receivedOn: z.date(),
  mode: z.enum(["UPI", "CASH", "BANK", "CHEQUE", "OTHER"]),
  reference: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  caseId: z.string().optional().nullable(),
});

export type ContributionInput = z.infer<typeof contributionSchema>;

export async function createContribution(input: ContributionInput, actorId: string | null) {
  const data = contributionSchema.parse(input);
  const receivedOn = toDateOnly(data.receivedOn);

  const settings = await prisma.orgSettings.findUniqueOrThrow({ where: { id: "singleton" } });

  const created = await prisma.$transaction(async (tx) => {
    const receiptNo = await allocateReceiptNo(receivedOn, settings.receiptPrefix, tx);

    const row = await tx.contribution.create({
      data: {
        contributorId: data.contributorId,
        amountPaise: data.amountPaise,
        receivedOn,
        mode: data.mode,
        reference: data.reference || null,
        note: data.note || null,
        receiptNo,
        recordedByUserId: actorId,
        caseId: data.caseId || null,
      },
    });

    await recordAudit({
      userId: actorId,
      action: "CREATE",
      entityType: "Contribution",
      entityId: row.id,
      after: {
        amountPaise: row.amountPaise,
        receiptNo: row.receiptNo,
        mode: row.mode,
        caseId: row.caseId,
      },
      tx,
    });

    return row;
  });

  return created;
}

export async function voidContribution(id: string, actorId: string | null) {
  const before = await prisma.contribution.findUnique({ where: { id } });
  if (!before) throw new Error("Contribution not found");
  if (before.status === "VOID") return;

  await prisma.$transaction(async (tx) => {
    await tx.contribution.update({ where: { id }, data: { status: "VOID" } });
    await recordAudit({
      userId: actorId,
      action: "VOID",
      entityType: "Contribution",
      entityId: id,
      before: { status: before.status, amountPaise: before.amountPaise },
      after: { status: "VOID" },
      tx,
    });
  });
}

export async function listContributions(filter?: {
  financialYear?: string;
  contributorId?: string;
}) {
  const range = filter?.financialYear ? financialYearRange(filter.financialYear) : null;

  return prisma.contribution.findMany({
    where: {
      ...(filter?.contributorId ? { contributorId: filter.contributorId } : {}),
      ...(range ? { receivedOn: { gte: range.start, lte: range.end } } : {}),
    },
    include: {
      contributor: { select: { id: true, name: true } },
      case: { select: { id: true, title: true } },
    },
    orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * The single place the "only my own data" filter lives.
 * Every member-facing read goes through here.
 */
export async function listMyContributions(userId: string) {
  return prisma.contribution.findMany({
    where: { status: "ACTIVE", contributor: { userId } },
    orderBy: { receivedOn: "desc" },
    include: { case: { select: { id: true, title: true } } },
  });
}

/**
 * The member's own ACTIVE contributions, summed per Indian financial year,
 * newest year first. Goes through the same "only my own data" filter as
 * listMyContributions above.
 */
export async function myYearlyTotals(
  userId: string,
): Promise<{ financialYear: string; totalPaise: bigint; count: number }[]> {
  const rows = await prisma.contribution.findMany({
    where: { status: "ACTIVE", contributor: { userId } },
    select: { amountPaise: true, receivedOn: true },
  });

  const byYear = new Map<string, { totalPaise: bigint; count: number }>();
  for (const row of rows) {
    const fy = financialYearOf(row.receivedOn);
    const existing = byYear.get(fy) ?? { totalPaise: 0n, count: 0 };
    existing.totalPaise += BigInt(row.amountPaise);
    existing.count += 1;
    byYear.set(fy, existing);
  }

  return Array.from(byYear.entries())
    .map(([financialYear, totals]) => ({ financialYear, ...totals }))
    .sort((a, b) => b.financialYear.localeCompare(a.financialYear));
}

export async function caseRaisedTotal(caseId: string): Promise<bigint> {
  const result = await prisma.contribution.aggregate({
    where: { caseId, status: "ACTIVE" },
    _sum: { amountPaise: true },
  });
  return BigInt(result._sum.amountPaise ?? 0);
}

export async function caseContributionCount(caseId: string): Promise<number> {
  return prisma.contribution.count({ where: { caseId, status: "ACTIVE" } });
}

export async function listCaseContributions(caseId: string) {
  return prisma.contribution.findMany({
    where: { caseId, status: "ACTIVE" },
    include: { contributor: { select: { id: true, name: true } } },
    orderBy: { receivedOn: "desc" },
  });
}

export async function ledgerTotals() {
  const [collected, disbursed] = await Promise.all([
    prisma.contribution.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountPaise: true },
    }),
    prisma.disbursement.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountPaise: true },
    }),
  ]);

  const collectedPaise = BigInt(collected._sum.amountPaise ?? 0);
  const disbursedPaise = BigInt(disbursed._sum.amountPaise ?? 0);

  return { collectedPaise, disbursedPaise, balancePaise: collectedPaise - disbursedPaise };
}
