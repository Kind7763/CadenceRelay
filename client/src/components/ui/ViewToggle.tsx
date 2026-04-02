export type ViewMode = 'grid' | 'list';

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => onChange('grid')}
        className={`flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === 'grid'
            ? 'bg-primary-100 text-primary-700'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
        }`}
        title="Grid view"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Grid
      </button>
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === 'list'
            ? 'bg-primary-100 text-primary-700'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
        }`}
        title="List view"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        List
      </button>
    </div>
  );
}
