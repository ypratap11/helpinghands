import Link from "next/link";
import { RecordList } from "@/components/RecordList";
import { Money } from "@/components/ui/Money";
import { CASE_CATEGORIES, categoryLabel } from "@/lib/categories";
import { CASE_STATUSES, CASE_TYPES, caseStatusLabel, caseTypeLabel } from "@/lib/caseMeta";
import { listCases } from "@/lib/data/cases";
import { todayInIndia } from "@/lib/fy";
import { CaseForm } from "./CaseForm";
import type { CaseStatus, CaseType } from "@prisma/client";

function PublishedPill({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center rounded-full bg-forest-soft px-2.5 py-0.5 text-xs font-semibold text-forest">
      Published
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--color-muted)_12%,white)] px-2.5 py-0.5 text-xs font-semibold text-muted">
      Draft
    </span>
  );
}

function TypePill({ type }: { type: CaseType }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted">
      {caseTypeLabel(type)}
    </span>
  );
}

function StatusPill({ status }: { status: CaseStatus }) {
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-2.5 py-0.5 text-xs font-semibold text-danger">
        {caseStatusLabel(status)}
      </span>
    );
  }
  if (status === "CLOSED") {
    return (
      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--color-muted)_12%,white)] px-2.5 py-0.5 text-xs font-semibold text-muted">
        {caseStatusLabel(status)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-forest-soft px-2.5 py-0.5 text-xs font-semibold text-forest">
      {caseStatusLabel(status)}
    </span>
  );
}

export default async function CasesPage() {
  const cases = await listCases();
  const today = todayInIndia();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ledger</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Causes</h1>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <h2 className="pb-4 font-display text-lg font-semibold text-ink">Add a cause</h2>
        <CaseForm categories={CASE_CATEGORIES} types={CASE_TYPES} statuses={CASE_STATUSES} today={today} />
      </section>

      <RecordList
        items={cases}
        empty="No causes recorded yet."
        columns={[
          {
            key: "title",
            header: "Title",
            cell: (c) => (
              <Link href={`/admin/cases/${c.id}`} className="font-semibold text-forest hover:underline">
                {c.title}
              </Link>
            ),
          },
          { key: "category", header: "Category", cell: (c) => categoryLabel(c.category) },
          { key: "city", header: "City", cell: (c) => c.city ?? "—" },
          { key: "type", header: "Type", cell: (c) => <TypePill type={c.type} /> },
          { key: "disbursed", header: "Disbursed", cell: (c) => <Money paise={c.disbursedPaise} compact /> },
          {
            key: "status",
            header: "",
            cell: (c) => (
              <Link href={`/admin/cases/${c.id}`} className="flex flex-wrap items-center gap-1.5">
                <StatusPill status={c.status} />
                <PublishedPill published={c.isPublished} />
              </Link>
            ),
          },
        ]}
        renderCard={(c) => (
          <Link href={`/admin/cases/${c.id}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{c.title}</span>
              <Money paise={c.disbursedPaise} compact />
            </div>
            <span className="text-sm text-muted">
              {categoryLabel(c.category)} · {c.city ?? "—"}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <StatusPill status={c.status} />
              <TypePill type={c.type} />
              <PublishedPill published={c.isPublished} />
            </div>
          </Link>
        )}
      />
    </div>
  );
}
