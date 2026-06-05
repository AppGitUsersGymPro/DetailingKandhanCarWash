import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

/**
 * SearchableSelect — drop-in replacement for <Select> with live search + scroll.
 *
 * Props:
 *   value       – currently selected value (string)
 *   onChange    – (value: string) => void
 *   options     – [{ value: string, label: string }]
 *   placeholder – text shown when nothing is selected
 *   disabled    – bool
 *   className   – extra wrapper classes
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled,
  className = '',
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos]       = useState({ top: 0, left: 0, width: 0 });
  const wrapRef             = useRef(null);
  const dropdownRef         = useRef(null);
  const searchRef           = useRef(null);

  const selectedLabel = options.find(o => String(o.value) === String(value))?.label ?? '';

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const reposition = () => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
  };

  // Focus search box when opened, clear search when closed
  useEffect(() => {
    if (open) {
      reposition();
      setTimeout(() => searchRef.current?.focus(), 10);
    } else {
      setSearch('');
    }
  }, [open]); // eslint-disable-line

  // Close on outside click (must check both trigger and portal dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inWrap     = wrapRef.current?.contains(e.target);
      const inDropdown = dropdownRef.current?.contains(e.target);
      if (!inWrap && !inDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on any scroll (handles scrolling inside modals)
  useEffect(() => {
    if (!open) return;
    const handler = () => reposition();
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open]); // eslint-disable-line

  const select = (val) => {
    onChange(val);
    setOpen(false);
  };

  const dropdown = open && createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="flex flex-col rounded-lg border border-border bg-bg-card shadow-2xl overflow-hidden"
    >
      {/* Search input */}
      <div className="p-1.5 border-b border-border">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && filtered.length === 1) select(filtered[0].value);
            }}
            placeholder="Search…"
            className="w-full bg-bg-elev border border-border rounded-md pl-7 pr-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      {/* Options list */}
      <ul className="overflow-y-auto max-h-52">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-gray-500 text-center">No results</li>
        )}
        {filtered.map((o) => (
          <li key={String(o.value)}>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(o.value); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-bg-elev ${
                String(value) === String(o.value) ? 'text-accent bg-accent/10' : 'text-gray-200'
              }`}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );

  return (
    <div ref={wrapRef} className={className}>
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        disabled={disabled}
        className={[
          'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-bg text-sm text-left',
          'transition-colors focus:outline-none focus:ring-1 focus:ring-accent',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent/50',
          open ? 'border-accent/50 ring-1 ring-accent' : '',
        ].join(' ')}
      >
        <span className={`truncate leading-tight ${value !== '' && value != null ? 'text-gray-100' : 'text-gray-500'}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-500 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {dropdown}
    </div>
  );
}
