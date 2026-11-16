'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserRound, X } from 'lucide-react';
import { emitAuthChange, onAuthChange } from '@/lib/auth/authEvents';
import { useLanguage, t } from '@/lib/i18n-client';
import { SignupCta } from '@/components/marketing/SignupCta';
import { loadAuthUser } from '@/lib/auth/useAuthState';
import { authHref } from '@/lib/auth/authLang';
import { pick } from '@/lib/strings/dict';
import { shellStrings } from '@/lib/strings/shell';

interface Me {
  id: string;
  email: string;
  role: string;
  plan: 'free' | 'pro';
}

const LINK_CLASS = 'whitespace-nowrap px-2.5 py-1 text-xs rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition';
const MENU_ITEM = 'block w-full rounded-md px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg transition';

// 현재 로그인 사용자. 비로그인이거나 조회에 실패하면 null. 결과는 가입 권유 카드와 공유한다(useAuthState).
const fetchMe: (force: boolean) => Promise<Me | null> = loadAuthUser;

export function AuthNav() {
  // undefined = 로딩 중, null = 비로그인, Me = 로그인
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const lang = useLanguage();
  const s = pick(shellStrings, lang);

  // 첫 마운트는 이미 받아 둔 값을 쓸 수 있지만(가입 권유 카드가 먼저 물었을 때), 이동·로그인·로그아웃 뒤에는 새로 묻는다.
  const refresh = useCallback((force: boolean) => fetchMe(force).then(setUser), []);
  const mounted = useRef(false);

  // 경로가 바뀌면 모바일 메뉴는 닫는다. effect 에서 닫으면 한 번 더 그리므로 렌더 중에 바로 맞춘다
  // (React 문서의 "prop 이 바뀔 때 state 조정" 방식).
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setMenuOpen(false);
  }

  // 마운트 + 경로 변경 시 재조회.
  useEffect(() => {
    void refresh(mounted.current);
    mounted.current = true;
  }, [refresh, pathname]);
  useEffect(() => onAuthChange(() => void refresh(true)), [refresh]);

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
    return (
      <div className="flex items-center gap-1">
        <Link href={authHref('login', lang, pathname)} className={LINK_CLASS}>{t(lang, 'login')}</Link>
        {/* 영어 헤더는 640px 부근에서 이미 빠듯해 md(768px) 이상에서만 보인다. */}
        <SignupCta
          placement="header"
          className="hidden whitespace-nowrap rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg transition hover:opacity-90 md:inline-block"
        >
          {t(lang, 'signup')}
        </SignupCta>
      </div>
    );
  }

  const links = [
    { href: '/dashboard', label: t(lang, 'dashboard') },
    { href: '/exam', label: t(lang, 'mockExam') },
    { href: '/account', label: t(lang, 'myPage') },
    ...(user.role === 'admin' ? [{ href: '/admin', label: s.admin }] : []),
  ];

  return (
    <div className="flex items-center gap-1">
      {/* 데스크탑: 인라인 메뉴 */}
      <div className="hidden items-center gap-1 sm:flex">
        {links.map((l) => (<Link key={l.href} href={l.href} className={LINK_CLASS}>{l.label}</Link>))}
        <span className="max-w-[14ch] truncate px-1 text-xs text-fg-faint">{user.email}</span>
        <button type="button" onClick={handleLogout} className={LINK_CLASS}>{t(lang, 'logout')}</button>
      </div>

      {/* 모바일: 메뉴 버튼 + 드롭다운 (가로로 펼쳐져 줄바꿈되던 문제 해결) */}
      <div className="relative flex items-center gap-1 sm:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={s.accountMenu}
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
              <button type="button" onClick={handleLogout} role="menuitem" className={MENU_ITEM}>{t(lang, 'logout')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
