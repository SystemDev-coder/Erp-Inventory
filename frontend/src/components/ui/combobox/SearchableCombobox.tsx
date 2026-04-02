import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export type ComboboxOption<TValue extends string | number> = {
  value: TValue;
  label: string;
  disabled?: boolean;
};

type Props<TValue extends string | number> = {
  value: TValue | '';
  options: ComboboxOption<TValue>[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: TValue | '') => void;
  onSearch?: (query: string) => void;
  allowCustom?: boolean;
  onCustomCommit?: (text: string) => void;
  className?: string;
};

const normalize = (value: string) => value.toLowerCase().trim();

export function SearchableCombobox<TValue extends string | number>({
  value,
  options,
  placeholder = 'Select...',
  disabled,
  onChange,
  onSearch,
  allowCustom,
  onCustomCommit,
  className,
}: Props<TValue>) {
  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const blurTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSearchRef = useRef<Props<TValue>['onSearch']>(onSearch);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(
    null
  );

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    setQuery(selected?.label || '');
  }, [selected?.label]);

  useEffect(() => {
    const fn = onSearchRef.current;
    if (!fn) return;
    const handle = window.setTimeout(() => fn(query), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuRect({ left: rect.left, top: rect.bottom + 6, width: rect.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(false);
  };

  const select = (next: ComboboxOption<TValue>) => {
    if (next.disabled) return;
    onChange(next.value);
    setQuery(next.label);
    setOpen(false);
  };

  const onBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      if (!allowCustom) return;
      const text = query.trim();
      if (!text) return;
      const selectedLabel = (selected?.label || '').trim();
      if (selectedLabel && text === selectedLabel) return;
      onCustomCommit?.(text);
    }, 150);
  };

  const onFocus = () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setOpen(true);
  };

  return (
    <div className={`relative ${className || ''}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 pr-16 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value !== '' && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
              title="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </div>
      </div>

      {open &&
        !disabled &&
        menuRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            // Must be above `Modal` which uses a very high z-index in this project.
            style={{
              position: 'fixed',
              left: menuRect.left,
              top: menuRect.top,
              width: menuRect.width,
              zIndex: 2147483500,
            }}
            className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No results</div>
            ) : (
              <ul className="py-1">
                {filtered.slice(0, 250).map((opt) => {
                  const isActive = String(opt.value) === String(value);
                  return (
                    <li key={String(opt.value)}>
                      <button
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => select(opt)}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {opt.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
