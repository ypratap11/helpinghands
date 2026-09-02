"use client";

import { useState } from "react";
import type { voidDisbursementAction } from "./actions";

/**
 * Two-tap void control for a disbursement: "Void" arms confirmation, "Confirm
 * void" actually submits. Deliberately not window.confirm() — that blocks
 * the main thread and cannot be exercised in tests. Mirrors
 * src/app/admin/contributions/VoidButton.tsx.
 */
export function VoidButton({
  id,
  caseId,
  action,
  className,
  label = "Void",
}: {
  id: string;
  caseId: string;
  action: typeof voidDisbursementAction;
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
      <input type="hidden" name="caseId" value={caseId} />
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
