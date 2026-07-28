// day 관련 URL 세그먼트("week1", "day3") 파싱 단일 출처.
//
// [category]/[slug]/[week]/[day](전체 동적 라우트)와 [category]/[slug]/week1/[day](무료 전용
// 정적 라우트) 양쪽이 "day3" 형태의 세그먼트를 정수로 파싱해야 한다(docs/SEO-indexing-fix-plan.md
// Step5 A-0 — 공유 모듈 추출). prefix가 없거나 숫자가 아니면 null을 반환해 호출부가 notFound()로
// 처리하게 한다.
export function parseDaySegment(seg: string, prefix: string): number | null {
  if (!seg.startsWith(prefix)) return null;
  const n = Number.parseInt(seg.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : null;
}
