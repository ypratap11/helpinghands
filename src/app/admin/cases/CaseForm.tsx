"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { todayInIndia } from "@/lib/fy";
import { saveCaseAction, type ActionState } from "./actions";

type Category = { value: string; label: string };
type Option = { value: string; label: string };

type Case = {
  id: string;
  title: string;
  category: string;
  publicSummary: string;
  beneficiaryName: string | null;
  beneficiaryContact: string | null;
  privateNotes: string | null;
  city: string | null;
  state: string | null;
  occurredOn: Date;
  type: string;
  status: string;
};

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function CaseForm({
  categories,
  types,
  statuses,
  today,
  caseRecord,
}: {
  categories: Category[];
  types: Option[];
  statuses: Option[];
  today: string;
  caseRecord?: Case;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCaseAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(caseRecord);
  const router = useRouter();

  // After a successful create, go to the new cause's page — that's where a
  // photo, disbursements, and Publish live. If there's no destination (edit,
  // or an older response), just clear the form so a phone doesn't invite
  // double-entry.
  useEffect(() => {
    if (!state.ok || isEdit) return;
    if (state.redirectTo) {
      router.push(state.redirectTo);
      return;
    }
    formRef.current?.reset();
    if (dateRef.current) dateRef.current.value = todayInIndia();
  }, [state, isEdit, router]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {caseRecord ? <input type="hidden" name="id" value={caseRecord.id} /> : null}

      <Field label="Cause name" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          defaultValue={caseRecord?.title}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="category">
          <select
            id="category"
            name="category"
            required
            defaultValue={caseRecord?.category ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="When this happened" htmlFor="occurredOn">
          <input
            id="occurredOn"
            name="occurredOn"
            type="date"
            required
            defaultValue={caseRecord ? dateInputValue(caseRecord.occurredOn) : today}
            ref={dateRef}
            className={inputClass}
          />
        </Field>

        <Field label="Type" htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue={caseRecord?.type ?? "ONCE"}
            className={inputClass}
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={caseRecord?.status ?? "ACTIVE"}
            className={inputClass}
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description (shown on the public page)" htmlFor="publicSummary">
        <textarea
          id="publicSummary"
          name="publicSummary"
          required
          rows={3}
          defaultValue={caseRecord?.publicSummary}
          className={`${inputClass} min-h-[88px] py-2`}
        />
      </Field>

      {!isEdit ? (
        <Field
          label="Total raised so far (for a past cause)"
          htmlFor="historicalRaised"
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              ₹
            </span>
            <input
              id="historicalRaised"
              name="historicalRaised"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              className={`${inputClass} pl-7`}
            />
          </div>
        </Field>
      ) : null}
      {!isEdit ? (
        <p className="-mt-2 text-xs text-muted">
          Only fill this in when recording money pooled before this system existed — it records
          one lump-sum contribution against this cause instead of itemising each past donor.
        </p>
      ) : null}

      {!isEdit ? (
        <Field
          label="Total already given / disbursed (for a past cause)"
          htmlFor="historicalTotal"
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              ₹
            </span>
            <input
              id="historicalTotal"
              name="historicalTotal"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              className={`${inputClass} pl-7`}
            />
          </div>
        </Field>
      ) : null}
      {!isEdit ? (
        <p className="-mt-2 text-xs text-muted">
          Only fill this in when recording work done before this system existed — it records
          one lump-sum payment against this cause instead of itemising each past payment.
        </p>
      ) : null}

      <details className="rounded-xl border border-line bg-forest-soft/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Private details (never shown publicly)
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          <Field label="Beneficiary name" htmlFor="beneficiaryName">
            <input
              id="beneficiaryName"
              name="beneficiaryName"
              defaultValue={caseRecord?.beneficiaryName ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Beneficiary contact" htmlFor="beneficiaryContact">
            <input
              id="beneficiaryContact"
              name="beneficiaryContact"
              defaultValue={caseRecord?.beneficiaryContact ?? ""}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city">
              <input id="city" name="city" defaultValue={caseRecord?.city ?? ""} className={inputClass} />
            </Field>
            <Field label="State" htmlFor="state">
              <input id="state" name="state" defaultValue={caseRecord?.state ?? ""} className={inputClass} />
            </Field>
          </div>
          <Field label="Private notes" htmlFor="privateNotes">
            <textarea
              id="privateNotes"
              name="privateNotes"
              rows={3}
              defaultValue={caseRecord?.privateNotes ?? ""}
              className={`${inputClass} min-h-[88px] py-2`}
            />
          </Field>
        </div>
      </details>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-sm font-medium text-forest">Saved.</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : isEdit ? "Save changes" : "Add cause"}
      </Button>
    </form>
  );
}
