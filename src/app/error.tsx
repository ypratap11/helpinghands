"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Nothing was lost. Please try again, or come back in a moment.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="min-h-[44px] w-full rounded-lg bg-neutral-900 px-4 text-white"
      >
        Try again
      </button>
    </main>
  );
}
