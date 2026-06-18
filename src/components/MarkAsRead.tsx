'use client';

import { useEffect } from 'react';
import { markVisited } from '@/lib/progress';

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
      // 스트릭용 서버 활동 기록(로그인 시에만 기록됨, 실패 무시).
      void fetch('/api/study/visit', { method: 'POST', cache: 'no-store' }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [slug, week, day, title, href]);
  return null;
}
