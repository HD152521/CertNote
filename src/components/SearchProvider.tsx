'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// 검색 다이얼로그는 Fuse.js를 포함해 무겁다. 검색을 처음 열 때만 청크를 로드(초기 번들에서 제외).
const SearchDialog = dynamic(() => import('./SearchDialog').then((m) => m.SearchDialog), { ssr: false });

interface SearchContextValue { open: () => void; close: (opts?: CloseOptions) => void; }

// 닫을 때 포커스를 연 요소로 돌려줄지. 결과를 눌러 페이지를 이동할 때는 돌려주지 않는다.
export interface CloseOptions { restoreFocus?: boolean }

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider');
  return ctx;
}

interface SearchProviderProps { children: ReactNode; }

// 검색 인덱스는 더 이상 모든 페이지에 인라인하지 않는다. 검색창을 처음 열 때
// SearchDialog가 /api/search(제목 매니페스트, force-static)를 받고 본문 샤드(/api/search/[cert])는 입력 시 받는다 → 페이지 응답 경량화.
export function SearchProvider({ children }: SearchProviderProps) {
  const [isOpen, setOpen] = useState(false);
  const isOpenRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const open = useCallback(() => {
    if (isOpenRef.current) return;
    // 다이얼로그가 입력창에 포커스를 가져가기 전에, 열기 직전의 포커스 요소를 기억한다.
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    isOpenRef.current = true;
    setOpen(true);
  }, []);
  const close = useCallback((opts: CloseOptions = {}) => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    setOpen(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opts.restoreFocus !== false && opener) {
      requestAnimationFrame(() => { if (opener.isConnected) opener.focus(); });
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isOpenRef.current) close(); else open();
      } else if (e.key === 'Escape') {
        close();
      } else if (e.key === '/' && !isCmd) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(t?.isContentEditable)) {
          e.preventDefault();
          open();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  return (
    <SearchContext.Provider value={{ open, close }}>
      {children}
      {isOpen && <SearchDialog onClose={close} />}
    </SearchContext.Provider>
  );
}
