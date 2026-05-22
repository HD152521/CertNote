'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SearchEntry } from '@/lib/content';
import { SearchDialog } from './SearchDialog';

interface SearchContextValue { open: () => void; close: () => void; index: SearchEntry[]; }

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider');
  return ctx;
}

interface SearchProviderProps { index: SearchEntry[]; children: ReactNode; }

export function SearchProvider({ index, children }: SearchProviderProps) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((p) => !p);
      } else if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === '/' && !isCmd) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t?.isContentEditable)) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <SearchContext.Provider value={{ open, close, index }}>
      {children}
      {isOpen && <SearchDialog onClose={close} index={index} />}
    </SearchContext.Provider>
  );
}
