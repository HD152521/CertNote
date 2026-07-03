'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

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
function IdentifyUser() {
  useEffect(() => {
    if (!ENABLED) return;
    let active = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d?.user?.id) {
          posthog.identify(String(d.user.id), { plan: d.user.plan, role: d.user.role });
        } else {
          posthog.reset(); // 로그아웃 상태면 이전 식별 해제
        }
      })
      .catch(() => {});
    return () => {
      active = false;
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
