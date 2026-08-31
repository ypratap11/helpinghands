import Link from "next/link";

export default function NotFound() {
  return (
    <main className="aura flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center lift">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          That page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-forest px-4 text-sm font-semibold text-white transition-colors hover:bg-forest-dark"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
