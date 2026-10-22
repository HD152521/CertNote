// day 관련 URL 세그먼트("week1", "day3") 파싱 단일 출처.
//
// {aws,linux,en}/[slug]/[week]/[day](2주차 이상), {aws,linux,en}/[slug]/week1/[day](week1 프리렌더),
// 그리고 proxy 의 존재 검증(src/lib/contentExists.ts)이 같은 규칙으로 세그먼트를 정수로 파싱한다
// (docs/SEO-indexing-fix-plan.md Step5 A-0 — 공유 모듈 추출).
//
// 정규형(`week2`, `day10` — prefix + 선행 0 없는 10진수)만 받아들이고 나머지는 null 을 돌려준다.
// 두 day 라우트 모두 URL 별로 캐시되므로(docs/P3-step1-day-cache-design.md), "day1abc"·"week02"
// 처럼 같은 day 를 가리키는 변형을 통과시키면 변형마다 본문이 따로 캐시되고 중복 URL 이 된다.
const CANONICAL_NUMBER = /^(?:0|[1-9]\d*)$/;

export function parseDaySegment(seg: string, prefix: string): number | null {
  if (!seg.startsWith(prefix)) return null;
  const digits = seg.slice(prefix.length);
  if (!CANONICAL_NUMBER.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
