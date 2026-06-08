'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { emitAuthChange, onAuthChange } from '@/lib/auth/authEvents';

interface Me {
  id: string;
  email: string;
  role: string;
}

const LINK_CLASS = 'px-2.5 py-1 text-xs rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition';

export function AuthNav() {
  // undefined = 로딩 중, null = 비로그인, Me = 로그인
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const router = useRouter();
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

  // 마운트 + 경로 변경 시 재조회 (헤더는 재마운트되지 않으므로 필요).
  useEffect(() => { refresh(); }, [refresh, pathname]);
  // 로그인/로그아웃 이벤트 시 재조회.
  useEffect(() => onAuthChange(refresh), [refresh]);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 로그아웃 요청 실패해도 클라이언트 상태는 비운다.
    }
    setUser(null);
    emitAuthChange();
    router.push('/');
    router.refresh();
  }

  if (user === undefined) return null;

  if (!user) {
    return <Link href="/login" className={LINK_CLASS}>로그인</Link>;
  }

  return (
    <div className="flex items-center gap-1">
      {user.role === 'admin' && <Link href="/admin" className={LINK_CLASS}>관리자</Link>}
      <span className="hidden sm:inline px-1 text-xs text-fg-faint">{user.email}</span>
      <button type="button" onClick={handleLogout} className={LINK_CLASS}>로그아웃</button>
    </div>
  );
}
