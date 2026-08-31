import { formatPaise, formatPaiseCompact } from "@/lib/money";

export function Money({
  paise,
  compact = false,
  className = "",
}: {
  paise: number | bigint;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`nums ${className}`}>
      {compact ? formatPaiseCompact(paise) : formatPaise(paise)}
    </span>
  );
}
