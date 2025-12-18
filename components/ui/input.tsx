import clsx from "clsx";
import { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, ...props }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm text-foreground">
      {label}
      <input
        suppressHydrationWarning
        className={clsx(
          "rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none",
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-rose-700 dark:text-rose-400">{error}</span>}
    </label>
  );
}
