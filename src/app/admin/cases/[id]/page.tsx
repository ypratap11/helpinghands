import { notFound } from "next/navigation";
import { RecordList } from "@/components/RecordList";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { CASE_CATEGORIES } from "@/lib/categories";
import { caseDisbursedTotal, getCase } from "@/lib/data/cases";
import { caseRaisedTotal, listCaseContributions } from "@/lib/data/contributions";
import { todayInIndia } from "@/lib/fy";
import { CaseForm } from "../CaseForm";
import { setPublishedAction } from "../actions";
import { DisbursementForm } from "./DisbursementForm";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export default async function EditCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseRecord = await getCase(id);
  if (!caseRecord) notFound();

  const today = todayInIndia();
  const [total, raised, caseContributions] = await Promise.all([
    caseDisbursedTotal(id),
    caseRaisedTotal(id),
    listCaseContributions(id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Edit cause</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
            {caseRecord.title}
          </h1>
        </div>
        <form action={setPublishedAction}>
          <input type="hidden" name="id" value={caseRecord.id} />
          <input type="hidden" name="published" value={(!caseRecord.isPublished).toString()} />
          <Button type="submit" variant={caseRecord.isPublished ? "secondary" : "primary"}>
            {caseRecord.isPublished ? "Unpublish" : "Publish"}
          </Button>
        </form>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <h2 className="pb-4 font-display text-lg font-semibold text-ink">Details</h2>
        <CaseForm categories={CASE_CATEGORIES} today={today} caseRecord={caseRecord} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <div className="flex items-baseline justify-between pb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Raised for this cause</h2>
          <span className="text-sm text-muted">
            <Money paise={raised} compact className="font-semibold text-forest" />
          </span>
        </div>
        <RecordList
          items={caseContributions}
          empty="No contributions earmarked for this cause yet."
          columns={[
            { key: "date", header: "Date", cell: (c) => formatDate(c.receivedOn) },
            { key: "from", header: "From", cell: (c) => c.contributor.name },
            { key: "amount", header: "Amount", cell: (c) => <Money paise={c.amountPaise} compact /> },
          ]}
          renderCard={(c) => (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{c.contributor.name}</span>
                <Money paise={c.amountPaise} compact />
              </div>
              <span className="text-sm text-muted">{formatDate(c.receivedOn)}</span>
            </div>
          )}
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <div className="flex items-baseline justify-between pb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Disbursements</h2>
          <span className="text-sm text-muted">
            Total given: <Money paise={total} compact className="font-semibold text-ink" />
          </span>
        </div>
        <DisbursementForm caseId={caseRecord.id} today={today} />
      </section>

      <RecordList
        items={caseRecord.disbursements}
        empty="No disbursements recorded yet."
        columns={[
          { key: "date", header: "Date", cell: (d) => formatDate(d.paidOn) },
          { key: "amount", header: "Amount", cell: (d) => <Money paise={d.amountPaise} compact /> },
          { key: "mode", header: "Mode", cell: (d) => d.mode },
          { key: "paidTo", header: "Paid to", cell: (d) => d.paidTo ?? "—" },
          { key: "note", header: "Note", cell: (d) => d.note ?? "—" },
        ]}
        renderCard={(d) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{d.paidTo ?? "—"}</span>
              <Money paise={d.amountPaise} compact />
            </div>
            <span className="text-sm text-muted">
              {formatDate(d.paidOn)} · {d.mode}
            </span>
            {d.note ? <span className="text-xs text-muted">{d.note}</span> : null}
          </div>
        )}
      />
    </div>
  );
}
