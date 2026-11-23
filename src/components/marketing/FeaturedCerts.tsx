import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { EN_CATEGORY } from '@/lib/category';
import { certHref, type CertMeta } from '@/lib/content';
import type { Language } from '@/lib/i18n';
import { certLevelLabel } from '@/lib/levels';
import { cn } from '@/lib/cn';
import { fmt, pick } from '@/lib/strings/dict';
import { formatCertLength } from '@/lib/strings/chrome';
import { homeStrings, type HomeKey } from '@/lib/strings/home';

// 큰 타일 두 개. 순서 = 노출 순서(첫 타일이 더 크다). 입문(CLF)과 다른 분야(리눅스마스터)를 보여 준다.
export const FEATURED_SLUGS = ['clf-c02', 'linux-master-1'];

type Group = { key: string; labelKey: HomeKey; certs: CertMeta[] };

const SECTIONS: { section: string; labelKey: HomeKey }[] = [
  { section: 'aws', labelKey: 'groupAws' },
  { section: 'linux', labelKey: 'groupLinux' },
  { section: 'data', labelKey: 'groupData' },
];

export function certLink(cert: Pick<CertMeta, 'slug' | 'section'>, lang: Language): string {
  return lang === 'en' ? `/${EN_CATEGORY}/${cert.slug}` : certHref(cert);
}

// 큰 타일에 올린 자격증을 뺀 나머지를 섹션별로 묶는다. 모르는 섹션도 '기타'로 남겨 링크가 빠지지 않게 한다.
export function groupRest(certs: CertMeta[]): Group[] {
  const known = SECTIONS.map(({ section, labelKey }) => ({
    key: section,
    labelKey,
    certs: certs.filter((c) => (c.section ?? 'aws') === section),
  }));
  const other = certs.filter((c) => !SECTIONS.some(({ section }) => (c.section ?? 'aws') === section));
  const groups: Group[] = [...known, { key: 'other', labelKey: 'groupOther', certs: other }];
  return groups.filter((g) => g.certs.length > 0);
}

function Tile({ cert, lang, large, delayMs }: { cert: CertMeta; lang: Language; large: boolean; delayMs: number }) {
  const s = pick(homeStrings, lang);
  return (
    <Link
      href={certLink(cert, lang)}
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        'card-enter group flex flex-col border border-border bg-bg-elevated transition-colors hover:border-accent hover:bg-bg-subtle',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        large ? 'p-7 md:col-span-3 md:min-h-56' : 'p-5 md:col-span-2',
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-fg-faint">
        {certLevelLabel(cert.level, cert.section ?? 'aws', lang)}
      </span>
      <span className={cn('mt-2 font-mono font-bold leading-none tracking-tight', large ? 'text-4xl' : 'text-2xl')}>
        {cert.code}
      </span>
      <span className={cn('mt-3 font-semibold leading-snug', large ? 'text-lg' : 'text-base')}>{cert.name}</span>
      <span className="mt-1 text-sm text-fg-muted">{formatCertLength(lang, cert.weeks, cert.dayCount)}</span>
      <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-semibold text-accent">
        {s.tileStart} <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

interface FeaturedCertsProps {
  lang: Language;
  certs: CertMeta[];
}

// 자격증 영역: 큰 타일 2개 + 나머지는 섹션별 촘촘한 목록. 균일 격자 대신 크기 차이로 위계를 만든다.
// 목록은 큰 타일 두 개만 뺀 전부(히어로 대표 포함)를 담아, 어떤 방문자 상태에서도 모든 트랙이 <a href> 로 남는다.
// 서버 컴포넌트 — 정적 프리렌더 대상이다(쿠키·세션·DB 금지).
export function FeaturedCerts({ lang, certs }: FeaturedCertsProps) {
  const s = pick(homeStrings, lang);
  const tiles = FEATURED_SLUGS.map((slug) => certs.find((c) => c.slug === slug)).filter(
    (c): c is CertMeta => Boolean(c),
  );
  const rest = certs.filter((c) => !tiles.includes(c));
  const groups = groupRest(rest);
  return (
    <section id="tracks" aria-labelledby="home-tracks-heading" className="scroll-mt-20 space-y-6">
      <div className="max-w-2xl space-y-2">
        <h2 id="home-tracks-heading" className="text-2xl font-bold tracking-tight">
          {fmt(s.tracksHeading, { n: certs.length })}
        </h2>
        <p className="text-fg-muted">{s.tracksLead}</p>
      </div>
      {tiles.length > 0 && (
        <div className="grid gap-4 md:grid-cols-5">
          {tiles.map((cert, i) => (
            <Tile key={cert.slug} cert={cert} lang={lang} large={i === 0} delayMs={i * 60} />
          ))}
        </div>
      )}
      <div aria-label={s.tracksIndexLabel} role="group" style={{ animationDelay: '120ms' }} className="card-enter divide-y divide-border border-y border-border">
        {groups.map((g) => (
          <div key={g.key} className="grid gap-2 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint sm:pt-1.5">{s[g.labelKey]}</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {g.certs.map((cert) => (
                <li key={cert.slug}>
                  <Link
                    href={certLink(cert, lang)}
                    className="inline-flex items-baseline gap-2 py-1 text-sm text-fg-muted transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="font-mono text-xs text-fg-faint">{cert.code}</span>
                    <span className="underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:decoration-current">
                      {cert.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
