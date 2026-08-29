import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

describe("recordAudit", () => {
  it("writes an entry with before and after snapshots", async () => {
    const user = await prisma.user.create({ data: { email: "boss@example.com" } });

    await recordAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "Contribution",
      entityId: "c1",
      before: { amountPaise: 50000 },
      after: { amountPaise: 60000 },
    });

    const entry = await prisma.auditLog.findFirst({ where: { entityId: "c1" } });
    expect(entry?.action).toBe("UPDATE");
    expect(entry?.before).toEqual({ amountPaise: 50000 });
    expect(entry?.after).toEqual({ amountPaise: 60000 });
  });

  it("survives an unknown user", async () => {
    await recordAudit({
      userId: null,
      action: "CREATE",
      entityType: "Contributor",
      entityId: "x1",
    });
    expect(await prisma.auditLog.count({ where: { entityId: "x1" } })).toBe(1);
  });

  it("participates in a transaction and rolls back with it", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit({
          action: "CREATE",
          entityType: "Contribution",
          entityId: "rollback",
          tx,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await prisma.auditLog.count({ where: { entityId: "rollback" } })).toBe(0);
  });
});
