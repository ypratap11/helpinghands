export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export const inputClass =
  "min-h-[44px] w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-muted/60 outline-none transition-colors focus:border-forest focus:ring-4 focus:ring-forest/10";
