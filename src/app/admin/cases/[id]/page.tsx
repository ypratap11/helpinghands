import { notFound } from "next/navigation";
import { RecordList } from "@/components/RecordList";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { CASE_CATEGORIES } from "@/lib/categories";
import { CASE_STATUSES, CASE_TYPES } from "@/lib/caseMeta";
import { listAttachments, listAttachmentsForEntities } from "@/lib/data/attachments";
import { caseDisbursedTotal, getCase } from "@/lib/data/cases";
import { caseContributionCount, caseRaisedTotal, listCaseContributions } from "@/lib/data/contributions";
import { todayInIndia } from "@/lib/fy";
import { CaseForm } from "../CaseForm";
import { setPublishedAction } from "../actions";
import { AttachmentGallery, type AttachmentRowData } from "./AttachmentGallery";
import { AttachmentUploadForm } from "./AttachmentUploadForm";
import { DisbursementForm } from "./DisbursementForm";
import { DisbursementList, type DisbursementRowData } from "./DisbursementList";

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
  const [total, raised, contributionCount, caseContributions, caseAttachments, disbursementAttachments] =
    await Promise.all([
      caseDisbursedTotal(id),
      caseRaisedTotal(id),
      caseContributionCount(id),
      listCaseContributions(id),
      listAttachments("CASE", id),
      listAttachmentsForEntities(
        "DISBURSEMENT",
        caseRecord.disbursements.map((d) => d.id),
      ),
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
        <CaseForm
          categories={CASE_CATEGORIES}
          types={CASE_TYPES}
          statuses={CASE_STATUSES}
          today={today}
          caseRecord={caseRecord}
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <h2 className="pb-1 font-display text-lg font-semibold text-ink">Cause photo</h2>
        <p className="pb-4 text-sm text-muted">
          A photo or PDF for this cause. Tick &ldquo;Show on the public page&rdquo; to display it once
          the cause is published — anything left unticked stays admin-only.
        </p>
        <div className="flex flex-col gap-4">
          <AttachmentUploadForm
            entityType="CASE"
            entityId={caseRecord.id}
            caseId={caseRecord.id}
            allowPublicToggle
            label="Upload photo"
          />
          <AttachmentGallery
            attachments={caseAttachments.map(toAttachmentRow)}
            caseId={caseRecord.id}
            emptyLabel="No photo uploaded for this cause yet."
          />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <div className="flex items-baseline justify-between pb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Raised for this cause</h2>
          <span className="text-sm text-muted">
            <Money paise={raised} compact className="font-semibold text-forest" /> ·{" "}
            {contributionCount.toLocaleString("en-IN")}{" "}
            {contributionCount === 1 ? "contribution" : "contributions"}
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

      <DisbursementList
        disbursements={caseRecord.disbursements.map((d) =>
          toDisbursementRow(d, disbursementAttachments.get(d.id) ?? []),
        )}
      />
    </div>
  );
}

function toAttachmentRow(a: {
  id: string;
  filename: string;
  mimeType: string;
  isPublic: boolean;
}): AttachmentRowData {
  return { id: a.id, filename: a.filename, mimeType: a.mimeType, isPublic: a.isPublic };
}

function toDisbursementRow(
  d: {
    id: string;
    caseId: string;
    amountPaise: number;
    paidOn: Date;
    mode: string;
    paidTo: string | null;
    reference: string | null;
    note: string | null;
    status: string;
  },
  attachments: { id: string; filename: string; mimeType: string; isPublic: boolean }[],
): DisbursementRowData {
  return {
    id: d.id,
    caseId: d.caseId,
    amountPaise: d.amountPaise,
    paidOn: d.paidOn.toISOString().slice(0, 10),
    paidOnDisplay: formatDate(d.paidOn),
    mode: d.mode,
    paidTo: d.paidTo,
    reference: d.reference,
    note: d.note,
    status: d.status === "VOID" ? "VOID" : "ACTIVE",
    attachments: attachments.map(toAttachmentRow),
  };
}
