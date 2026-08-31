import type { CaseCategory } from "@prisma/client";

export const CASE_CATEGORIES: { value: CaseCategory; label: string }[] = [
  { value: "MEDICAL", label: "Medical" },
  { value: "EDUCATION", label: "Education" },
  { value: "FOOD", label: "Food & essentials" },
  { value: "SHELTER", label: "Shelter" },
  { value: "DISASTER", label: "Disaster relief" },
  { value: "OTHER", label: "Other" },
];

export function categoryLabel(c: CaseCategory): string {
  return CASE_CATEGORIES.find((entry) => entry.value === c)?.label ?? c;
}
