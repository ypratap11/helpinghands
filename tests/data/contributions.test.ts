import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createContributor } from "@/lib/data/contributors";
import {
  createContribution,
  ledgerTotals,
  listContributions,
  listMyContributions,
  voidContribution,
} from "@/lib/data/contributions";

async function aContributor(name = "Asha", email?: string) {
  return createContributor({ name, email: email ?? null }, null);
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
});
