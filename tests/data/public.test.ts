import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAttachment } from "@/lib/data/attachments";
import { createCase, createDisbursement, setCasePublished, voidDisbursement } from "@/lib/data/cases";
import { createContribution, voidContribution } from "@/lib/data/contributions";
import { createContributor } from "@/lib/data/contributors";
import { getPublishedCase, listPublicCaseImages, listPublishedCases, publicImpact } from "@/lib/data/public";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);

async function aContributor(name = "Asha") {
  return createContributor({ name, email: null }, null);
}

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
    expect(pc.type).toBe("ONCE");
    expect(pc.status).toBe("ACTIVE");
    // The cause name is admin-authored and now intentionally public, so it
    // must be present verbatim — distinct from the beneficiaryName marker
    // below, which must never appear.
    expect(pc.title).toBe("Hospital bill for a daily-wage worker");

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

  it("excludes a voided disbursement from a case's disbursed total", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    const drop = await createDisbursement(
      c.id,
      { amountPaise: 1500000, paidOn: new Date(Date.UTC(2026, 5, 12)), mode: "BANK" },
      null,
    );

    await voidDisbursement(drop.id, null);

    const pc = (await listPublishedCases())[0];
    expect(pc.disbursedPaise).toBe(0n);
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

  it("is zero when there are no contributions", async () => {
    const impact = await publicImpact();
    expect(impact.contributorCount).toBe(0);
  });

  it("counts distinct ACTIVE contributors, not contribution records", async () => {
    const asha = await aContributor("Asha");
    // Two active contributions from the SAME person count once.
    for (const amountPaise of [100000, 200000]) {
      await createContribution(
        { contributorId: asha.id, amountPaise, receivedOn: new Date(Date.UTC(2026, 7, 28)), mode: "CASH" },
        null,
      );
    }
    // A different person adds one.
    const ravi = await aContributor("Ravi");
    await createContribution(
      { contributorId: ravi.id, amountPaise: 300000, receivedOn: new Date(Date.UTC(2026, 7, 28)), mode: "CASH" },
      null,
    );
    // A third person whose only contribution is voided is not counted.
    const meena = await aContributor("Meena");
    const voided = await createContribution(
      { contributorId: meena.id, amountPaise: 500000, receivedOn: new Date(Date.UTC(2026, 7, 28)), mode: "CASH" },
      null,
    );
    await voidContribution(voided.id, null);

    const impact = await publicImpact();
    expect(impact.contributorCount).toBe(2); // Asha + Ravi (distinct); Meena excluded (voided)
  });

  it("excludes a voided disbursement from disbursedPaise", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    const keep = await createDisbursement(
      c.id,
      { amountPaise: 100000, paidOn: new Date(Date.UTC(2026, 5, 12)), mode: "BANK" },
      null,
    );
    const drop = await createDisbursement(
      c.id,
      { amountPaise: 500000, paidOn: new Date(Date.UTC(2026, 5, 12)), mode: "BANK" },
      null,
    );

    const before = await publicImpact();
    expect(before.disbursedPaise).toBe(600000n);

    await voidDisbursement(drop.id, null);

    const after = await publicImpact();
    expect(after.disbursedPaise).toBe(100000n);
    expect(keep.amountPaise).toBe(100000);
  });
});

describe("listPublicCaseImages", () => {
  it("returns only public image attachments for a published case", async () => {
    const admin = await prisma.user.create({ data: { email: "admin@example.com", role: "ADMIN" } });
    const c = await aCase();
    await setCasePublished(c.id, true, null);

    await createAttachment({ entityType: "CASE", entityId: c.id, isPublic: true }, PNG_BYTES, "cover.png", admin.id);
    await createAttachment({ entityType: "CASE", entityId: c.id, isPublic: false }, PNG_BYTES, "private.png", admin.id);
    await createAttachment({ entityType: "CASE", entityId: c.id, isPublic: true }, PDF_BYTES, "receipt.pdf", admin.id);

    const images = await listPublicCaseImages(c.id);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe("cover.png");
    expect(images[0].mimeType).toBe("image/png");
  });

  it("returns nothing for a case with no attachments", async () => {
    const c = await aCase();
    await setCasePublished(c.id, true, null);
    expect(await listPublicCaseImages(c.id)).toEqual([]);
  });
});
