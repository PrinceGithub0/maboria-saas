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
    <div
      className={clsx(
        "rounded-2xl border border-border bg-card p-6 text-card-foreground max-md:rounded-[32px] max-md:border-slate-200 max-md:bg-white max-md:p-4 max-md:text-slate-900 max-md:shadow-[0_24px_48px_rgba(15,23,42,0.12)] max-md:[&_.text-muted-foreground]:text-slate-800 max-md:[&_.text-foreground]:text-slate-900 max-md:[&_.text-card-foreground]:text-slate-900 dark:max-md:border-slate-700 dark:max-md:bg-slate-900 dark:max-md:text-slate-100 dark:max-md:[&_.text-muted-foreground]:text-slate-300 dark:max-md:[&_.text-foreground]:text-slate-100 dark:max-md:[&_.text-card-foreground]:text-slate-100 dark:max-md:shadow-[0_28px_60px_rgba(0,0,0,0.45)]",
        className
      )}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
