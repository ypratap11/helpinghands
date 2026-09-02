import type { PublicCase } from "@/lib/data/public";

export type CaseMonthGroup = {
  /** Stable, sortable key for the group, e.g. "2026-09". Safe as a React list key. */
  key: string;
  /** Human label, e.g. "September 2026". */
  label: string;
  cases: PublicCase[];
};

const monthYearFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Groups published causes by calendar month + year (UTC, matching the
 * month/year labels shown elsewhere on the public site) of `occurredOn`.
 * Groups are ordered newest first; within a group, causes are ordered
 * newest first. Pure function — no I/O, safe to unit test directly.
 */
export function groupCasesByMonth(cases: PublicCase[]): CaseMonthGroup[] {
  const byKey = new Map<string, PublicCase[]>();

  for (const c of cases) {
    const key = monthKey(c.occurredOn);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(c);
    } else {
      byKey.set(key, [c]);
    }
  }

  const groups: CaseMonthGroup[] = Array.from(byKey.entries()).map(([key, groupCases]) => ({
    key,
    label: monthYearFormatter.format(groupCases[0].occurredOn),
    cases: [...groupCases].sort((a, b) => b.occurredOn.getTime() - a.occurredOn.getTime()),
  }));

  groups.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));

  return groups;
}
