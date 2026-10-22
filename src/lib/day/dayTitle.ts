// day 본문 제목은 "Day 1 - 주제" 꼴이다. 검색 결과 제목 자리는 짧아서 앞의 "Day 1 -" 가 주제어를 밀어내므로,
// title·구조화 데이터 headline 에서는 뗀다. 화면의 H1 은 본문(마크다운) 그대로 둔다.
const DAY_PREFIX = /^Day\s*\d+\s*[-–—:]\s*/i;

export function stripDayPrefix(title: string): string {
  const stripped = title.replace(DAY_PREFIX, '').trim();
  return stripped || title;
}

// generateMetadata 의 title 과 Article JSON-LD 의 headline 이 같은 문자열을 쓴다.
export function dayHeadline(title: string, certCode: string): string {
  return `${stripDayPrefix(title)} — ${certCode}`;
}
