// CertNote 로고(B안: 둥근 남색 사각형 + C 고리 + 체크)의 단일 정의.
// 헤더 마크, OG 카드, scripts/build-brand-icons.mjs 가 모두 이 값을 쓴다. 모양을 바꾸면 아이콘을 다시 만든다.
export const BRAND_NAVY = '#12233F';
export const BRAND_NAVY_DARK = '#1B2B4B';
export const BRAND_TEAL = '#14B8A6';
export const BRAND_INK = '#FFFFFF';

export const MARK_VIEWBOX = '0 0 64 64';
export const MARK_TILE = { x: 2, y: 2, size: 60, radius: 16 } as const;
export const MARK_RING_PATH = 'M44 20.5A15 15 0 1 0 44 43.5';
export const MARK_CHECK_PATH = 'M30 32l5 5 11-12';
export const MARK_STROKE = 6;

interface MarkSvgOptions {
  readonly tile?: string;
  readonly ink?: string;
  readonly stroke?: number;
  // 마스커블 아이콘처럼 사각형 전체를 칠하고 안쪽만 그릴 때 쓴다(0~1, 1이면 원래 크기).
  readonly fullBleedScale?: number;
}

// 정적 SVG 문자열. 아이콘 생성 스크립트와 app/icon.svg 가 이 결과와 같아야 한다(brand.test.ts 가 확인).
export function markSvg({ tile = BRAND_NAVY, ink = BRAND_INK, stroke = MARK_STROKE, fullBleedScale }: MarkSvgOptions = {}): string {
  const strokes =
    `<path d="${MARK_RING_PATH}" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round"/>` +
    `<path d="${MARK_CHECK_PATH}" fill="none" stroke="${BRAND_TEAL}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (fullBleedScale !== undefined) {
    const offset = 32 * (1 - fullBleedScale);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
      `<rect width="64" height="64" fill="${tile}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${fullBleedScale})">${strokes}</g></svg>`
    );
  }
  const { x, y, size, radius } = MARK_TILE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${tile}"/>${strokes}</svg>`
  );
}
