import Link from "next/link";
import { RecordList } from "@/components/RecordList";
import { listContributors } from "@/lib/data/contributors";
import { ContributorForm } from "./ContributorForm";

export default async function ContributorsPage() {
  const contributors = await listContributors();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">People</h1>

      <RecordList
        items={contributors}
        empty="No one added yet."
        columns={[
          { key: "name", header: "Name", cell: (c) => <Link href={`/admin/contributors/${c.id}`}>{c.name}</Link> },
          { key: "email", header: "Email", cell: (c) => c.email ?? "—" },
          { key: "phone", header: "Phone", cell: (c) => c.phone ?? "—" },
        ]}
        renderCard={(c) => (
          <Link href={`/admin/contributors/${c.id}`} className="flex flex-col gap-1">
            <span className="font-medium">{c.name}</span>
            <span className="text-sm text-neutral-500">{c.email ?? c.phone ?? "No contact"}</span>
          </Link>
        )}
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="pb-4 font-medium">Add someone</h2>
        <ContributorForm />
      </section>
    </div>
  );
}
