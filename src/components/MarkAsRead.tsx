'use client';

import { useEffect } from 'react';
import { markVisited } from '@/lib/progress';

const VISIT_PING_KEY = 'cert-notes:visit-ping';

// 스트릭용 서버 활동 기록. 하루 1회만 호출(중복 쓰기 제거) — 서버도 멱등이지만 불필요한 요청을 막는다.
// 로그인 안 했으면 서버가 조용히 무시. 실패는 무시.
function pingVisitOncePerDay() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    if (window.localStorage.getItem(VISIT_PING_KEY) === today) return;
    window.localStorage.setItem(VISIT_PING_KEY, today);
  } catch {
    // localStorage 불가 시에도 비콘은 보낸다.
  }
  void fetch('/api/study/visit', { method: 'POST', cache: 'no-store' }).catch(() => {});
}

interface MarkAsReadProps {
  slug: string;
  week: number;
  day: number;
  title: string;
  href: string;
}

export function MarkAsRead({ slug, week, day, title, href }: MarkAsReadProps) {
  useEffect(() => {
    const t = setTimeout(() => {
      markVisited(slug, { week, day, title, href, at: Date.now() });
      pingVisitOncePerDay();
    }, 800);
    return () => clearTimeout(t);
  }, [slug, week, day, title, href]);
  return null;
}
