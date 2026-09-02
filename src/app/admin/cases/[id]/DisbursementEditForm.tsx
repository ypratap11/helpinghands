"use client";

import { useActionState, useEffect } from "react";
import { AmountInput } from "@/components/ui/AmountInput";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { editDisbursementAction, type ActionState } from "./actions";

export type EditableDisbursement = {
  id: string;
  caseId: string;
  amountPaise: number;
  paidOn: string;
  mode: string;
  paidTo: string;
  reference: string;
  note: string;
};

/**
 * Inline edit form for a single disbursement, prefilled with its current
 * values. Deliberately passed only strings/numbers (never the case-level
 * bigint total) — see DisbursementList.tsx. Mirrors DisbursementForm.tsx's
 * shape but calls editDisbursementAction and reports success/cancel back to
 * the parent instead of resetting itself.
 */
export function DisbursementEditForm({
  disbursement,
  onCancel,
  onSaved,
}: {
  disbursement: EditableDisbursement;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    editDisbursementAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state, onSaved]);

  const amountDefault = (disbursement.amountPaise / 100).toFixed(2);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={disbursement.id} />
      <input type="hidden" name="caseId" value={disbursement.caseId} />

      <AmountInput defaultValue={amountDefault} />

      <Field label="Paid on" htmlFor={`paidOn-${disbursement.id}`}>
        <input
          id={`paidOn-${disbursement.id}`}
          name="paidOn"
          type="date"
          required
          defaultValue={disbursement.paidOn}
          className={inputClass}
        />
      </Field>

      <Field label="How" htmlFor={`mode-${disbursement.id}`}>
        <select
          id={`mode-${disbursement.id}`}
          name="mode"
          required
          defaultValue={disbursement.mode}
          className={inputClass}
        >
          <option value="UPI">UPI</option>
          <option value="CASH">Cash</option>
          <option value="BANK">Bank transfer</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>

      <Field label="Paid to" htmlFor={`paidTo-${disbursement.id}`}>
        <input
          id={`paidTo-${disbursement.id}`}
          name="paidTo"
          defaultValue={disbursement.paidTo}
          className={inputClass}
        />
      </Field>

      <Field label="Reference (UTR / cheque no.)" htmlFor={`reference-${disbursement.id}`}>
        <input
          id={`reference-${disbursement.id}`}
          name="reference"
          defaultValue={disbursement.reference}
          className={inputClass}
        />
      </Field>

      <Field label="Note" htmlFor={`note-${disbursement.id}`}>
        <textarea
          id={`note-${disbursement.id}`}
          name="note"
          rows={2}
          defaultValue={disbursement.note}
          className={`${inputClass} min-h-[64px] py-2`}
        />
      </Field>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
