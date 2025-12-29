export function Table<T>({
  columns,
  data,
  keyExtractor,
}: {
  columns: { key: keyof T; label: string; render?: (row: T) => React.ReactNode }[];
  data: T[];
  keyExtractor: (row: T) => string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card max-md:border-transparent max-md:bg-transparent dark:max-md:bg-transparent">
      <div className="hidden md:block">
        <table className="w-full border-collapse bg-card text-sm text-foreground">
          <thead>
            <tr className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              {columns.map((col) => (
                <th key={String(col.key)} className="px-4 py-3">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={keyExtractor(row)} className="border-t border-border hover:bg-muted">
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3">
                    {col.render ? col.render(row) : (row[col.key] as any)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-6 p-4 md:hidden">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            className="space-y-3 rounded-[28px] border border-border/60 bg-background/80 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.12)] max-md:border-slate-200 max-md:bg-white max-md:shadow-[0_20px_40px_rgba(15,23,42,0.1)] dark:max-md:border-slate-700 dark:max-md:bg-slate-900 dark:max-md:shadow-[0_22px_46px_rgba(0,0,0,0.45)]"
          >
            {columns.map((col) => (
              <div key={String(col.key)} className="flex items-start justify-between gap-3">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{col.label}</span>
                <span className="text-sm text-foreground">
                  {col.render ? col.render(row) : (row[col.key] as any)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
