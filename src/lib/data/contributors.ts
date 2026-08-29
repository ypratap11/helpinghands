import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export const contributorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().optional().nullable(),
  pan: z.string().trim().toUpperCase().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type ContributorInput = z.infer<typeof contributorSchema>;

function normalise(input: ContributorInput) {
  const parsed = contributorSchema.parse(input);
  return { ...parsed, email: parsed.email ? parsed.email : null };
}

export async function listContributors(query?: string) {
  return prisma.contributor.findMany({
    where: {
      isSystem: false,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getContributor(id: string) {
  return prisma.contributor.findUnique({ where: { id } });
}

export async function createContributor(input: ContributorInput, actorId: string | null) {
  const data = normalise(input);
  const created = await prisma.contributor.create({ data });

  await recordAudit({
    userId: actorId,
    action: "CREATE",
    entityType: "Contributor",
    entityId: created.id,
    after: data,
  });

  return created;
}

export async function updateContributor(
  id: string,
  input: ContributorInput,
  actorId: string | null,
) {
  const before = await prisma.contributor.findUnique({ where: { id } });
  if (!before) throw new Error("Contributor not found");
  if (before.isSystem) throw new Error("The Anonymous contributor cannot be edited");

  const data = normalise(input);
  const updated = await prisma.contributor.update({ where: { id }, data });

  await recordAudit({
    userId: actorId,
    action: "UPDATE",
    entityType: "Contributor",
    entityId: id,
    before: { name: before.name, email: before.email, phone: before.phone, pan: before.pan },
    after: data,
  });

  return updated;
}
