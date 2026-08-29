import { describe, expect, it } from "vitest";
import { formatPaise } from "@/lib/money";

describe("ledger display", () => {
  it("formats a bigint ledger total", () => {
    expect(formatPaise(123456700n)).toBe("₹12,34,567.00");
  });
});
