import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export function resolveRoleForEmail(email: string): Role {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(email.trim().toLowerCase()) ? "ADMIN" : "MEMBER";
}

/**
 * Attaches a pre-existing contributor record to a user who has just signed in.
 * Only ever fills an empty userId, so an existing link is never reassigned.
 */
export async function linkContributorToUser(userId: string, email: string): Promise<void> {
  const contributor = await prisma.contributor.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, userId: null, isSystem: false },
  });

  if (!contributor) return;

  await prisma.contributor.update({ where: { id: contributor.id }, data: { userId } });
}
