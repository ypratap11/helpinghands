import { describe, expect, it } from "vitest";
import {
  InvalidAmountError,
  formatPaise,
  formatPaiseCompact,
  parseRupeesToPaise,
} from "@/lib/money";

describe("parseRupeesToPaise", () => {
  it("parses whole rupees", () => {
    expect(parseRupeesToPaise("500")).toBe(50000);
  });

  it("parses paise precisely", () => {
    expect(parseRupeesToPaise("1234.50")).toBe(123450);
  });

  it("parses a single decimal place as tens of paise", () => {
    expect(parseRupeesToPaise("10.5")).toBe(1050);
  });

  it("accepts Indian digit grouping and rupee symbol", () => {
    expect(parseRupeesToPaise("₹1,00,000")).toBe(10000000);
  });

  it("accepts surrounding whitespace", () => {
    expect(parseRupeesToPaise("  250  ")).toBe(25000);
  });

  it("does not lose precision on values that float maths rounds badly", () => {
    expect(parseRupeesToPaise("0.07")).toBe(7);
    expect(parseRupeesToPaise("1.15")).toBe(115);
    expect(parseRupeesToPaise("8.29")).toBe(829);
  });

  it("rejects more than two decimal places", () => {
    expect(() => parseRupeesToPaise("10.123")).toThrow(InvalidAmountError);
  });

  it("rejects negative amounts", () => {
    expect(() => parseRupeesToPaise("-5")).toThrow(InvalidAmountError);
  });

  it("rejects zero", () => {
    expect(() => parseRupeesToPaise("0")).toThrow(InvalidAmountError);
  });

  it("rejects empty and non-numeric input", () => {
    expect(() => parseRupeesToPaise("")).toThrow(InvalidAmountError);
    expect(() => parseRupeesToPaise("abc")).toThrow(InvalidAmountError);
  });
});

describe("formatPaise", () => {
  it("formats with two decimals and the rupee symbol", () => {
    expect(formatPaise(123450)).toBe("₹1,234.50");
  });

  it("groups in lakhs, not thousands", () => {
    expect(formatPaise(10000000)).toBe("₹1,00,000.00");
  });

  it("groups in crores", () => {
    expect(formatPaise(1000000000)).toBe("₹1,00,00,000.00");
  });

  it("accepts bigint aggregates from the database", () => {
    expect(formatPaise(50000n)).toBe("₹500.00");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });
});

describe("formatPaiseCompact", () => {
  it("drops decimals for whole rupees", () => {
    expect(formatPaiseCompact(50000)).toBe("₹500");
  });

  it("keeps decimals when paise are present", () => {
    expect(formatPaiseCompact(50050)).toBe("₹500.50");
  });
});
