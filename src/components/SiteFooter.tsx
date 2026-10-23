'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n-client';
import { OPERATOR_NAME, SITE_NAME } from '@/lib/site';

const LINKS = [
  { href: '/about', ko: '소개', en: 'About' },
  { href: '/changelog', ko: '수정 기록', en: 'Changelog' },
  { href: '/contact', ko: '문의', en: 'Contact' },
  { href: '/terms', ko: '이용약관', en: 'Terms' },
  { href: '/privacy', ko: '개인정보처리방침', en: 'Privacy' },
] as const;

// 전 페이지 공통 푸터. 운영 주체와 정책 문서로 가는 길을 어디서든 한 번에 찾을 수 있게 한다.
export function SiteFooter() {
  const lang = useLanguage();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-6 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <p>
          © {SITE_NAME} · {OPERATOR_NAME}
        </p>
        <nav aria-label={lang === 'en' ? 'Site information' : '사이트 정보'}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="underline-offset-4 transition hover:text-fg hover:underline">
                  {lang === 'en' ? l.en : l.ko}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
