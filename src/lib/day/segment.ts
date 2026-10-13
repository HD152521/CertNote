// day 관련 URL 세그먼트("week1", "day3") 파싱 단일 출처.
//
// [category]/[slug]/[week]/[day](전체 라우트)와 [category]/[slug]/week1/[day](week1 전용 정적
// 라우트) 양쪽이 "day3" 형태의 세그먼트를 정수로 파싱한다. prefix 뒤가 "정규형 양의 정수"
// (`[1-9]\d*`)가 아니면 null — 호출부가 notFound()로 처리한다.
//
// 엄격해야 하는 이유: 이 라우트는 렌더 결과를 URL 단위로 캐시한다. parseInt 처럼 느슨하게 파싱하면
// `week2abc`·`week02`·`day1.5` 가 전부 week2/day1 과 같은 본문으로 렌더돼 (1) 중복 색인, (2) 임의
// 문자열 수만큼 캐시 항목이 쌓이는 캐시 오염이 생긴다.
const CANONICAL_INT = /^[1-9]\d*$/;

export function parseDaySegment(seg: string, prefix: string): number | null {
  if (!seg.startsWith(prefix)) return null;
  const digits = seg.slice(prefix.length);
  if (!CANONICAL_INT.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
