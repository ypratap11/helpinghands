import Link from "next/link";
import { signOut } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/contributions", label: "Money in" },
  { href: "/admin/contributors", label: "People" },
];

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col sm:flex-row">
      <nav className="hidden w-52 shrink-0 flex-col justify-between border-r border-neutral-200 p-4 sm:flex">
        <div>
          <p className="px-3 pb-4 text-sm font-semibold">Helping Hands</p>
          <ul className="flex flex-col gap-1">
            {TABS.map((tab) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className="flex min-h-[44px] items-center rounded-lg px-3 text-sm hover:bg-neutral-100"
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Sign out
          </button>
        </form>
      </nav>

      <main className="flex-1 p-4 pb-24 sm:pb-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className="flex min-h-[56px] flex-col items-center justify-center text-xs"
              >
                {tab.label}
              </Link>
            </li>
          ))}
          <li className="flex-1">
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex min-h-[56px] w-full flex-col items-center justify-center text-xs text-neutral-600"
              >
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );
}
