export interface SortState {
  field: string;
  dir: 'asc' | 'desc';
}

export function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
  className = '',
}: {
  label: string;
  field: string;
  currentSort: SortState | null;
  onSort: (field: string) => void;
  className?: string;
}) {
  const isActive = currentSort?.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`cursor-pointer select-none hover:bg-gray-100 px-3 py-2 text-left font-medium text-gray-600 ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentSort.dir === 'asc' ? (
            <span className="text-primary-600">{'\u2191'}</span>
          ) : (
            <span className="text-primary-600">{'\u2193'}</span>
          )
        ) : (
          <span className="text-gray-300">{'\u2195'}</span>
        )}
      </span>
    </th>
  );
}

export function sortItems<T>(items: T[], sort: SortState | null, getField: (item: T, field: string) => string | number | null): T[] {
  if (!sort) return items;
  return [...items].sort((a, b) => {
    const aVal = getField(a, sort.field);
    const bVal = getField(b, sort.field);
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    let cmp: number;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
    }
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

export function toggleSort(current: SortState | null, field: string): SortState {
  if (current?.field === field) {
    return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { field, dir: 'asc' };
}
