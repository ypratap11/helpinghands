import { requireUserOrRedirect } from "@/lib/authz";

// Same reasoning as src/app/admin/layout.tsx - a signed-in member's own page
// must never be prerendered/cached statically.
export const dynamic = "force-dynamic";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();
  return <>{children}</>;
}
