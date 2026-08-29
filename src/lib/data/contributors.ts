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
export type ContributorUpdateInput = Partial<ContributorInput>;

export const ANONYMOUS_CONTRIBUTOR_ID = "anonymous";

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

/**
 * Builds an update payload containing only the keys actually present on
 * `input`, so an update that omits a field (e.g. a form that doesn't render
 * it) leaves the existing column value untouched rather than nulling it.
 * Prisma treats an `undefined` value in `data` as "do not change this
 * column" (unlike an explicit `null`, which clears it), so any key not
 * present on `input` is left out of the parsed result entirely.
 */
function normalisePartial(input: ContributorUpdateInput) {
  const parsed = contributorSchema.partial().parse(input);
  const data: ContributorUpdateInput = {};
  for (const key of Object.keys(input) as (keyof ContributorInput)[]) {
    if (key === "email") {
      data.email = parsed.email ? parsed.email : null;
    } else {
      data[key] = parsed[key] as never;
    }
  }
  return data;
}

export async function updateContributor(
  id: string,
  input: ContributorUpdateInput,
  actorId: string | null,
) {
  const before = await prisma.contributor.findUnique({ where: { id } });
  if (!before) throw new Error("Contributor not found");
  if (before.isSystem) throw new Error("The Anonymous contributor cannot be edited");

  const data = normalisePartial(input);
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
