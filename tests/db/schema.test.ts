import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("schema", () => {
  it("has the seeded settings singleton", async () => {
    const settings = await prisma.orgSettings.findUnique({ where: { id: "singleton" } });
    expect(settings?.isEightyGEnabled).toBe(false);
    expect(settings?.showBalancePublicly).toBe(false);
    expect(settings?.receiptPrefix).toBe("HH");
  });

  it("has the seeded anonymous contributor", async () => {
    const anon = await prisma.contributor.findUnique({ where: { id: "anonymous" } });
    expect(anon?.isSystem).toBe(true);
  });

  it("stores receivedOn without a time component", async () => {
    const contribution = await prisma.contribution.create({
      data: {
        contributorId: "anonymous",
        amountPaise: 50000,
        receivedOn: new Date(Date.UTC(2026, 7, 28)),
        mode: "CASH",
      },
    });
    expect(contribution.receivedOn.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    await prisma.contribution.delete({ where: { id: contribution.id } });
  });
});
