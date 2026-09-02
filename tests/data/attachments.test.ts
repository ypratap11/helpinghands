import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCase } from "@/lib/data/cases";
import {
  AttachmentTooLargeError,
  createAttachment,
  deleteAttachment,
  getAttachment,
  isAttachmentPubliclyServable,
  listAttachments,
  UnsupportedFileTypeError,
} from "@/lib/data/attachments";
import { readFile } from "@/lib/storage";
import { setCasePublished } from "@/lib/data/cases";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

async function anAdmin() {
  return prisma.user.create({ data: { email: "admin@example.com", role: "ADMIN" } });
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

describe("createAttachment", () => {
  it("sniffs the real type, saves the bytes, and creates an audited row", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();

    const created = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id, isPublic: true },
      PNG_BYTES,
      "cause-photo.png",
      admin.id,
    );

    expect(created.mimeType).toBe("image/png");
    expect(created.sizeBytes).toBe(PNG_BYTES.length);
    expect(created.isPublic).toBe(true);
    expect(created.entityType).toBe("CASE");
    expect(created.entityId).toBe(caseRecord.id);
    expect(created.uploadedByUserId).toBe(admin.id);

    // storageKey must never be derived from the declared filename.
    expect(created.storageKey).not.toContain("cause-photo");
    expect(created.storageKey).toMatch(/\.png$/);

    const onDisk = await readFile(created.storageKey);
    expect(onDisk.equals(PNG_BYTES)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Attachment", entityId: created.id },
    });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.userId).toBe(admin.id);
  });

  it("defaults isPublic to false when not supplied", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();

    const created = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id },
      PNG_BYTES,
      "photo.png",
      admin.id,
    );

    expect(created.isPublic).toBe(false);
  });

  it("rejects a file whose real bytes are not one of the allowed formats, and saves nothing", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    const notAnImage = Buffer.from("just some text pretending to be a photo.png");

    await expect(
      createAttachment(
        { entityType: "CASE", entityId: caseRecord.id },
        notAnImage,
        "totally-a-photo.png",
        admin.id,
      ),
    ).rejects.toThrow(UnsupportedFileTypeError);

    expect(await prisma.attachment.count()).toBe(0);
  });

  it("rejects a file over 10MB, and saves nothing", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(11 * 1024 * 1024)]);

    await expect(
      createAttachment(
        { entityType: "CASE", entityId: caseRecord.id },
        oversized,
        "big.png",
        admin.id,
      ),
    ).rejects.toThrow(AttachmentTooLargeError);

    expect(await prisma.attachment.count()).toBe(0);
  });

  it("accepts a file right at the 10MB boundary", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    // Exactly 10MB, with a valid PNG signature at the start.
    const atLimit = Buffer.concat([PNG_BYTES, Buffer.alloc(10 * 1024 * 1024 - PNG_BYTES.length)]);

    const created = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id },
      atLimit,
      "exactly-10mb.png",
      admin.id,
    );

    expect(created.sizeBytes).toBe(10 * 1024 * 1024);
  });

  it("sanitises the declared filename for display without affecting storageKey", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();

    const created = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id },
      PNG_BYTES,
      "../../etc/passwd.png",
      admin.id,
    );

    expect(created.filename).not.toContain("..");
    expect(created.filename).not.toContain("/");
  });
});

describe("listAttachments / getAttachment", () => {
  it("lists attachments for a given entity", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    const otherCase = await aCase();

    await createAttachment({ entityType: "CASE", entityId: caseRecord.id }, PNG_BYTES, "a.png", admin.id);
    await createAttachment({ entityType: "CASE", entityId: caseRecord.id }, PNG_BYTES, "b.png", admin.id);
    await createAttachment({ entityType: "CASE", entityId: otherCase.id }, PNG_BYTES, "c.png", admin.id);

    const list = await listAttachments("CASE", caseRecord.id);
    expect(list).toHaveLength(2);
  });

  it("gets a single attachment by id", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    const created = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id },
      PNG_BYTES,
      "a.png",
      admin.id,
    );

    const found = await getAttachment(created.id);
    expect(found?.id).toBe(created.id);
  });

  it("returns null for a nonexistent id", async () => {
    expect(await getAttachment("does-not-exist")).toBeNull();
  });
});

