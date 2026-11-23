import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Language } from '@/lib/i18n';
import { fmt, pick } from '@/lib/strings/dict';
import { homeStrings } from '@/lib/strings/home';
import { DAILY_STUDY_MINUTES } from '@/lib/studyTime';
import { SignupCta } from '@/components/marketing/SignupCta';
import { HeroSlot, type FeaturedSummary } from '@/components/marketing/HeroSlot';

interface HomeHeroProps {
  lang: Language;
  /** 기록 없는 방문자(서버 HTML)에게 크게 보여 줄 대표 자격증. 없으면 대표 카드 자리가 비어 있다. */
  featured: FeaturedSummary | null;
  codes: Record<string, string>;
  /** '둘러보기' 링크 목적지. 한국어는 /aws 허브, 영어는 같은 페이지의 트랙 목록(#tracks). */
  browseHref: string;
}

// 한국어 홈(Landing)과 영어 홈(en/page)이 함께 쓰는 첫 화면.
// 왼쪽: 제목·설명·행동 버튼 / 오른쪽: 대표 자격증 또는 이어서 읽기(HeroSlot, 고정 높이).
// 서버 컴포넌트 — 쿠키·세션·DB 를 읽지 않는다(홈 정적 프리렌더 조건). 기록 읽기는 HeroSlot 이 마운트 뒤에 한다.
export function HomeHero({ lang, featured, codes, browseHref }: HomeHeroProps) {
  const s = pick(homeStrings, lang);
  return (
    <section className="grid gap-x-12 gap-y-8 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-7">
        <p className="flex items-center gap-3 text-xs font-medium tracking-wide text-accent">
          <span aria-hidden="true" className="h-px w-8 shrink-0 bg-accent" />
          {s.eyebrow}
        </p>
        <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.5rem]">
          {s.h1Lead}
          <br />
          <span className="text-accent">{s.h1Tail}</span>
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-fg-muted">
          {fmt(s.introLead, { minutes: DAILY_STUDY_MINUTES })}
          {s.introStrong && <strong className="font-semibold text-fg">{s.introStrong}</strong>}
        </p>
      </div>

      <div className="lg:col-span-5 lg:row-span-2 lg:mt-3">
        <HeroSlot lang={lang} featured={featured} codes={codes} />
      </div>

      <div className="space-y-4 lg:col-span-7">
        <div className="flex flex-wrap items-center gap-3">
          <SignupCta
            placement="home_hero"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 font-semibold text-accent-fg transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.primaryCta} <ArrowRight className="h-4 w-4" />
          </SignupCta>
          <Link
            href={browseHref}
            className="rounded-md px-3 py-3 font-semibold text-fg underline decoration-border-strong decoration-2 underline-offset-8 transition hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.browseCta}
          </Link>
        </div>
        <p className="max-w-xl text-sm text-fg-faint">{s.note}</p>
      </div>
    </section>
  );
}
