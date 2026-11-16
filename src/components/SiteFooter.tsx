'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n-client';
import { footerInfoLinks, footerStudyLinks, type FooterLink } from '@/lib/footerLinks';
import { OPERATOR_NAME, OPERATOR_NAME_EN, SITE_NAME } from '@/lib/site';

function FooterNav({ label, links }: { label: string; links: FooterLink[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="underline-offset-4 transition hover:text-fg hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// 전 페이지 공통 푸터. 학습 입구(자격증·실습·로드맵)와 운영 주체·정책 문서로 가는 길을 어디서든 한 번에 찾을 수 있게 한다.
// 링크는 서버 렌더 HTML 의 일반 <a> 라 크롤러가 JS 없이 따라간다(링크 목록은 src/lib/footerLinks.ts).
export function SiteFooter() {
  const lang = useLanguage();
  const en = lang === 'en';
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 pb-20 pt-6 text-xs text-fg-muted sm:flex-row sm:items-start sm:justify-between sm:pb-6 lg:px-6">
        <p>
          © {SITE_NAME} · {en ? OPERATOR_NAME_EN : OPERATOR_NAME}
        </p>
        <div className="flex flex-col gap-2 sm:items-end">
          <FooterNav label={en ? 'Study' : '학습'} links={footerStudyLinks(lang)} />
          <FooterNav label={en ? 'Site information' : '사이트 정보'} links={footerInfoLinks(lang)} />
        </div>
      </div>
    </footer>
  );
}
