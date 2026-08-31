import { BrandMark } from "@/components/BrandMark";

export default function MePage() {
  return (
    <main className="aura flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 text-center lift">
        <BrandMark className="mx-auto h-12 w-12" />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">
          My contributions
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Nothing is recorded against this email yet. Ask an admin to link you, and your giving and
          receipts will show up here.
        </p>
      </div>
    </main>
  );
}
