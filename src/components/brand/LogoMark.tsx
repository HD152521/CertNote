import {
  BRAND_INK,
  BRAND_TEAL,
  MARK_CHECK_PATH,
  MARK_RING_PATH,
  MARK_STROKE,
  MARK_TILE,
  MARK_VIEWBOX,
} from '@/lib/brand';

interface LogoMarkProps {
  readonly className?: string;
}

// 장식용 마크. 옆에 항상 "CertNote" 글자가 함께 나오므로 스크린리더에서는 숨긴다.
export function LogoMark({ className }: LogoMarkProps) {
  const { x, y, size, radius } = MARK_TILE;
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false" className={className}>
      <rect x={x} y={y} width={size} height={size} rx={radius} className="fill-[#12233F] dark:fill-[#1B2B4B]" />
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
  );
}
