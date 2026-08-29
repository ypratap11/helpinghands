import { AdminShell } from "@/components/AdminShell";
import { requireAdminOrRedirect } from "@/lib/authz";

// Every /admin page needs a live session and live data - never prerender it.
// Without this, `next build` can fail (or silently bake in stale data) when
// it tries to statically generate this route ahead of a request.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOrRedirect();
  return <AdminShell>{children}</AdminShell>;
}
