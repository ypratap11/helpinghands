"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAttachment, deleteAttachment, getAttachment } from "@/lib/data/attachments";
import { updateDisbursement, voidDisbursement } from "@/lib/data/cases";
import { toDateOnly } from "@/lib/fy";
import { AmountTooLargeError, InvalidAmountError, parseRupeesToPaise } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

const MODES = ["UPI", "CASH", "BANK", "CHEQUE", "OTHER"] as const;
type Mode = (typeof MODES)[number];

function field(data: FormData, name: string): string | null {
  const value = data.get(name);
  if (typeof value !== "string") return null;
  return value.trim() === "" ? null : value.trim();
}

function parseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = toDateOnly(raw);
  if (date.toISOString().slice(0, 10) !== raw) return null;
  return date;
}

export async function voidDisbursementAction(data: FormData): Promise<void> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return;
  }

  const id = String(data.get("id") ?? "");
  const caseId = String(data.get("caseId") ?? "").trim();
  if (id) await voidDisbursement(id, actor.id);

  if (caseId) revalidatePath(`/admin/cases/${caseId}`);
  revalidatePath("/admin/cases");
  revalidatePath("/");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

export async function editDisbursementAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const id = String(data.get("id") ?? "").trim();
  if (!id) return { error: "Missing disbursement." };

  const caseId = String(data.get("caseId") ?? "").trim();

  const paidOnRaw = String(data.get("paidOn") ?? "").trim();
  const paidOn = parseDate(paidOnRaw);
  if (!paidOn) return { error: "Enter a real date." };

  const modeRaw = String(data.get("mode") ?? "");
  const mode = (MODES as readonly string[]).includes(modeRaw) ? (modeRaw as Mode) : null;
  if (!mode) return { error: "Choose how the money was paid." };

  let amountPaise: number;
  try {
    amountPaise = parseRupeesToPaise(String(data.get("amount") ?? ""));
  } catch (error) {
    if (error instanceof AmountTooLargeError) {
      return { error: "That amount is too large to record. Please double-check it." };
    }
    if (error instanceof InvalidAmountError) return { error: "Enter a valid amount, such as 2500." };
    throw error;
  }

  try {
    await updateDisbursement(
      id,
      {
        amountPaise,
        paidOn,
        mode,
        paidTo: field(data, "paidTo"),
        reference: field(data, "reference"),
        note: field(data, "note"),
      },
      actor.id,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  if (caseId) revalidatePath(`/admin/cases/${caseId}`);
  revalidatePath("/admin/cases");
  revalidatePath("/");
  if (caseId) revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

const ATTACHMENT_ENTITY_TYPES = ["CASE", "DISBURSEMENT", "CONTRIBUTION"] as const;
type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/**
 * Uploads a file (a cause photo, a transfer-proof screenshot, ...) and
 * attaches it to a Case/Disbursement/Contribution. requireAdmin() runs
 * first, before anything else touches the file. Only a CASE attachment may
 * ever be marked public here -- a DISBURSEMENT/CONTRIBUTION attachment is
 * forced private regardless of what the form sends, since those always
 * carry money/bank detail. (The serving route enforces this independently
 * too, at read time, via isAttachmentPubliclyServable -- this is defence in
 * depth, not the only guard.)
 */
export async function uploadAttachmentAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const entityTypeRaw = String(data.get("entityType") ?? "");
  const entityType = (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(entityTypeRaw)
    ? (entityTypeRaw as AttachmentEntityType)
    : null;
  if (!entityType) return { error: "Missing or invalid attachment target." };

  const entityId = String(data.get("entityId") ?? "").trim();
  if (!entityId) return { error: "Missing attachment target." };

  const fileValue = data.get("file");
  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const isPublic = entityType === "CASE" && field(data, "isPublic") === "true";

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await fileValue.arrayBuffer());
  } catch {
    return { error: "Could not read the uploaded file." };
  }

  try {
    await createAttachment({ entityType, entityId, isPublic }, bytes, fileValue.name, actor.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not upload the file." };
  }

  const caseId = field(data, "caseId") ?? (entityType === "CASE" ? entityId : null);
  if (caseId) {
    revalidatePath(`/admin/cases/${caseId}`);
    if (isPublic) {
      revalidatePath("/");
      revalidatePath(`/cases/${caseId}`);
    }
  }

  return { ok: true };
}

/**
 * Deletes an attachment. requireAdmin() first. Looks up whether the
 * attachment being removed was a public CASE attachment BEFORE deleting it,
 * so the right public pages get revalidated afterwards.
 */
export async function deleteAttachmentAction(data: FormData): Promise<void> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return;
  }

  const id = String(data.get("id") ?? "").trim();
  if (!id) return;

  const caseId = field(data, "caseId");

  const before = await getAttachment(id);
  const wasPublicCase = Boolean(before?.isPublic && before.entityType === "CASE");

  await deleteAttachment(id, actor.id);

  if (caseId) {
    revalidatePath(`/admin/cases/${caseId}`);
    if (wasPublicCase) {
      revalidatePath("/");
      revalidatePath(`/cases/${caseId}`);
    }
  }
}
