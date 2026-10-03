import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | string;
  /** Called only with a finite number that also passes `isValid`. */
  onValue: (value: number) => void;
  /** Extra validity rule on top of "finite"; rejected input is simply not committed. */
  isValid?: (value: number) => boolean;
};

export const isPositive = (value: number) => value > 0;

/**
 * A controlled numeric text box bound straight to store state: every
 * keystroke that parses to an acceptable number is committed, anything
 * else is ignored (so the box keeps showing the last valid value).
 * Defaults to the app's compact decimal text box.
 */
export function NumberInput({ value, onValue, isValid, className = "parameter-number-input", type = "text", inputMode, ...rest }: Props) {
  return (
    <input
      {...rest}
      className={className}
      type={type}
      inputMode={inputMode ?? (type === "text" ? "decimal" : undefined)}
      value={value}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        if (Number.isFinite(parsed) && (!isValid || isValid(parsed))) onValue(parsed);
      }}
    />
  );
}
