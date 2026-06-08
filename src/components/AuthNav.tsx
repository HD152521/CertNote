'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (active) setUser(d.user ?? null); })
      .catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 로그아웃 요청 실패해도 클라이언트 상태는 비운다.
    }
    setUser(null);
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
      <button type="button" onClick={handleLogout} className={LINK_CLASS}>로그아웃</button>
    </div>
  );
}
