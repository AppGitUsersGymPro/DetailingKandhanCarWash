import { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Field, Input } from './Field';

/**
 * Searchable autocomplete backed by a lookup table.
 * Props:
 *   label, required, error
 *   value          – current text value
 *   onChange(text) – called on every keystroke
 *   onSelect(text) – called when a suggestion is clicked (auto-adds via onCreate if new)
 *   fetchOptions(q) – async fn returning [{id, name, ...}]
 *   onCreate(name)  – async fn to create a new entry; if omitted, typing is free-form only
 *   placeholder
 *   disabled
 */
export default function VehicleAutocomplete({
  label, required, error, value, onChange, onSelect,
  fetchOptions, onCreate, placeholder, disabled,
}) {
  value = value ?? '';
  const [open, setOpen]           = useState(false);
  const [options, setOptions]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [creating, setCreating]   = useState(false);
  const containerRef              = useRef(null);
  const debounceRef               = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch when value changes (debounced 250ms)
  const fetch = (q) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchOptions(q);
        setOptions(Array.isArray(data) ? data : []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const handleInput = (e) => {
    const v = e.target.value;
    onChange(v);
    setOpen(true);
    fetch(v);
  };

  const handleFocus = () => {
    setOpen(true);
    if (options.length === 0) fetch(value);
  };

  const handleSelect = (name) => {
    onSelect(name);
    setOpen(false);
  };

  const handleAddNew = async () => {
    if (!onCreate || !value.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(value.trim());
      onSelect(value.trim());
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const showAddNew = onCreate && value.trim() &&
    !options.some(o => o.name.toLowerCase() === value.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <Field label={label} required={required} error={error}>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <Input
            value={value}
            onChange={handleInput}
            onFocus={handleFocus}
            placeholder={placeholder || `Search ${label}…`}
            disabled={disabled}
            className="pl-8"
          />
        </div>
      </Field>

      {open && !disabled && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
            ) : options.length === 0 && !value.trim() ? (
              <div className="px-3 py-2 text-xs text-gray-500">Start typing to search</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No results</div>
            ) : (
              options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(o.name); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-bg-hover transition-colors"
                >
                  {o.name}
                </button>
              ))
            )}
          </div>
          {showAddNew && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent/10 border-t border-border transition-colors flex items-center gap-1.5"
            >
              <Plus size={13} />
              {creating ? 'Adding…' : `Add "${value.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
