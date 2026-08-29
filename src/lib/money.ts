export class InvalidAmountError extends Error {
  constructor(input: string) {
    super(`Not a valid rupee amount: ${JSON.stringify(input)}`);
    this.name = "InvalidAmountError";
  }
}

/**
 * Converts a human-typed rupee string into integer paise.
 * Deliberately string-based: parseFloat("0.07") * 100 is 7.000000000000001.
 */
export function parseRupeesToPaise(input: string): number {
  const cleaned = String(input).trim().replace(/[₹,\s]/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new InvalidAmountError(input);

  const [whole, fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (paise <= 0) throw new InvalidAmountError(input);
  if (!Number.isSafeInteger(paise)) throw new InvalidAmountError(input);

  return paise;
}

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPaise(paise: number | bigint): string {
  return formatter.format(Number(paise) / 100);
}

export function formatPaiseCompact(paise: number | bigint): string {
  const value = Number(paise);
  if (value % 100 !== 0) return formatPaise(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value / 100);
}
