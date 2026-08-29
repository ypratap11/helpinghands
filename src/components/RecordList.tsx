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
    return <p className="rounded-lg bg-white p-6 text-center text-neutral-500">{empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            {renderCard(item)}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border border-neutral-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium text-neutral-600">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3">
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
