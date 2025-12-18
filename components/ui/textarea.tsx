import clsx from "clsx";
import { TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export function Textarea({ label, error, className, ...props }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-200">
      {label}
      <textarea
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
