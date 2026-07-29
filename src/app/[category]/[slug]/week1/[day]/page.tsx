import { SECTIONS, EN_CATEGORY, isSupportedCategory, langOfCategory } from '@/lib/category';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllDays, getDay, listCerts } from '@/lib/content';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { parseDaySegment } from '@/lib/day/segment';
import { buildDayMetadata } from '@/lib/day/metadata';
import { DayView } from '@/components/day/DayView';

interface PageProps { params: Promise<{ category: string; slug: string; day: string }>; }

// 무료 주차(week1) 전용 정적 렌더 라우트(docs/SEO-indexing-fix-plan.md Step5).
//
// 왜 별도 라우트인가: [week]/[day]에 generateStaticParams를 그대로 추가하면 세그먼트 전체가
// SSG 판정을 받아, 유료 주차 요청(cookies() 호출 경로)까지 DYNAMIC_SERVER_USAGE 500을 낸다
// (메커니즘은 ../[week]/[day]/page.tsx 상단 주석 참고 — Next.js 16.2.6 소스로 확정됨). 리터럴
// week1 세그먼트를 신설하면 이 라우트의 코드 경로에는 애초에 cookies() 호출이 존재하지
// 않으므로 SSG와 안전하게 양립한다. shared/lib/router/utils/sorted-routes.js에 따라 리터럴
// 세그먼트가 [week]보다 항상 먼저 매칭되고 specificity가 달라 라우트 충돌(E458)도 없다.
//
// `dynamic`은 의도적으로 선언하지 않는다(auto) — generateStaticParams가 있으므로 자동으로
// force-static과 동등하게 SSG된다. 여기서 force-static을 명시하면 향후 이 라우트에 실수로
// 동적 API가 섞여도 빌드가 조용히 통과해버려 회귀를 못 잡는다(auto가 더 정직한 방어).
export async function generateStaticParams() {
  const out: { category: string; slug: string; day: string }[] = [];
  // 공개 URL category(섹션 세그먼트 + en)로 정적 생성한다. listCerts(section)이 meta.section으로
  // 걸러 각 섹션 자격증만 반환하므로 /aws/*·/linux/* 무료 Week1 페이지가 각각 생성된다.
  for (const category of [...SECTIONS, EN_CATEGORY]) {
    // listCerts는 index.json 파싱 실패 시 throw할 수 있다(en 카테고리 콘텐츠 미비 등).
    // sitemap.ts와 동일하게 조용히 건너뛴다 — 한쪽 언어 실패가 반대쪽 빌드까지 막지 않는다.
    const certs = await listCerts(category).catch(() => []);
    for (const cert of certs) {
      const days = await getAllDays(category, cert.slug);
      for (const dayRef of days) {
        // week2+ 절대 포함 금지 — 포함하면 이 세그먼트가 유료 주차까지 SSG로 판정해 위 주석의
        // 500이 재현된다. FREE_WEEK 상수 하나로 무료 경계를 판정해 정책 변경(Step5 A-3 가드)과
        // 항상 같은 값을 쓴다.
        if (dayRef.week !== FREE_WEEK) continue;
        out.push({ category, slug: cert.slug, day: `day${dayRef.day}` });
      }
    }
  }
  return out;
}

// dynamicParams는 기본값(true)과 동일하지만 의도를 코드에 남긴다: 사이트맵 밖의 잘못된
// category/slug 요청은 generateStaticParams 목록에 없어 요청 시점에 렌더를 시도하고,
// 이 페이지 내부의 getDay()가 null을 반환하면 notFound()로 정상 404 처리한다. 이 라우트가
// 실수로 dynamicParams=false로 바뀌면(A-3 가드 테스트가 있기 전엔 금지) 알려지지 않은 day가
// 전부 404가 되어 신규 콘텐츠 배포 직후 빌드 캐시가 갱신되기 전까지 색인 공백이 생길 수 있다.
export const dynamicParams = true;

// 본문은 src/lib/day/metadata.ts(buildDayMetadata)에 위임 — [week]/[day] 라우트와 공유(Step5 A-0).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, slug, day } = await params;
  if (!isSupportedCategory(category)) return {};
  const d = parseDaySegment(day, 'day');
  if (d === null) return {};
  return buildDayMetadata(category, slug, FREE_WEEK, d);
}

export default async function Week1DayPage({ params }: PageProps) {
  const { category, slug, day } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const d = parseDaySegment(day, 'day');
  if (d === null) notFound();
  const content = await getDay(category, slug, FREE_WEEK, d);
  if (!content) notFound();

  // 무료 주차는 게이팅이 없다 — locked/loggedIn을 항상 고정값으로 넘긴다. cookies()/getCurrentUser()
  // 를 여기서 호출하면 SSG가 깨진다(DayView 주석 참고).
  return (
    <DayView category={category} slug={slug} w={FREE_WEEK} d={d} lang={lang} content={content} locked={false} loggedIn={false} />
  );
}
