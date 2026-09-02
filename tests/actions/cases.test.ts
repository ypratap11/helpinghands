import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, requireAdmin: requireAdminMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { ForbiddenError } = await import("@/lib/authz");
const { saveCaseAction, addDisbursementAction, setPublishedAction } = await import(
  "@/app/admin/cases/actions"
);
const { voidDisbursementAction, editDisbursementAction } = await import(
  "@/app/admin/cases/[id]/actions"
);

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("saveCaseAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    // The mocked actor id must correspond to a real User row: recordAudit()
    // (called by createCase/updateCase/createDisbursement) writes
    // AuditLog.userId, which carries a foreign key to User.id. Without a real
    // row here, every successful save fails downstream with a P2003 FK
    // violation, masking the very cases this suite exists to prove work.
    // requireAdmin itself is still fully mocked/stubbed above — this only
    // satisfies referential integrity for the audit write.
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("creates a case for an admin", async () => {
    const result = await saveCaseAction(
      {},
      form({
        title: "Hospital bill for a daily-wage worker",
        category: "MEDICAL",
        publicSummary: "Medical support for a family after an accident.",
        occurredOn: "2026-08-28",
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.case.findFirst();
    expect(saved?.title).toBe("Hospital bill for a daily-wage worker");
    expect(saved?.category).toBe("MEDICAL");
    expect(saved?.type).toBe("ONCE");
    expect(saved?.status).toBe("ACTIVE");
  });

  it("persists an explicit type and status from FormData", async () => {
    const result = await saveCaseAction(
      {},
      form({
        title: "Yearly scholarship support",
        category: "EDUCATION",
        publicSummary: "Yearly school fee support for a student.",
        occurredOn: "2026-08-28",
        type: "YEARLY",
        status: "CLOSED",
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.case.findFirst({ where: { title: "Yearly scholarship support" } });
    expect(saved?.type).toBe("YEARLY");
    expect(saved?.status).toBe("CLOSED");
  });

  it("refuses a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());

    const result = await saveCaseAction(
      {},
      form({
        title: "Sneaky case",
        category: "MEDICAL",
        publicSummary: "Should not save.",
        occurredOn: "2026-08-28",
      }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.case.count()).toBe(0);
  });

  it("rejects a missing title and writes nothing", async () => {
    const result = await saveCaseAction(
      {},
      form({
        title: "",
        category: "MEDICAL",
        publicSummary: "Medical support.",
        occurredOn: "2026-08-28",
      }),
    );

    expect(result.error).toMatch(/title/i);
    expect(await prisma.case.count()).toBe(0);
  });

  it("rejects a date whose components roll over into a different day, and writes nothing", async () => {
    const result = await saveCaseAction(
      {},
      form({
        title: "Hospital bill",
        category: "MEDICAL",
        publicSummary: "Medical support.",
        occurredOn: "2026-13-40",
      }),
    );

    expect(result.error).toMatch(/date/i);
    expect(await prisma.case.count()).toBe(0);
  });

  it("updates an existing case when an id is supplied", async () => {
    const created = await prisma.case.create({
      data: {
        title: "Original title",
        category: "MEDICAL",
        publicSummary: "Original summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    const result = await saveCaseAction(
      {},
      form({
        id: created.id,
        title: "Updated title",
        category: "MEDICAL",
        publicSummary: "Updated summary.",
        occurredOn: "2026-06-10",
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.title).toBe("Updated title");
  });

  it("updates type and status when an id is supplied", async () => {
    const created = await prisma.case.create({
      data: {
        title: "Original title",
        category: "MEDICAL",
        publicSummary: "Original summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });
    expect(created.type).toBe("ONCE");
    expect(created.status).toBe("ACTIVE");

    const result = await saveCaseAction(
      {},
      form({
        id: created.id,
        title: "Original title",
        category: "MEDICAL",
        publicSummary: "Original summary.",
        occurredOn: "2026-06-10",
        type: "MONTHLY",
        status: "CANCELLED",
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.type).toBe("MONTHLY");
    expect(after?.status).toBe("CANCELLED");
  });

  describe("historical backfill", () => {
    it('records exactly one disbursement of 5000000 paise dated to occurredOn when "Total already given" is "50,000"', async () => {
      const result = await saveCaseAction(
        {},
        form({
          title: "Past cause recorded from WhatsApp history",
          category: "FOOD",
          publicSummary: "Food support given before this system existed.",
          occurredOn: "2025-03-15",
          historicalTotal: "50,000",
        }),
      );

      expect(result.ok).toBe(true);
      const saved = await prisma.case.findFirst({ where: { title: "Past cause recorded from WhatsApp history" } });
      expect(saved).not.toBeNull();

      const disbursements = await prisma.disbursement.findMany({ where: { caseId: saved!.id } });
      expect(disbursements).toHaveLength(1);
      expect(disbursements[0].amountPaise).toBe(5000000);
      expect(disbursements[0].paidOn.toISOString()).toBe("2025-03-15T00:00:00.000Z");
      expect(disbursements[0].mode).toBe("OTHER");
      expect(disbursements[0].note).toBe("Recorded as a past total");
    });

    it("creates zero disbursements when the historical total is left empty", async () => {
      const result = await saveCaseAction(
        {},
        form({
          title: "Ordinary new case",
          category: "FOOD",
          publicSummary: "A brand new cause with no past history.",
          occurredOn: "2026-08-28",
        }),
      );

      expect(result.ok).toBe(true);
      const saved = await prisma.case.findFirst({ where: { title: "Ordinary new case" } });
      expect(saved).not.toBeNull();

      const disbursements = await prisma.disbursement.findMany({ where: { caseId: saved!.id } });
      expect(disbursements).toHaveLength(0);
    });

    it("does not re-trigger on edit even if historicalTotal is supplied", async () => {
      const created = await prisma.case.create({
        data: {
          title: "Existing case",
          category: "MEDICAL",
          publicSummary: "Existing summary.",
          occurredOn: new Date(Date.UTC(2026, 5, 10)),
        },
      });

      const result = await saveCaseAction(
        {},
        form({
          id: created.id,
          title: "Existing case",
          category: "MEDICAL",
          publicSummary: "Existing summary.",
          occurredOn: "2026-06-10",
          historicalTotal: "10,000",
        }),
      );

      expect(result.ok).toBe(true);
      const disbursements = await prisma.disbursement.findMany({ where: { caseId: created.id } });
      expect(disbursements).toHaveLength(0);
    });

    it('records exactly one Anonymous contribution of 5600000 paise tied to the new case when "Total raised so far" is "56,000"', async () => {
      const result = await saveCaseAction(
        {},
        form({
          title: "Past cause with a raised total",
          category: "FOOD",
          publicSummary: "Food support pooled before this system existed.",
          occurredOn: "2025-03-15",
          historicalRaised: "56,000",
        }),
      );

      expect(result.ok).toBe(true);
      const saved = await prisma.case.findFirst({ where: { title: "Past cause with a raised total" } });
      expect(saved).not.toBeNull();

      const contributions = await prisma.contribution.findMany({ where: { caseId: saved!.id } });
      expect(contributions).toHaveLength(1);
      expect(contributions[0].amountPaise).toBe(5600000);
      expect(contributions[0].receivedOn.toISOString()).toBe("2025-03-15T00:00:00.000Z");
      expect(contributions[0].mode).toBe("OTHER");
      expect(contributions[0].contributorId).toBe("anonymous");
      expect(contributions[0].status).toBe("ACTIVE");
      expect(contributions[0].note).toBe("Recorded as a past total (raised)");

      const raisedTotal = await prisma.contribution.aggregate({
        where: { caseId: saved!.id, status: "ACTIVE" },
        _sum: { amountPaise: true },
      });
      expect(raisedTotal._sum.amountPaise).toBe(5600000);
    });

    it("records both a contribution and a disbursement when historicalRaised and historicalTotal are both supplied", async () => {
      const result = await saveCaseAction(
        {},
        form({
          title: "Past cause with both raised and given",
          category: "FOOD",
          publicSummary: "Food support fully backfilled.",
          occurredOn: "2025-03-15",
          historicalRaised: "60,000",
          historicalTotal: "50,000",
        }),
      );

      expect(result.ok).toBe(true);
      const saved = await prisma.case.findFirst({
        where: { title: "Past cause with both raised and given" },
      });
      expect(saved).not.toBeNull();

      const contributions = await prisma.contribution.findMany({ where: { caseId: saved!.id } });
      expect(contributions).toHaveLength(1);
      expect(contributions[0].amountPaise).toBe(6000000);

      const disbursements = await prisma.disbursement.findMany({ where: { caseId: saved!.id } });
      expect(disbursements).toHaveLength(1);
      expect(disbursements[0].amountPaise).toBe(5000000);
    });

    it("creates zero contributions and zero disbursements when neither historical field is supplied", async () => {
      const result = await saveCaseAction(
        {},
        form({
          title: "Brand new cause, no history",
          category: "FOOD",
          publicSummary: "Nothing to backfill here.",
          occurredOn: "2026-08-28",
        }),
      );

      expect(result.ok).toBe(true);
      const saved = await prisma.case.findFirst({ where: { title: "Brand new cause, no history" } });
      expect(saved).not.toBeNull();

      const contributions = await prisma.contribution.findMany({ where: { caseId: saved!.id } });
      expect(contributions).toHaveLength(0);
      const disbursements = await prisma.disbursement.findMany({ where: { caseId: saved!.id } });
      expect(disbursements).toHaveLength(0);
    });

    it("does not re-trigger on edit even if historicalRaised is supplied", async () => {
      const created = await prisma.case.create({
        data: {
          title: "Existing case for raised guard",
          category: "MEDICAL",
          publicSummary: "Existing summary.",
          occurredOn: new Date(Date.UTC(2026, 5, 10)),
        },
      });

      const result = await saveCaseAction(
        {},
        form({
          id: created.id,
          title: "Existing case for raised guard",
          category: "MEDICAL",
          publicSummary: "Existing summary.",
          occurredOn: "2026-06-10",
          historicalRaised: "10,000",
        }),
      );

      expect(result.ok).toBe(true);
      const contributions = await prisma.contribution.findMany({ where: { caseId: created.id } });
      expect(contributions).toHaveLength(0);
    });
  });
});

describe("addDisbursementAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("converts the typed rupee amount to paise for an admin", async () => {
    const created = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    const result = await addDisbursementAction(
      {},
      form({
        caseId: created.id,
        amount: "2,500.50",
        paidOn: "2026-08-28",
        mode: "UPI",
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.disbursement.findFirst({ where: { caseId: created.id } });
    expect(saved?.amountPaise).toBe(250050);
  });

  it("refuses a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const created = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    const result = await addDisbursementAction(
      {},
      form({ caseId: created.id, amount: "100", paidOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.disbursement.count()).toBe(0);
  });

  it("returns a friendly error for an amount above the postgres INT4 ceiling and writes nothing", async () => {
    const created = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    const result = await addDisbursementAction(
      {},
      form({ caseId: created.id, amount: "21474836.48", paidOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.disbursement.count()).toBe(0);
  });

  it("rejects a date whose components roll over into a different day, and writes nothing", async () => {
    const created = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    const result = await addDisbursementAction(
      {},
      form({ caseId: created.id, amount: "100", paidOn: "2026-13-40", mode: "CASH" }),
    );

    expect(result.error).toMatch(/date/i);
    expect(await prisma.disbursement.count()).toBe(0);
  });
});

describe("setPublishedAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("publishes a case for an admin", async () => {
    const created = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    await setPublishedAction(form({ id: created.id, published: "true" }));

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.isPublished).toBe(true);
  });

  it("does not flip for a non-admin", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const created = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });

    await setPublishedAction(form({ id: created.id, published: "true" }));

    const after = await prisma.case.findUnique({ where: { id: created.id } });
    expect(after?.isPublished).toBe(false);
  });
});

describe("voidDisbursementAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  async function aDisbursement() {
    const caseRecord = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });
    return prisma.disbursement.create({
      data: {
        caseId: caseRecord.id,
        amountPaise: 100000,
        paidOn: new Date(Date.UTC(2026, 5, 15)),
        mode: "BANK",
      },
    });
  }

  it("voids the disbursement for an admin", async () => {
    const disbursement = await aDisbursement();

    await voidDisbursementAction(form({ id: disbursement.id }));

    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.status).toBe("VOID");
  });

  it("returns cleanly for a non-admin instead of throwing, and voids nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const disbursement = await aDisbursement();

    await expect(voidDisbursementAction(form({ id: disbursement.id }))).resolves.toBeUndefined();

    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.status).toBe("ACTIVE");
  });
});

describe("editDisbursementAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  async function aDisbursement() {
    const caseRecord = await prisma.case.create({
      data: {
        title: "A case",
        category: "MEDICAL",
        publicSummary: "Summary.",
        occurredOn: new Date(Date.UTC(2026, 5, 10)),
      },
    });
    return prisma.disbursement.create({
      data: {
        caseId: caseRecord.id,
        amountPaise: 100000,
        paidOn: new Date(Date.UTC(2026, 5, 15)),
        mode: "BANK",
        paidTo: "Apollo Hospital",
      },
    });
  }

  it("converts the typed rupee amount to paise and updates for an admin", async () => {
    const disbursement = await aDisbursement();

    const result = await editDisbursementAction(
      {},
      form({
        id: disbursement.id,
        caseId: disbursement.caseId,
        amount: "1,500.50",
        paidOn: "2026-08-28",
        mode: "UPI",
        paidTo: "Care Hospital",
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.amountPaise).toBe(150050);
    expect(after?.mode).toBe("UPI");
    expect(after?.paidTo).toBe("Care Hospital");
  });

  it("refuses a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const disbursement = await aDisbursement();

    const result = await editDisbursementAction(
      {},
      form({
        id: disbursement.id,
        caseId: disbursement.caseId,
        amount: "999",
        paidOn: "2026-08-28",
        mode: "CASH",
      }),
    );

    expect(result.error).toBeTruthy();
    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.amountPaise).toBe(100000); // untouched
  });

  it("rejects a date whose components roll over into a different day, and writes nothing", async () => {
    const disbursement = await aDisbursement();

    const result = await editDisbursementAction(
      {},
      form({
        id: disbursement.id,
        caseId: disbursement.caseId,
        amount: "999",
        paidOn: "2026-13-40",
        mode: "CASH",
      }),
    );

    expect(result.error).toMatch(/date/i);
    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.amountPaise).toBe(100000); // untouched
  });

  it("returns a friendly error for an amount above the postgres INT4 ceiling and writes nothing", async () => {
    const disbursement = await aDisbursement();

    const result = await editDisbursementAction(
      {},
      form({
        id: disbursement.id,
        caseId: disbursement.caseId,
        amount: "21474836.48",
        paidOn: "2026-08-28",
        mode: "CASH",
      }),
    );

    expect(result.error).toBeTruthy();
    const after = await prisma.disbursement.findUnique({ where: { id: disbursement.id } });
    expect(after?.amountPaise).toBe(100000); // untouched
  });

  it("refuses to edit a VOID disbursement", async () => {
    const disbursement = await aDisbursement();
    await voidDisbursementAction(form({ id: disbursement.id }));

    const result = await editDisbursementAction(
      {},
      form({
        id: disbursement.id,
        caseId: disbursement.caseId,
        amount: "999",
        paidOn: "2026-08-28",
        mode: "CASH",
      }),
    );

    expect(result.error).toBeTruthy();
  });
});
