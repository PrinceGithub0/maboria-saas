import clsx from "clsx";
import { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, ...props }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-200">
      {label}
      <input
        suppressHydrationWarning
        className={clsx(
          "rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-50 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none",
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </label>
  );
}
