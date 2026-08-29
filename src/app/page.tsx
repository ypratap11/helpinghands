import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Helping Hands</h1>
        <p className="text-base leading-relaxed text-neutral-600">
          A small group of friends pooling what we can to help people in need —
          and keeping an honest record of every rupee in and every rupee out.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
      </div>

      <p className="text-sm text-neutral-500">
        Members can sign in to see their own contributions and receipts.
        Administrators manage the ledger.
      </p>
    </main>
  );
}
