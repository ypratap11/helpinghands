import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (server.js + traced node_modules) so the
  // production Docker image can ship without node_modules wholesale.
  output: "standalone",
  // Server actions default to a 1MB request body limit. Attachment uploads
  // (cause photos, transfer-proof screenshots) are posted straight through
  // a server action (uploadAttachmentAction) as multipart FormData, and the
  // hard cap on file size is enforced server-side in
  // src/lib/data/attachments.ts (MAX_ATTACHMENT_BYTES, 10MB) -- this only
  // raises Next's own transport-level ceiling to match, so a ~1-10MB file
  // doesn't get rejected by Next before it even reaches that check.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
