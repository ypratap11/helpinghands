import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCase } from "@/lib/data/cases";
import { createContributor } from "@/lib/data/contributors";
import {
  caseContributionCount,
  caseRaisedTotal,
  createContribution,
  ledgerTotals,
  listCaseContributions,
  listContributions,
  listMyContributions,
  myYearlyTotals,
  voidContribution,
} from "@/lib/data/contributions";

async function aContributor(name = "Asha", email?: string) {
  return createContributor({ name, email: email ?? null }, null);
}

async function aCase(overrides: Record<string, unknown> = {}) {
  return createCase(
    {
      title: "Hospital bill for a daily-wage worker",
      category: "MEDICAL",
      publicSummary: "Medical support for a family after an accident.",
      occurredOn: new Date(Date.UTC(2026, 5, 10)),
      ...overrides,
    },
    null,
  );
}

describe("createContribution", () => {
  it("stores paise and assigns a receipt number from the received date", async () => {
    const contributor = await aContributor();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 250000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
        reference: "UTR123",
      },
      null,
    );

    expect(created.amountPaise).toBe(250000);
    expect(created.receiptNo).toBe("HH/2026-27/0001");
    expect(created.status).toBe("ACTIVE");
  });

  it("uses the receipt prefix from settings", async () => {
    await prisma.orgSettings.update({
      where: { id: "singleton" },
      data: { receiptPrefix: "HHF" },
    });
    const contributor = await aContributor();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    expect(created.receiptNo?.startsWith("HHF/")).toBe(true);
  });

  it("rejects a zero or negative amount", async () => {
    const contributor = await aContributor();
    await expect(
      createContribution(
        {
          contributorId: contributor.id,
          amountPaise: 0,
          receivedOn: new Date(Date.UTC(2026, 7, 28)),
          mode: "CASH",
        },
        null,
      ),
    ).rejects.toThrow();
  });

  it("allows recording against the Anonymous contributor", async () => {
    const created = await createContribution(
      {
        contributorId: "anonymous",
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );
    expect(created.contributorId).toBe("anonymous");
  });

  it("writes an audit entry", async () => {
    const contributor = await aContributor();
    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Contribution", entityId: created.id },
    });
    expect(audit?.action).toBe("CREATE");
  });

  it("persists an optional caseId when the contribution is earmarked for a cause", async () => {
    const contributor = await aContributor();
    const caseRecord = await aCase();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );

    expect(created.caseId).toBe(caseRecord.id);
    const row = await prisma.contribution.findUnique({ where: { id: created.id } });
    expect(row?.caseId).toBe(caseRecord.id);
  });

  it("stores null caseId for a general contribution not tied to any cause", async () => {
    const contributor = await aContributor();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    expect(created.caseId).toBeNull();
  });

  it("includes caseId in the audit after-snapshot", async () => {
    const contributor = await aContributor();
    const caseRecord = await aCase();

    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Contribution", entityId: created.id },
    });
    expect((audit?.after as { caseId: string | null }).caseId).toBe(caseRecord.id);
  });
});

describe("voidContribution", () => {
  it("marks the row VOID instead of deleting it, keeping the receipt number", async () => {
    const contributor = await aContributor();
    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    await voidContribution(created.id, null);

    const after = await prisma.contribution.findUnique({ where: { id: created.id } });
    expect(after).not.toBeNull();
    expect(after?.status).toBe("VOID");
    expect(after?.receiptNo).toBe(created.receiptNo);
  });

  it("excludes voided money from the ledger totals", async () => {
    const contributor = await aContributor();
    const keep = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );
    const drop = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 500000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    await voidContribution(drop.id, null);

    const totals = await ledgerTotals();
    expect(totals.collectedPaise).toBe(100000n);
    expect(keep.status).toBe("ACTIVE");
  });

  it("writes a VOID audit row with the actor id", async () => {
    const actor = await prisma.user.create({ data: { email: "boss@example.com" } });
    const contributor = await aContributor();
    const created = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      actor.id,
    );

    await voidContribution(created.id, actor.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Contribution", entityId: created.id, action: "VOID" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(actor.id);
    expect((audit?.after as { status: string }).status).toBe("VOID");
  });
});

