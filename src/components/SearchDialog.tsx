'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';
import type { SearchEntry, SearchBodyEntry } from '@/lib/content';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { chromeStrings, formatSearchCount } from '@/lib/strings/chrome';

interface SearchDialogProps { index?: SearchEntry[]; onClose: () => void; }

export function SearchDialog({ index = [], onClose }: SearchDialogProps) {
  const lang = useLanguage();
  const s = pick(chromeStrings, lang);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 본문 포함 인덱스를 첫 오픈 시 1회 받아온다(정적 캐시). 로딩 전엔 제목 인덱스로 동작.
  const [bodyIndex, setBodyIndex] = useState<SearchBodyEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/search')
      .then((r) => r.json())
      .then((d) => { if (active && Array.isArray(d.index)) setBodyIndex(d.index as SearchBodyEntry[]); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const data: SearchEntry[] = bodyIndex ?? index;
  const fuse = useMemo(
    () => new Fuse(data, {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'body', weight: 0.3 },
        { name: 'certCode', weight: 0.15 },
        { name: 'certName', weight: 0.05 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
    }),
    [data],
  );
  const results = useMemo(() => {
    if (!q.trim()) return data.slice(0, 12);
    return fuse.search(q).slice(0, 25).map((r) => r.item);
  }, [q, fuse, data]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [q]);
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((p) => Math.min(p + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) { router.push(r.href); onClose(); }
    }
  }
  return (
    <div role="dialog" aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[10vh] px-4"
      onClick={onClose}
    >
      <div className={cn('w-full max-w-xl overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-2xl')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <Search className="h-4 w-4 text-fg-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={s.searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-faint"
          />
          <kbd className="font-mono text-[10px] text-fg-faint border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">
              {bodyIndex === null ? s.searchLoading : s.searchNoResults}
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.href}>
              <button type="button" onMouseEnter={() => setActive(i)}
                onClick={() => { router.push(r.href); onClose(); }}
                className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition', active === i ? 'bg-accent/10' : 'hover:bg-bg-subtle')}
              >
                <span className="font-mono text-[11px] text-fg-faint w-16 shrink-0">{r.certCode}</span>
                <span className="font-mono text-[11px] text-fg-faint w-16 shrink-0">W{r.week}·D{r.day}</span>
                <span className="flex-1 truncate text-sm">{r.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-3.5 py-2 text-[11px] text-fg-faint flex items-center justify-between">
          <span>{formatSearchCount(lang, data.length)}</span>
          <span className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> {s.searchNavigate}</span>
            <span><kbd className="font-mono">↵</kbd> {s.searchOpen}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
