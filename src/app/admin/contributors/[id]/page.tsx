import { notFound } from "next/navigation";
import { getContributor } from "@/lib/data/contributors";
import { ContributorForm } from "../ContributorForm";

export default async function EditContributorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contributor = await getContributor(id);
  if (!contributor || contributor.isSystem) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Edit person</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">{contributor.name}</h1>
      </header>
      <ContributorForm contributor={contributor} />
    </div>
  );
}
