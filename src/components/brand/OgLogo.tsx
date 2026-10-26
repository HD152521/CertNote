import {
  BRAND_INK,
  BRAND_NAVY_DARK,
  BRAND_TEAL,
  MARK_CHECK_PATH,
  MARK_RING_PATH,
  MARK_STROKE,
  MARK_TILE,
  MARK_VIEWBOX,
} from '@/lib/brand';

// OG 카드(next/og ImageResponse)용 마크 + 워드마크. satori 는 Tailwind 클래스를 모르므로 색을 직접 쓴다.
// 카드 배경이 남색이라 타일은 한 단계 밝은 남색으로 둬 윤곽이 보이게 한다.
export const OG_BACKGROUND = 'linear-gradient(135deg, #0B1628 0%, #12233F 60%, #1B2B4B 100%)';
export const OG_ACCENT = '#2DD4BF';

interface OgLogoProps {
  readonly fontSize: number;
}

export function OgLogo({ fontSize }: OgLogoProps) {
  const { x, y, size, radius } = MARK_TILE;
  const markSize = Math.round(fontSize * 1.3);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={markSize} height={markSize} viewBox={MARK_VIEWBOX}>
        <rect x={x} y={y} width={size} height={size} rx={radius} fill={BRAND_NAVY_DARK} />
        <path d={MARK_RING_PATH} fill="none" stroke={BRAND_INK} strokeWidth={MARK_STROKE} strokeLinecap="round" />
        <path
          d={MARK_CHECK_PATH}
          fill="none"
          stroke={BRAND_TEAL}
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ display: 'flex', fontSize, fontWeight: 700, letterSpacing: -1 }}>
        <span>Cert</span>
        <span style={{ color: OG_ACCENT }}>Note</span>
      </div>
    </div>
  );
}
