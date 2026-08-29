import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { linkContributorToUser, resolveRoleForEmail } from "@/lib/auth-roles";

describe("resolveRoleForEmail", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "boss@example.com, Second.Admin@Example.com";
  });

  it("promotes a listed email to ADMIN", () => {
    expect(resolveRoleForEmail("boss@example.com")).toBe("ADMIN");
  });

  it("ignores case and surrounding spaces in the list", () => {
    expect(resolveRoleForEmail("second.admin@example.com")).toBe("ADMIN");
  });

  it("defaults everyone else to MEMBER", () => {
    expect(resolveRoleForEmail("friend@example.com")).toBe("MEMBER");
  });

  it("defaults to MEMBER when the list is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(resolveRoleForEmail("boss@example.com")).toBe("MEMBER");
  });
});

describe("linkContributorToUser", () => {
  it("links an existing contributor with the same email", async () => {
    const user = await prisma.user.create({
      data: { email: "asha@example.com", name: "Asha" },
    });
    const contributor = await prisma.contributor.create({
      data: { name: "Asha", email: "asha@example.com" },
    });

    await linkContributorToUser(user.id, "asha@example.com");

    const linked = await prisma.contributor.findUnique({ where: { id: contributor.id } });
    expect(linked?.userId).toBe(user.id);
  });

  it("matches email case-insensitively", async () => {
    const user = await prisma.user.create({ data: { email: "ravi@example.com" } });
    const contributor = await prisma.contributor.create({
      data: { name: "Ravi", email: "Ravi@Example.com" },
    });

    await linkContributorToUser(user.id, "ravi@example.com");

    const linked = await prisma.contributor.findUnique({ where: { id: contributor.id } });
    expect(linked?.userId).toBe(user.id);
  });

  it("does nothing when no contributor matches", async () => {
    const user = await prisma.user.create({ data: { email: "nobody@example.com" } });
    await expect(linkContributorToUser(user.id, "nobody@example.com")).resolves.toBeUndefined();
    expect(await prisma.contributor.count({ where: { userId: user.id } })).toBe(0);
  });

  it("never steals a contributor already linked to someone else", async () => {
    const first = await prisma.user.create({ data: { email: "shared@example.com" } });
    const second = await prisma.user.create({ data: { email: "other@example.com" } });
    const contributor = await prisma.contributor.create({
      data: { name: "Shared", email: "shared@example.com", userId: first.id },
    });

    await linkContributorToUser(second.id, "shared@example.com");

    const linked = await prisma.contributor.findUnique({ where: { id: contributor.id } });
    expect(linked?.userId).toBe(first.id);
  });
});
