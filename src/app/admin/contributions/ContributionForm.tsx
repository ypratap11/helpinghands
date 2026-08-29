"use client";

import { useActionState } from "react";
import { AmountInput } from "@/components/ui/AmountInput";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { addContributionAction, type ActionState } from "./actions";

export function ContributionForm({
  contributors,
  today,
}: {
  contributors: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addContributionAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="From" htmlFor="contributorId">
        <select id="contributorId" name="contributorId" required className={inputClass}>
          {contributors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="anonymous">Anonymous</option>
        </select>
      </Field>

      <AmountInput />

      <Field label="Received on" htmlFor="receivedOn">
        <input id="receivedOn" name="receivedOn" type="date" required defaultValue={today} className={inputClass} />
      </Field>

      <Field label="How" htmlFor="mode">
        <select id="mode" name="mode" required defaultValue="UPI" className={inputClass}>
          <option value="UPI">UPI</option>
          <option value="CASH">Cash</option>
          <option value="BANK">Bank transfer</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>

      <Field label="Reference (UTR / cheque no.)" htmlFor="reference">
        <input id="reference" name="reference" className={inputClass} />
      </Field>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700">Recorded.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Record contribution"}
      </Button>
    </form>
  );
}
