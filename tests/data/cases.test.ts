import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  caseDisbursedTotal,
  createCase,
  createDisbursement,
  getCase,
  listCases,
  setCasePublished,
  updateCase,
  updateDisbursement,
  voidDisbursement,
} from "@/lib/data/cases";

async function aCase(overrides: Record<string, unknown> = {}) {
  return createCase(
    {
      title: "Hospital bill for a daily-wage worker",
      category: "MEDICAL",
      publicSummary: "Medical support for a family after an accident.",
      beneficiaryName: "Ganesh Rao",
      beneficiaryContact: "+91 90000 11111",
      privateNotes: "Verified via local hospital.",
      city: "Hyderabad",
      state: "Telangana",
      occurredOn: new Date(Date.UTC(2026, 5, 10)),
      ...overrides,
    },
    null,
  );
}

describe("createCase", () => {
  it("stores the case and writes an audit entry", async () => {
    const actor = await prisma.user.create({ data: { email: "boss@example.com" } });

    const created = await createCase(
      {
        title: "Hospital bill for a daily-wage worker",
        category: "MEDICAL",
        publicSummary: "Medical support for a family after an accident.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
      actor.id,
    );

    expect(created.title).toBe("Hospital bill for a daily-wage worker");
    expect(created.category).toBe("MEDICAL");
    expect(created.isPublished).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Case", entityId: created.id },
    });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.userId).toBe(actor.id);
  });

  it("defaults type to ONCE and status to ACTIVE when omitted", async () => {
    const created = await aCase();
    expect(created.type).toBe("ONCE");
    expect(created.status).toBe("ACTIVE");
  });

  it("persists an explicit type and status", async () => {
    const created = await aCase({ type: "MONTHLY", status: "CLOSED" });
    expect(created.type).toBe("MONTHLY");
    expect(created.status).toBe("CLOSED");
  });

  it("rejects an empty title", async () => {
    await expect(
      createCase(
        {
          title: "   ",
          category: "MEDICAL",
          publicSummary: "Medical support.",
          occurredOn: new Date(Date.UTC(2026, 5, 10)),
        },
        null,
      ),
    ).rejects.toThrow();
  });

  it("rejects an empty publicSummary", async () => {
    await expect(
      createCase(
        {
          title: "Hospital bill",
          category: "MEDICAL",
          publicSummary: "   ",
          occurredOn: new Date(Date.UTC(2026, 5, 10)),
        },
        null,
      ),
    ).rejects.toThrow();
  });
});

describe("updateCase", () => {
  it("records before and after in the audit log", async () => {
    const created = await aCase();
    await updateCase(created.id, { title: "Updated title" }, null);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: "UPDATE" },
    });
    expect((audit?.before as { title: string }).title).toBe(created.title);
    expect((audit?.after as { title: string }).title).toBe("Updated title");
  });

  it("leaves an existing privateNotes value intact when the update omits privateNotes", async () => {
    const created = await aCase({ privateNotes: "Original private note" });

    await updateCase(created.id, { title: "New title" }, null);

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.title).toBe("New title");
    expect(after?.privateNotes).toBe("Original private note");
  });

  it("clears privateNotes when the update explicitly sends null", async () => {
    const created = await aCase({ privateNotes: "Temporary note" });

    await updateCase(created.id, { privateNotes: null }, null);

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.privateNotes).toBeNull();
  });

  it("changes type and status when provided", async () => {
    const created = await aCase();
    expect(created.type).toBe("ONCE");
    expect(created.status).toBe("ACTIVE");

    await updateCase(created.id, { type: "YEARLY", status: "CANCELLED" }, null);

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.type).toBe("YEARLY");
    expect(after?.status).toBe("CANCELLED");
  });

  it("leaves type and status intact when the update omits them", async () => {
    const created = await aCase({ type: "MONTHLY", status: "CLOSED" });

    await updateCase(created.id, { title: "New title" }, null);

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.title).toBe("New title");
    expect(after?.type).toBe("MONTHLY");
    expect(after?.status).toBe("CLOSED");
  });
});

describe("setCasePublished", () => {
  it("publishes a case and writes a PUBLISH audit row", async () => {
    const created = await aCase();
    expect(created.isPublished).toBe(false);

    await setCasePublished(created.id, true, null);

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.isPublished).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: "PUBLISH" },
    });
    expect(audit).not.toBeNull();
  });

  it("unpublishes a case and writes an UNPUBLISH audit row", async () => {
    const created = await aCase();
    await setCasePublished(created.id, true, null);

    await setCasePublished(created.id, false, null);

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.isPublished).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: "UNPUBLISH" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("createDisbursement", () => {
  it("stores paise and writes an audit entry inside the same transaction", async () => {
    const actor = await prisma.user.create({ data: { email: "boss@example.com" } });
    const created = await aCase();

    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 250000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK", paidTo: "Apollo Hospital" },
      actor.id,
    );

    expect(disbursement.amountPaise).toBe(250000);
    expect(disbursement.caseId).toBe(created.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Disbursement", entityId: disbursement.id },
    });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.userId).toBe(actor.id);
  });

  it("rejects a zero or negative amount", async () => {
    const created = await aCase();
    await expect(
      createDisbursement(
        created.id,
        { amountPaise: 0, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
        null,
      ),
    ).rejects.toThrow();
  });

  it("rolls back and leaves no orphan audit row when the write fails", async () => {
    const auditCountBefore = await prisma.auditLog.count();
    const disbursementCountBefore = await prisma.disbursement.count();

    await expect(
      createDisbursement(
        "non-existent-case-id",
        { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
        null,
      ),
    ).rejects.toThrow();

    expect(await prisma.auditLog.count()).toBe(auditCountBefore);
    expect(await prisma.disbursement.count()).toBe(disbursementCountBefore);
  });
});

