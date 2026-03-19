import clsx from "clsx";

export function Badge({
  children,
  variant = "default",
  className,
  style,
}: {
  children: React.ReactNode;
  variant?:
    | "default"
    | "pending"
    | "success"
    | "warning"
    | "danger"
    | "country"
    | "roleAdmin"
    | "roleUser"
    | "roleSuperAdmin";
  className?: string;
  style?: React.CSSProperties;
}) {
  const styles: Record<string, string> = {
    default:
      "bg-slate-900 text-white border border-slate-900 font-semibold dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
    pending:
      "bg-cyan-600 text-white border border-cyan-700 font-semibold dark:bg-cyan-500 dark:text-white dark:border-cyan-400",
    success:
      "bg-emerald-100 text-slate-900 border border-emerald-300 font-semibold dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/40",
    warning:
      "bg-amber-200 text-slate-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40",
    danger:
      "bg-rose-600 text-white border border-rose-700 font-semibold dark:bg-rose-500/30 dark:text-white dark:border-rose-400/50",
    country: "bg-slate-100 text-slate-900 border border-slate-400 font-semibold dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-500/40",
    roleAdmin:
      "bg-amber-600 text-white border border-amber-700 font-semibold dark:bg-amber-500 dark:text-white dark:border-amber-400",
    roleUser:
      "bg-blue-600 text-white border border-blue-700 font-semibold dark:bg-blue-500 dark:text-white dark:border-blue-400",
    roleSuperAdmin:
      "bg-violet-600 text-white border border-violet-700 font-semibold dark:bg-violet-500 dark:text-white dark:border-violet-400",
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
