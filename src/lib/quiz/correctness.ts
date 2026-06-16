const CHOICE = /^[A-E]$/;

function toSet(s: string): Set<string> {
  return new Set(
    s
      .split(/[,/\s]+/)
      .map((x) => x.trim().toUpperCase())
      .filter((x) => CHOICE.test(x)),
  );
}

// 정답 문자열(예: "B" 또는 "B, D")을 보기 집합으로 변환한다.
export function parseCorrectSet(answer: string): Set<string> {
  return toSet(answer);
}

// 사용자가 고른 보기들(예: "B" 또는 "B,D")을 정규화된 집합으로 변환한다.
export function parseSelectedSet(selected: string): Set<string> {
  return toSet(selected);
}

// 복수 정답 문제인지 여부(정답이 2개 이상).
export function isMultiAnswer(answer: string): boolean {
  return parseCorrectSet(answer).size > 1;
}

// 정답 개수("N개 선택" 안내용).
export function answerCount(answer: string): number {
  return parseCorrectSet(answer).size;
}

// 선택을 정규화된 표준 문자열("B" 또는 "B,D")로 만든다. 유효한 보기가 없으면 null.
export function normalizeSelection(selected: string): string | null {
  const set = toSet(selected);
  if (set.size === 0) return null;
  return [...set].sort().join(',');
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// 선택 집합이 정답 집합과 정확히 일치해야 정답(복수 정답은 전부 골라야 하고, 초과 선택도 오답).
export function isSelectionCorrect(answer: string, selected: string): boolean {
  return setsEqual(parseCorrectSet(answer), parseSelectedSet(selected));
}
