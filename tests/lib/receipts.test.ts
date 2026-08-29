import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { allocateReceiptNo } from "@/lib/receipts";

describe("allocateReceiptNo", () => {
  it("formats as prefix/financial-year/zero-padded sequence", async () => {
    expect(await allocateReceiptNo("2026-08-28", "HH")).toBe("HH/2026-27/0001");
  });

  it("increments within a financial year", async () => {
    await allocateReceiptNo("2026-08-28", "HH");
    expect(await allocateReceiptNo("2026-09-01", "HH")).toBe("HH/2026-27/0002");
  });

  it("keeps a separate sequence per financial year", async () => {
    await allocateReceiptNo("2026-08-28", "HH");
    expect(await allocateReceiptNo("2027-05-01", "HH")).toBe("HH/2027-28/0001");
  });

  it("uses the received date, not today, so back-dated entries land correctly", async () => {
    expect(await allocateReceiptNo("2025-06-10", "HH")).toBe("HH/2025-26/0001");
  });

  it("respects the 31 March boundary", async () => {
    expect(await allocateReceiptNo("2027-03-31", "HH")).toBe("HH/2026-27/0001");
    expect(await allocateReceiptNo("2027-04-01", "HH")).toBe("HH/2027-28/0001");
  });

  it("never issues a duplicate under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => allocateReceiptNo("2026-08-28", "HH")),
    );

    expect(new Set(results).size).toBe(25);
    const sequences = results.map((r) => Number(r.split("/")[2])).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("records the counter state in the database", async () => {
    await allocateReceiptNo("2026-08-28", "HH");
    await allocateReceiptNo("2026-08-29", "HH");
    const counter = await prisma.receiptCounter.findUnique({
      where: { financialYear: "2026-27" },
    });
    expect(counter?.lastSequence).toBe(2);
  });
});
