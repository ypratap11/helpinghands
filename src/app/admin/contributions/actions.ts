"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createContribution, voidContribution } from "@/lib/data/contributions";
import { toDateOnly } from "@/lib/fy";
import { AmountTooLargeError, InvalidAmountError, parseRupeesToPaise } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

const MODES = ["UPI", "CASH", "BANK", "CHEQUE", "OTHER"] as const;
type Mode = (typeof MODES)[number];

export async function addContributionAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const contributorId = String(data.get("contributorId") ?? "").trim();
  if (!contributorId) return { error: "Choose who this came from." };

  const receivedOnRaw = String(data.get("receivedOn") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOnRaw)) return { error: "Enter the date received." };

  const receivedOnDate = toDateOnly(receivedOnRaw);
  if (receivedOnDate.toISOString().slice(0, 10) !== receivedOnRaw) {
    return { error: "Enter a real date." };
  }

  const modeRaw = String(data.get("mode") ?? "");
  const mode = (MODES as readonly string[]).includes(modeRaw) ? (modeRaw as Mode) : null;
  if (!mode) return { error: "Choose how the money was received." };

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

  const caseId = String(data.get("caseId") ?? "").trim() || null;

  try {
    await createContribution(
      {
        contributorId,
        amountPaise,
        receivedOn: receivedOnDate,
        mode,
        reference: (String(data.get("reference") ?? "").trim() || null) as string | null,
        note: (String(data.get("note") ?? "").trim() || null) as string | null,
        caseId,
      },
      actor.id,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/admin/contributions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function voidContributionAction(data: FormData): Promise<void> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return;
  }

  const id = String(data.get("id") ?? "");
  if (id) await voidContribution(id, actor.id);
  revalidatePath("/admin/contributions");
  revalidatePath("/admin");
}
