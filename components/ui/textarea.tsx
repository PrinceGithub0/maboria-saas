import clsx from "clsx";
import { TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export function Textarea({ label, error, className, ...props }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm text-foreground">
      {label}
      <textarea
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
