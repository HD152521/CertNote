import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Lang } from '@/lib/category';
import { previewOf } from '@/lib/content';
import type { DayContent } from '@/lib/content';
import { buildToc } from '@/lib/toc';
import { readingTimeMinutes } from '@/lib/readingTime';
import { extractDaySummary } from '@/lib/daySummary';
import { Article } from '@/components/Article';
import { Paywall } from '@/components/Paywall';
import { SummaryCard } from '@/components/day/SummaryCard';
import { Toc } from '@/components/Toc';
import { MarkAsRead } from '@/components/MarkAsRead';
import { ExamDateNudge } from '@/components/study/ExamDateNudge';
import { DayNavigationOverlay } from '@/components/study/DayNavigationOverlay';
import { DayMeta } from '@/components/DayMeta';
import { cn } from '@/lib/cn';
import { JsonLd } from '@/components/JsonLd';
import { LessonTracker } from '@/components/analytics/LessonTracker';
import { buildDayStructuredData } from '@/lib/day/structuredData';

export interface DayViewProps {
  category: string;
  slug: string;
  w: number;
  d: number;
  lang: Lang;
  content: DayContent;
  /** 잠김 여부. 유료 주차 게이팅 판정은 호출부(각 라우트의 page.tsx)가 이미 끝내고 값으로 넘긴다. */
  locked: boolean;
  loggedIn: boolean;
}

// day 페이지 렌더 전용 순수 서버 컴포넌트(docs/SEO-indexing-fix-plan.md Step5 A-0).
// [category]/[slug]/[week]/[day](전체 동적 라우트)와 [category]/[slug]/week1/[day](무료 전용
// 정적 라우트) 양쪽이 공유한다.
//
// 계약: 여기서 cookies()/headers()/getCurrentUser() 등 요청별 동적 API를 절대 호출하지 않는다.
// locked/loggedIn은 반드시 props로만 받는다 — 이 계약이 깨지면(=여기서 직접 인증을 읽으면)
// week1 정적 라우트가 다시 DYNAMIC_SERVER_USAGE 500을 낸다. 결합도 가드 테스트
// (src/components/day/**에서 next/headers import 금지)가 회귀를 잡는다.
export async function DayView({ category, slug, w, d, lang, content, locked, loggedIn }: DayViewProps) {
  const { articleLd, breadcrumbLd } = await buildDayStructuredData(category, slug, w, d, lang, content);
  // "## 핵심 정리" 섹션을 본문에서 뽑아 맨 위 카드로 따로 렌더한다(가독성 개선). 아직 이 형식으로
  // 바뀌지 않은 문서(대다수)는 summary===null이라 카드 없이 기존과 동일하게 렌더된다(안전 요구사항).
  // TOC·읽기시간은 항상 "카드를 뺀 본문"(body) 기준 — 요약을 목차·읽기시간에 이중으로 반영하지 않는다.
  const { summary, body } = extractDaySummary(content.body);
  const readingMinutes = readingTimeMinutes(body);
  // 잠겼으면 미리보기만 렌더(전체 본문은 HTML에 싣지 않음). 열렸으면 전체 TOC.
  const toc = locked ? [] : buildToc(body);

  return (
    <div className="flex gap-0">
      {articleLd && <JsonLd data={articleLd} />}
      {breadcrumbLd && <JsonLd data={breadcrumbLd} />}
      <LessonTracker cert={slug} week={w} day={d} locked={locked} loggedIn={loggedIn} />
      {!locked && (
        <MarkAsRead slug={slug} week={w} day={d} title={content.title} href={content.href} />
      )}
      {/* Mobile navigation overlay - Click to show arrows */}
      <DayNavigationOverlay prevHref={content.prev?.href} nextHref={content.next?.href} />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-2xl">
          <nav className="mb-4 flex items-center gap-2 text-xs text-fg-muted font-mono">
            <Link href={`/${category}/${slug}`} className="hover:text-fg">← {content.certMeta.code}</Link>
            <span className="text-fg-faint">/</span>
            <span>Week {w}</span>
            <span className="text-fg-faint">/</span>
            <span className="text-fg">Day {d}</span>
          </nav>
          <DayMeta certMeta={content.certMeta} week={w} day={d} readingMinutes={readingMinutes} lang={lang} />
          {locked ? (
            // 잠긴 문서에서는 요약 카드를 보여주지 않는다: "핵심 정리"는 그 자체로 결론이 응축된
            // 최고가치 콘텐츠라 카드로 도드라지게 뽑아 무료로 노출하면 본문을 안 읽어도 핵심을 다
            // 가져가는 우회로가 된다(previewOf가 앞부분만 자르는 것과는 성격이 다른 유출).
            // previewOf도 summary가 제거된 body를 슬라이스해서, 문서 서두에 있던 고밀도 요약이
            // 자동 미리보기 텍스트에 그대로 딸려나가는 것도 막는다(기존 동작보다 유출 표면이 준다).
            <>
              <div className="relative max-h-[28rem] overflow-hidden">
                <Article source={previewOf(body)} slug={slug} week={w} day={d} lang={lang} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
              </div>
              <Paywall loggedIn={loggedIn} lang={lang} />
            </>
          ) : (
            <>
              {summary && <SummaryCard summary={summary} lang={lang} />}
              <Article source={body} slug={slug} week={w} day={d} lang={lang} />
            </>
          )}
          <footer className="mt-12 grid grid-cols-2 gap-3 border-t border-border pt-6">
            {content.prev ? (
              <Link href={content.prev.href} className={cn('flex flex-col gap-1 rounded-md border border-border p-3 transition', 'hover:border-border-strong')}>
                <span className="flex items-center gap-1 text-xs text-fg-muted"><ArrowLeft className="h-3 w-3" /> {lang === 'en' ? 'Previous' : '이전'}</span>
                <span className="text-sm font-medium truncate">{content.prev.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
                <span className="text-xs text-fg-faint">Week {content.prev.week} · Day {content.prev.day}</span>
              </Link>
            ) : (<div />)}
            {content.next ? (
              <Link href={content.next.href} className={cn('flex flex-col gap-1 rounded-md border border-border p-3 text-right transition', 'hover:border-border-strong')}>
                <span className="flex items-center justify-end gap-1 text-xs text-fg-muted">{lang === 'en' ? 'Next' : '다음'} <ArrowRight className="h-3 w-3" /></span>
                <span className="text-sm font-medium truncate">{content.next.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
                <span className="text-xs text-fg-faint">Week {content.next.week} · Day {content.next.day}</span>
              </Link>
            ) : (<div />)}
          </footer>
          {/* 학습을 마친 접점에서 시험일 등록(D-day·일일 분량)을 안내. 잠긴 페이지·영어판에선 생략(위젯이 한국어 전용). */}
          {!locked && lang === 'ko' && (
            <div className="mt-6">
              <ExamDateNudge />
            </div>
          )}
        </div>
      </div>
      <Toc items={toc} />
    </div>
  );
}
