import { AdminShell } from "@/components/AdminShell";
import { requireAdminOrRedirect } from "@/lib/authz";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOrRedirect();
  return <AdminShell>{children}</AdminShell>;
}
