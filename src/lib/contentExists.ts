import { isSection } from './category';
import { getAllDays, getCertMeta } from './content';
import { parseDaySegment } from './day/segment';
import { FREE_WEEK } from './entitlement/policy';

// docs/SEO-indexing-fix-plan.md Step6 소프트 404 수정용 존재 검증.
//
// 왜 proxy(src/proxy.ts)에서 이 함수가 필요한가: root loading.tsx가 전역 스트리밍을 켜놓아
// page.tsx 내부의 notFound()는 헤더가 이미 200으로 나간 뒤 호출되므로 상태코드를 바꿀 수 없다
// (Next.js 16.2.6 loading.md "Status Codes" 절 실측 확인 — 스트리밍 시작 후에는 상태코드
// 변경 불가). 존재 여부를 렌더 시작 "전"인 proxy 단계에서 판정해 진짜 라우트 불일치로 만들면
// (src/proxy.ts가 3세그먼트 마커로 rewrite) Next가 프리렌더된 not-found를 그대로 내보내
// 실제 404가 나간다 — 렌더 자체를 시작하지 않으므로 스트리밍 문제가 애초에 발생하지 않는다.
//
// day(week1) 존재 여부는 검증하지 않는다 — [category]/[slug]/week1/[day]/page.tsx의 주석과
// 동일한 이유(신규 day 콘텐츠가 재배포 전에도 즉시 열람 가능해야 함).
//
// 2주차 이상([week]/[day])은 첫 요청 때 렌더되어 배포까지 캐시된다(docs/P3-step1-day-cache-design.md
// 4장). proxy 는 캐시된 페이지에도 요청마다 먼저 실행되고, 이 함수의 getAllDays 와 캐시된 본문은
// 같은 배포에 묶인 content/ 에서 나오며 ISR 캐시도 배포 단위다. 그래서 한 배포 안에서 "캐시에는
// 있는데 여기서는 없다고 판정" 하거나 그 반대가 생기지 않는다.
//
// week·day 세그먼트는 정규형(`week2`, `day10` — 선행 0 없는 10진수)만 존재한다고 본다. 페이지가
// URL 별로 캐시되므로 "day1abc"·"week02" 같은 변형을 통과시키면 변형마다 본문이 따로 캐시된다.
// 판정 규칙은 페이지와 같은 parseDaySegment 하나를 쓴다.
export async function contentPathExists(pathname: string): Promise<boolean> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return true; // /aws-certs, /en 자체는 카테고리 라우트가 별도로 처리.

  const [category, slug, weekSeg, daySeg] = segments;
  // 섹션 하위의 후기 라우트(/{section}/reviews[/{cert}]) 검증. 이 라우트는 force-dynamic이라
  // 페이지 내부 notFound()가 스트리밍 때문에 200으로 누수된다(day 라우트와 동일 메커니즘) —
  // 그래서 존재 여부를 여기(렌더 전)서 판정해 잘못된 cert는 진짜 404 마커로 리라이트한다.
  if (slug === 'reviews') {
    if (segments.length === 2) return true; // /{section}/reviews 허브
    if (segments.length !== 3) return false; // 더 깊은 경로 없음
    // /{section}/reviews/{cert} — cert가 이 섹션에 실제로 존재해야 한다.
    try {
      const rm = await getCertMeta(category, segments[2]);
      if (isSection(category) && rm.section !== category) return false; // 교차 섹션 차단
      return true;
    } catch {
      return false;
    }
  }
  let meta;
  try {
    meta = await getCertMeta(category, slug);
  } catch {
    return false; // 존재하지 않는 자격증 slug.
  }
  // 교차 섹션 URL 차단: aws·linux가 같은 폴더에 공존하므로 getCertMeta는 섹션을 안 가린다.
  // /linux/{aws-slug}/... 같은 조합이 aws 콘텐츠를 렌더하는 중복 색인 구멍을 여기서 막는다.
  if (isSection(category) && meta.section !== category) return false;

  if (segments.length === 2) return true; // 자격증 허브 — slug 존재만 검증.
  if (segments.length !== 4) return true; // 그 외 깊이는 애초에 어떤 라우트도 매칭하지 않는다.

  const week = parseDaySegment(weekSeg, 'week');
  const day = parseDaySegment(daySeg, 'day');
  if (week === null || day === null) return false; // 형식이 아니거나 정규형이 아닌 변형.
  if (week === FREE_WEEK) return true; // week1 은 day 번호의 존재 여부를 검증하지 않음(위 주석).

  const days = await getAllDays(category, slug);
  return days.some((d) => d.week === week && d.day === day);
}
