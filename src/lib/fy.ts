const FY_PATTERN = /^(\d{4})-(\d{2})$/;

/** Normalises any input to UTC midnight, matching a Postgres DATE column. */
export function toDateOnly(input: Date | string): Date {
  if (typeof input === "string") {
    const [y, m, d] = input.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
  );
}

/** Indian financial year label for a date: 1 April – 31 March. */
export function financialYearOf(date: Date | string): string {
  const d = toDateOnly(date);
  const year = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function financialYearRange(fy: string): { start: Date; end: Date } {
  const match = FY_PATTERN.exec(fy);
  if (!match) throw new Error(`Malformed financial year: ${fy}`);

  const startYear = Number(match[1]);
  const expectedEnd = String((startYear + 1) % 100).padStart(2, "0");
  if (match[2] !== expectedEnd) throw new Error(`Malformed financial year: ${fy}`);

  return {
    start: new Date(Date.UTC(startYear, 3, 1)),
    end: new Date(Date.UTC(startYear + 1, 2, 31)),
  };
}

export function currentFinancialYear(now: Date = new Date()): string {
  return financialYearOf(now);
}

/**
 * Today's calendar date in Asia/Kolkata as "YYYY-MM-DD".
 *
 * Not the same as toDateOnly(new Date()): the server runs UTC and users are in
 * India (UTC+5:30), so between 00:00 and 05:30 IST a UTC-derived date is a day
 * behind. Any "default to today" must use this.
 */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}
