import { isSupportedCategory, langOfCategory } from '@/lib/category';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDay } from '@/lib/content';
import { parseDaySegment } from '@/lib/day/segment';
import { buildDayMetadata } from '@/lib/day/metadata';
import { DayView } from '@/components/day/DayView';
import { PAYWALL_ENABLED } from '@/lib/entitlement/policy';

interface PageProps { params: Promise<{ category: string; slug: string; week: string; day: string }>; }

// 첫 요청 때 한 번 렌더해 다음 배포까지 캐시한다(docs/P3-step1-day-cache-design.md, 선택 B).
// 구독제 보류(2026-10)로 이 라우트는 쿠키·권한을 읽지 않고 전 주차가 누구에게나 열려 있다
// (policy.ts PAYWALL_ENABLED).
//
// generateStaticParams 가 빈 배열을 돌려주므로 빌드 때는 한 장도 만들지 않는다. dynamicParams 가
// true 라 목록에 없는 day 도 첫 방문 때 정적 렌더되고, revalidate 를 선언하지 않아 재검증 없이
// 배포 단위로만 무효화된다(콘텐츠가 레포의 md 라 수정 = 배포). 존재하지 않는 URL 의 진짜 404 는
// 이 페이지의 notFound() 가 아니라 src/proxy.ts(contentPathExists) 가 렌더 전에 책임진다.
//
// `dynamic` 은 선언하지 않는다. 강제 정적으로 두면 cookies() 가 예외 없이 빈 값을 돌려줘, 페이월을
// 되살렸을 때 구독자가 조용히 잠긴다(week1 라우트가 같은 이유로 선언하지 않는다).
//
// 페이월을 되살릴 때: 이 상태에서 cookies() 를 읽으면 빌드는 통과하고 운영에서 매 요청
// DYNAMIC_SERVER_USAGE 500 이 난다. 아래 throw 가 스위치만 켠 빌드를 실패시켜 배포를 막는다.
// 반드시 설계 문서 3장의 되돌림 절차(이 함수 삭제 + 동적 렌더 복원)를 스위치와 한 커밋으로 할 것.
// 계약은 ./cacheContract.test.ts 가 지킨다. week1 은 별도 라우트(../week1/[day]/page.tsx)가 빌드 때 만든다.
export async function generateStaticParams(): Promise<{ category: string; slug: string; week: string; day: string }[]> {
  if (PAYWALL_ENABLED) {
    throw new Error(
      'PAYWALL_ENABLED=true 인데 [week]/[day] 가 정적 캐시 라우트다. ' +
        'docs/P3-step1-day-cache-design.md 3장의 되돌림 절차를 먼저 수행할 것.',
    );
  }
  return [];
}

export const dynamicParams = true;

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
