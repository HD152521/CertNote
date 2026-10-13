'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { overlapsAnyAd, type Box } from './adOverlap';
import { hasMountedAdSlots, subscribeAdSlots } from './adSlotRegistry';

/** 버튼과 광고 사이에 최소한 비워 둘 거리(px). 손가락 한 마디 — 터치 대상 최소 크기(48px)와 같게 잡았다. */
export const AD_CLEARANCE_PX = 48;

function readAdBoxes(): Box[] {
  return Array.from(document.querySelectorAll('ins.adsbygoogle'), (ins) => ins.getBoundingClientRect());
}

/**
 * 화면에 고정된 요소가 지금 광고와 겹치거나 바로 옆(`margin` px 안)에 있는가.
 * 겹치는 동안 호출부는 그 요소를 감춘다(docs/P3-adsense-readiness-plan.md Step 10 — 오클릭 방지).
 *
 * `getTargetBoxes` 는 대상의 뷰포트 기준 사각형을 돌려준다. 아직 그려지지 않은 요소(탭해야 나타나는
 * 이전/다음 화살표)도 "나타날 자리"로 판정할 수 있게 ref 대신 함수를 받는다. 렌더마다 새로 만들어도 된다.
 *
 * 비용: 화면에 AdSlot 이 하나도 없으면(광고 환경변수가 없는 빌드, 광고 없는 화면) 스크롤·리사이즈
 * 리스너를 달지 않고 DOM 도 읽지 않는다. 슬롯이 생기면 달고 사라지면 뗀다.
 *
 * 상태를 effect 에서 setState 로 옮기지 않고 useSyncExternalStore 로 읽는다 — 스크롤 위치는 React
 * 밖의 값이고, 서버·하이드레이션에서는 항상 false 라 서버 HTML 과 어긋나지 않는다.
 */
export function useOverlapsAd(getTargetBoxes: () => Box[], margin: number = AD_CLEARANCE_PX): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    let frame = 0;
    let detach: (() => void) | null = null;

    // 스크롤 이벤트는 프레임당 여러 번 온다. 다음 프레임에 한 번만 다시 잰다.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        onChange();
      });
    };

    const attach = () => {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      // 스크롤 없이 광고가 움직이는 경우(퀴즈 해설이 펼쳐져 아래 내용이 밀림 등)는 문서 높이 변화로 잡는다.
      const resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(document.body);
      return () => {
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        resizeObserver.disconnect();
      };
    };

    const sync = () => {
      const needed = hasMountedAdSlots();
      if (needed && !detach) detach = attach();
      if (!needed && detach) {
        detach();
        detach = null;
      }
      schedule();
    };

    const unsubscribe = subscribeAdSlots(sync);
    if (hasMountedAdSlots()) detach = attach();

    return () => {
      unsubscribe();
      detach?.();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => hasMountedAdSlots() && overlapsAnyAd(getTargetBoxes(), readAdBoxes(), margin),
    () => false,
  );
}
