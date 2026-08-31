import { signIn } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  return (
    <main className="aura flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="rise w-full max-w-sm rounded-3xl border border-line bg-surface p-8 lift">
        <BrandMark className="h-12 w-12" />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Sign in to see your contributions, or to manage the ledger.
        </p>

        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/admin" });
          }}
        >
          <button
            type="submit"
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-forest-soft"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 1 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17.1 2.6 14.8 1.6 12 1.6a10.4 10.4 0 1 0 0 20.8c6 0 10-4.2 10-10.1 0-.7-.1-1.2-.2-1.7H12Z" />
              <path fill="#34A853" d="M3.9 7.3 7 9.6a6.2 6.2 0 0 1 5-2.5c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17.1 2.6 14.8 1.6 12 1.6 8 1.6 4.5 3.9 3.9 7.3Z" opacity=".0" />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          Google may warn that the app isn&apos;t verified — that&apos;s expected for a small
          project. Continue past it to sign in.
        </p>
      </div>
    </main>
  );
}
