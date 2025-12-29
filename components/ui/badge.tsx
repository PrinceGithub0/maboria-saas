import clsx from "clsx";

export function Badge({
  children,
  variant = "default",
  className,
  style,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "country";
  className?: string;
  style?: React.CSSProperties;
}) {
  const styles: Record<string, string> = {
    default: "bg-slate-200 text-slate-900 border border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
    success:
      "bg-emerald-100 text-slate-900 border border-emerald-300 font-semibold dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/40",
    warning: "bg-amber-500 text-amber-950 border border-amber-600 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40",
    danger: "bg-rose-600 text-white border border-rose-700 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40",
    country: "bg-slate-100 text-slate-900 border border-slate-400 font-semibold dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-500/40",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs",
        styles[variant],
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}
