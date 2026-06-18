'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserRound, X } from 'lucide-react';
import { emitAuthChange, onAuthChange } from '@/lib/auth/authEvents';

interface Me {
  id: string;
  email: string;
  role: string;
  plan: 'free' | 'pro';
}

const LINK_CLASS = 'px-2.5 py-1 text-xs rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition';
const MENU_ITEM = 'block w-full rounded-md px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg transition';

export function AuthNav() {
  // undefined = 로딩 중, null = 비로그인, Me = 로그인
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  // 마운트 + 경로 변경 시 재조회. 경로가 바뀌면 모바일 메뉴는 닫는다.
  useEffect(() => { refresh(); setMenuOpen(false); }, [refresh, pathname]);
  useEffect(() => onAuthChange(refresh), [refresh]);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
    } catch {
      // 로그아웃 요청 실패해도 클라이언트 상태는 비운다.
    }
    setUser(null);
    setMenuOpen(false);
    emitAuthChange();
    // 전체 새로고침으로 라우터 캐시를 통째로 비운다. router.push/refresh는 현재 경로만
    // 갱신하므로, 로그인 중 캐시된 유료 페이지(2주차 등)가 로그아웃 후에도 그대로 보였다.
    window.location.assign('/');
  }

  if (user === undefined) return null;

  if (!user) {
    return <Link href="/login" className={LINK_CLASS}>로그인</Link>;
  }

  const links = [
    { href: '/exam', label: '모의고사' },
    { href: '/dashboard', label: '대시보드' },
    { href: '/notebook', label: '오답노트' },
    ...(user.role === 'admin' ? [{ href: '/admin', label: '관리자' }] : []),
  ];

  const badge = user.plan === 'pro' ? (
    <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Pro</span>
  ) : (
    <Link href="/pricing" className="rounded-md border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent transition hover:bg-accent/10">업그레이드</Link>
  );

  return (
    <div className="flex items-center gap-1">
      {/* 데스크탑: 인라인 메뉴 */}
      <div className="hidden items-center gap-1 sm:flex">
        {links.map((l) => (<Link key={l.href} href={l.href} className={LINK_CLASS}>{l.label}</Link>))}
        {badge}
        <span className="max-w-[14ch] truncate px-1 text-xs text-fg-faint">{user.email}</span>
        <button type="button" onClick={handleLogout} className={LINK_CLASS}>로그아웃</button>
      </div>

      {/* 모바일: 배지 + 메뉴 버튼 + 드롭다운 (가로로 펼쳐져 줄바꿈되던 문제 해결) */}
      <div className="relative flex items-center gap-1 sm:hidden">
        {badge}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="계정 메뉴"
          aria-expanded={menuOpen}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
        >
          {menuOpen ? <X className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" aria-hidden onClick={() => setMenuOpen(false)} />
            <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-border bg-bg-elevated p-1.5 shadow-lg">
              <p className="truncate px-2 py-1 text-[11px] text-fg-faint">{user.email}</p>
              {links.map((l) => (
                <Link key={l.href} href={l.href} role="menuitem" onClick={() => setMenuOpen(false)} className={MENU_ITEM}>
                  {l.label}
                </Link>
              ))}
              <button type="button" onClick={handleLogout} role="menuitem" className={MENU_ITEM}>로그아웃</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
