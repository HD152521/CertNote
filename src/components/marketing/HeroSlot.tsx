'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { Language } from '@/lib/i18n';
import { markResumeIntent } from '@/lib/readingPosition';
import { fmt, pick } from '@/lib/strings/dict';
import { homeStrings } from '@/lib/strings/home';
import { DAILY_STUDY_MINUTES } from '@/lib/studyTime';
import { useResume, type Resume } from '@/components/resume/useResume';

// 히어로 오른쪽 자리. 서버 HTML 은 항상 "대표 자격증"으로 나가고, 마운트 뒤 이 브라우저에 읽은 기록이
// 있으면 같은 틀 안에서 "이어서 읽기"로 바뀐다. 두 상태가 같은 고정 높이 틀을 쓰므로 교체해도 아래가 밀리지 않는다(CLS 0).
// min-h 라서 글자를 키워도 CTA 가 잘리지 않고, 가변 텍스트는 line-clamp 로 상한을 둬 두 상태의 높이가 거의 같다.
// 높이를 바꾸려면 이 한 상수만 고친다 — 테스트가 두 상태 모두 이 틀 안에 있는지 확인한다.
export const HERO_SLOT_FRAME =
  'group relative flex min-h-[24rem] flex-col border border-border-strong border-l-[3px] border-l-accent bg-bg-elevated p-6 transition-colors hover:bg-bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-[22rem] sm:p-7';

export interface FeaturedSummary {
  code: string;
  name: string;
  weeks: number;
  dayCount: number;
  href: string;
}

interface HeroSlotProps {
  lang: Language;
  featured: FeaturedSummary | null;
  /** slug → 시험 코드. 이어서 읽기 카드에서 어느 자격증인지 보여 준다. */
  codes: Record<string, string>;
}

interface ViewProps extends HeroSlotProps {
  resume: Resume | null;
}

// "Day 3 - VPC" 에서 앞의 일차 표기를 뗀 노트 제목.
function noteTitle(resume: Resume): string {
  return resume.entry.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '');
}

function ariaName(lang: Language, code: string, name: string, cta: string): string {
  return fmt(pick(homeStrings, lang).slotAria, { code, name, cta });
}

function Cta({ label }: { label: string }) {
  return (
    <span className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent">
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </span>
  );
}

function FeaturedBody({ lang, featured }: { lang: Language; featured: FeaturedSummary }) {
  const s = pick(homeStrings, lang);
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint">{s.slotFeatured}</p>
      <p className="mt-3 font-mono text-5xl font-bold leading-none tracking-tight">{featured.code}</p>
      <p className="mt-3 line-clamp-2 text-lg font-semibold leading-snug">{featured.name}</p>
      <ul className="mt-4 space-y-1.5 text-sm text-fg-muted">
        {[
          fmt(s.bulletLength, { weeks: featured.weeks, days: featured.dayCount }),
          fmt(s.bulletDaily, { minutes: DAILY_STUDY_MINUTES }),
          s.bulletAccount,
        ].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <Cta label={s.slotStart} />
    </>
  );
}

function ResumeBody({ lang, resume, codes }: { lang: Language; resume: Resume; codes: Record<string, string> }) {
  const s = pick(homeStrings, lang);
  const { entry } = resume;
  const title = noteTitle(resume);
  const code = codes[resume.slug] ?? resume.slug;
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-fg-faint">
        {resume.midway ? s.slotResumeMidway : s.slotResume}
      </p>
      <p className="mt-3 font-mono text-5xl font-bold leading-none tracking-tight">{code}</p>
      <p className="mt-3 line-clamp-2 text-lg font-semibold leading-snug">{title}</p>
      <p className="mt-3 text-sm text-fg-muted">{fmt(s.resumeMeta, { code, week: entry.week, day: entry.day })}</p>
      <Cta label={s.slotContinue} />
    </>
  );
}

// 표시만 담당(상태 없음) — 테스트가 두 상태를 직접 그려 같은 틀인지 확인한다.
export function HeroSlotView({ lang, featured, codes, resume }: ViewProps) {
  if (resume) {
    return (
      <Link
        href={resume.href}
        onClick={() => resume.midway && markResumeIntent(resume.entry.href)}
        data-hero-slot="resume"
        aria-label={ariaName(lang, codes[resume.slug] ?? resume.slug, noteTitle(resume), pick(homeStrings, lang).slotContinue)}
        className={HERO_SLOT_FRAME}
      >
        <ResumeBody lang={lang} resume={resume} codes={codes} />
      </Link>
    );
  }
  if (!featured) return null;
  return (
    <Link
      href={featured.href}
      data-hero-slot="featured"
      aria-label={ariaName(lang, featured.code, featured.name, pick(homeStrings, lang).slotStart)}
      className={HERO_SLOT_FRAME}>
      <FeaturedBody lang={lang} featured={featured} />
    </Link>
  );
}

export function HeroSlot(props: HeroSlotProps) {
  const resume = useResume(undefined, props.lang);
  return <HeroSlotView {...props} resume={resume} />;
}
