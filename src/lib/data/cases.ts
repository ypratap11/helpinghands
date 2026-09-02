import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { toDateOnly } from "@/lib/fy";

export const caseSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.enum(["MEDICAL", "EDUCATION", "FOOD", "SHELTER", "DISASTER", "OTHER"]),
  publicSummary: z.string().trim().min(1, "Public summary is required"),
  beneficiaryName: z.string().trim().optional().nullable(),
  beneficiaryContact: z.string().trim().optional().nullable(),
  privateNotes: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  occurredOn: z.date(),
  type: z.enum(["MONTHLY", "YEARLY", "ONCE"]).default("ONCE"),
  status: z.enum(["ACTIVE", "CLOSED", "CANCELLED"]).default("ACTIVE"),
});

// z.input (not z.infer/z.output) so that `type`/`status` — which carry a
// `.default()` — are optional on the way in, matching createCase's actual
// contract: callers may omit them and get ONCE/ACTIVE.
export type CaseInput = z.input<typeof caseSchema>;
export type CaseUpdateInput = Partial<CaseInput>;

export const disbursementSchema = z.object({
  amountPaise: z.number().int().positive("Amount must be greater than zero"),
  paidOn: z.date(),
  mode: z.enum(["UPI", "CASH", "BANK", "CHEQUE", "OTHER"]),
  paidTo: z.string().trim().optional().nullable(),
  reference: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export type DisbursementInput = z.infer<typeof disbursementSchema>;
export type DisbursementUpdateInput = Partial<DisbursementInput>;

function normalise(input: CaseInput) {
  const parsed = caseSchema.parse(input);
  return {
    ...parsed,
    beneficiaryName: parsed.beneficiaryName || null,
    beneficiaryContact: parsed.beneficiaryContact || null,
    privateNotes: parsed.privateNotes || null,
    city: parsed.city || null,
    state: parsed.state || null,
    occurredOn: toDateOnly(parsed.occurredOn),
  };
}

export async function createCase(input: CaseInput, actorId: string | null) {
  const data = normalise(input);
  const created = await prisma.case.create({ data: { ...data, createdByUserId: actorId } });

  await recordAudit({
    userId: actorId,
    action: "CREATE",
    entityType: "Case",
    entityId: created.id,
    after: {
      title: created.title,
      category: created.category,
      occurredOn: created.occurredOn,
      type: created.type,
      status: created.status,
    },
  });

  return created;
}

/**
 * Builds an update payload containing only the keys actually present on
 * `input`, so an update that omits a field (e.g. a form that doesn't render
 * it) leaves the existing column value untouched rather than nulling it.
 * Prisma treats an `undefined` value in `data` as "do not change this
 * column" (unlike an explicit `null`, which clears it), so any key not
 * present on `input` is left out of the parsed result entirely.
 */
function normalisePartial(input: CaseUpdateInput) {
  const parsed = caseSchema.partial().parse(input);
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof CaseInput)[]) {
    if (key === "occurredOn") {
      data.occurredOn = parsed.occurredOn ? toDateOnly(parsed.occurredOn) : parsed.occurredOn;
    } else if (
      key === "beneficiaryName" ||
      key === "beneficiaryContact" ||
      key === "privateNotes" ||
      key === "city" ||
      key === "state"
    ) {
      data[key] = parsed[key] || null;
    } else {
      data[key] = parsed[key];
    }
  }
  return data;
}

export async function updateCase(id: string, input: CaseUpdateInput, actorId: string | null) {
  const before = await prisma.case.findUnique({ where: { id } });
  if (!before) throw new Error("Case not found");

  const data = normalisePartial(input);
  const updated = await prisma.case.update({ where: { id }, data });

  await recordAudit({
    userId: actorId,
    action: "UPDATE",
    entityType: "Case",
    entityId: id,
    before: { title: before.title, category: before.category, publicSummary: before.publicSummary },
    after: data,
  });

  return updated;
}

