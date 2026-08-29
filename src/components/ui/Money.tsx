import { formatPaise, formatPaiseCompact } from "@/lib/money";

export function Money({
  paise,
  compact = false,
}: {
  paise: number | bigint;
  compact?: boolean;
}) {
  return (
    <span className="tabular-nums">
      {compact ? formatPaiseCompact(paise) : formatPaise(paise)}
    </span>
  );
}
