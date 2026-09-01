import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Wordmark } from "@/components/BrandMark";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export function MemberShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <div className="aura min-h-dvh">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
          <Link href="/me" className="lift rounded-xl">
            <Wordmark />
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-ink/80 transition-colors hover:bg-forest-soft hover:text-forest"
            >
              View public page
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-forest transition-colors hover:bg-forest-soft"
              >
                Admin ledger →
              </Link>
            ) : null}
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-forest-soft hover:text-forest"
              >
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <main className="flex-1 py-8">{children}</main>
      </div>
    </div>
  );
}
