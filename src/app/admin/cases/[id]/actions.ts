"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
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
