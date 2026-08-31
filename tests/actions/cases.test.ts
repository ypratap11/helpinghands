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
