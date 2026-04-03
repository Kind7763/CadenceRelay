import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

export interface OptionWithCount {
  value: string;
  count?: number;
}

export interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  loading?: boolean;
  /** Optional map of option value -> contact count */
  optionCounts?: Record<string, number>;
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  loading = false,
  optionCounts,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    },
    []
  );

  // Filter options by search (case-insensitive)
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleOption(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function selectAll() {
    // Select all currently filtered options
    const newSet = new Set(selected);
    for (const opt of filtered) newSet.add(opt);
    onChange(Array.from(newSet));
  }

  function clearAll() {
    onChange([]);
    setSearch('');
  }

  function removeChip(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  const displayText =
    selected.length === 0
      ? placeholder
      : `${selected.length} ${label.toLowerCase()} selected`;

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700"
            >
              <span className="max-w-[140px] truncate">{v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(v);
                }}
                className="text-primary-400 hover:text-primary-600 font-bold leading-none"
              >
                &times;
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-gray-600 px-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Trigger / search input */}
      <div
        className={`flex items-center rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
          open ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="flex-1 outline-none bg-transparent text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 ${selected.length === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
            {displayText}
          </span>
        )}
        {loading ? (
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Select All / Clear All bar */}
          <div className="flex items-center justify-between border-b px-3 py-1.5">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Select All{search ? ' (filtered)' : ''}
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Scrollable options */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                {options.length === 0 ? 'No options available' : 'No matches found'}
              </p>
            ) : (
              filtered.map((opt) => {
                const isSelected = selectedSet.has(opt);
                const count = optionCounts?.[opt];
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${
                      isSelected ? 'bg-primary-50/50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOption(opt)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="flex-1 truncate">{opt}</span>
                    {count != null && (
                      <span className="text-xs text-gray-400 tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
