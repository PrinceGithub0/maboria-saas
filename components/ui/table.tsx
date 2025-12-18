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
    <div className="overflow-hidden rounded-2xl border border-border">
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
  );
}
