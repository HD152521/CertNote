// 튜터 요청의 `selected`(사용자가 고른 보기) 검증·정규화.
//
// 퀴즈 UI(Quiz.tsx, ReviewSession.tsx)는 보기 글자를 정렬해 쉼표로 이어 보낸다: "B", "B,D".
// 이 값은 LLM 프롬프트와 설명 캐시 키(tutor_explanations.selected)에 그대로 들어가므로,
// 자유 텍스트를 받으면 프롬프트 주입·캐시 오염·비용 증폭(긴 입력)의 통로가 된다. 그래서 형식을 엄격히 제한한다.

// "A, B, C, D, E"(13자)까지 여유를 둔 상한. 정규화 결과는 최대 9자("A,B,C,D,E").
export const MAX_SELECTED_LENGTH = 16;

// 글자(A~E)가 공백/쉼표로만 구분된 형태. 소문자·다른 구분자·개행은 거부한다.
const SELECTED_PATTERN = /^[A-E](?:[ ,]+[A-E])*$/;

// 허용되면 정렬·중복 제거한 정규형("B,D")을, 아니면 null 을 돌려준다.
// 정규형을 쓰는 이유: "D,B" 와 "B, D" 가 서로 다른 캐시 행(=중복 LLM 호출)이 되는 것을 막는다.
export function normalizeSelected(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length > MAX_SELECTED_LENGTH) return null;
  const trimmed = raw.trim();
  if (!SELECTED_PATTERN.test(trimmed)) return null;
  const letters = new Set(trimmed.match(/[A-E]/g));
  return [...letters].sort().join(',');
}
