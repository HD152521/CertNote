'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

// 커스텀 드롭다운. native <select> 팝업이 Windows Chrome에서 OS 테마로 렌더돼
// 다크모드에서 안 보이던 문제 해결 — 일반 DOM이라 앱 토큰이 그대로 적용된다.
// 키보드(↑↓/Enter/Esc)·바깥 클릭 닫기·ARIA(listbox/option) 지원.
export function Select({ value, onChange, options, placeholder = '선택', disabled, className, id, ariaLabel }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActive(options.findIndex((o) => o.value === value));
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[active];
      if (o && !o.disabled) choose(o.value);
    }
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none transition focus:border-border-strong disabled:opacity-50"
      >
        <span className={cn('truncate', !selected && 'text-fg-faint')}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-fg-faint transition', open && 'rotate-180')} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-bg-elevated py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => !o.disabled && choose(o.value)}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-1.5 text-sm',
                o.disabled ? 'cursor-default text-fg-faint' : 'cursor-pointer text-fg',
                i === active && !o.disabled && 'bg-bg-subtle',
                o.value === value && 'text-accent',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