describe("caseDisbursedTotal", () => {
  it("sums disbursements for a case", async () => {
    const created = await aCase();
    await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );
    await createDisbursement(
      created.id,
      { amountPaise: 50000, paidOn: new Date(Date.UTC(2026, 5, 16)), mode: "CASH" },
      null,
    );

    expect(await caseDisbursedTotal(created.id)).toBe(150000n);
  });

  it("returns zero for a case with no disbursements", async () => {
    const created = await aCase();
    expect(await caseDisbursedTotal(created.id)).toBe(0n);
  });
});

describe("listCases", () => {
  it("returns cases newest first with per-case disbursed totals", async () => {
    const first = await aCase({ title: "First case" });
    const second = await aCase({ title: "Second case" });
    await createDisbursement(
      first.id,
      { amountPaise: 75000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );

    const list = await listCases();
    expect(list.map((c) => c.title)).toEqual(["Second case", "First case"]);

    const firstResult = list.find((c) => c.id === first.id);
    const secondResult = list.find((c) => c.id === second.id);
    expect(firstResult?.disbursedPaise).toBe(75000n);
    expect(secondResult?.disbursedPaise).toBe(0n);
  });
});

describe("voidDisbursement", () => {
  it("marks the row VOID instead of deleting it, and writes an audit entry", async () => {
    const actor = await prisma.user.create({ data: { email: "boss@example.com" } });
    const created = await aCase();
    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK", paidTo: "Apollo Hospital" },
      actor.id,
    );

    await voidDisbursement(disbursement.id, actor.id);

    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after).not.toBeNull();
    expect(after?.status).toBe("VOID");
    expect(after?.paidTo).toBe("Apollo Hospital"); // untouched, not deleted

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Disbursement", entityId: disbursement.id, action: "VOID" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(actor.id);
  });

  it("is idempotent: voiding an already-voided disbursement is a no-op", async () => {
    const created = await aCase();
    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );

    await voidDisbursement(disbursement.id, null);
    await voidDisbursement(disbursement.id, null);

    const voidAudits = await prisma.auditLog.count({
      where: { entityType: "Disbursement", entityId: disbursement.id, action: "VOID" },
    });
    expect(voidAudits).toBe(1);
  });

  it("throws for an unknown disbursement", async () => {
    await expect(voidDisbursement("does-not-exist", null)).rejects.toThrow();
  });

  it("excludes the voided disbursement from caseDisbursedTotal", async () => {
    const created = await aCase();
    const keep = await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );
    const drop = await createDisbursement(
      created.id,
      { amountPaise: 500000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "CASH" },
      null,
    );
    expect(await caseDisbursedTotal(created.id)).toBe(600000n);

    await voidDisbursement(drop.id, null);

    expect(await caseDisbursedTotal(created.id)).toBe(100000n);
    expect(keep.amountPaise).toBe(100000);
  });

  it("excludes the voided disbursement from listCases' per-case total", async () => {
    const created = await aCase();
    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 75000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );

    await voidDisbursement(disbursement.id, null);

    const list = await listCases();
    const found = list.find((c) => c.id === created.id);
    expect(found?.disbursedPaise).toBe(0n);
  });
});

describe("updateDisbursement", () => {
  it("changes fields non-destructively and writes an audit entry", async () => {
    const actor = await prisma.user.create({ data: { email: "boss@example.com" } });
    const created = await aCase();
    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK", paidTo: "Apollo Hospital" },
      actor.id,
    );

    const updated = await updateDisbursement(
      disbursement.id,
      { amountPaise: 150000, paidTo: "Care Hospital" },
      actor.id,
    );

    expect(updated.amountPaise).toBe(150000);
    expect(updated.paidTo).toBe("Care Hospital");
    expect(updated.mode).toBe("BANK"); // left untouched

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Disbursement", entityId: disbursement.id, action: "UPDATE" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.before as { amountPaise: number }).amountPaise).toBe(100000);
    expect((audit?.after as { amountPaise: number }).amountPaise).toBe(150000);
  });

  it("leaves a field untouched when the update omits it", async () => {
    const created = await aCase();
    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK", note: "Original note" },
      null,
    );

    await updateDisbursement(disbursement.id, { amountPaise: 200000 }, null);

    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.amountPaise).toBe(200000);
    expect(after?.note).toBe("Original note");
  });

  it("refuses to edit a VOID disbursement", async () => {
    const created = await aCase();
    const disbursement = await createDisbursement(
      created.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );
    await voidDisbursement(disbursement.id, null);

    await expect(updateDisbursement(disbursement.id, { amountPaise: 999 }, null)).rejects.toThrow();
  });

  it("throws for an unknown disbursement", async () => {
    await expect(updateDisbursement("does-not-exist", { amountPaise: 999 }, null)).rejects.toThrow();
  });
});

describe("getCase", () => {
  it("returns the full row including private fields and disbursements", async () => {
    const created = await aCase();
    await createDisbursement(
      created.id,
      { amountPaise: 25000, paidOn: new Date(Date.UTC(2026, 5, 15)), mode: "BANK" },
      null,
    );

    const found = await getCase(created.id);
    expect(found?.beneficiaryName).toBe("Ganesh Rao");
    expect(found?.privateNotes).toBe("Verified via local hospital.");
    expect(found?.disbursements).toHaveLength(1);
    expect(found?.type).toBe("ONCE");
    expect(found?.status).toBe("ACTIVE");
  });

  it("returns null for an unknown id", async () => {
    expect(await getCase("does-not-exist")).toBeNull();
  });
});