describe("deleteAttachment", () => {
  it("deletes the file from storage, removes the row, and audits it", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    const created = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id },
      PNG_BYTES,
      "a.png",
      admin.id,
    );

    await deleteAttachment(created.id, admin.id);

    expect(await prisma.attachment.findUnique({ where: { id: created.id } })).toBeNull();
    await expect(readFile(created.storageKey)).rejects.toThrow();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Attachment", entityId: created.id, action: "VOID" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(admin.id);
  });

  it("throws for a nonexistent attachment", async () => {
    const admin = await anAdmin();
    await expect(deleteAttachment("does-not-exist", admin.id)).rejects.toThrow();
  });
});

describe("isAttachmentPubliclyServable (the serving-permission decision)", () => {
  it("is false for a private CASE attachment (isPublic: false)", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    await setCasePublished(caseRecord.id, true, null);
    const attachment = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id, isPublic: false },
      PNG_BYTES,
      "private.png",
      admin.id,
    );

    expect(await isAttachmentPubliclyServable(attachment)).toBe(false);
  });

  it("is true for a public CASE attachment whose case is published", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    await setCasePublished(caseRecord.id, true, null);
    const attachment = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id, isPublic: true },
      PNG_BYTES,
      "photo.png",
      admin.id,
    );

    expect(await isAttachmentPubliclyServable(attachment)).toBe(true);
  });

  it("is false for a public CASE attachment whose case is NOT published", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase(); // unpublished by default
    const attachment = await createAttachment(
      { entityType: "CASE", entityId: caseRecord.id, isPublic: true },
      PNG_BYTES,
      "photo.png",
      admin.id,
    );

    expect(await isAttachmentPubliclyServable(attachment)).toBe(false);
  });

  it("is false for a DISBURSEMENT attachment even when isPublic is true", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    await setCasePublished(caseRecord.id, true, null);
    const disbursement = await prisma.disbursement.create({
      data: {
        caseId: caseRecord.id,
        amountPaise: 100000,
        paidOn: new Date(Date.UTC(2026, 5, 15)),
        mode: "BANK",
      },
    });
    const attachment = await createAttachment(
      { entityType: "DISBURSEMENT", entityId: disbursement.id, isPublic: true },
      PNG_BYTES,
      "transfer-proof.png",
      admin.id,
    );

    expect(await isAttachmentPubliclyServable(attachment)).toBe(false);
  });

  it("is false for a CONTRIBUTION attachment even when isPublic is true", async () => {
    const admin = await anAdmin();
    const contributor = await prisma.contributor.create({ data: { name: "Asha" } });
    const contribution = await prisma.contribution.create({
      data: {
        contributorId: contributor.id,
        amountPaise: 50000,
        receivedOn: new Date(Date.UTC(2026, 5, 15)),
        mode: "UPI",
      },
    });
    const attachment = await createAttachment(
      { entityType: "CONTRIBUTION", entityId: contribution.id, isPublic: true },
      PNG_BYTES,
      "receipt.png",
      admin.id,
    );

    expect(await isAttachmentPubliclyServable(attachment)).toBe(false);
  });
});

describe("listAttachmentsForEntities", () => {
  it("groups attachments by entityId for a batch of entities in one query", async () => {
    const admin = await anAdmin();
    const caseRecord = await aCase();
    const d1 = await prisma.disbursement.create({
      data: {
        caseId: caseRecord.id,
        amountPaise: 10000,
        paidOn: new Date(Date.UTC(2026, 5, 12)),
        mode: "UPI",
      },
    });
    const d2 = await prisma.disbursement.create({
      data: {
        caseId: caseRecord.id,
        amountPaise: 20000,
        paidOn: new Date(Date.UTC(2026, 5, 13)),
        mode: "CASH",
      },
    });

    await createAttachment({ entityType: "DISBURSEMENT", entityId: d1.id }, PNG_BYTES, "proof1.png", admin.id);
    await createAttachment({ entityType: "DISBURSEMENT", entityId: d1.id }, PNG_BYTES, "proof2.png", admin.id);
    await createAttachment({ entityType: "DISBURSEMENT", entityId: d2.id }, PNG_BYTES, "proof3.png", admin.id);

    const { listAttachmentsForEntities } = await import("@/lib/data/attachments");
    const grouped = await listAttachmentsForEntities("DISBURSEMENT", [d1.id, d2.id, "no-attachments"]);

    expect(grouped.get(d1.id)).toHaveLength(2);
    expect(grouped.get(d2.id)).toHaveLength(1);
    expect(grouped.get("no-attachments") ?? []).toHaveLength(0);
  });

  it("returns an empty map for an empty list of entity ids", async () => {
    const { listAttachmentsForEntities } = await import("@/lib/data/attachments");
    const grouped = await listAttachmentsForEntities("DISBURSEMENT", []);
    expect(grouped.size).toBe(0);
  });
});
