// CountUp 의 순수 로직. 서버 렌더와 클라이언트 애니메이션이 같은 함수로 문자열을 만들어
// 최종값 문자열이 한 글자도 다르지 않게 한다(hydration 불일치 방지).

export const COUNT_UP_MS = 900;

export interface FigureFormat {
  prefix?: string;
  suffix?: string;
  locale: string;
}

export function formatFigure(value: number, { prefix = '', suffix = '', locale }: FigureFormat): string {
  return `${prefix}${value.toLocaleString(locale)}${suffix}`;
}

// 0 이나 유한하지 않은 값, 음수는 올릴 필요가 없다(₩0 같은 값은 그대로 둔다).
export function isAnimatable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

// 경과 시간에 대응하는 표시 값. 끝(elapsed >= COUNT_UP_MS)에서는 항상 정확히 최종값이다.
export function valueAt(elapsedMs: number, target: number): number {
  if (elapsedMs >= COUNT_UP_MS) return target;
  return Math.floor(target * easeOutCubic(elapsedMs / COUNT_UP_MS));
}
