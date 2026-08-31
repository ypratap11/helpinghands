import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { categoryLabel } from "@/lib/categories";
import type { PublicCase } from "@/lib/data/public";

const monthYearFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * An anonymised cause card for the public transparency pages. Renders only
 * fields from `PublicCase` (src/lib/data/public.ts) — never a private field.
 * Kept as a server component so the `disbursedPaise` bigint is formatted by
 * `Money` on the server and never crosses into a client component prop.
 */
export function CaseCard({ caseItem }: { caseItem: PublicCase }) {
  const whenWhere = [caseItem.city, monthYearFormatter.format(caseItem.occurredOn)]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/cases/${caseItem.id}`}
      className="group flex min-h-[44px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5 lift transition-colors hover:border-forest/40"
    >
      <span className="inline-flex w-fit items-center rounded-full bg-forest-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-forest">
        {categoryLabel(caseItem.category)}
      </span>
      <p className="font-display text-lg font-medium leading-snug text-ink">
        {caseItem.publicSummary}
      </p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-2">
        <span className="text-sm text-muted">{whenWhere}</span>
        <Money
          paise={caseItem.disbursedPaise}
          compact
          className="font-display text-base font-semibold text-forest"
        />
      </div>
    </Link>
  );
}
