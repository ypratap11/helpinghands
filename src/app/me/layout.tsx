import { requireUserOrRedirect } from "@/lib/authz";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();
  return <>{children}</>;
}
