import type { ReactNode } from "react";

export type Column<T> = { key: string; header: string; cell: (item: T) => ReactNode };

export function RecordList<T extends { id: string }>({
  items,
  columns,
  renderCard,
  empty = "Nothing here yet.",
}: {
  items: T[];
  columns: Column<T>[];
  renderCard: (item: T) => ReactNode;
  empty?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center text-sm text-muted">
        {empty}
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl border border-line bg-surface p-4 lift">
            {renderCard(item)}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface lift sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-forest-soft/50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-line/70 last:border-0 hover:bg-forest-soft/30"
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3.5 align-middle">
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
