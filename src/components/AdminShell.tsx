import Link from "next/link";
import { signOut } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";

const TABS = [
  { href: "/admin", label: "Overview", icon: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" },
  { href: "/admin/contributions", label: "Money in", icon: "M12 4v16M6 10l6-6 6 6" },
  { href: "/admin/contributors", label: "People", icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5m3-5c2.8 0 5 2.2 5 5" },
];

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col sm:flex-row">
      {/* Desktop sidebar */}
      <nav className="hidden w-60 shrink-0 flex-col justify-between border-r border-line px-4 py-6 sm:flex">
        <div>
          <Link href="/admin" className="mb-8 flex items-center gap-2.5 px-2">
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-base font-semibold tracking-tight">Helping Hands</span>
          </Link>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Ledger</p>
          <ul className="flex flex-col gap-1">
            {TABS.map((tab) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink/80 transition-colors hover:bg-forest-soft hover:text-forest"
                >
                  <NavIcon d={tab.icon} />
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-muted transition-colors hover:bg-forest-soft hover:text-forest"
          >
            <NavIcon d="M15 5l0-1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1M10 12h11m0 0-3-3m3 3-3 3" />
            Sign out
          </button>
        </form>
      </nav>

      <main className="flex-1 px-4 py-6 pb-28 sm:px-8 sm:py-10 sm:pb-10">{children}</main>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink/70"
              >
                <NavIcon d={tab.icon} />
                {tab.label}
              </Link>
            </li>
          ))}
          <li className="flex-1">
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted"
              >
                <NavIcon d="M15 5l0-1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1M10 12h11m0 0-3-3m3 3-3 3" />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );
}
