"use server";

import { revalidatePath } from "next/cache";
import { CASE_CATEGORIES } from "@/lib/categories";
import { CASE_STATUSES, CASE_TYPES } from "@/lib/caseMeta";
import { requireAdmin } from "@/lib/authz";
import { createCase, createDisbursement, setCasePublished, updateCase } from "@/lib/data/cases";
import { toDateOnly } from "@/lib/fy";
import { AmountTooLargeError, InvalidAmountError, parseRupeesToPaise } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean };

const MODES = ["UPI", "CASH", "BANK", "CHEQUE", "OTHER"] as const;
type Mode = (typeof MODES)[number];

const CATEGORY_VALUES = CASE_CATEGORIES.map((c) => c.value);
type CategoryValue = (typeof CATEGORY_VALUES)[number];

const TYPE_VALUES = CASE_TYPES.map((t) => t.value);
type TypeValue = (typeof TYPE_VALUES)[number];

const STATUS_VALUES = CASE_STATUSES.map((s) => s.value);
type StatusValue = (typeof STATUS_VALUES)[number];

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

export async function saveCaseAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const title = field(data, "title") ?? "";
  if (!title) return { error: "Title is required." };

  const categoryRaw = String(data.get("category") ?? "");
  const category = (CATEGORY_VALUES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as CategoryValue)
    : null;
  if (!category) return { error: "Choose a category." };

  const publicSummary = field(data, "publicSummary") ?? "";
  if (!publicSummary) return { error: "Public summary is required." };

  const occurredOnRaw = String(data.get("occurredOn") ?? "").trim();
  const occurredOn = parseDate(occurredOnRaw);
  if (!occurredOn) return { error: "Enter a real date." };

  const id = field(data, "id");

  // type/status are optional on the FormData: when present and valid they're
  // included in `input`; when absent, the key is left off entirely. For a
  // create that means caseSchema's `.default()` fills them in (ONCE/ACTIVE);
  // for an edit, updateCase's non-destructive partial update then leaves the
  // existing column value untouched instead of nulling it.
  const typeRaw = field(data, "type");
  if (typeRaw && !(TYPE_VALUES as readonly string[]).includes(typeRaw)) {
    return { error: "Choose a valid type." };
  }
  const type = typeRaw as TypeValue | null;

  const statusRaw = field(data, "status");
  if (statusRaw && !(STATUS_VALUES as readonly string[]).includes(statusRaw)) {
    return { error: "Choose a valid status." };
  }
  const status = statusRaw as StatusValue | null;

  const input = {
    title,
    category,
    publicSummary,
    beneficiaryName: field(data, "beneficiaryName"),
    beneficiaryContact: field(data, "beneficiaryContact"),
    privateNotes: field(data, "privateNotes"),
    city: field(data, "city"),
    state: field(data, "state"),
    occurredOn,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };

  // Historical backfill: only on create (an id means this is an edit), and
  // only when the optional "total already given" field carries a value.
  const historicalTotalRaw = field(data, "historicalTotal");
  let historicalAmountPaise: number | null = null;
  if (!id && historicalTotalRaw) {
    try {
      historicalAmountPaise = parseRupeesToPaise(historicalTotalRaw);
    } catch (error) {
      if (error instanceof AmountTooLargeError) {
        return { error: "That amount is too large to record. Please double-check it." };
      }
      if (error instanceof InvalidAmountError) {
        return { error: "Enter a valid amount already given, such as 50000." };
      }
      throw error;
    }
  }

  try {
    if (id) {
      await updateCase(id, input, actor.id);
    } else {
      const created = await createCase(input, actor.id);
      if (historicalAmountPaise !== null) {
        await createDisbursement(
          created.id,
          {
            amountPaise: historicalAmountPaise,
            paidOn: occurredOn,
            mode: "OTHER",
            note: "Recorded as a past total",
          },
          actor.id,
        );
      }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/admin/cases");
  if (id) revalidatePath(`/admin/cases/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function setPublishedAction(data: FormData): Promise<void> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return;
  }

  const id = String(data.get("id") ?? "");
  const published = String(data.get("published") ?? "") === "true";
  if (!id) return;

  await setCasePublished(id, published, actor.id);
  revalidatePath("/admin/cases");
  revalidatePath(`/admin/cases/${id}`);
  revalidatePath("/");
  revalidatePath(`/cases/${id}`);
}

export async function addDisbursementAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const caseId = String(data.get("caseId") ?? "").trim();
  if (!caseId) return { error: "Missing cause." };

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
    await createDisbursement(
      caseId,
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

  revalidatePath(`/admin/cases/${caseId}`);
  revalidatePath("/admin/cases");
  revalidatePath("/");
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
