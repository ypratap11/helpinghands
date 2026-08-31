"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="aura flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center lift">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Nothing was lost. Try again, or come back in a moment.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-forest px-4 text-sm font-semibold text-white transition-colors hover:bg-forest-dark"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
