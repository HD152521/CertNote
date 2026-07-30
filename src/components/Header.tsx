'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n-client';
import { ThemeToggle } from './ThemeToggle';
import { SearchButton } from './SearchButton';
import { AuthNav } from './AuthNav';
import { MobileNav } from './MobileNav';
import { LangToggle } from './LangToggle';
import type { CertTree } from './SidebarNav';

interface HeaderProps { certTrees: CertTree[]; enCertTrees?: CertTree[]; }

// 자격증 목록은 헤더에 두지 않는다. lg+는 왼쪽 사이드바, lg 미만은 햄버거 드로어가 담당한다.
// (헤더에 코드 칩을 같이 두면 계정 메뉴와 겹쳐 데스크탑에서도 줄바꿈이 발생했다.)
export function Header({ certTrees, enCertTrees }: HeaderProps) {
  const lang = useLanguage();
  const tagline = lang === 'en' ? '/ Commute Study Notes' : '/ 출퇴근 학습 노트';
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-1 sm:gap-2">
        <MobileNav certTrees={certTrees} enCertTrees={enCertTrees} />
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
          <span>Cert Notes</span>
          <span className="text-fg-faint font-normal hidden sm:inline">{tagline}</span>
        </Link>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/roadmap"
            className="hidden rounded-md px-2 py-1 text-sm font-medium text-fg-muted transition hover:text-fg sm:inline-block"
          >
            {lang === 'en' ? 'Roadmap' : '로드맵'}
          </Link>
          <LangToggle />
          <SearchButton />
          <ThemeToggle />
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
