"use client";

import { useActionState, useEffect, useRef } from "react";
import { AmountInput } from "@/components/ui/AmountInput";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { todayInIndia } from "@/lib/fy";
import { addDisbursementAction, type ActionState } from "../actions";

export function DisbursementForm({ caseId, today }: { caseId: string; today: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addDisbursementAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    if (dateRef.current) dateRef.current.value = todayInIndia();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="caseId" value={caseId} />

      <AmountInput />

      <Field label="Paid on" htmlFor="paidOn">
        <input
          id="paidOn"
          name="paidOn"
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

      <Field label="Paid to" htmlFor="paidTo">
        <input id="paidTo" name="paidTo" className={inputClass} />
      </Field>

      <Field label="Reference (UTR / cheque no.)" htmlFor="reference">
        <input id="reference" name="reference" className={inputClass} />
      </Field>

      <Field label="Note" htmlFor="note">
        <textarea id="note" name="note" rows={2} className={`${inputClass} min-h-[64px] py-2`} />
      </Field>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-sm font-medium text-forest">Recorded.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Record disbursement"}
      </Button>
    </form>
  );
}
