import { useState, useRef, useEffect } from 'react';

export const LABEL_COLORS = [
  { name: 'Red', color: '#EF4444' },
  { name: 'Orange', color: '#F97316' },
  { name: 'Yellow', color: '#EAB308' },
  { name: 'Green', color: '#22C55E' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Purple', color: '#8B5CF6' },
  { name: 'Gray', color: '#6B7280' },
];

interface LabelPickerProps {
  currentColor?: string;
  currentName?: string;
  onSelect: (label: { name: string; color: string } | null) => void;
  onClose: () => void;
}

export default function LabelPicker({ currentColor, currentName, onSelect, onClose }: LabelPickerProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(currentColor || null);
  const [labelName, setLabelName] = useState(currentName || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  function handleColorClick(color: string) {
    if (selectedColor === color) {
      setSelectedColor(null);
      setLabelName('');
    } else {
      setSelectedColor(color);
      if (!labelName) {
        const preset = LABEL_COLORS.find((c) => c.color === color);
        if (preset) setLabelName(preset.name);
      }
    }
  }

  function handleApply() {
    if (selectedColor && labelName.trim()) {
      onSelect({ name: labelName.trim(), color: selectedColor });
    }
    onClose();
  }

  function handleRemove() {
    onSelect(null);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-xs font-medium text-gray-500">Label Color</p>
      <div className="flex gap-2">
        {LABEL_COLORS.map((c) => (
          <button
            key={c.color}
            onClick={() => handleColorClick(c.color)}
            className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
              selectedColor === c.color ? 'border-gray-800 scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: c.color }}
            title={c.name}
          />
        ))}
      </div>
      {selectedColor && (
        <div className="mt-2">
          <input
            type="text"
            placeholder="Label name..."
            value={labelName}
            onChange={(e) => setLabelName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoFocus
          />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={handleRemove}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Remove label
        </button>
        <button
          onClick={handleApply}
          disabled={!selectedColor || !labelName.trim()}
          className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
