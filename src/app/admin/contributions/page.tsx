import { RecordList } from "@/components/RecordList";
import { Money } from "@/components/ui/Money";
import { listCases } from "@/lib/data/cases";
import { listContributions } from "@/lib/data/contributions";
import { ANONYMOUS_CONTRIBUTOR_ID, listContributors } from "@/lib/data/contributors";
import { todayInIndia } from "@/lib/fy";
import { ContributionForm } from "./ContributionForm";
import { VoidButton } from "./VoidButton";
import { voidContributionAction } from "./actions";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export default async function ContributionsPage() {
  const [contributions, contributors, cases] = await Promise.all([
    listContributions(),
    listContributors(),
    listCases(),
  ]);
  const today = todayInIndia();
  // listCases() returns disbursedPaise as a bigint; a bigint prop into a
  // "use client" component throws in React production, so strip it down to
  // plain strings before it crosses into ContributionForm.
  const caseOptions = cases.map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ledger</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Money in</h1>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <h2 className="pb-4 font-display text-lg font-semibold text-ink">Record a contribution</h2>
        <ContributionForm
          contributors={contributors}
          cases={caseOptions}
          today={today}
          anonymousContributorId={ANONYMOUS_CONTRIBUTOR_ID}
        />
      </section>

      <RecordList
        items={contributions}
        empty="No contributions recorded yet."
        columns={[
          { key: "date", header: "Date", cell: (c) => formatDate(c.receivedOn) },
          { key: "from", header: "From", cell: (c) => c.contributor.name },
          { key: "amount", header: "Amount", cell: (c) => <Money paise={c.amountPaise} compact /> },
          { key: "cause", header: "Cause", cell: (c) => c.case?.title ?? "—" },
          { key: "receipt", header: "Receipt", cell: (c) => c.receiptNo ?? "—" },
          {
            key: "status",
            header: "",
            cell: (c) =>
              c.status === "VOID" ? (
                <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-2.5 py-0.5 text-xs font-semibold text-danger">Voided</span>
              ) : (
                <VoidButton id={c.id} action={voidContributionAction} />
              ),
          },
        ]}
        renderCard={(c) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{c.contributor.name}</span>
              <Money paise={c.amountPaise} compact />
            </div>
            <span className="text-sm text-muted">
              {formatDate(c.receivedOn)} · {c.mode}
              {c.status === "VOID" ? " · Voided" : ""}
            </span>
            <span className="text-xs text-muted">Cause: {c.case?.title ?? "—"}</span>
            <span className="text-xs text-muted">{c.receiptNo ?? ""}</span>
            {c.status === "ACTIVE" ? (
              <div className="pt-1">
                <VoidButton
                  id={c.id}
                  action={voidContributionAction}
                  label="Void this entry"
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-danger underline"
                />
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  );
}
