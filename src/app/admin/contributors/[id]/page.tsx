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
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{contributor.name}</h1>
      <ContributorForm contributor={contributor} />
    </div>
  );
}
