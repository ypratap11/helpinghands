import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

const base =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const styles: Record<Variant, string> = {
  primary: "bg-forest text-white hover:bg-forest-dark shadow-sm",
  secondary: "bg-surface text-forest border border-line hover:bg-forest-soft",
  danger: "bg-surface text-danger border border-line hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,white)]",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${base} ${styles[variant]} ${className}`} />;
}
