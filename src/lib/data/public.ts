import type { CaseCategory, CaseStatus, CaseType } from "@prisma/client";
import { listAttachments } from "@/lib/data/attachments";
import { prisma } from "@/lib/db";

export type PublicImpact = {
  raisedPaise: bigint;
  disbursedPaise: bigint;
  balancePaise: bigint | null;
  peopleHelped: number;
  contributorCount: number;
};

export type PublicCase = {
  id: string;
  title: string;
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
 * beneficiaryName, beneficiaryContact, or privateNotes. `type`, `status`,
 * and `title` ARE safe to expose publicly (they carry no beneficiary
 * information — `title` is the admin-authored cause name, not a person's
 * name).
 */
const PUBLIC_CASE_SELECT = {
  id: true,
  title: true,
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
  title: string;
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
    where: { caseId: { in: caseIds }, status: "ACTIVE" },
    _sum: { amountPaise: true },
  });
  return new Map(totals.map((t) => [t.caseId, BigInt(t._sum.amountPaise ?? 0)]));
}

function toPublicCase(row: PublicCaseRow, disbursedPaise: bigint): PublicCase {
  return {
    id: row.id,
    title: row.title,
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

export type PublicAttachment = { id: string; filename: string; mimeType: string };

/**
 * Public image attachments for a cause's public page. Intended to be
 * called only for a case already confirmed published (e.g. right after
 * getPublishedCase() returns non-null) -- it does not re-check
 * isPublished itself, only entityType CASE + isPublic true, mirroring
 * isAttachmentPubliclyServable's rule for a CASE attachment. Filters to
 * image mime types only, since this is used to render `<img>` thumbnails,
 * not a generic file list; a public PDF (if ever needed) would need its
 * own link-based rendering, not this list.
 */
export async function listPublicCaseImages(caseId: string): Promise<PublicAttachment[]> {
  const attachments = await listAttachments("CASE", caseId);
  return attachments
    .filter((a) => a.isPublic && a.mimeType.startsWith("image/"))
    .map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType }));
}

export async function publicImpact(): Promise<PublicImpact> {
  const [collected, disbursed, peopleHelped, contributorGroups, settings] = await Promise.all([
    prisma.contribution.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountPaise: true },
    }),
    prisma.disbursement.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountPaise: true },
    }),
    prisma.case.count({ where: { isPublished: true } }),
    // Distinct people who have given (not the number of contribution records),
    // so the "Contributors" figure means what it says. A cause backfilled with
    // a single lump "raised" total counts as one contributor (its donors were
    // never itemised) — accurate for itemised causes.
    prisma.contribution.groupBy({ by: ["contributorId"], where: { status: "ACTIVE" } }),
    prisma.orgSettings.findUniqueOrThrow({ where: { id: "singleton" } }),
  ]);

  const raisedPaise = BigInt(collected._sum.amountPaise ?? 0);
  const disbursedPaise = BigInt(disbursed._sum.amountPaise ?? 0);

  return {
    raisedPaise,
    disbursedPaise,
    balancePaise: settings.showBalancePublicly ? raisedPaise - disbursedPaise : null,
    peopleHelped,
    contributorCount: contributorGroups.length,
  };
}
