import { describe, expect, it } from "vitest";
import {
  currentFinancialYear,
  financialYearOf,
  financialYearRange,
  toDateOnly,
} from "@/lib/fy";

describe("financialYearOf", () => {
  it("puts 31 March in the year that is ending", () => {
    expect(financialYearOf("2026-03-31")).toBe("2025-26");
  });

  it("puts 1 April in the year that is starting", () => {
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
  });

  it("handles mid-year dates", () => {
    expect(financialYearOf("2026-12-25")).toBe("2026-27");
  });

  it("handles January", () => {
    expect(financialYearOf("2027-01-15")).toBe("2026-27");
  });

  it("accepts a Date object", () => {
    expect(financialYearOf(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
  });
});

describe("financialYearRange", () => {
  it("spans 1 April to 31 March", () => {
    const { start, end } = financialYearRange("2026-27");
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(end.toISOString().slice(0, 10)).toBe("2027-03-31");
  });

  it("round-trips with financialYearOf at both boundaries", () => {
    const { start, end } = financialYearRange("2026-27");
    expect(financialYearOf(start)).toBe("2026-27");
    expect(financialYearOf(end)).toBe("2026-27");
  });

  it("rejects a malformed label", () => {
    expect(() => financialYearRange("2026")).toThrow();
    expect(() => financialYearRange("2026-28")).toThrow();
  });
});

describe("currentFinancialYear", () => {
  it("uses the supplied clock", () => {
    expect(currentFinancialYear(new Date("2026-08-28T12:00:00Z"))).toBe("2026-27");
  });
});

describe("toDateOnly", () => {
  it("strips the time component", () => {
    expect(toDateOnly("2026-08-28").toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("does not shift the day for a late-evening India timestamp", () => {
    // 28 Aug 23:30 IST is 18:00 UTC the same day; it must stay the 28th.
    expect(toDateOnly(new Date("2026-08-28T18:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-08-28",
    );
  });
});
