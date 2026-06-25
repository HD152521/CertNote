'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// 검색 다이얼로그는 Fuse.js를 포함해 무겁다. 검색을 처음 열 때만 청크를 로드(초기 번들에서 제외).
const SearchDialog = dynamic(() => import('./SearchDialog').then((m) => m.SearchDialog), { ssr: false });

interface SearchContextValue { open: () => void; close: () => void; }

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider');
  return ctx;
}

interface SearchProviderProps { children: ReactNode; }

// 검색 인덱스는 더 이상 모든 페이지에 인라인하지 않는다. 검색창을 처음 열 때
// SearchDialog가 /api/search(force-static, CDN 캐시)에서 1회 받아온다 → 페이지 응답 경량화.
export function SearchProvider({ children }: SearchProviderProps) {
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
    <SearchContext.Provider value={{ open, close }}>
      {children}
      {isOpen && <SearchDialog onClose={close} />}
    </SearchContext.Provider>
  );
}
