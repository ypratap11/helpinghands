import { CaseRow } from "@/components/CaseRow";
import { groupCasesByMonth } from "@/lib/groupCasesByMonth";
import type { PublicCase } from "@/lib/data/public";

/**
 * "Where it went" — published causes grouped by month + year (newest
 * first), each rendered as a full-width collapsible row. Server component
 * throughout (native <details>/<summary>, no "use client"), so the
 * disbursedPaise bigint on each PublicCase is formatted by <Money> on the
 * server and never crosses into a client component prop.
 */
export function WhereItWentSection({ cases }: { cases: PublicCase[] }) {
  if (cases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
        <h3 className="font-display text-lg font-semibold text-ink">No causes published yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          When help goes out, an anonymised summary — what it was for, roughly where, and how much
          — will appear here. Names and details stay private, always.
        </p>
      </div>
    );
  }

  const groups = groupCasesByMonth(cases);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            {group.label}
          </h3>
          <div className="rounded-2xl border border-line bg-surface px-4 lift sm:px-5">
            {group.cases.map((c) => (
              <CaseRow key={c.id} caseItem={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
