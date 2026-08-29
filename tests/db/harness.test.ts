import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("test database harness", () => {
  it("starts each test with only baseline rows", async () => {
    expect(await prisma.contributor.count()).toBe(1);
    expect(await prisma.contribution.count()).toBe(0);

    await prisma.contributor.create({ data: { name: "Left over" } });
    expect(await prisma.contributor.count()).toBe(2);
  });

  it("does not see the previous test's rows", async () => {
    expect(await prisma.contributor.count()).toBe(1);
  });
});
