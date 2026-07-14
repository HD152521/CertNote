'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n-client';
import { SidebarNav, type CertTree } from './SidebarNav';
import { cn } from '@/lib/cn';

interface MobileNavProps {
  certTrees: CertTree[];
  enCertTrees?: CertTree[];
}

// 모바일(<lg) 전용 햄버거 + 슬라이드 드로어. 데스크탑에선 숨김(lg:hidden).
// 드로어는 createPortal로 body에 렌더한다 — Header의 backdrop-blur(backdrop-filter)가
// position:fixed 자식의 기준을 헤더 박스로 가두기 때문에, 헤더 안에 두면 드로어가
// 56px 헤더 영역에 갇혀 가려진다. body로 빼내 뷰포트 기준으로 띄운다.
export function MobileNav({ certTrees, enCertTrees }: MobileNavProps) {
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 포털은 클라이언트 마운트 후에만(SSR 안전).
  useEffect(() => setMounted(true), []);

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

  const drawer = (
    <div className={cn('lg:hidden fixed inset-0 z-[60]', !open && 'pointer-events-none')} aria-hidden={!open}>
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
        aria-label={lang === 'en' ? 'Certificates menu' : '자격증 메뉴'}
        className={cn(
          'absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-bg p-4 shadow-xl',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">{lang === 'en' ? 'Certificates' : '자격증'}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={lang === 'en' ? 'Close menu' : '메뉴 닫기'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarNav certTrees={certTrees} enCertTrees={enCertTrees} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={lang === 'en' ? 'Open menu' : '메뉴 열기'}
        className="lg:hidden -ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* 드로어는 body로 포털 — 헤더의 backdrop-filter 컨테이닝 블록을 탈출시켜 뷰포트 전체에 띄운다. */}
      {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
