"use client";

import { useActionState, useEffect, useRef } from "react";
import { AmountInput } from "@/components/ui/AmountInput";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { todayInIndia } from "@/lib/fy";
import { addContributionAction, type ActionState } from "./actions";

export function ContributionForm({
  contributors,
  cases,
  today,
  anonymousContributorId,
}: {
  contributors: { id: string; name: string }[];
  cases: { id: string; title: string }[];
  today: string;
  anonymousContributorId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addContributionAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Clear the form after a successful save so a phone doesn't invite
  // double-entry of real money. Keyed on the whole `state` object (a fresh
  // object every dispatch) rather than `state.ok` alone, so two successive
  // successful saves both trigger a reset, not just the first.
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    if (dateRef.current) dateRef.current.value = todayInIndia();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <Field label="From" htmlFor="contributorId">
        <select id="contributorId" name="contributorId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose…
          </option>
          {contributors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={anonymousContributorId}>Anonymous</option>
        </select>
      </Field>

      <Field label="For a cause (optional)" htmlFor="caseId">
        <select id="caseId" name="caseId" defaultValue="" className={inputClass}>
          <option value="">General — not tied to a cause</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </Field>

      <AmountInput />

      <Field label="Received on" htmlFor="receivedOn">
        <input
          id="receivedOn"
          name="receivedOn"
          type="date"
          required
          defaultValue={today}
          ref={dateRef}
          className={inputClass}
        />
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

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-sm font-medium text-forest">Recorded.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Record contribution"}
      </Button>
    </form>
  );
}
