import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSection, langOfCategory } from '@/lib/category';
import { getAllDays, getCertMeta, getDay } from '@/lib/content';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { buildDayMetadata } from '@/lib/day/metadata';
import { parseDaySegment } from '@/lib/day/segment';
import { DayView } from '@/components/day/DayView';

// day 페이지 라우트의 공유 구현. 라우트 파일은 category 별 리터럴 폴더
// (src/app/{aws,linux,en}/[slug]/[week]/[day], …/[slug]/week1/[day])에 얇게 두고 여기를 호출한다.
//
// 왜 `[category]` 동적 세그먼트가 아니라 리터럴 폴더인가: 이 라우트들은 렌더 결과를 URL 단위로 캐시한다.
// root loading.tsx 때문에 응답이 스트리밍으로 시작되어 페이지 안의 notFound()는 200 이 되고(Next 문서
// loading.md "Status Codes"), 그 200 이 그대로 캐시된다. 동적 `[category]` 아래에 두면 /api/x/week2/day1,
// /_next/foo/bar/baz 같은 임의 4세그먼트 경로가 모두 이 라우트에 매칭돼 캐시 키가 무한해진다. 세그먼트별
// `dynamicParams=false` 는 라우트 전체를 NOT_FOUND 폴백으로 만들어(실측: 유효한 week2 페이지도 404)
// 쓸 수 없었다. 리터럴 폴더면 지원 category 밖 경로는 라우터가 아예 매칭하지 않아 진짜 404 가 난다.
// (src/lib/day/dayRouteStructure.test.ts 가 이 구조를 고정한다.)

export interface DayRouteParams { slug: string; week: string; day: string }
export interface Week1RouteParams { slug: string; day: string }

// 자격증이 이 URL 섹션(/aws, /linux)에 속하는지. aws·linux 는 같은 content 폴더에 공존하므로 파일 존재만으로는
// /linux/saa-c03/week2/day1 같은 교차 섹션 URL 을 거르지 못한다(지금은 프록시가 404 로 막는다 — 이쪽은 이중 방어).
// 섹션이 아닌 category(영어판 'en')는 섹션 축이 없어 검사하지 않는다.
async function certBelongsToCategory(category: string, slug: string): Promise<boolean> {
  if (!isSection(category)) return true;
  const meta = await getCertMeta(category, slug).catch(() => null);
  return meta !== null && (meta.section ?? 'aws') === category;
}

export async function dayRouteMetadata(category: string, { slug, week, day }: DayRouteParams): Promise<Metadata> {
  const w = parseDaySegment(week, 'week');
  const d = parseDaySegment(day, 'day');
  if (w === null || d === null) return {};
  if (!(await certBelongsToCategory(category, slug))) return {};
  return buildDayMetadata(category, slug, w, d);
}

export async function renderDayRoute(category: string, { slug, week, day }: DayRouteParams) {
  const w = parseDaySegment(week, 'week');
  const d = parseDaySegment(day, 'day');
  if (w === null || d === null) notFound();
  if (!(await certBelongsToCategory(category, slug))) notFound();
  const content = await getDay(category, slug, w, d);
  if (!content) notFound();
  return (
    <DayView category={category} slug={slug} w={w} d={d} lang={langOfCategory(category)} content={content} locked={false} loggedIn={false} />
  );
}

export async function week1RouteMetadata(category: string, { slug, day }: Week1RouteParams): Promise<Metadata> {
  const d = parseDaySegment(day, 'day');
  if (d === null) return {};
  if (!(await certBelongsToCategory(category, slug))) return {};
  return buildDayMetadata(category, slug, FREE_WEEK, d);
}

export async function renderWeek1Route(category: string, { slug, day }: Week1RouteParams) {
  return renderDayRoute(category, { slug, week: `week${FREE_WEEK}`, day });
}

// week1 은 빌드 시 프리렌더한다(신규 방문자·크롤러 진입 페이지). 이 category 의 week1 day 전부.
export async function week1StaticParams(category: string): Promise<Week1RouteParams[]> {
  const { listCerts } = await import('@/lib/content');
  const certs = await listCerts(category).catch(() => []);
  const out: Week1RouteParams[] = [];
  for (const cert of certs) {
    for (const ref of await getAllDays(category, cert.slug)) {
      if (ref.week === FREE_WEEK) out.push({ slug: cert.slug, day: `day${ref.day}` });
    }
  }
  return out;
}
