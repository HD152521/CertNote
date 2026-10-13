// content/**의 "## 📌 핵심 정리" 섹션을 본문에서 뽑아 렌더러가 맨 위 카드로 보여줄 수 있게
// 하는 순수 함수. content/** 파일 자체는 건드리지 않는다 — 렌더링 전용 유틸이다.
//
// 콘텐츠 규약(확정): H1 제목 다음에 "## 📌 핵심 정리" H2 섹션이 오고, 그 안에 불릿 3~5개가
// 이어진다. 아직 이 형식으로 바뀌지 않은 문서가 대부분이므로, 섹션이 없으면 summary=null을
// 반환해 호출부가 카드를 렌더하지 않고 기존처럼 본문 전체를 그대로 쓰게 한다(안전 요구사항).

export interface DaySummaryResult {
  /** 추출된 요약 마크다운(헤딩 줄 제외, 앞뒤 공백 트리밍). 섹션이 없으면 null. */
  summary: string | null;
  /** 요약 섹션이 제거된 나머지 본문. 섹션이 없으면 원본 그대로("body"는 항상 렌더 가능한 전체 본문). */
  body: string;
}

// 이모지를 하드코딩하지 않고 "핵심 정리" 텍스트로만 매칭한다 — 이모지가 바뀌거나 빠져도
// (예: "## 핵심 정리") 안전하게 인식한다. 뒤에 다른 말이 붙은 헤딩("## 핵심 정리 문제" 등)은
// $ 앵커 때문에 매칭되지 않는다.
const SUMMARY_HEADING_RE = /^##\s+.*핵심\s*정리\s*$/;
// 요약 섹션의 끝: 다음 H1 또는 H2(요약과 같거나 더 얕은 레벨) 헤딩. 요약 섹션 안에는 H3 이하가
// 나오지 않는 게 규약이지만, 혹시 나오더라도 경계로 취급하지 않는다.
const SECTION_BOUNDARY_RE = /^#{1,2}\s+/;
const CODE_FENCE_RE = /^\s*```/;

/** 코드펜스 안이 아닌 첫 매칭 라인의 인덱스. 없으면 -1. */
function findLineOutsideCodeFence(lines: string[], from: number, test: (line: string) => boolean): number {
  let inCode = false;
  for (let i = from; i < lines.length; i++) {
    if (CODE_FENCE_RE.test(lines[i])) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (test(lines[i])) return i;
  }
  return -1;
}

export function extractDaySummary(markdown: string): DaySummaryResult {
  const lines = markdown.split(/\r?\n/);

  const startIndex = findLineOutsideCodeFence(lines, 0, (line) => SUMMARY_HEADING_RE.test(line));
  if (startIndex === -1) {
    return { summary: null, body: markdown };
  }

  const boundaryIndex = findLineOutsideCodeFence(lines, startIndex + 1, (line) => SECTION_BOUNDARY_RE.test(line));
  const endIndex = boundaryIndex === -1 ? lines.length : boundaryIndex;

  const summaryText = lines.slice(startIndex + 1, endIndex).join('\n').trim();
  const remainingLines = [...lines.slice(0, startIndex), ...lines.slice(endIndex)];
  // 섹션 제거로 생기는 빈 줄 뭉치를 문단 구분(빈 줄 1개) 수준으로 정리한다.
  const body = remainingLines.join('\n').replace(/\n{3,}/g, '\n\n');

  return { summary: summaryText.length > 0 ? summaryText : null, body };
}
