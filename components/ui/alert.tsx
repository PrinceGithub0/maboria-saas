import clsx from "clsx";

export function Alert({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "success" | "warning" | "error";
}) {
  const variants: Record<string, string> = {
    info: "bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
    success: "bg-emerald-100 text-slate-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/40",
    warning: "bg-amber-100 text-slate-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40",
    error: "bg-rose-100 text-slate-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40",
  };
  return <div className={clsx("rounded-xl p-4 text-sm", variants[variant])}>{children}</div>;
}
