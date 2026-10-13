import { DEFAULT_CATEGORY, SUPPORTED_CATEGORIES, isSection } from './category';
import { getAllDays, getCategoryIndex, getCertMeta } from './content';
import { parseDaySegment } from './day/segment';

// docs/SEO-indexing-fix-plan.md Step6 소프트 404 수정용 존재 검증.
//
// 왜 proxy(src/proxy.ts)에서 이 함수가 필요한가: root loading.tsx가 전역 스트리밍을 켜놓아
// page.tsx 내부의 notFound()는 헤더가 이미 200으로 나간 뒤 호출되므로 상태코드를 바꿀 수 없다
// (Next.js 16.2.6 loading.md "Status Codes" 절 실측 확인 — 스트리밍 시작 후에는 상태코드
// 변경 불가). 존재 여부를 렌더 시작 "전"인 proxy 단계에서 판정해 진짜 라우트 불일치로 만들면
// (src/proxy.ts가 3세그먼트 마커로 rewrite) Next가 프리렌더된 not-found를 그대로 내보내
// 실제 404가 나간다 — 렌더 자체를 시작하지 않으므로 스트리밍 문제가 애초에 발생하지 않는다.
//
// week1 포함 모든 day의 존재를 검증한다. 콘텐츠(마크다운)는 배포로만 바뀌고 배포마다 이 프로세스의
// 콘텐츠 메모이즈·페이지 캐시가 새로 시작되므로 "재배포 전 신규 day 열람" 요구는 성립하지 않는다.
// 검증이 없으면 /week1/day999 가 렌더 도중 notFound()로 가며 스트리밍 때문에 200(소프트 404)이 나가고,
// 그 응답이 캐시될 수 있다.
// 파일시스템 탐침이 아니라 콘텐츠 인덱스(index.json)의 slug 목록과 정확히(대소문자 포함) 대조한다.
// Windows·macOS 같은 대소문자 무시 파일시스템에서 /aws/SAA-C03 이 통과하면 안 되기 때문이다.
async function certSlugExists(category: string, slug: string): Promise<boolean> {
  try {
    const idx = await getCategoryIndex(category);
    return idx.certs.some((c) => c.slug === slug);
  } catch {
    return false;
  }
}

const KNOWN_CATEGORIES: readonly string[] = [...SUPPORTED_CATEGORIES, DEFAULT_CATEGORY];

export async function contentPathExists(pathname: string): Promise<boolean> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return segments.length === 0 || KNOWN_CATEGORIES.includes(segments[0]); // /aws-certs, /en 허브는 카테고리 라우트가 처리.

  const [category, slug, weekSeg, daySeg] = segments;
  // 알 수 없는 category(/foo/bar/week2/day1, /AWS/...)는 전부 없는 경로. 정확 일치만 인정한다.
  if (!KNOWN_CATEGORIES.includes(category)) return false;
  // 섹션 하위의 후기 라우트(/{section}/reviews[/{cert}]) 검증. 이 라우트는 force-dynamic이라
  // 페이지 내부 notFound()가 스트리밍 때문에 200으로 누수된다(day 라우트와 동일 메커니즘) —
  // 그래서 존재 여부를 여기(렌더 전)서 판정해 잘못된 cert는 진짜 404 마커로 리라이트한다.
  if (slug === 'reviews') {
    if (segments.length === 2) return true; // /{section}/reviews 허브
    if (segments.length !== 3) return false; // 더 깊은 경로 없음
    // /{section}/reviews/{cert} — cert가 이 섹션에 실제로 존재해야 한다.
    try {
      if (!(await certSlugExists(category, segments[2]))) return false;
      const rm = await getCertMeta(category, segments[2]);
      if (isSection(category) && rm.section !== category) return false; // 교차 섹션 차단
      return true;
    } catch {
      return false;
    }
  }
  if (!(await certSlugExists(category, slug))) return false; // 없는 slug·대소문자 불일치.
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

  // 엄격 파싱(정규형 양의 정수만) — week02·day1abc 같은 별칭 URL이 존재하는 day로 통과하면
  // 캐시되는 라우트에 임의 문자열 수만큼 캐시 항목이 쌓인다(segment.ts 참고).
  const week = parseDaySegment(weekSeg, 'week');
  const day = parseDaySegment(daySeg, 'day');
  if (week === null || day === null) return false;

  const days = await getAllDays(category, slug);
  return days.some((d) => d.week === week && d.day === day);
}
