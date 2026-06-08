import Link from 'next/link';
import type { CertMeta } from '@/lib/content';
import { ThemeToggle } from './ThemeToggle';
import { SearchButton } from './SearchButton';
import { AuthNav } from './AuthNav';
import { cn } from '@/lib/cn';

interface HeaderProps { certs: CertMeta[]; }

export function Header({ certs }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
          <span>Cert Notes</span>
          <span className="text-fg-faint font-normal hidden sm:inline">/ 출퇴근 학습 노트</span>
        </Link>
        <nav className="flex items-center gap-2">
          <ul className="hidden md:flex items-center gap-1">
            {certs.map((c) => (
              <li key={c.slug}>
                <Link href={`/aws-certs/${c.slug}`}
                  className={cn('px-2.5 py-1 text-xs font-mono rounded-md text-fg-muted', 'hover:bg-bg-subtle hover:text-fg transition')}
                  title={c.name}
                >{c.code}</Link>
              </li>
            ))}
          </ul>
          <SearchButton />
          <ThemeToggle />
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
