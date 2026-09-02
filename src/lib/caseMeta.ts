import type { CaseStatus, CaseType } from "@prisma/client";

export const CASE_TYPES: { value: CaseType; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONCE", label: "One-time" },
];

export function caseTypeLabel(t: CaseType): string {
  return CASE_TYPES.find((entry) => entry.value === t)?.label ?? t;
}

export const CASE_STATUSES: { value: CaseStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function caseStatusLabel(s: CaseStatus): string {
  return CASE_STATUSES.find((entry) => entry.value === s)?.label ?? s;
}
