import { DEFAULT_CATEGORY, EN_CATEGORY, isSupportedCategory, langOfCategory } from '@/lib/category';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getDay, previewOf } from '@/lib/content';
import { excerptOf } from '@/lib/site';
import { buildToc } from '@/lib/toc';
import { readingTimeMinutes } from '@/lib/readingTime';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { Article } from '@/components/Article';
import { Paywall } from '@/components/Paywall';
import { Toc } from '@/components/Toc';
import { MarkAsRead } from '@/components/MarkAsRead';
import { ExamDateNudge } from '@/components/study/ExamDateNudge';
import { DayNavigationOverlay } from '@/components/study/DayNavigationOverlay';
import { DayMeta } from '@/components/DayMeta';
import { cn } from '@/lib/cn';

interface PageProps { params: Promise<{ category: string; slug: string; week: string; day: string }>; }

// 항상 동적 렌더. day 페이지는 쿠키(로그인)·권한을 읽어 게이팅하므로 정적 생성과 양립 불가다.
// (generateStaticParams + cookies() 조합은 프로덕션에서 DYNAMIC_SERVER_USAGE 500을 유발했다.)
// 본문은 권한 있을 때만 응답에 포함되고, 잠기면 미리보기+Paywall만 내려간다.
export const dynamic = 'force-dynamic';

function parseSegment(seg: string, prefix: string): number | null {
  if (!seg.startsWith(prefix)) return null;
  const n = Number.parseInt(seg.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : null;
}

// 페이지별 검색 노출 메타. 제목·요약·canonical이 415개 페이지 각각 달라진다.
// getDay는 프로덕션에서 메모이즈되므로 본문 렌더와 이중 비용이 아니다.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, slug, week, day } = await params;
  if (!isSupportedCategory(category)) return {};
  const w = parseSegment(week, 'week');
  const d = parseSegment(day, 'day');
  if (w === null || d === null) return {};

  // Week 2 이상은 Google 검색 인덱싱 차단 (프리미엄 콘텐츠)
  if (w > FREE_WEEK) {
    return {
      robots: 'noindex, nofollow',
    };
  }

  const content = await getDay(category, slug, w, d).catch(() => null);
  if (!content) return {};
  // 주제어(content.title)를 앞세운다. "Week N"은 검색량이 없어 title 자리를 낭비하므로 제외.
  const title = `${content.title} — ${content.certMeta.code}`;
  const description = excerptOf(content.body);
  // 한/영 상호 hreflang: 반대 언어 버전이 실제로 존재할 때만 연결(무료 Week1만 영어판이 있다).
  const otherCategory = category === EN_CATEGORY ? DEFAULT_CATEGORY : EN_CATEGORY;
  const other = w <= FREE_WEEK ? await getDay(otherCategory, slug, w, d).catch(() => null) : null;
  const languages = other
    ? {
        ko: category === EN_CATEGORY ? other.href : content.href,
        en: category === EN_CATEGORY ? content.href : other.href,
      }
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: content.href, languages },
    // openGraph를 직접 정의하면 상위 세그먼트의 파일 기반 OG 이미지가 덮이므로
    // 자격증 카드 이미지를 명시적으로 지정한다.
    openGraph: {
      title,
      description,
      url: content.href,
      type: 'article',
      images: [`/${category}/${slug}/opengraph-image`],
    },
  };
}

export default async function DayPage({ params }: PageProps) {
  const { category, slug, week, day } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const w = parseSegment(week, 'week');
  const d = parseSegment(day, 'day');
  if (w === null || d === null) notFound();
  const content = await getDay(category, slug, w, d);
  if (!content) notFound();

  // 무료 주차는 인증을 읽지 않아 정적으로 유지된다. 유료 주차에서만 쿠키·권한을 읽어 동적 렌더.
  let locked = false;
  let loggedIn = false;
  if (w > FREE_WEEK) {
    const session = await getCurrentUser();
    loggedIn = Boolean(session);
    const ent = session ? await getEntitlementService().getEntitlement(session.sub) : null;
    locked = !ent?.isPro;
  }

  const readingMinutes = readingTimeMinutes(content.body);
  // 잠겼으면 미리보기만 렌더(전체 본문은 HTML에 싣지 않음). 열렸으면 전체 TOC.
  const toc = locked ? [] : buildToc(content.body);

  return (
    <div className="flex gap-0">
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
            <>
              <div className="relative max-h-[28rem] overflow-hidden">
                <Article source={previewOf(content.body)} slug={slug} week={w} day={d} lang={lang} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
              </div>
              <Paywall loggedIn={loggedIn} />
            </>
          ) : (
            <Article source={content.body} slug={slug} week={w} day={d} lang={lang} />
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
