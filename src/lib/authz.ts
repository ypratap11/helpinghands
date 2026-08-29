import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type SessionUser = { id: string; email: string; role: Role };

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "ForbiddenError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) throw new UnauthenticatedError();
  return { id: user.id, email: user.email, role: user.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}

export async function requireUserOrRedirect(): Promise<SessionUser> {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}

export async function requireAdminOrRedirect(): Promise<SessionUser> {
  const user = await requireUserOrRedirect();
  if (user.role !== "ADMIN") redirect("/me");
  return user;
}
