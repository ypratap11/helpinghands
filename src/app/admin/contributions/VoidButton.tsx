"use client";

import { useState } from "react";
import type { voidContributionAction } from "./actions";

/**
 * Two-tap void control: "Void" arms confirmation, "Confirm void" actually
 * submits. Deliberately not window.confirm() — that blocks the main thread
 * and cannot be exercised in tests.
 */
export function VoidButton({
  id,
  action,
  className,
  label = "Void",
}: {
  id: string;
  action: typeof voidContributionAction;
  className?: string;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={className ?? "inline-flex min-h-[44px] items-center px-2 text-xs text-muted underline"}
      >
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={className ?? "inline-flex min-h-[44px] items-center px-2 text-xs text-danger underline"}
      >
        Confirm void
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="inline-flex min-h-[44px] items-center px-2 text-xs text-muted underline"
      >
        Cancel
      </button>
    </form>
  );
}
