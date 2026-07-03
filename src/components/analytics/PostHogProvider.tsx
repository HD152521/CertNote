'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import * as Sentry from '@sentry/nextjs';
import { onAuthChange } from '@/lib/auth/authEvents';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
// 프로덕션 + 키가 있을 때만 활성화(개발 중 데이터 오염 방지, 미설정 시 완전 no-op).
const ENABLED = typeof window !== 'undefined' && !!KEY && process.env.NODE_ENV === 'production';

if (ENABLED && !posthog.__loaded) {
  posthog.init(KEY as string, {
    api_host: HOST,
    person_profiles: 'identified_only', // 로그인(식별)된 사용자만 person으로 집계 → 비용 절감
    capture_pageview: false, // App Router는 SPA 전환이라 수동 캡처
    capture_pageleave: true, // 이탈(체류시간) 측정
  });
}

// 라우트 전환마다 $pageview 캡처 (App Router는 자동 안 됨).
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!ENABLED) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}

// 로그인 사용자 식별 → 이벤트가 사용자 단위로 묶인다(퍼널·리텐션 분석용).
// 마운트뿐 아니라 로그인/로그아웃(auth-change)마다 재동기화해야 같은 브라우저에서
// 계정을 바꿔도 각각 다른 유저로 잡힌다. 계정 전환 시 reset() 후 identify().
function IdentifyUser() {
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    if (!ENABLED) return;
    let active = true;
    async function sync() {
      try {
        const d = await fetch('/api/auth/me').then((r) => r.json());
        if (!active) return;
        const id = d?.user?.id ? String(d.user.id) : null;
        if (id) {
          // 다른 사용자로 전환될 때만 reset(첫 로그인은 익명→가입 연결 보존).
          if (lastId.current && lastId.current !== id) posthog.reset();
          if (posthog.get_distinct_id() !== id) {
            posthog.identify(id, { plan: d.user.plan, role: d.user.role });
          }
          // Sentry 에러도 같은 유저로 묶는다(DSN 미설정이면 no-op).
          Sentry.setUser({ id });
          lastId.current = id;
        } else {
          if (lastId.current) posthog.reset(); // 로그아웃 → 익명으로 초기화
          Sentry.setUser(null);
          lastId.current = null;
        }
      } catch {
        /* /me 실패는 무시 */
      }
    }
    sync();
    const unsub = onAuthChange(sync); // 로그인/로그아웃마다 재동기화
    return () => {
      active = false;
      unsub();
    };
  }, []);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!ENABLED) return <>{children}</>;
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <IdentifyUser />
      {children}
    </PHProvider>
  );
}
