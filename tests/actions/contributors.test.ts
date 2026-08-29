import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, requireAdmin: requireAdminMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { ForbiddenError } = await import("@/lib/authz");
const { saveContributorAction } = await import("@/app/admin/contributors/actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("saveContributorAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    // The mocked actor id must correspond to a real User row: recordAudit()
    // (called by createContributor/updateContributor) writes AuditLog.userId,
    // which carries a foreign key to User.id. Without a real row here, every
    // successful save fails downstream with a P2003 FK violation, masking the
    // very case ("creates a contributor for an admin") this suite exists to
    // prove works. requireAdmin itself is still fully mocked/stubbed above —
    // this only satisfies referential integrity for the audit write.
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("creates a contributor for an admin", async () => {
    const result = await saveContributorAction({}, form({ name: "Asha", email: "asha@example.com" }));

    expect(result.ok).toBe(true);
    expect(await prisma.contributor.count({ where: { name: "Asha" } })).toBe(1);
  });

  it("refuses a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());

    const result = await saveContributorAction({}, form({ name: "Sneaky" }));

    expect(result.error).toBeTruthy();
    expect(await prisma.contributor.count({ where: { name: "Sneaky" } })).toBe(0);
  });

  it("returns a readable error for a missing name rather than throwing", async () => {
    const result = await saveContributorAction({}, form({ name: "" }));
    expect(result.error).toMatch(/name/i);
  });

  it("updates when an id is supplied", async () => {
    const created = await prisma.contributor.create({ data: { name: "Asha" } });
    const result = await saveContributorAction({}, form({ id: created.id, name: "Asha Nair" }));

    expect(result.ok).toBe(true);
    const after = await prisma.contributor.findUnique({ where: { id: created.id } });
    expect(after?.name).toBe("Asha Nair");
  });
});
