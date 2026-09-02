import Link from "next/link";
import { RecordList } from "@/components/RecordList";
import { listContributors } from "@/lib/data/contributors";
import { ContributorForm } from "./ContributorForm";

export default async function ContributorsPage() {
  const contributors = await listContributors();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ledger</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">People</h1>
      </header>

      <RecordList
        items={contributors}
        empty="No one added yet."
        columns={[
          { key: "name", header: "Name", cell: (c) => <Link href={`/admin/contributors/${c.id}`} className="font-semibold text-forest hover:underline">{c.name}</Link> },
          { key: "email", header: "Email", cell: (c) => c.email ?? "—" },
          { key: "phone", header: "Phone", cell: (c) => c.phone ?? "—" },
          {
            key: "edit",
            header: "",
            cell: (c) => (
              <Link
                href={`/admin/contributors/${c.id}`}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-line px-3 text-sm font-medium text-forest hover:bg-forest-soft"
              >
                Edit
              </Link>
            ),
          },
        ]}
        renderCard={(c) => (
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-ink">{c.name}</span>
              <span className="text-sm text-muted">{c.email ?? c.phone ?? "No contact"}</span>
            </div>
            <Link
              href={`/admin/contributors/${c.id}`}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-line px-3 text-sm font-medium text-forest hover:bg-forest-soft"
            >
              Edit
            </Link>
          </div>
        )}
      />

      <section className="rounded-2xl border border-line bg-surface p-6 lift">
        <h2 className="pb-4 font-display text-lg font-semibold text-ink">Add someone</h2>
        <ContributorForm />
      </section>
    </div>
  );
}
