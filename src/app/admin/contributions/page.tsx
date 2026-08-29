import { RecordList } from "@/components/RecordList";
import { Money } from "@/components/ui/Money";
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
  const [contributions, contributors] = await Promise.all([
    listContributions(),
    listContributors(),
  ]);
  const today = todayInIndia();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Money in</h1>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="pb-4 font-medium">Record a contribution</h2>
        <ContributionForm
          contributors={contributors}
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
          { key: "receipt", header: "Receipt", cell: (c) => c.receiptNo ?? "—" },
          {
            key: "status",
            header: "",
            cell: (c) =>
              c.status === "VOID" ? (
                <span className="text-xs text-red-600">Voided</span>
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
            <span className="text-sm text-neutral-500">
              {formatDate(c.receivedOn)} · {c.mode}
              {c.status === "VOID" ? " · Voided" : ""}
            </span>
            <span className="text-xs text-neutral-400">{c.receiptNo ?? ""}</span>
            {c.status === "ACTIVE" ? (
              <div className="pt-1">
                <VoidButton
                  id={c.id}
                  action={voidContributionAction}
                  label="Void this entry"
                  className="inline-flex min-h-[44px] items-center text-sm text-neutral-500 underline"
                />
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  );
}
