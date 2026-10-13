import { isSupportedCategory, langOfCategory } from '@/lib/category';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDay } from '@/lib/content';
import { parseDaySegment } from '@/lib/day/segment';
import { buildDayMetadata } from '@/lib/day/metadata';
import { DayView } from '@/components/day/DayView';

interface PageProps { params: Promise<{ category: string; slug: string; week: string; day: string }>; }

// 항상 동적 렌더. 구독제 보류(2026-10)로 이 라우트는 더 이상 쿠키·권한을 읽지 않는다 — 전 주차가
// 누구에게나 열려 있다(policy.ts PAYWALL_ENABLED).
//
// 그래도 force-dynamic 은 유지한다. generateStaticParams 를 추가해 정적으로 바꾸면 빌드가 day
// 1,300여 개를 전부 프리렌더하게 되고, 나중에 페이월을 되살려 cookies() 를 다시 읽는 순간
// DYNAMIC_SERVER_USAGE 500 이 난다(Next.js 16.2.6: generateStaticParams 가 있으면 세그먼트 전체가
// SSG 판정을 받아 목록 밖 param 요청도 cookies() 에서 throw — docs/SEO-indexing-fix-plan.md Step5).
// 정적화는 빌드 시간·캐시 무효화를 따로 검증한 뒤 별도 작업으로 한다.
// week1 전용 정적 렌더는 별도 라우트(../week1/[day]/page.tsx)가 담당한다.
export const dynamic = 'force-dynamic';

// 페이지별 검색 노출 메타. 제목·요약·canonical이 415개 페이지 각각 달라진다.
// getDay는 프로덕션에서 메모이즈되므로 본문 렌더와 이중 비용이 아니다.
// 본문은 src/lib/day/metadata.ts(buildDayMetadata)로 이동(Step5 A-0) — week1/[day] 라우트와 공유.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, slug, week, day } = await params;
  if (!isSupportedCategory(category)) return {};
  const w = parseDaySegment(week, 'week');
  const d = parseDaySegment(day, 'day');
  if (w === null || d === null) return {};
  return buildDayMetadata(category, slug, w, d);
}

export default async function DayPage({ params }: PageProps) {
  const { category, slug, week, day } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const w = parseDaySegment(week, 'week');
  const d = parseDaySegment(day, 'day');
  if (w === null || d === null) notFound();
  const content = await getDay(category, slug, w, d);
  if (!content) notFound();

  return (
    <DayView category={category} slug={slug} w={w} d={d} lang={lang} content={content} locked={false} loggedIn={false} />
  );
}
