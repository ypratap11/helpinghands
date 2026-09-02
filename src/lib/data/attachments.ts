import type { Attachment, AttachmentEntity } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sniffAllowedType } from "@/lib/fileType";
import { deleteFile, saveFile } from "@/lib/storage";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super("Only JPEG, PNG, WebP, and PDF files are allowed.");
    this.name = "UnsupportedFileTypeError";
  }
}

export class AttachmentTooLargeError extends Error {
  constructor() {
    super("Files must be 10MB or smaller.");
    this.name = "AttachmentTooLargeError";
  }
}

/**
 * Keeps only the last path segment of the declared filename, strips control
 * characters, and caps length. This is for DISPLAY only (what shows next to
 * a thumbnail / in a Content-Disposition header) -- it is never used to
 * derive storageKey, which is always a random UUID (see storage.ts).
 */
function sanitiseFilename(declaredName: string): string {
  const withoutControlChars = declaredName.replace(/[\x00-\x1f\x7f]/g, "");
  const base = withoutControlChars.split(/[/\\]/).pop() ?? withoutControlChars;
  const trimmed = base.trim().slice(0, 200);
  return trimmed || "file";
}

export type CreateAttachmentInput = {
  entityType: AttachmentEntity;
  entityId: string;
  isPublic?: boolean;
};

/**
 * Validates and stores an uploaded file, then creates its Attachment row.
 * Security-critical order: sniff the REAL bytes (never trust a declared
 * MIME type or the filename), enforce the size cap, THEN write to storage
 * and only then create the DB row -- so a rejected upload never touches
 * disk or the database.
 */
export async function createAttachment(
  input: CreateAttachmentInput,
  bytes: Buffer,
  declaredName: string,
  actorId: string | null,
): Promise<Attachment> {
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentTooLargeError();

  const sniffed = sniffAllowedType(bytes);
  if (!sniffed) throw new UnsupportedFileTypeError();

  const storageKey = await saveFile(bytes, sniffed.ext);
  const filename = sanitiseFilename(declaredName);

  const created = await prisma.attachment.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      storageKey,
      filename,
      mimeType: sniffed.mime,
      sizeBytes: bytes.length,
      isPublic: input.isPublic ?? false,
      uploadedByUserId: actorId,
    },
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE",
    entityType: "Attachment",
    entityId: created.id,
    after: {
      entityType: created.entityType,
      entityId: created.entityId,
      filename: created.filename,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes,
      isPublic: created.isPublic,
    },
  });

  return created;
}

export async function listAttachments(
  entityType: AttachmentEntity,
  entityId: string,
): Promise<Attachment[]> {
  return prisma.attachment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  return prisma.attachment.findUnique({ where: { id } });
}

/**
 * Batch-fetches attachments for many entities of the same type in a single
 * query, grouped by entityId. Used by the admin cause page to load every
 * disbursement's proof attachments at once instead of one query per row.
 */
export async function listAttachmentsForEntities(
  entityType: AttachmentEntity,
  entityIds: string[],
): Promise<Map<string, Attachment[]>> {
  if (entityIds.length === 0) return new Map();

  const rows = await prisma.attachment.findMany({
    where: { entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: "desc" },
  });

  const grouped = new Map<string, Attachment[]>();
  for (const row of rows) {
    const existing = grouped.get(row.entityId);
    if (existing) existing.push(row);
    else grouped.set(row.entityId, [row]);
  }
  return grouped;
}

/**
 * Attachments are not money records (unlike Disbursement/Contribution,
 * which are soft-voided to preserve the ledger), so a hard delete is
 * acceptable here. Deletes the file from storage first, then the row, and
 * records a VOID audit entry either way.
 */
export async function deleteAttachment(id: string, actorId: string | null): Promise<void> {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new Error("Attachment not found");

  await deleteFile(attachment.storageKey);
  await prisma.attachment.delete({ where: { id } });

  await recordAudit({
    userId: actorId,
    action: "VOID",
    entityType: "Attachment",
    entityId: id,
    before: {
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      filename: attachment.filename,
    },
  });
}

/**
 * Whether this attachment may be served to an anonymous (non-admin)
 * visitor. A CASE attachment is public only when BOTH isPublic is true AND
 * the parent Case is currently published. A DISBURSEMENT or CONTRIBUTION
 * attachment (transfer-proof screenshots, bank details) is NEVER public,
 * regardless of its isPublic flag -- those always carry money/bank detail.
 * Used by the /api/files/[id] serving route; kept here (not inline in the
 * route) so it's directly unit-testable without any HTTP/session mocking.
 */
export async function isAttachmentPubliclyServable(attachment: Attachment): Promise<boolean> {
  if (attachment.entityType !== "CASE") return false;
  if (!attachment.isPublic) return false;

  const caseRecord = await prisma.case.findUnique({
    where: { id: attachment.entityId },
    select: { isPublished: true },
  });

  return caseRecord?.isPublished === true;
}
