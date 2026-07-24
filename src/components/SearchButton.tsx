'use client';


import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearch } from './SearchProvider';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { chromeStrings } from '@/lib/strings/chrome';

export function SearchButton() {
  const s = pick(chromeStrings, useLanguage());
  const { open } = useSearch();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <button type="button" onClick={open}
      className={cn('inline-flex h-9 items-center gap-2 rounded-md border border-border', 'bg-bg-subtle px-2.5 text-fg-muted transition hover:text-fg hover:border-border-strong')}
      aria-label={s.searchLabel}
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline text-xs">{s.searchLabel}</span>
      <kbd className="hidden sm:inline font-mono text-[10px] border border-border rounded px-1 py-0.5">
        {isMac ? '⌘K' : 'Ctrl+K'}
      </kbd>
    </button>
  );
}
