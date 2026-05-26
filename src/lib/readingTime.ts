// 한국어 + 코드 혼합 본문의 대략적인 읽기 시간 추정.
// 한국어 평균 ~450자/분 기준.

export function readingTimeMinutes(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, '   ')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>`-]/g, '')
    .replace(/\s+/g, '');
  const chars = stripped.length;
  return Math.max(1, Math.round(chars / 450));
}
