import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export function Dropdown({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Pilih opsi...',
  error,
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Cari...',
  compact = false,
  className = '',
  id,
  'aria-label': ariaLabel,
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const listboxId = `${fieldId}-listbox`;
  const errId = `${fieldId}-err`;

  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 200, openUp: false });

  const selectedOption = useMemo(
    () => options.find((opt) => String(opt.value) === String(value ?? '')) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (opt) =>
        String(opt.label).toLowerCase().includes(q) ||
        (opt.hint && String(opt.hint).toLowerCase().includes(q))
    );
  }, [options, searchable, query]);

  function computeCoords() {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(280, Math.max(88, options.length * 40 + (searchable ? 52 : 16)));
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    const width = Math.max(rect.width, compact ? 188 : rect.width);
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    return {
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.min(rect.left, maxLeft),
      width,
      openUp,
    };
  }

  function updatePosition() {
    const next = computeCoords();
    if (next) setCoords(next);
  }

  function openMenu() {
    const next = computeCoords();
    if (next) setCoords(next);
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, options.length]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const currentIdx = filteredOptions.findIndex((o) => String(o.value) === String(value ?? ''));
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);

    const timer = setTimeout(() => {
      if (searchable) searchInputRef.current?.focus();
    }, 10);

    function handleOutside(e) {
      if (
        triggerRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleReposition() {
      updatePosition();
    }

    function handleEsc(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('keydown', handleEsc, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('keydown', handleEsc, true);
    };
  }, [open]);

  function selectOption(opt) {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handleTriggerKeyDown(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      if (!open) {
        e.preventDefault();
        openMenu();
        return;
      }
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && filteredOptions[activeIndex]) {
      e.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    }
  }

  const triggerHeight = compact ? 'min-h-[34px] h-8 px-2.5 text-xs' : 'min-h-[42px] px-3.5 text-sm';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={fieldId} className="text-xs font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel || (!label ? placeholder : undefined)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border bg-[var(--color-surface)] text-left transition-colors duration-[var(--duration-fast)] disabled:opacity-50 ${triggerHeight} ${
          open
            ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)]'
            : error
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
        }`}
      >
        <span
          className={`truncate font-medium ${
            selectedOption ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--color-text-secondary)] transition-transform duration-[var(--duration-fast)] ${
            open ? 'rotate-180 text-[var(--color-accent-text)]' : ''
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>

      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              transform: coords.openUp ? 'translateY(-100%)' : 'none',
              zIndex: 90,
              boxShadow: 'var(--shadow-overlay)',
            }}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] p-1.5 text-[var(--color-text-primary)]"
          >
            {searchable && (
              <div className="mb-1.5 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(0, i - 1));
                    } else if (e.key === 'Enter' && filteredOptions[activeIndex]) {
                      e.preventDefault();
                      selectOption(filteredOptions[activeIndex]);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-base sm:text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
              </div>
            )}

            <ul
              id={listboxId}
              role="listbox"
              aria-label={label || ariaLabel || 'Daftar pilihan'}
              className="max-h-[min(240px,42dvh)] overflow-y-auto space-y-0.5"
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2.5 text-center text-xs text-[var(--color-text-muted)]">
                  Tidak ada opsi yang cocok.
                </li>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = String(opt.value) === String(value ?? '');
                  const isActive = idx === activeIndex;
                  return (
                    <li
                      key={`${opt.value}-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={Boolean(opt.disabled)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectOption(opt);
                      }}
                      className={`flex min-h-[44px] sm:min-h-[38px] cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs transition-colors ${
                        opt.disabled
                          ? 'opacity-45 cursor-not-allowed'
                          : isSelected
                          ? 'bg-[var(--color-surface-warm)] text-[var(--color-accent-text)] font-semibold'
                          : isActive
                          ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{opt.label}</p>
                        {opt.hint && (
                          <p className="truncate text-[11px] font-normal text-[var(--color-text-muted)]">
                            {opt.hint}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
