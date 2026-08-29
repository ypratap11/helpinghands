import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, requireAdmin: requireAdminMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { ForbiddenError } = await import("@/lib/authz");
const { addContributionAction, voidContributionAction } = await import(
  "@/app/admin/contributions/actions"
);

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("addContributionAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    // The mocked actor id must correspond to a real User row: recordAudit()
    // (called by createContribution) writes AuditLog.userId, which carries a
    // foreign key to User.id. Without a real row here, every successful save
    // fails downstream with a P2003 FK violation, masking the very case
    // ("converts the typed rupee amount to paise") this suite exists to
    // prove works. requireAdmin itself is still fully mocked/stubbed above —
    // this only satisfies referential integrity for the audit write.
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("converts the typed rupee amount to paise", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({
        contributorId: contributor.id,
        amount: "2,500.50",
        receivedOn: "2026-08-28",
        mode: "UPI",
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.contribution.findFirst();
    expect(saved?.amountPaise).toBe(250050);
    expect(saved?.receivedOn.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(saved?.receiptNo).toBe("HH/2026-27/0001");
  });

  it("rejects a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "100", receivedOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.contribution.count()).toBe(0);
  });

  it("returns a readable error for a bad amount", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "abc", receivedOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toMatch(/amount/i);
    expect(await prisma.contribution.count()).toBe(0);
  });

  it("rejects a missing date", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "100", receivedOn: "", mode: "CASH" }),
    );

    expect(result.error).toMatch(/date/i);
  });

  it("rejects a date whose components roll over into a different day, and writes nothing", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({ contributorId: contributor.id, amount: "100", receivedOn: "2026-13-40", mode: "CASH" }),
    );

    expect(result.error).toMatch(/date/i);
    expect(await prisma.contribution.count()).toBe(0);
  });

  it("rejects an empty contributorId and writes nothing", async () => {
    const result = await addContributionAction(
      {},
      form({ contributorId: "", amount: "100", receivedOn: "2026-08-28", mode: "CASH" }),
    );

    expect(result.error).toMatch(/who this came from/i);
    expect(await prisma.contribution.count()).toBe(0);
  });

  it("returns a friendly error for an amount above the postgres INT4 ceiling and writes nothing", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });

    const result = await addContributionAction(
      {},
      form({
        contributorId: contributor.id,
        amount: "21474836.48",
        receivedOn: "2026-08-28",
        mode: "CASH",
      }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.contribution.count()).toBe(0);
  });
});

describe("voidContributionAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("voids the contribution for an admin", async () => {
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });
    const contribution = await prisma.contribution.create({
      data: {
        contributorId: contributor.id,
        amountPaise: 1000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
    });

    await voidContributionAction(form({ id: contribution.id }));

    const after = await prisma.contribution.findUnique({ where: { id: contribution.id } });
    expect(after?.status).toBe("VOID");
  });

  it("returns cleanly for a non-admin instead of throwing, and voids nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });
    const contribution = await prisma.contribution.create({
      data: {
        contributorId: contributor.id,
        amountPaise: 1000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
    });

    await expect(voidContributionAction(form({ id: contribution.id }))).resolves.toBeUndefined();

    const after = await prisma.contribution.findUnique({ where: { id: contribution.id } });
    expect(after?.status).toBe("ACTIVE");
  });
});
