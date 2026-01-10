import clsx from "clsx";

export function Alert({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "success" | "warning" | "error";
}) {
  const variants: Record<string, string> = {
    info: "border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-100",
    success: "alert-success",
    warning:
      "border border-amber-300 bg-amber-100 text-slate-900 dark:border-amber-900/40 dark:bg-amber-900/30 dark:text-amber-100",
    error: "alert-error",
  };
  return (
    <div
      className={clsx(
        "rounded-xl p-4 text-sm leading-relaxed",
        variants[variant],
        variant === "error" && "alert-error"
      )}
    >
      {children}
    </div>
  );
}
