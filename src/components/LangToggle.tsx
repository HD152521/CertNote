'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { cn } from '@/lib/cn';

// 헤더 KO/EN 토글. 현재 경로의 반대 언어 대응 페이지로 보낸다.
// 영어판은 무료 Week1만 있으므로: 유료 주차(week2+)에서 EN을 누르면 해당 자격증 영어 허브로,
// 대응 페이지가 없는 경로(대시보드 등)는 언어별 홈으로 보낸다.
function counterpart(pathname: string, to: 'ko' | 'en'): string {
  const koMatch = pathname.match(new RegExp(`^/${DEFAULT_CATEGORY}/([^/]+)(?:/week(\\d+)/day(\\d+))?$`));
  const enMatch = pathname.match(new RegExp(`^/${EN_CATEGORY}(?:/([^/]+)(?:/week(\\d+)/day(\\d+))?)?$`));
  if (to === 'en') {
    if (koMatch) {
      const [, slug, week, day] = koMatch;
      if (week && Number(week) === 1) return `/${EN_CATEGORY}/${slug}/week${week}/day${day}`;
      return `/${EN_CATEGORY}/${slug}`;
    }
    return `/${EN_CATEGORY}`;
  }
  if (enMatch) {
    const [, slug, week, day] = enMatch;
    if (slug && week) return `/${DEFAULT_CATEGORY}/${slug}/week${week}/day${day}`;
    if (slug) return `/${DEFAULT_CATEGORY}/${slug}`;
  }
  return '/';
}

export function LangToggle() {
  const pathname = usePathname();
  const isEn = pathname === `/${EN_CATEGORY}` || pathname.startsWith(`/${EN_CATEGORY}/`);
  return (
    <div className="flex items-center rounded-md border border-border text-[11px] font-mono" aria-label="Language">
      <Link
        href={counterpart(pathname, 'ko')}
        className={cn('rounded-l-[5px] px-2 py-1 transition', !isEn ? 'bg-bg-subtle text-fg font-semibold' : 'text-fg-faint hover:text-fg')}
        aria-current={!isEn ? 'true' : undefined}
      >
        KO
      </Link>
      <Link
        href={counterpart(pathname, 'en')}
        className={cn('rounded-r-[5px] px-2 py-1 transition', isEn ? 'bg-bg-subtle text-fg font-semibold' : 'text-fg-faint hover:text-fg')}
        aria-current={isEn ? 'true' : undefined}
      >
        EN
      </Link>
    </div>
  );
}