describe("listContributions", () => {
  it("filters by financial year using receivedOn", async () => {
    const contributor = await aContributor();
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 2, 31)),
        mode: "CASH",
      },
      null,
    );
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 200,
        receivedOn: new Date(Date.UTC(2026, 3, 1)),
        mode: "CASH",
      },
      null,
    );

    expect((await listContributions({ financialYear: "2025-26" })).length).toBe(1);
    expect((await listContributions({ financialYear: "2026-27" })).length).toBe(1);
  });

  it("includes the linked case's id and title for an earmarked contribution", async () => {
    const contributor = await aContributor();
    const caseRecord = await aCase({ title: "Flood relief" });
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );

    const [found] = await listContributions();
    expect(found.case).toEqual({ id: caseRecord.id, title: "Flood relief" });
  });

  it("returns a null case for a general contribution", async () => {
    const contributor = await aContributor();
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    const [found] = await listContributions();
    expect(found.case).toBeNull();
  });
});

describe("caseRaisedTotal", () => {
  it("sums only ACTIVE contributions earmarked for that case", async () => {
    const contributor = await aContributor();
    const caseRecord = await aCase();
    const otherCase = await aCase({ title: "Other cause" });

    const keep = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    const voided = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 500000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 900000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: otherCase.id,
      },
      null,
    );

    await voidContribution(voided.id, null);

    expect(await caseRaisedTotal(caseRecord.id)).toBe(100000n);
    expect(keep.status).toBe("ACTIVE");
  });

  it("returns zero for a case with no earmarked contributions", async () => {
    const caseRecord = await aCase();
    expect(await caseRaisedTotal(caseRecord.id)).toBe(0n);
  });
});

describe("caseContributionCount", () => {
  it("counts only ACTIVE contributions earmarked for that case", async () => {
    const contributor = await aContributor();
    const caseRecord = await aCase();
    const otherCase = await aCase({ title: "Other cause" });

    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    const voided = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 500000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    await voidContribution(voided.id, null);
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 900000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
        caseId: otherCase.id,
      },
      null,
    );
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 700000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
      null,
    );

    expect(await caseContributionCount(caseRecord.id)).toBe(1);
  });

  it("returns zero for a case with no earmarked contributions", async () => {
    const caseRecord = await aCase();
    expect(await caseContributionCount(caseRecord.id)).toBe(0);
  });
});

describe("listCaseContributions", () => {
  it("returns ACTIVE contributions for the case, newest first", async () => {
    const contributor = await aContributor("Asha");
    const caseRecord = await aCase();
    const otherCase = await aCase({ title: "Other cause" });

    const older = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 1)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    const newer = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 200000,
        receivedOn: new Date(Date.UTC(2026, 7, 15)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    const voided = await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 300000,
        receivedOn: new Date(Date.UTC(2026, 7, 20)),
        mode: "CASH",
        caseId: caseRecord.id,
      },
      null,
    );
    await voidContribution(voided.id, null);
    await createContribution(
      {
        contributorId: contributor.id,
        amountPaise: 400000,
        receivedOn: new Date(Date.UTC(2026, 7, 25)),
        mode: "CASH",
        caseId: otherCase.id,
      },
      null,
    );

    const list = await listCaseContributions(caseRecord.id);
    expect(list.map((c) => c.id)).toEqual([newer.id, older.id]);
  });

  it("returns an empty list for a case with no contributions", async () => {
    const caseRecord = await aCase();
    expect(await listCaseContributions(caseRecord.id)).toEqual([]);
  });
});

