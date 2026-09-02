import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/BrandMark";
import { Money } from "@/components/ui/Money";
import { categoryLabel } from "@/lib/categories";
import { caseStatusLabel, caseTypeLabel } from "@/lib/caseMeta";
import { getPublishedCase } from "@/lib/data/public";

const monthYearFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Public, anonymised case detail. Reads exclusively from
 * src/lib/data/public.ts (getPublishedCase), which selects only public
 * columns — no beneficiaryName/beneficiaryContact/privateNotes ever reach
 * this component. No auth required. Kept as a server component so the
 * disbursedPaise bigint is formatted by <Money> on the server.
 */
export default async function PublicCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseItem = await getPublishedCase(id);
  if (!caseItem) notFound();

  const location = [caseItem.city, caseItem.state].filter(Boolean).join(", ");

  return (
    <div className="aura min-h-dvh">
      <header className="mx-auto flex w-full max-w-3xl items-center px-6 py-6">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-24 pt-6">
        <Link
          href="/"
          className="rise inline-flex min-h-[44px] w-fit items-center text-sm font-semibold text-forest hover:underline"
        >
          &larr; Back to Helping Hands
        </Link>

        <article className="rise rounded-3xl border border-line bg-surface p-7 lift sm:p-10">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex w-fit items-center rounded-full bg-forest-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-forest">
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
          </div>
          <p className="mt-5 font-display text-2xl font-medium leading-snug text-ink sm:text-3xl">
            {caseItem.publicSummary}
          </p>

          <dl className="mt-9 grid gap-6 border-t border-line pt-7 sm:grid-cols-3">
            {location ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Where</dt>
                <dd className="mt-1 text-base text-ink">{location}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">When</dt>
              <dd className="mt-1 text-base text-ink">
                {monthYearFormatter.format(caseItem.occurredOn)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Given</dt>
              <dd className="mt-1">
                <Money
                  paise={caseItem.disbursedPaise}
                  compact
                  className="font-display text-2xl font-semibold text-forest"
                />
              </dd>
            </div>
          </dl>
        </article>

        <p className="rise text-sm leading-relaxed text-muted">
          Names and contact details are kept private by design — this page shows only what&apos;s
          needed to see where the help went.
        </p>
      </main>
    </div>
  );
}
