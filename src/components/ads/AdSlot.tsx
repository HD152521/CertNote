'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isAdEligiblePath } from '@/lib/ads/adEligibility';
import { getAdSenseClient, parseAdSlotId } from '@/lib/ads/adsense';
import { useLanguage } from '@/lib/i18n-client';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSlotProps {
  /** 애드센스 광고 단위 ID(숫자). 없거나 형식이 틀리면 아무것도 렌더하지 않는다. */
  slot: string | undefined;
  /** data-ad-format. 기본 auto(반응형). */
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical';
  /** data-ad-layout. 인아티클 광고는 format="fluid" 와 함께 "in-article" 을 준다. */
  layout?: string;
  /** 광고가 뜨기 전에 미리 차지할 높이(px). 늦게 뜬 광고가 본문을 밀지 않게 한다. */
  minHeight?: number;
  className?: string;
}

// 광고 슬롯 하나(docs/P3-adsense-readiness-plan.md Step 9). 로더(AdSenseLoader)가 실린 페이지에서만
// 채워진다. 게시자 ID·슬롯 ID 가 없거나 제외 경로면 빈 상자도 남기지 않는다.
//
// 주의: 경로 판정은 주소창 기준(usePathname)이다. 로그인 사용자의 학습 홈은 주소가 `/` 라
// 여기서 걸러지지 않는다 — src/app/home 에는 이 컴포넌트를 두지 말 것(로더가 없어 빈 자리만 남는다).
export function AdSlot({ slot, format = 'auto', layout, minHeight, className }: AdSlotProps) {
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

  if (!enabled) return null;

  return (
    <aside
      aria-label={lang === 'en' ? 'Advertisement' : '광고'}
      className={className}
      style={minHeight ? { minHeight } : undefined}
    >
      {/* key: 클라이언트 내비게이션으로 같은 자리의 슬롯이 재사용되면 이미 채워진 <ins> 가 남는다.
          경로가 바뀔 때 새 요소로 갈아 끼워 위 effect 의 push 가 새 광고를 요청하게 한다. */}
      <ins
        key={pathname}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client ?? undefined}
        data-ad-slot={slotId ?? undefined}
        data-ad-format={format}
        data-ad-layout={layout}
        data-full-width-responsive={format === 'auto' ? 'true' : undefined}
      />
    </aside>
  );
}
