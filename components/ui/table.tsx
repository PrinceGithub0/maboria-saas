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
    <div className="overflow-hidden rounded-2xl border border-slate-800">
      <table className="w-full border-collapse bg-slate-900/60 text-sm text-slate-200">
        <thead>
          <tr className="bg-slate-900/80 text-left uppercase tracking-wide text-xs text-slate-400">
            {columns.map((col) => (
              <th key={String(col.key)} className="px-4 py-3">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={keyExtractor(row)} className="border-t border-slate-800 hover:bg-slate-900/80">
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
