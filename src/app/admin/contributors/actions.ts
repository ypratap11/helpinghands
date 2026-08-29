"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/authz";
import { createContributor, updateContributor } from "@/lib/data/contributors";

export type ActionState = { error?: string; ok?: boolean };

function field(data: FormData, name: string): string | null {
  const value = data.get(name);
  if (typeof value !== "string") return null;
  return value.trim() === "" ? null : value.trim();
}

export async function saveContributorAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const input = {
    name: field(data, "name") ?? "",
    email: field(data, "email"),
    phone: field(data, "phone"),
    pan: field(data, "pan"),
    addressLine: field(data, "addressLine"),
    city: field(data, "city"),
    state: field(data, "state"),
    pincode: field(data, "pincode"),
    notes: field(data, "notes"),
  };

  const id = field(data, "id");

  try {
    if (id) await updateContributor(id, input, actor.id);
    else await createContributor(input, actor.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Please check the details entered." };
    }
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/admin/contributors");
  return { ok: true };
}
