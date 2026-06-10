'use client';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { SidebarNav, type CertTree } from './SidebarNav';
import { cn } from '@/lib/cn';

interface MobileNavProps {
  certTrees: CertTree[];
}

// 모바일(<lg) 전용 햄버거 + 슬라이드 드로어. 데스크탑에선 숨김(lg:hidden).
export function MobileNav({ certTrees }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  // 열렸을 때만 Esc 닫기 + 배경 스크롤 잠금.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="lg:hidden -ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* 항상 마운트해 transform/opacity로만 전환(컴포지터 친화). 닫힘 땐 pointer-events 차단. */}
      <div
        className={cn('lg:hidden fixed inset-0 z-50', !open && 'pointer-events-none')}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="자격증 메뉴"
          className={cn(
            'absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-bg p-4 shadow-xl',
            'transition-transform duration-300 ease-out',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">자격증</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="메뉴 닫기"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SidebarNav certTrees={certTrees} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}
