'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearch } from './SearchProvider';
import { cn } from '@/lib/cn';

export function SearchButton() {
  const { open } = useSearch();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <button type="button" onClick={open}
      className={cn('inline-flex h-9 items-center gap-2 rounded-md border border-border', 'bg-bg-subtle px-2.5 text-fg-muted transition hover:text-fg hover:border-border-strong')}
      aria-label="검색"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline text-xs">검색</span>
      <kbd className="hidden sm:inline font-mono text-[10px] border border-border rounded px-1 py-0.5">
        {isMac ? '⌘K' : 'Ctrl+K'}
      </kbd>
    </button>
  );
}