describe("listMyContributions", () => {
  it("returns only the signed-in user's own contributions", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });
    const ravi = await aContributor("Ravi", "ravi@example.com");

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: ravi.id,
        amountPaise: 900000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );

    const list = await listMyContributions(mine.id);
    expect(list.length).toBe(1);
    expect(list[0].amountPaise).toBe(100000);
  });

  it("returns nothing for a user with no linked contributor", async () => {
    const stranger = await prisma.user.create({ data: { email: "nobody@example.com" } });
    expect(await listMyContributions(stranger.id)).toEqual([]);
  });

  it("hides voided contributions from the member", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });

    const created = await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );
    await voidContribution(created.id, null);

    expect(await listMyContributions(mine.id)).toEqual([]);
  });

  it("includes the tied case's id and title for an earmarked contribution", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });
    const caseRecord = await aCase({ title: "Flood relief" });

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
        caseId: caseRecord.id,
      },
      null,
    );

    const [found] = await listMyContributions(mine.id);
    expect(found.case).toEqual({ id: caseRecord.id, title: "Flood relief" });
  });

  it("returns a null case for a general contribution not tied to any cause", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "UPI",
      },
      null,
    );

    const [found] = await listMyContributions(mine.id);
    expect(found.case).toBeNull();
  });
});

describe("myYearlyTotals", () => {
  it("groups by Indian financial year, a 31-Mar and 1-Apr contribution landing in different years", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 2, 31)), // 31 Mar 2026 -> FY 2025-26
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 200000,
        receivedOn: new Date(Date.UTC(2026, 3, 1)), // 1 Apr 2026 -> FY 2026-27
        mode: "UPI",
      },
      null,
    );

    const totals = await myYearlyTotals(mine.id);
    expect(totals).toEqual([
      { financialYear: "2026-27", totalPaise: 200000n, count: 1 },
      { financialYear: "2025-26", totalPaise: 100000n, count: 1 },
    ]);
  });

  it("sums multiple ACTIVE contributions within the same financial year and excludes voided ones", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 1)),
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 250000,
        receivedOn: new Date(Date.UTC(2026, 7, 15)),
        mode: "CASH",
      },
      null,
    );
    const voided = await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 900000,
        receivedOn: new Date(Date.UTC(2026, 7, 20)),
        mode: "CASH",
      },
      null,
    );
    await voidContribution(voided.id, null);

    const totals = await myYearlyTotals(mine.id);
    expect(totals).toEqual([{ financialYear: "2026-27", totalPaise: 350000n, count: 2 }]);
  });

  it("sorts financial years newest first", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2024, 7, 1)), // FY 2024-25
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 200000,
        receivedOn: new Date(Date.UTC(2026, 7, 1)), // FY 2026-27
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 300000,
        receivedOn: new Date(Date.UTC(2025, 7, 1)), // FY 2025-26
        mode: "UPI",
      },
      null,
    );

    const totals = await myYearlyTotals(mine.id);
    expect(totals.map((t) => t.financialYear)).toEqual(["2026-27", "2025-26", "2024-25"]);
  });

  it("returns an empty array for a user with no linked contributions", async () => {
    const stranger = await prisma.user.create({ data: { email: "nobody@example.com" } });
    expect(await myYearlyTotals(stranger.id)).toEqual([]);
  });

  it("excludes other users' contributions from the totals", async () => {
    const mine = await prisma.user.create({ data: { email: "asha@example.com" } });
    const asha = await aContributor("Asha", "asha@example.com");
    await prisma.contributor.update({ where: { id: asha.id }, data: { userId: mine.id } });
    const ravi = await aContributor("Ravi", "ravi@example.com");

    await createContribution(
      {
        contributorId: asha.id,
        amountPaise: 100000,
        receivedOn: new Date(Date.UTC(2026, 7, 1)),
        mode: "UPI",
      },
      null,
    );
    await createContribution(
      {
        contributorId: ravi.id,
        amountPaise: 900000,
        receivedOn: new Date(Date.UTC(2026, 7, 1)),
        mode: "UPI",
      },
      null,
    );

    const totals = await myYearlyTotals(mine.id);
    expect(totals).toEqual([{ financialYear: "2026-27", totalPaise: 100000n, count: 1 }]);
  });
});
