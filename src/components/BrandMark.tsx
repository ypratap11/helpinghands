export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-line ${className}`}
      aria-hidden
    >
      {/* The logo is a JPEG on a white ground, so a white tile keeps it clean. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="" className="h-full w-full object-contain p-0.5" />
    </span>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark className="h-9 w-9" />
      <span className="font-display text-lg font-semibold tracking-tight text-ink">Helping Hands</span>
    </span>
  );
}
