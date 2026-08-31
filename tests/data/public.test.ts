import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCase, createDisbursement, setCasePublished } from "@/lib/data/cases";
import { getPublishedCase, listPublishedCases, publicImpact } from "@/lib/data/public";

async function aCase(overrides: Record<string, unknown> = {}) {
  return createCase(
    {
      title: "Hospital bill for a daily-wage worker",
      category: "MEDICAL",
      publicSummary: "Medical support for a family after an accident.",
      beneficiaryName: "REAL NAME MUST NOT LEAK",
      beneficiaryContact: "+91 99999 00000",
      privateNotes: "PRIVATE NOTE MUST NOT LEAK",
      city: "Hyderabad",
      state: "Telangana",
      occurredOn: new Date(Date.UTC(2026, 5, 10)),
      ...overrides,
    },
    null,
  );
}

describe("listPublishedCases", () => {
  it("excludes unpublished cases", async () => {
    await aCase(); // unpublished
    expect(await listPublishedCases()).toEqual([]);
  });

  it("returns published cases with ONLY anonymised fields", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);

    const list = await listPublishedCases();
    expect(list).toHaveLength(1);
    const pc = list[0];

    // The public shape carries these:
    expect(pc.category).toBe("MEDICAL");
    expect(pc.publicSummary).toContain("Medical support");
    expect(pc.city).toBe("Hyderabad");

    // And CANNOT carry any of these — the whole point of the plan:
    const serialised = JSON.stringify(pc);
    expect(serialised).not.toContain("REAL NAME");
    expect(serialised).not.toContain("99999");
    expect(serialised).not.toContain("PRIVATE NOTE");
    expect(pc).not.toHaveProperty("beneficiaryName");
    expect(pc).not.toHaveProperty("beneficiaryContact");
    expect(pc).not.toHaveProperty("privateNotes");
  });

  it("includes each case's disbursed total", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    await createDisbursement(
      c.id,
      { amountPaise: 1500000, paidOn: new Date(Date.UTC(2026, 5, 12)), mode: "BANK" },
      null,
    );
    const pc = (await listPublishedCases())[0];
    expect(pc.disbursedPaise).toBe(1500000n);
  });
});

describe("getPublishedCase", () => {
  it("returns null for an unpublished case even by direct id", async () => {
    const c = await aCase();
    expect(await getPublishedCase(c.id)).toBeNull();
  });

  it("returns anonymised detail for a published case", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    const pc = await getPublishedCase(c.id);
    expect(pc).not.toBeNull();
    expect(JSON.stringify(pc)).not.toContain("REAL NAME");
  });
});

describe("publicImpact", () => {
  it("counts only published cases as people helped, and hides balance by default", async () => {
    const c1 = await aCase();
    await setCasePublished(c1.id, true, null);
    await aCase(); // unpublished — must not count

    const impact = await publicImpact();
    expect(impact.peopleHelped).toBe(1);
    expect(impact.balancePaise).toBeNull(); // showBalancePublicly defaults false
  });

  it("exposes balance only when showBalancePublicly is true", async () => {
    await prisma.orgSettings.update({
      where: { id: "singleton" },
      data: { showBalancePublicly: true },
    });
    const impact = await publicImpact();
    expect(impact.balancePaise).not.toBeNull();
  });
});
