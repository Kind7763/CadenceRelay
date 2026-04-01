import { useState, useRef, useEffect } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export interface ItemCardMenuProps {
  sections: MenuSection[];
}

export default function ItemCardMenu({ sections }: ItemCardMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {sIdx > 0 && <hr className="my-1 border-gray-100" />}
              {section.title && (
                <div className="px-3 py-1 text-[10px] font-medium uppercase text-gray-400">
                  {section.title}
                </div>
              )}
              {section.items.map((item, iIdx) => (
                <button
                  key={iIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick();
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    item.variant === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
