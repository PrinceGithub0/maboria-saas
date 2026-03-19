export function Table<T>({
  columns,
  data,
  keyExtractor,
  align = "left",
}: {
  columns: {
    key: keyof T;
    label: string;
    render?: (row: T) => React.ReactNode;
    align?: "left" | "center" | "right";
  }[];
  data: T[];
  keyExtractor: (row: T) => string;
  align?: "left" | "center" | "right";
}) {
  const getAlignmentClass = (columnAlign?: "left" | "center" | "right") => {
    const resolvedAlign = columnAlign ?? align;
    return resolvedAlign === "center"
      ? "text-center"
      : resolvedAlign === "right"
        ? "text-right"
        : "text-left";
  };

  return (
    <div className="overflow-visible rounded-[18px] border border-border/30 bg-transparent max-md:border-transparent max-md:bg-transparent dark:max-md:bg-transparent">
      <div className="hidden md:block">
        <table className="w-full border-collapse bg-card text-sm text-foreground">
          <thead>
            <tr className="bg-muted/35 text-[11px] uppercase tracking-[0.2em] text-slate-700 dark:bg-white/[0.03] dark:text-slate-300">
              {columns.map((col) => (
                <th key={String(col.key)} className={`px-6 py-3 font-semibold ${getAlignmentClass(col.align)}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-t border-border/30 transition-colors hover:bg-muted/35"
              >
                {columns.map((col) => (
                  <td key={String(col.key)} className={`px-6 py-4 ${getAlignmentClass(col.align)}`}>
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
            className="space-y-3 rounded-[28px] border border-border/60 bg-card p-4 shadow-[0_12px_28px_rgba(15,23,42,0.12)] max-md:shadow-[0_20px_40px_rgba(15,23,42,0.1)] dark:max-md:shadow-[0_22px_46px_rgba(0,0,0,0.45)]"
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
