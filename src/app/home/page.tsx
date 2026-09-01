import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/authz";

// Role-aware landing after sign-in: never prerender, always check the live
// session and send the user to the right home.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUserOrRedirect();
  redirect(user.role === "ADMIN" ? "/admin" : "/me");
}
