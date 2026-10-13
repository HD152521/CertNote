'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { currentCertSlug, orderShardKeys, type ManifestCert, type SearchBodyEntry, type SearchShard } from '@/lib/search/model';
import { createSearcher } from '@/lib/search/searcher';
import { loadedShards, loadManifest, loadShards } from '@/lib/search/loader';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { chromeStrings, formatSearchCount } from '@/lib/strings/chrome';
import type { CloseOptions } from './SearchProvider';

interface SearchDialogProps { onClose: (opts?: CloseOptions) => void; }

// 본문 검색을 시작할 최소 입력 길이.
const BODY_SEARCH_MIN_CHARS = 2;
const NO_ENTRIES: SearchBodyEntry[] = [];
const NO_SHARDS: SearchShard[] = [];

export function SearchDialog({ onClose }: SearchDialogProps) {
  const lang = useLanguage();
  const s = pick(chromeStrings, lang);
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 첫 오픈: 제목 매니페스트만 받는다(작음). 이 시점부터 제목 검색이 된다.
  const [entries, setEntries] = useState<SearchBodyEntry[] | null>(null);
  const [certs, setCerts] = useState<ManifestCert[]>([]);
  const [shards, setShards] = useState<SearchShard[]>(NO_SHARDS);
  useEffect(() => {
    let alive = true;
    loadManifest().then((m) => {
      if (!alive || !m) return;
      setEntries(m.entries);
      setCerts(m.certs);
      setShards(loadedShards()); // 이전에 열었을 때 받아 둔 샤드
    });
    return () => { alive = false; };
  }, []);

  const currentSlug = useMemo(() => currentCertSlug(pathname ?? '', certs.map((c) => c.slug)), [pathname, certs]);

  // 검색어를 처음 입력하면 본문 샤드를 받는다 — 지금 보고 있는 자격증의 샤드가 맨 앞이고, 도착하는 대로 합친다.
  // 한 샤드가 실패해도 나머지와 제목 검색은 그대로 동작한다. 같은 마운트에서는 한 번만 시작한다
  // (모듈 캐시가 재오픈 중복을 막는다). 입력 전에는 아무것도 받지 않는다.
  const shardsStarted = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  useEffect(() => {
    if (shardsStarted.current || certs.length === 0 || q.trim().length < BODY_SEARCH_MIN_CHARS) return;
    shardsStarted.current = true;
    void loadShards(
      orderShardKeys(certs, currentSlug),
      (shard) => setShards((prev) => (prev.some((p) => p.slug === shard.slug) ? prev : [...prev, shard])),
      fetch,
      () => !aliveRef.current,
    );
  }, [q, certs, currentSlug]);

  const data = entries ?? NO_ENTRIES;
  // 입력은 즉시 반영하고 검색·결과 렌더는 한 박자 늦춘다(느린 기기에서 키 입력이 끊기지 않게). 검색 자체도 입력당
  // 수십 ms 로 줄였다(순위 규칙·성능 근거는 searcher.ts). 늦춰진 결과가 아직 현재 입력을 따라잡지 못한 순간에
  // Enter 를 누르면 낡은 결과를 열지 않도록 현재 입력으로 바로 다시 검색한다.
  const search = useMemo(() => createSearcher(data, shards, { preferSlug: currentSlug }), [data, shards, currentSlug]);
  const deferredQ = useDeferredValue(q);
  const results = useMemo(() => search(deferredQ), [search, deferredQ]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [q]);
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((p) => Math.min(p + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = (deferredQ === q ? results : search(q))[deferredQ === q ? active : 0];
      if (r) { router.push(r.href); onClose({ restoreFocus: false }); }
    }
  }
  return (
    <div role="dialog" aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[10vh] px-4"
      onClick={() => onClose()}
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
              {entries === null ? s.searchLoading : s.searchNoResults}
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.href}>
              <Link href={r.href} prefetch={false} onMouseEnter={() => setActive(i)} onClick={() => onClose({ restoreFocus: false })}
                className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition', active === i ? 'bg-accent/10' : 'hover:bg-bg-subtle')}
              >
                <span className="font-mono text-[11px] text-fg-faint w-16 shrink-0">{r.certCode}</span>
                <span className="font-mono text-[11px] text-fg-faint w-16 shrink-0">W{r.week}·D{r.day}</span>
                <span className="flex-1 truncate text-sm">{r.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
              </Link>
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
