import { describe, expect, it } from "vitest";
import { groupCasesByMonth } from "@/lib/groupCasesByMonth";
import type { PublicCase } from "@/lib/data/public";

function aPublicCase(overrides: Partial<PublicCase> & { id: string; occurredOn: Date }): PublicCase {
  return {
    title: "A cause",
    category: "MEDICAL",
    publicSummary: "Summary",
    city: "Hyderabad",
    state: "Telangana",
    type: "ONCE",
    status: "ACTIVE",
    disbursedPaise: 1000n,
    ...overrides,
  };
}

describe("groupCasesByMonth", () => {
  it("returns an empty array for no cases", () => {
    expect(groupCasesByMonth([])).toEqual([]);
  });

  it("groups cases by calendar month + year of occurredOn", () => {
    const sep = aPublicCase({ id: "a", occurredOn: new Date(Date.UTC(2026, 8, 10)) });
    const sep2 = aPublicCase({ id: "b", occurredOn: new Date(Date.UTC(2026, 8, 3)) });
    const aug = aPublicCase({ id: "c", occurredOn: new Date(Date.UTC(2026, 7, 20)) });

    const groups = groupCasesByMonth([sep, sep2, aug]);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("September 2026");
    expect(groups[0].cases.map((c) => c.id)).toEqual(["a", "b"]);
    expect(groups[1].label).toBe("August 2026");
    expect(groups[1].cases.map((c) => c.id)).toEqual(["c"]);
  });

  it("orders groups newest year+month first, regardless of input order", () => {
    const jan2025 = aPublicCase({ id: "old", occurredOn: new Date(Date.UTC(2025, 0, 5)) });
    const dec2026 = aPublicCase({ id: "new", occurredOn: new Date(Date.UTC(2026, 11, 1)) });
    const jun2026 = aPublicCase({ id: "mid", occurredOn: new Date(Date.UTC(2026, 5, 15)) });

    const groups = groupCasesByMonth([jan2025, dec2026, jun2026]);

    expect(groups.map((g) => g.label)).toEqual(["December 2026", "June 2026", "January 2025"]);
  });

  it("orders cases within a group newest first", () => {
    const early = aPublicCase({ id: "early", occurredOn: new Date(Date.UTC(2026, 8, 1)) });
    const late = aPublicCase({ id: "late", occurredOn: new Date(Date.UTC(2026, 8, 28)) });

    const groups = groupCasesByMonth([early, late]);

    expect(groups[0].cases.map((c) => c.id)).toEqual(["late", "early"]);
  });

  it("uses a stable year-month key for React list keys", () => {
    const c = aPublicCase({ id: "a", occurredOn: new Date(Date.UTC(2026, 8, 10)) });
    expect(groupCasesByMonth([c])[0].key).toBe("2026-09");
  });
});
