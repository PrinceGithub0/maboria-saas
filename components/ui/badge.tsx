import clsx from "clsx";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
}) {
  const styles: Record<string, string> = {
    default: "bg-muted text-foreground border border-border",
    success: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40",
    warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40",
    danger: "bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/40",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
