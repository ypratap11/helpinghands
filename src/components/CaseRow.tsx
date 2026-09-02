import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { categoryLabel } from "@/lib/categories";
import { caseStatusLabel, caseTypeLabel } from "@/lib/caseMeta";
import type { PublicCase } from "@/lib/data/public";

/**
 * A single collapsible "Where it went" row for the public transparency
 * pages. Renders only fields from `PublicCase` (src/lib/data/public.ts) —
 * never a private field. Uses native <details>/<summary> so the section
 * stays a server component: no "use client", no JS, and the disbursedPaise
 * bigint is formatted by <Money> entirely on the server (never crosses into
 * a client component prop).
 */
export function CaseRow({ caseItem }: { caseItem: PublicCase }) {
  const location = [caseItem.city, caseItem.state].filter(Boolean).join(", ");

  return (
    <details className="group border-b border-line py-1 last:border-b-0 [&::-webkit-details-marker]:hidden">
      <summary
        className="flex min-h-[44px] w-full cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 py-3 outline-none [&::-webkit-details-marker]:hidden"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 ease-out group-open:rotate-90"
        >
          <path
            d="M7 4.5 12.5 10 7 15.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span className="min-w-0 flex-1 basis-64 font-display text-lg font-medium leading-snug text-ink">
          {caseItem.title}
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex w-fit items-center rounded-full bg-forest-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-forest">
            {categoryLabel(caseItem.category)}
          </span>
          {caseItem.status !== "ACTIVE" ? (
            <span className="inline-flex w-fit items-center rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted">
              {caseStatusLabel(caseItem.status)}
            </span>
          ) : null}
          {caseItem.type !== "ONCE" ? (
            <span className="inline-flex w-fit items-center rounded-full bg-marigold-soft px-2.5 py-1 text-xs font-semibold text-marigold">
              {caseTypeLabel(caseItem.type)}
            </span>
          ) : null}
        </span>

        <Money
          paise={caseItem.disbursedPaise}
          compact
          className="ml-auto shrink-0 font-display text-base font-semibold text-forest"
        />
      </summary>

      <div className="flex flex-col gap-3 py-1 pb-4 pl-8 pr-2">
        <p className="max-w-2xl text-sm leading-relaxed text-ink">{caseItem.publicSummary}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          {location ? <span>{location}</span> : null}
          <Link
            href={`/cases/${caseItem.id}`}
            className="inline-flex min-h-[44px] items-center font-semibold text-forest hover:underline"
          >
            View full details &rarr;
          </Link>
        </div>
      </div>
    </details>
  );
}
