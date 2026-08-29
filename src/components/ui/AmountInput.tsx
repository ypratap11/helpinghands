import { Field, inputClass } from "@/components/ui/Field";

export function AmountInput({
  name = "amount",
  label = "Amount",
  defaultValue,
  error,
}: {
  name?: string;
  label?: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={name} error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
          ₹
        </span>
        <input
          id={name}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          defaultValue={defaultValue}
          className={`${inputClass} pl-7`}
        />
      </div>
    </Field>
  );
}
