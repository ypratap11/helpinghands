import Link from "next/link";
import { RecordList } from "@/components/RecordList";
import { Money } from "@/components/ui/Money";
import { CASE_CATEGORIES, categoryLabel } from "@/lib/categories";
import { listCases } from "@/lib/data/cases";
import { todayInIndia } from "@/lib/fy";
import { CaseForm } from "./CaseForm";

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
        <CaseForm categories={CASE_CATEGORIES} today={today} />
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
          { key: "disbursed", header: "Disbursed", cell: (c) => <Money paise={c.disbursedPaise} compact /> },
          { key: "status", header: "", cell: (c) => <Link href={`/admin/cases/${c.id}`}><PublishedPill published={c.isPublished} /></Link> },
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
            <div className="pt-1">
              <PublishedPill published={c.isPublished} />
            </div>
          </Link>
        )}
      />
    </div>
  );
}
