export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-forest ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[62%] w-[62%]">
        {/* cupped hands */}
        <path
          d="M4 13c0 3.6 3.6 6.5 8 6.5s8-2.9 8-6.5"
          stroke="#fbf8f1"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {/* sprout stem */}
        <path d="M12 13V8.5" stroke="var(--color-marigold)" strokeWidth="1.7" strokeLinecap="round" />
        {/* two leaves */}
        <path
          d="M12 10.5C10.8 8.6 8.9 8 7.4 8.2 7.4 9.9 8.8 11.1 12 10.5Z"
          fill="var(--color-marigold)"
        />
        <path
          d="M12 9.6C13 7.9 14.7 7.2 16.1 7.4 16.1 9 14.9 10.1 12 9.6Z"
          fill="#fbf8f1"
        />
      </svg>
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
