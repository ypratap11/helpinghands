"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { saveContributorAction, type ActionState } from "./actions";

type Contributor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pan: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  notes: string | null;
};

export function ContributorForm({ contributor }: { contributor?: Contributor }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveContributorAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {contributor ? <input type="hidden" name="id" value={contributor.id} /> : null}

      <Field label="Name" htmlFor="name">
        <input id="name" name="name" required defaultValue={contributor?.name} className={inputClass} />
      </Field>

      <Field label="Email (used to link their login)" htmlFor="email">
        <input id="email" name="email" type="email" inputMode="email" defaultValue={contributor?.email ?? ""} className={inputClass} />
      </Field>

      <Field label="Phone" htmlFor="phone">
        <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={contributor?.phone ?? ""} className={inputClass} />
      </Field>

      <details className="rounded-xl border border-line bg-forest-soft/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Tax details (needed later for 80G)
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          <Field label="PAN" htmlFor="pan">
            <input id="pan" name="pan" defaultValue={contributor?.pan ?? ""} className={`${inputClass} uppercase`} />
          </Field>
          <Field label="Address" htmlFor="addressLine">
            <input id="addressLine" name="addressLine" defaultValue={contributor?.addressLine ?? ""} className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city">
              <input id="city" name="city" defaultValue={contributor?.city ?? ""} className={inputClass} />
            </Field>
            <Field label="State" htmlFor="state">
              <input id="state" name="state" defaultValue={contributor?.state ?? ""} className={inputClass} />
            </Field>
            <Field label="PIN code" htmlFor="pincode">
              <input id="pincode" name="pincode" inputMode="numeric" defaultValue={contributor?.pincode ?? ""} className={inputClass} />
            </Field>
          </div>
        </div>
      </details>

      <Field label="Internal notes (admin only, not shown to the contributor)" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={contributor?.notes ?? ""}
          className={`${inputClass} min-h-[88px] py-2`}
        />
      </Field>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-sm font-medium text-forest">Saved.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
