import Link from "next/link";
import { Wordmark } from "@/components/BrandMark";

export default function HomePage() {
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

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pb-24 pt-10 sm:pt-20">
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

        <section className="rise grid gap-4 sm:grid-cols-3" style={{ animationDelay: "300ms" }}>
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
