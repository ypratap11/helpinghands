"use client";

import { useState } from "react";
import { deleteAttachmentAction } from "./actions";

export type AttachmentRowData = {
  id: string;
  filename: string;
  mimeType: string;
  isPublic: boolean;
};

/**
 * Two-tap delete control, mirroring VoidButton.tsx in this same directory:
 * "Delete" arms confirmation, "Confirm delete" actually submits.
 * Deliberately not window.confirm() -- blocks the main thread and can't be
 * exercised in tests.
 */
function DeleteAttachmentButton({ id, caseId }: { id: string; caseId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-danger underline"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={deleteAttachmentAction} className="inline-flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="caseId" value={caseId} />
      <button
        type="submit"
        className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-danger underline"
      >
        Confirm delete
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

/**
 * Renders a case's/disbursement's existing attachments: an image thumbnail
 * for JPEG/PNG/WebP, or a plain link for a PDF. Every thumbnail/link points
 * at /api/files/[id] -- the serving route, which independently re-checks
 * permission on every request (this admin page is already gated by
 * requireAdminOrRedirect, but the route never trusts that; see
 * src/app/api/files/[id]/route.ts).
 */
export function AttachmentGallery({
  attachments,
  caseId,
  emptyLabel = "Nothing attached yet.",
}: {
  attachments: AttachmentRowData[];
  caseId: string;
  emptyLabel?: string;
}) {
  if (attachments.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-2"
        >
          {attachment.mimeType.startsWith("image/") ? (
            <a href={`/api/files/${attachment.id}`} target="_blank" rel="noreferrer">
              {/*
                Plain <img>, not next/image: the source is our own
                /api/files/[id] route (permission-checked per-request, not a
                static asset), so Next's build-time image optimiser has
                nothing useful to do here.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${attachment.id}`}
                alt={attachment.filename}
                className="h-20 w-20 rounded-lg border border-line object-cover"
              />
            </a>
          ) : (
            <a
              href={`/api/files/${attachment.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] max-w-[9rem] items-center break-all text-sm font-medium text-forest underline"
            >
              {attachment.filename}
            </a>
          )}
          <div className="flex items-center gap-2">
            {attachment.isPublic ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-forest">
                Public
              </span>
            ) : null}
            <DeleteAttachmentButton id={attachment.id} caseId={caseId} />
          </div>
        </li>
      ))}
    </ul>
  );
}
