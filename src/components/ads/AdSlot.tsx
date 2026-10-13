'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isAdEligiblePath } from '@/lib/ads/adEligibility';
import { registerAdSlot } from '@/lib/ads/adSlotRegistry';
import { getAdSenseClient, parseAdSlotId } from '@/lib/ads/adsense';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSlotProps {
  /** 애드센스 광고 단위 ID(숫자). 없거나 형식이 틀리면 아무것도 렌더하지 않는다. */
  slot: string | null | undefined;
  /** data-ad-format. 기본 auto(반응형). height 를 주면 쓰이지 않는다. */
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical';
  /** data-ad-layout. 인아티클 광고는 format="fluid" 와 함께 "in-article" 을 준다. */
  layout?: string;
  /** 광고가 뜨기 전에 미리 차지할 높이(px). 늦게 뜬 광고가 본문을 밀지 않게 한다. */
  minHeight?: number;
  /**
   * <ins> 의 높이(px). 주면 고정 높이 단위가 된다 — 폭은 컨테이너를 따르고(width:100%) 높이만 못 박으며,
   * data-ad-format 과 data-full-width-responsive 를 내지 않는다. 애드센스가 이 크기에 맞는 광고만
   * 요청하므로 광고가 늦게 뜨든 안 뜨든 높이가 변하지 않는다.
   *
   * 반드시 인라인 style 로 낸다. 애드센스 도움말 "How to modify your responsive ad code"
   * (support.google.com/adsense/answer/9183363)는 이 수정을 허용하면서도 "외부 스타일시트의 CSS 로
   * 광고 단위 크기를 정하는 것은 공식 지원하지 않는다"고 적는다 — Tailwind 클래스는 외부 스타일시트다.
   */
  height?: number;
  /** 광고가 채워지지 않으면(ins[data-ad-status="unfilled"]) 슬롯 전체를 접는다. 화면 위쪽 슬롯에는 쓰지 말 것. */
  collapseWhenUnfilled?: boolean;
  className?: string;
}

// 미채움 판정은 애드센스가 <ins> 에 붙이는 data-ad-status 를 CSS(:has)로 읽는다. JS 로 상태를 들고
// 다시 렌더하지 않으므로 하이드레이션·리렌더와 엮이지 않는다.
const COLLAPSE_WHEN_UNFILLED = 'has-[ins[data-ad-status=unfilled]]:hidden';
// "광고" 표기는 광고가 실제로 채워졌을 때만 보인다. 미채움뿐 아니라 광고 차단기로 스크립트가 막힌
// 경우(data-ad-status 가 아예 붙지 않는다)에도 빈 칸에 표기만 남지 않게, 기본을 감춤으로 둔다.
// invisible 은 자리를 그대로 차지하므로 보이게 바뀌는 순간에도 높이가 변하지 않는다.
const SHOW_LABEL_WHEN_FILLED = 'invisible group-has-[ins[data-ad-status=filled]]:visible';
// 표기 한 줄이 차지하는 높이(px): leading-4(16) + mb-1(4). 아래 span 의 클래스와 함께 바꿀 것.
const AD_LABEL_HEIGHT_PX = 20;

// 광고 슬롯 하나(docs/P3-adsense-readiness-plan.md Step 9). 로더(AdSenseLoader)가 실린 페이지에서만
// 채워진다. 게시자 ID·슬롯 ID 가 없거나 제외 경로면 빈 상자도 남기지 않는다.
//
// 주의: 경로 판정은 주소창 기준(usePathname)이다. 로그인 사용자의 학습 홈은 주소가 `/` 라
// 여기서 걸러지지 않는다 — src/app/home 에는 이 컴포넌트를 두지 말 것(로더가 없어 빈 자리만 남는다).
// 어디에 어떤 크기로 두는지는 src/lib/ads/adPlacements.ts 가 정한다(Step 10).
export function AdSlot({
  slot,
  format = 'auto',
  layout,
  minHeight,
  height,
  collapseWhenUnfilled = false,
  className,
}: AdSlotProps) {
  const pathname = usePathname();
  const lang = useLanguage();
  const client = getAdSenseClient();
  const slotId = parseAdSlotId(slot);
  const enabled = Boolean(client && slotId) && isAdEligiblePath(pathname);
  // <ins> 하나에 push 는 한 번만. 두 번 부르면 애드센스가 "already have ads" 예외를 던진다
  // (개발 모드 StrictMode 의 effect 재실행 포함).
  const pushedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || pushedFor.current === pathname) return;
    pushedFor.current = pathname;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // 광고 요청 실패(차단기, 폭 0 인 컨테이너 등)는 본문과 무관하다. 화면을 깨뜨리지 않고 넘긴다.
    }
  }, [enabled, pathname]);

  // 화면에 광고가 있는 동안만 떠 있는 버튼들이 겹침을 검사한다(useOverlapsAd). 렌더되지 않는 슬롯은
  // 등록하지 않으므로 광고 환경변수가 없는 빌드에서는 그 검사가 아예 돌지 않는다.
  useEffect(() => (enabled ? registerAdSlot() : undefined), [enabled]);

  if (!enabled) return null;

  const label = lang === 'en' ? 'Advertisement' : '광고';
  const isFixedHeight = height !== undefined;
  // 바깥 영역이 미리 차지할 높이. 고정 높이 단위는 표기 + 광고 높이로 정해진다.
  const reservedHeight = isFixedHeight ? height + AD_LABEL_HEIGHT_PX : minHeight;

  return (
    <aside
      aria-label={label}
      className={cn('group', collapseWhenUnfilled && COLLAPSE_WHEN_UNFILLED, className)}
      style={reservedHeight ? { minHeight: reservedHeight } : undefined}
    >
      {/* 눈에 보이는 광고 표기(애드센스 정책: 본문과 광고를 구분). 높이를 고정(AD_LABEL_HEIGHT_PX)해
          슬롯 전체 높이가 표기 유무·글꼴 로딩에 흔들리지 않게 한다. 영역 레이블과 겹치므로 보조기기에는 숨긴다. */}
      <span aria-hidden="true" className={cn('mb-1 block text-[11px] leading-4 text-fg-muted', SHOW_LABEL_WHEN_FILLED)}>
        {label}
      </span>
      {/* key: 클라이언트 내비게이션으로 같은 자리의 슬롯이 재사용되면 이미 채워진 <ins> 가 남는다.
          경로가 바뀔 때 새 요소로 갈아 끼워 위 effect 의 push 가 새 광고를 요청하게 한다. */}
      <ins
        key={pathname}
        className="adsbygoogle"
        style={isFixedHeight ? { display: 'block', width: '100%', height } : { display: 'block' }}
        data-ad-client={client ?? undefined}
        data-ad-slot={slotId ?? undefined}
        data-ad-format={isFixedHeight ? undefined : format}
        data-ad-layout={layout}
        data-full-width-responsive={!isFixedHeight && format === 'auto' ? 'true' : undefined}
      />
    </aside>
  );
}
