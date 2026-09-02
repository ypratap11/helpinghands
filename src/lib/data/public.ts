import type { CaseCategory, CaseStatus, CaseType } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PublicImpact = {
  raisedPaise: bigint;
  disbursedPaise: bigint;
  balancePaise: bigint | null;
  peopleHelped: number;
  contributionCount: number;
};

export type PublicCase = {
  id: string;
  category: CaseCategory;
  publicSummary: string;
  city: string | null;
  state: string | null;
  occurredOn: Date;
  type: CaseType;
  status: CaseStatus;
  disbursedPaise: bigint;
};

/**
 * The public fields of a Case — anonymised by construction. Every read in
 * this module selects exactly this shape and NEVER `include`s or selects
 * beneficiaryName, beneficiaryContact, or privateNotes. `type` and `status`
 * ARE safe to expose publicly (they carry no beneficiary information).
 */
const PUBLIC_CASE_SELECT = {
  id: true,
  category: true,
  publicSummary: true,
  city: true,
  state: true,
  occurredOn: true,
  type: true,
  status: true,
} as const;

type PublicCaseRow = {
  id: string;
  category: CaseCategory;
  publicSummary: string;
  city: string | null;
  state: string | null;
  occurredOn: Date;
  type: CaseType;
  status: CaseStatus;
};

async function disbursedTotalsFor(caseIds: string[]): Promise<Map<string, bigint>> {
  if (caseIds.length === 0) return new Map();
  const totals = await prisma.disbursement.groupBy({
    by: ["caseId"],
    where: { caseId: { in: caseIds } },
    _sum: { amountPaise: true },
  });
  return new Map(totals.map((t) => [t.caseId, BigInt(t._sum.amountPaise ?? 0)]));
}

function toPublicCase(row: PublicCaseRow, disbursedPaise: bigint): PublicCase {
  return {
    id: row.id,
    category: row.category,
    publicSummary: row.publicSummary,
    city: row.city,
    state: row.state,
    occurredOn: row.occurredOn,
    type: row.type,
    status: row.status,
    disbursedPaise,
  };
}

export async function listPublishedCases(limit?: number): Promise<PublicCase[]> {
  const rows = await prisma.case.findMany({
    where: { isPublished: true },
    select: PUBLIC_CASE_SELECT,
    orderBy: { occurredOn: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  const totals = await disbursedTotalsFor(rows.map((r) => r.id));
  return rows.map((row) => toPublicCase(row, totals.get(row.id) ?? 0n));
}

export async function getPublishedCase(id: string): Promise<PublicCase | null> {
  const row = await prisma.case.findFirst({
    where: { id, isPublished: true },
    select: PUBLIC_CASE_SELECT,
  });
  if (!row) return null;

  const totals = await disbursedTotalsFor([row.id]);
  return toPublicCase(row, totals.get(row.id) ?? 0n);
}

export async function publicImpact(): Promise<PublicImpact> {
  const [collected, disbursed, peopleHelped, contributionCount, settings] = await Promise.all([
    prisma.contribution.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountPaise: true },
    }),
    prisma.disbursement.aggregate({ _sum: { amountPaise: true } }),
    prisma.case.count({ where: { isPublished: true } }),
    prisma.contribution.count({ where: { status: "ACTIVE" } }),
    prisma.orgSettings.findUniqueOrThrow({ where: { id: "singleton" } }),
  ]);

  const raisedPaise = BigInt(collected._sum.amountPaise ?? 0);
  const disbursedPaise = BigInt(disbursed._sum.amountPaise ?? 0);

  return {
    raisedPaise,
    disbursedPaise,
    balancePaise: settings.showBalancePublicly ? raisedPaise - disbursedPaise : null,
    peopleHelped,
    contributionCount,
  };
}
