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
    default: "bg-slate-800 text-slate-100",
    success: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50",
    warning: "bg-amber-500/20 text-amber-300 border border-amber-500/50",
    danger: "bg-rose-500/20 text-rose-300 border border-rose-500/50",
  };
  return (
    <span className={clsx("inline-flex items-center rounded-full px-3 py-1 text-xs", styles[variant], className)}>
      {children}
    </span>
  );
}
