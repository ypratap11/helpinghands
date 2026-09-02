import { auth } from "@/lib/auth";
import { getAttachment, isAttachmentPubliclyServable } from "@/lib/data/attachments";
import { readFile } from "@/lib/storage";

/**
 * Serves an attachment's raw bytes.
 *
 * Permission rules (see isAttachmentPubliclyServable for the shared
 * decision, unit-tested directly in tests/data/attachments.test.ts):
 *   - A signed-in ADMIN may read any attachment.
 *   - Anyone else may read it ONLY if isAttachmentPubliclyServable() says
 *     so -- which is only ever true for a CASE attachment with isPublic
 *     true whose parent Case is currently published. A
 *     DISBURSEMENT/CONTRIBUTION attachment is NEVER served to a
 *     non-admin, regardless of its isPublic flag.
 *
 * On ANY failure (missing row, missing file on disk, forbidden) this
 * returns a plain 404 -- never a 403 or any other status -- so a visitor
 * cannot distinguish "doesn't exist" from "exists but you can't see it".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const attachment = await getAttachment(id);
  if (!attachment) return notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  if (!isAdmin) {
    const publiclyServable = await isAttachmentPubliclyServable(attachment);
    if (!publiclyServable) return notFound();
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(attachment.storageKey);
  } catch {
    return notFound();
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${escapeFilenameForHeader(attachment.filename)}"`,
      // Private attachments (admin-only) must never be cached by a shared
      // cache; public ones (a published cause's photo) can be cached
      // moderately -- they rarely change and re-fetching on every view of
      // a public page is wasteful.
      "Cache-Control": attachment.isPublic
        ? "public, max-age=3600"
        : "private, no-store",
    },
  });
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/** Strips characters that would break out of the quoted filename in a Content-Disposition header. */
function escapeFilenameForHeader(filename: string): string {
  return filename.replace(/["\r\n]/g, "");
}
