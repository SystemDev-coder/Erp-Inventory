import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  hasError?: boolean;
  onChange: (value: TValue | '') => void;
  onSearch?: (query: string) => void;
  allowCustom?: boolean;
  onCustomCommit?: (text: string) => void;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

const normalize = (value: string) => value.toLowerCase().trim();

export function SearchableCombobox<TValue extends string | number>({
  value,
  options,
  placeholder = 'Select...',
  disabled,
  hasError,
  onChange,
  onSearch,
  allowCustom,
  onCustomCommit,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: Props<TValue>) {
  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSearchRef = useRef<Props<TValue>['onSearch']>(onSearch);
  const listboxId = useId();
  const [menuRect, setMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    placement: 'top' | 'bottom';
  } | null>(null);

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
      const maxMenuHeight = 288;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
      const available = openUpward ? spaceAbove : spaceBelow;
      const height = Math.max(120, Math.min(maxMenuHeight, available));
      setMenuRect({
        left: rect.left,
        top: openUpward ? rect.top - height - 6 : rect.bottom + 6,
        width: rect.width,
        maxHeight: height,
        placement: openUpward ? 'top' : 'bottom',
      });
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

  const visible = filtered.slice(0, 250);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
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

  const activeDescendant =
    open && visible[highlightedIndex] ? `${listboxId}-opt-${highlightedIndex}` : undefined;

  return (
    <div className={`relative ${className || ''}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-invalid={hasError || undefined}
          aria-label={ariaLabel || placeholder}
          aria-labelledby={ariaLabelledBy}
          value={query}
          disabled={disabled}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex((prev) => (prev + 1) % Math.max(visible.length, 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex((prev) =>
                prev <= 0 ? Math.max(visible.length - 1, 0) : prev - 1
              );
            } else if (event.key === 'Enter' && open && visible[highlightedIndex]) {
              event.preventDefault();
              select(visible[highlightedIndex]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className={`h-12 w-full rounded-lg border bg-white px-3 pr-16 text-sm text-slate-900 shadow-sm outline-none transition-all focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100 ${
            hasError
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
              : 'border-slate-300 focus:border-primary-500 focus:ring-primary-500/20 dark:border-slate-700'
          }`}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value !== '' && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
        </div>
      </div>

      {open &&
        !disabled &&
        menuRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'fixed',
              left: menuRect.left,
              top: menuRect.top,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
              zIndex: 2147483500,
            }}
            className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            {visible.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No results</div>
            ) : (
              <ul id={listboxId} role="listbox" className="py-1">
                {visible.map((opt, index) => {
                  const isActive = String(opt.value) === String(value);
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <li
                      key={String(opt.value)}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={isActive}
                      aria-disabled={opt.disabled || undefined}
                      onClick={() => select(opt)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full cursor-pointer px-3 py-2.5 min-h-11 text-left text-sm transition-colors ${
                        isHighlighted || isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                      } ${opt.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {opt.label}
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
