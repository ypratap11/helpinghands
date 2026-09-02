import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, requireAdmin: requireAdminMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { ForbiddenError } = await import("@/lib/authz");
const { createCase } = await import("@/lib/data/cases");
const { uploadAttachmentAction, deleteAttachmentAction } = await import(
  "@/app/admin/cases/[id]/actions"
);

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

function pngFile(name = "photo.png"): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

function form(fields: Record<string, string | File>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function aCase() {
  return createCase(
    {
      title: "Hospital bill for a daily-wage worker",
      category: "MEDICAL",
      publicSummary: "Medical support for a family after an accident.",
      occurredOn: new Date(Date.UTC(2026, 5, 10)),
    },
    null,
  );
}

describe("uploadAttachmentAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("saves an attachment for an admin", async () => {
    const caseRecord = await aCase();

    const result = await uploadAttachmentAction(
      {},
      form({
        entityType: "CASE",
        entityId: caseRecord.id,
        isPublic: "true",
        file: pngFile(),
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.attachment.findFirst({ where: { entityId: caseRecord.id } });
    expect(saved?.mimeType).toBe("image/png");
    expect(saved?.isPublic).toBe(true);
  });

  it("defaults a DISBURSEMENT attachment to private even if isPublic is sent", async () => {
    const caseRecord = await aCase();
    const disbursement = await prisma.disbursement.create({
      data: {
        caseId: caseRecord.id,
        amountPaise: 50000,
        paidOn: new Date(Date.UTC(2026, 5, 12)),
        mode: "UPI",
      },
    });

    const result = await uploadAttachmentAction(
      {},
      form({
        entityType: "DISBURSEMENT",
        entityId: disbursement.id,
        isPublic: "true",
        file: pngFile(),
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.attachment.findFirst({ where: { entityId: disbursement.id } });
    expect(saved?.isPublic).toBe(false);
  });

  it("refuses a non-admin and writes nothing", async () => {
    requireAdminMock.mockRejectedValue(new ForbiddenError());
    const caseRecord = await aCase();

    const result = await uploadAttachmentAction(
      {},
      form({ entityType: "CASE", entityId: caseRecord.id, file: pngFile() }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.attachment.count()).toBe(0);
  });

  it("rejects a disguised non-image file and writes nothing", async () => {
    const caseRecord = await aCase();
    const fakeFile = new File([Buffer.from("not really a png")], "fake.png", { type: "image/png" });

    const result = await uploadAttachmentAction(
      {},
      form({ entityType: "CASE", entityId: caseRecord.id, file: fakeFile }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.attachment.count()).toBe(0);
  });

  it("rejects a file over 10MB and writes nothing", async () => {
    const caseRecord = await aCase();
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(11 * 1024 * 1024)]);
    const bigFile = new File([oversized], "big.png", { type: "image/png" });

    const result = await uploadAttachmentAction(
      {},
      form({ entityType: "CASE", entityId: caseRecord.id, file: bigFile }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.attachment.count()).toBe(0);
  });

  it("rejects a missing file", async () => {
    const caseRecord = await aCase();

    const result = await uploadAttachmentAction(
      {},
      form({ entityType: "CASE", entityId: caseRecord.id }),
    );

    expect(result.error).toBeTruthy();
    expect(await prisma.attachment.count()).toBe(0);
  });
});

describe("deleteAttachmentAction", () => {
  beforeEach(async () => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "boss@example.com", role: "ADMIN" });
    await prisma.user.create({ data: { id: "admin1", email: "boss@example.com", role: "ADMIN" } });
  });

  it("deletes an attachment for an admin", async () => {
    const caseRecord = await aCase();
    const uploaded = await uploadAttachmentAction(
      {},
      form({ entityType: "CASE", entityId: caseRecord.id, file: pngFile() }),
    );
    expect(uploaded.ok).toBe(true);
    const saved = await prisma.attachment.findFirst({ where: { entityId: caseRecord.id } });

    await deleteAttachmentAction(form({ id: saved!.id, caseId: caseRecord.id }));

    expect(await prisma.attachment.findUnique({ where: { id: saved!.id } })).toBeNull();
  });

  it("refuses a non-admin and deletes nothing", async () => {
    const caseRecord = await aCase();
    const uploaded = await uploadAttachmentAction(
      {},
      form({ entityType: "CASE", entityId: caseRecord.id, file: pngFile() }),
    );
    expect(uploaded.ok).toBe(true);
    const saved = await prisma.attachment.findFirst({ where: { entityId: caseRecord.id } });

    requireAdminMock.mockRejectedValue(new ForbiddenError());
    await deleteAttachmentAction(form({ id: saved!.id, caseId: caseRecord.id }));

    expect(await prisma.attachment.findUnique({ where: { id: saved!.id } })).not.toBeNull();
  });
});
