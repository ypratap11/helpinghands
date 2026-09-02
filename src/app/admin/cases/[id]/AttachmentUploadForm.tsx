"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { uploadAttachmentAction, type ActionState } from "./actions";

/**
 * Upload form for a single file attached to a Case or a Disbursement.
 * Posts straight to uploadAttachmentAction, which sniffs the real file
 * type, enforces the 10MB cap, and requireAdmin()s before anything else --
 * this component does no validation of its own beyond the browser's
 * `accept` hint (which is a UX nicety, never a security boundary).
 */
export function AttachmentUploadForm({
  entityType,
  entityId,
  caseId,
  allowPublicToggle = false,
  label = "Upload a file",
}: {
  entityType: "CASE" | "DISBURSEMENT";
  entityId: string;
  caseId: string;
  allowPublicToggle?: boolean;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadAttachmentAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="caseId" value={caseId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="file"
          name="file"
          accept="image/*,application/pdf"
          required
          aria-label={label}
          className="block w-full text-sm text-ink file:mr-3 file:min-h-[44px] file:cursor-pointer file:rounded-xl file:border-0 file:bg-forest-soft file:px-4 file:text-sm file:font-semibold file:text-forest hover:file:bg-forest-soft/70 sm:w-auto"
        />

        {allowPublicToggle ? (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isPublic"
              value="true"
              className="h-5 w-5 rounded border-line text-forest focus:ring-2 focus:ring-forest/30"
            />
            Show on the public page
          </label>
        ) : null}

        <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Uploading…" : label}
        </Button>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
