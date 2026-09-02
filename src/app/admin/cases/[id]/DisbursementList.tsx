"use client";

import { useState } from "react";
import { Money } from "@/components/ui/Money";
import { DisbursementEditForm, type EditableDisbursement } from "./DisbursementEditForm";
import { VoidButton } from "./VoidButton";
import { voidDisbursementAction } from "./actions";

export type DisbursementRowData = {
  id: string;
  caseId: string;
  amountPaise: number;
  paidOn: string; // YYYY-MM-DD, for the edit form's date input
  paidOnDisplay: string; // dd/mm/yyyy, for display
  mode: string;
  paidTo: string | null;
  reference: string | null;
  note: string | null;
  status: "ACTIVE" | "VOID";
};

function toEditable(d: DisbursementRowData): EditableDisbursement {
  return {
    id: d.id,
    caseId: d.caseId,
    amountPaise: d.amountPaise,
    paidOn: d.paidOn,
    mode: d.mode,
    paidTo: d.paidTo ?? "",
    reference: d.reference ?? "",
    note: d.note ?? "",
  };
}

const VOIDED_BADGE =
  "inline-flex w-fit items-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-2.5 py-0.5 text-xs font-semibold text-danger";

/**
 * Cards-below-sm / table-at-sm-and-up list of a case's disbursements, each
 * with its own Edit / two-tap Void controls (ACTIVE only — a VOID row
 * renders greyed with neither). Not built on the shared RecordList
 * component: editing needs to swap an entire row for an inline form, which
 * RecordList's per-column cell renderer can't express. Deliberately passed
 * only strings/numbers from the server component above it — the case-level
 * disbursedPaise bigint never crosses into client code.
 */
export function DisbursementList({ disbursements }: { disbursements: DisbursementRowData[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (disbursements.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center text-sm text-muted">
        No disbursements recorded yet.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {disbursements.map((d) => (
          <li key={d.id} className="rounded-2xl border border-line bg-surface p-4 lift">
            {editingId === d.id ? (
              <DisbursementEditForm
                disbursement={toEditable(d)}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{d.paidTo ?? "—"}</span>
                  <Money paise={d.amountPaise} compact />
                </div>
                <span className="text-sm text-muted">
                  {d.paidOnDisplay} · {d.mode}
                </span>
                {d.note ? <span className="text-xs text-muted">{d.note}</span> : null}
                {d.status === "ACTIVE" ? (
                  <div className="flex flex-wrap gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(d.id)}
                      className="inline-flex min-h-[44px] items-center text-sm font-medium text-forest underline"
                    >
                      Edit
                    </button>
                    <VoidButton
                      id={d.id}
                      caseId={d.caseId}
                      action={voidDisbursementAction}
                      label="Void this entry"
                      className="inline-flex min-h-[44px] items-center text-sm font-medium text-danger underline"
                    />
                  </div>
                ) : (
                  <span className={`${VOIDED_BADGE} mt-1`}>Voided</span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface lift sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-forest-soft/50">
              {["Date", "Amount", "Mode", "Paid to", "Note", ""].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {disbursements.map((d) =>
              editingId === d.id ? (
                <tr key={d.id} className="border-b border-line/70 last:border-0">
                  <td colSpan={6} className="px-4 py-4">
                    <DisbursementEditForm
                      disbursement={toEditable(d)}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={d.id}
                  className={`border-b border-line/70 last:border-0 hover:bg-forest-soft/30 ${
                    d.status === "VOID" ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-3.5 align-middle">{d.paidOnDisplay}</td>
                  <td className="px-4 py-3.5 align-middle">
                    <Money paise={d.amountPaise} compact />
                  </td>
                  <td className="px-4 py-3.5 align-middle">{d.mode}</td>
                  <td className="px-4 py-3.5 align-middle">{d.paidTo ?? "—"}</td>
                  <td className="px-4 py-3.5 align-middle">{d.note ?? "—"}</td>
                  <td className="px-4 py-3.5 align-middle text-right">
                    {d.status === "ACTIVE" ? (
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingId(d.id)}
                          className="inline-flex min-h-[44px] items-center px-2 text-xs text-forest underline"
                        >
                          Edit
                        </button>
                        <VoidButton id={d.id} caseId={d.caseId} action={voidDisbursementAction} />
                      </div>
                    ) : (
                      <span className={VOIDED_BADGE}>Voided</span>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
