import { isSupportedCategory, langOfCategory } from '@/lib/category';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDay } from '@/lib/content';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { parseDaySegment } from '@/lib/day/segment';
import { buildDayMetadata } from '@/lib/day/metadata';
import { DayView } from '@/components/day/DayView';

interface PageProps { params: Promise<{ category: string; slug: string; week: string; day: string }>; }

// 항상 동적 렌더. 이 라우트는 유료 주차(week2+)를 포함한 전체 주차를 담당하며, 유료 주차에서는
// 쿠키(로그인)·권한을 읽어 게이팅하므로 정적 생성과 양립 불가하다.
//
// 절대 이 라우트에 generateStaticParams 를 추가하지 말 것 — Next.js 16.2.6 소스로 확정된
// 메커니즘(docs/SEO-indexing-fix-plan.md Step5):
//   build/templates/app-page.js:350  generateStaticParams 존재 시 세그먼트 전체가 SSG 판정
//   build/templates/app-page.js:357  목록에 없는 param 요청까지 supportsDynamicResponse=false
//   server/async-storage/work-store.js:33          → isStaticGeneration=true
//   server/app-render/dynamic-rendering.js:238      → cookies() 호출 시 DynamicServerError throw
//   server/app-render/app-render.js:1991            → 500 (동적 렌더로 재시도하는 핸들러 없음)
// 아래 `dynamic = 'force-dynamic'`이 dynamic-rendering.js:226의 store.forceDynamic 조기 return으로
// 이 throw를 막는 유일한 방어다. 이 라우트를 절대 force-static/generateStaticParams로 바꾸지 말 것
// — cookies()가 빈 값을 반환해 유료 구독자가 페이월에 갇힌다.
// 무료 week1 전용 정적 렌더은 별도 라우트(../week1/[day]/page.tsx)가 담당한다.
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

  // 무료 주차는 인증을 읽지 않아 정적으로 유지될 수 있다(실제 정적 생성은 week1/[day] 라우트).
  // 유료 주차에서만 쿠키·권한을 읽어 동적 렌더.
  let locked = false;
  let loggedIn = false;
  if (w > FREE_WEEK) {
    const session = await getCurrentUser();
    loggedIn = Boolean(session);
    const ent = session ? await getEntitlementService().getEntitlement(session.sub) : null;
    locked = !ent?.isPro;
  }

  return (
    <DayView category={category} slug={slug} w={w} d={d} lang={lang} content={content} locked={locked} loggedIn={loggedIn} />
  );
}
