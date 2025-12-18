import clsx from "clsx";

export function Card({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={clsx("rounded-2xl border border-border bg-card p-6 text-card-foreground", className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
