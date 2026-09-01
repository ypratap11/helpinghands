import { BrandMark } from "@/components/BrandMark";
import { MemberShell } from "@/components/MemberShell";
import { RecordList } from "@/components/RecordList";
import { Money } from "@/components/ui/Money";
import { listMyContributions, myYearlyTotals } from "@/lib/data/contributions";
import { requireUser } from "@/lib/authz";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export default async function MePage() {
  // Own-data only: every read below is scoped to this signed-in user's id.
  const user = await requireUser();
  const [contributions, yearlyTotals] = await Promise.all([
    listMyContributions(user.id),
    myYearlyTotals(user.id),
  ]);

  const grandTotalPaise = yearlyTotals.reduce((sum, y) => sum + y.totalPaise, 0n);
  const grandCount = yearlyTotals.reduce((sum, y) => sum + y.count, 0);

  if (contributions.length === 0) {
    return (
      <MemberShell isAdmin={user.role === "ADMIN"}>
        <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center lift">
          <BrandMark className="mx-auto h-12 w-12" />
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">
            Your giving
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Nothing is recorded against this email yet. Ask an admin to link you, and your giving
            and receipts will show up here.
          </p>
        </div>
      </MemberShell>
    );
  }

  return (
    <MemberShell isAdmin={user.role === "ADMIN"}>
      <div className="flex flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your account</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
            Your giving
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Thank you — here&apos;s everything you&apos;ve given, year by year, with receipts.
          </p>
        </header>

        <section>
          <div className="rounded-2xl border border-forest/20 bg-forest p-6 text-white lift">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Total given
            </p>
            <p className="mt-3 font-display text-4xl font-semibold tracking-tight">
              <Money paise={grandTotalPaise} compact />
            </p>
            <p className="mt-2 text-sm text-white/75">
              {grandCount} {grandCount === 1 ? "contribution" : "contributions"} across{" "}
              {yearlyTotals.length} {yearlyTotals.length === 1 ? "year" : "years"}
            </p>
          </div>
        </section>

        <section>
          <h2 className="pb-4 font-display text-lg font-semibold text-ink">By financial year</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {yearlyTotals.map((year) => (
              <div key={year.financialYear} className="rounded-2xl border border-line bg-surface p-6 lift">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  FY {year.financialYear.replace("-", "–")}
                </p>
                <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
                  <Money paise={year.totalPaise} compact />
                </p>
                <p className="mt-2 text-sm text-muted">
                  {year.count} {year.count === 1 ? "contribution" : "contributions"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="pb-4 font-display text-lg font-semibold text-ink">All contributions</h2>
          <RecordList
            items={contributions}
            empty="No contributions recorded yet."
            columns={[
              { key: "date", header: "Date", cell: (c) => formatDate(c.receivedOn) },
              { key: "amount", header: "Amount", cell: (c) => <Money paise={c.amountPaise} compact /> },
              { key: "mode", header: "Mode", cell: (c) => c.mode },
              { key: "cause", header: "Cause", cell: (c) => c.case?.title ?? "General" },
              {
                key: "receipt",
                header: "Receipt",
                cell: (c) => <span className="font-mono text-xs">{c.receiptNo ?? "—"}</span>,
              },
            ]}
            renderCard={(c) => (
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{formatDate(c.receivedOn)}</span>
                  <Money paise={c.amountPaise} compact />
                </div>
                <span className="text-sm text-muted">{c.mode}</span>
                <span className="text-xs text-muted">Cause: {c.case?.title ?? "General"}</span>
                <span className="font-mono text-xs text-muted">{c.receiptNo ?? ""}</span>
              </div>
            )}
          />
        </section>
      </div>
    </MemberShell>
  );
}
