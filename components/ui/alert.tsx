import clsx from "clsx";

export function Alert({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "success" | "warning" | "error";
}) {
  const variants: Record<string, string> = {
    info: "bg-muted text-foreground border border-border",
    success: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/40",
    warning: "bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/40",
    error: "bg-rose-500/10 text-rose-800 dark:text-rose-200 border border-rose-500/40",
  };
  return <div className={clsx("rounded-xl p-4 text-sm", variants[variant])}>{children}</div>;
}