export async function setCasePublished(id: string, published: boolean, actorId: string | null) {
  const before = await prisma.case.findUnique({ where: { id } });
  if (!before) throw new Error("Case not found");

  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { isPublished: published } });
    await recordAudit({
      userId: actorId,
      action: published ? "PUBLISH" : "UNPUBLISH",
      entityType: "Case",
      entityId: id,
      before: { isPublished: before.isPublished },
      after: { isPublished: published },
      tx,
    });
  });
}

export async function listCases() {
  const cases = await prisma.case.findMany({ orderBy: { createdAt: "desc" } });
  const totals = await prisma.disbursement.groupBy({
    by: ["caseId"],
    where: { status: "ACTIVE" },
    _sum: { amountPaise: true },
  });
  const totalsByCase = new Map(totals.map((t) => [t.caseId, BigInt(t._sum.amountPaise ?? 0)]));

  return cases.map((c) => ({ ...c, disbursedPaise: totalsByCase.get(c.id) ?? 0n }));
}

export async function getCase(id: string) {
  return prisma.case.findUnique({
    where: { id },
    include: { disbursements: { orderBy: { paidOn: "desc" } } },
  });
}

export async function createDisbursement(
  caseId: string,
  input: DisbursementInput,
  actorId: string | null,
) {
  const data = disbursementSchema.parse(input);
  const paidOn = toDateOnly(data.paidOn);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.disbursement.create({
      data: {
        caseId,
        amountPaise: data.amountPaise,
        paidOn,
        mode: data.mode,
        paidTo: data.paidTo || null,
        reference: data.reference || null,
        note: data.note || null,
        recordedByUserId: actorId,
      },
    });

    await recordAudit({
      userId: actorId,
      action: "CREATE",
      entityType: "Disbursement",
      entityId: row.id,
      after: { caseId: row.caseId, amountPaise: row.amountPaise, mode: row.mode },
      tx,
    });

    return row;
  });

  return created;
}

export async function caseDisbursedTotal(caseId: string): Promise<bigint> {
  const result = await prisma.disbursement.aggregate({
    where: { caseId, status: "ACTIVE" },
    _sum: { amountPaise: true },
  });
  return BigInt(result._sum.amountPaise ?? 0);
}

export async function voidDisbursement(id: string, actorId: string | null): Promise<void> {
  const before = await prisma.disbursement.findUnique({ where: { id } });
  if (!before) throw new Error("Disbursement not found");
  if (before.status === "VOID") return;

  await prisma.$transaction(async (tx) => {
    await tx.disbursement.update({ where: { id }, data: { status: "VOID" } });
    await recordAudit({
      userId: actorId,
      action: "VOID",
      entityType: "Disbursement",
      entityId: id,
      before: { status: before.status, amountPaise: before.amountPaise },
      after: { status: "VOID" },
      tx,
    });
  });
}

/**
 * Builds an update payload containing only the keys actually present on
 * `input`, mirroring normalisePartial() above — an omitted key leaves the
 * existing column value untouched rather than nulling it.
 */
function normalisePartialDisbursement(input: DisbursementUpdateInput) {
  const parsed = disbursementSchema.partial().parse(input);
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof DisbursementInput)[]) {
    if (key === "paidOn") {
      data.paidOn = parsed.paidOn ? toDateOnly(parsed.paidOn) : parsed.paidOn;
    } else if (key === "paidTo" || key === "reference" || key === "note") {
      data[key] = parsed[key] || null;
    } else {
      data[key] = parsed[key];
    }
  }
  return data;
}

export async function updateDisbursement(
  id: string,
  input: DisbursementUpdateInput,
  actorId: string | null,
) {
  const before = await prisma.disbursement.findUnique({ where: { id } });
  if (!before) throw new Error("Disbursement not found");
  if (before.status === "VOID") throw new Error("A voided disbursement cannot be edited");

  const data = normalisePartialDisbursement(input);
  const updated = await prisma.disbursement.update({ where: { id }, data });

  await recordAudit({
    userId: actorId,
    action: "UPDATE",
    entityType: "Disbursement",
    entityId: id,
    before: {
      amountPaise: before.amountPaise,
      paidOn: before.paidOn,
      mode: before.mode,
      paidTo: before.paidTo,
    },
    after: data,
  });

  return updated;
}
