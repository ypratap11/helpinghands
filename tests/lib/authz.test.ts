import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const { ForbiddenError, UnauthenticatedError, requireAdmin, requireUser } = await import(
  "@/lib/authz"
);

describe("requireUser", () => {
  beforeEach(() => authMock.mockReset());

  it("returns the signed-in user", async () => {
    authMock.mockResolvedValue({
      user: { id: "u1", email: "a@example.com", role: "MEMBER" },
    });
    await expect(requireUser()).resolves.toMatchObject({ id: "u1", role: "MEMBER" });
  });

  it("throws when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("throws when the session has no user", async () => {
    authMock.mockResolvedValue({});
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => authMock.mockReset());

  it("returns an admin", async () => {
    authMock.mockResolvedValue({
      user: { id: "u1", email: "boss@example.com", role: "ADMIN" },
    });
    await expect(requireAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("rejects a member with ForbiddenError, not Unauthenticated", async () => {
    authMock.mockResolvedValue({
      user: { id: "u2", email: "friend@example.com", role: "MEMBER" },
    });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an anonymous visitor", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
