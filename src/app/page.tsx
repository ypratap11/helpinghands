import Link from "next/link";
import { Wordmark } from "@/components/BrandMark";
import { CaseCard } from "@/components/CaseCard";
import { Money } from "@/components/ui/Money";
import { listPublishedCases, publicImpact } from "@/lib/data/public";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [impact, cases] = await Promise.all([publicImpact(), listPublishedCases(6)]);

  const hasImpact = impact.raisedPaise > 0n || impact.disbursedPaise > 0n || impact.peopleHelped > 0;

  const stats: { label: string; node: React.ReactNode }[] = [
    { label: "Raised", node: <Money paise={impact.raisedPaise} compact /> },
    { label: "Given out", node: <Money paise={impact.disbursedPaise} compact /> },
    {
      label: "People helped",
      node: <span className="nums">{impact.peopleHelped.toLocaleString("en-IN")}</span>,
    },
  ];
  if (impact.balancePaise !== null) {
    stats.push({ label: "In hand", node: <Money paise={impact.balancePaise} compact /> });
  }

  return (
    <div className="aura min-h-dvh">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark />
        <Link
          href="/login"
          className="inline-flex min-h-[40px] items-center rounded-xl border border-line bg-surface/70 px-4 text-sm font-semibold text-forest transition-colors hover:bg-forest-soft"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pb-24 pt-10 sm:pt-20">
        <section className="max-w-2xl">
          <p className="rise mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-forest">
            <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
            Friends helping friends
          </p>
          <h1 className="rise font-display text-[2.6rem] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-6xl" style={{ animationDelay: "60ms" }}>
            We pool what we can, and help where it&apos;s{" "}
            <span className="mark italic text-forest">needed most</span>.
          </h1>
          <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ animationDelay: "140ms" }}>
            A small circle of friends putting money together for people going through a hard time —
            medical bills, school fees, a family that needs a hand. Every rupee that comes in and
            every rupee that goes out is written down and kept in the open.
          </p>
          <div className="rise mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "220ms" }}>
            <Link
              href="/login"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-forest px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-dark"
            >
              Sign in to continue
            </Link>
            <span className="inline-flex min-h-[48px] items-center text-sm text-muted">
              Members see their giving. Admins keep the ledger.
            </span>
          </div>
        </section>

        {/* Live impact band */}
        <section className="rise" style={{ animationDelay: "260ms" }}>
          {hasImpact ? (
            <div
              className={`grid gap-px overflow-hidden rounded-2xl border border-line bg-line lift ${
                stats.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"
              }`}
            >
              {stats.map((s) => (
                <div key={s.label} className="bg-surface px-6 py-7 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p>
                  <p className="mt-2 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                    {s.node}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
              <h2 className="font-display text-xl font-semibold text-ink">
                The ledger is just getting started
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                As contributions come in and help goes out, the running totals will show up here —
                line by line, rupee by rupee. No numbers yet means there&apos;s nothing to hide.
              </p>
            </div>
          )}
        </section>

        {/* Where it went */}
        <section className="rise" style={{ animationDelay: "320ms" }}>
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Where it went
            </h2>
            {cases.length > 0 ? (
              <span className="text-sm text-muted">Most recent first</span>
            ) : null}
          </div>

          {cases.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cases.map((c) => (
                <CaseCard key={c.id} caseItem={c} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center">
              <h3 className="font-display text-lg font-semibold text-ink">
                No causes published yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                When help goes out, an anonymised summary — what it was for, roughly where, and how
                much — will appear here. Names and details stay private, always.
              </p>
            </div>
          )}
        </section>

        {/* How it works / promise */}
        <section className="rise grid gap-4 sm:grid-cols-3" style={{ animationDelay: "380ms" }}>
          {[
            {
              t: "Open by design",
              d: "Contributions and help are recorded as they happen — nothing tucked away in a chat thread.",
            },
            {
              t: "A receipt for every gift",
              d: "Each contribution gets its own numbered receipt, ready for tax-deduction once we register.",
            },
            {
              t: "Kept, never erased",
              d: "A mistake is marked and corrected, not deleted — so the record always adds up.",
            },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-line bg-surface p-5 lift">
              <h2 className="font-display text-lg font-semibold text-forest">{c.t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10 text-sm text-muted">
        Helping Hands — kept honestly, in Asia/Kolkata time.
      </footer>
    </div>
  );
}
