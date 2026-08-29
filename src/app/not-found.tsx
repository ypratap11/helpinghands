import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-neutral-600">
          That page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
      <Link
        href="/"
        className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-neutral-900 px-4 text-white"
      >
        Go home
      </Link>
    </main>
  );
}
