// 정답 문자열(예: "B" 또는 "B, D")을 보기 집합으로 변환한다.
export function parseCorrectSet(answer: string): Set<string> {
  return new Set(
    answer
      .split(/[,/\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-E]$/.test(s)),
  );
}

// 현재 UI는 한 개만 고르므로, 고른 보기가 정답 집합에 포함되면 정답으로 본다.
export function isSelectionCorrect(answer: string, selected: string): boolean {
  return parseCorrectSet(answer).has(selected.trim().toUpperCase());
}
