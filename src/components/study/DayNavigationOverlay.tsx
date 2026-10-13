'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Box } from '@/lib/ads/adOverlap';
import { useOverlapsAd } from '@/lib/ads/useOverlapsAd';

interface DayNavigationOverlayProps {
  prevHref?: string;
  nextHref?: string;
}

// 아래 버튼 클래스(w-12 h-12, left-2/right-2, top-1/2)와 같은 값. 버튼은 탭해야 그려지므로
// "나타날 자리"를 좌표로 계산해 광고와 겹치는지 미리 판정한다 — 클래스를 바꾸면 함께 바꿀 것.
const BUTTON_SIZE_PX = 48;
const BUTTON_EDGE_OFFSET_PX = 8;

function buttonBoxes(hasPrev: boolean, hasNext: boolean): Box[] {
  const viewportWidth = document.documentElement.clientWidth;
  const top = window.innerHeight / 2 - BUTTON_SIZE_PX / 2;
  const bottom = top + BUTTON_SIZE_PX;
  const boxes: Box[] = [];
  if (hasPrev) {
    boxes.push({ left: BUTTON_EDGE_OFFSET_PX, right: BUTTON_EDGE_OFFSET_PX + BUTTON_SIZE_PX, top, bottom });
  }
  if (hasNext) {
    const right = viewportWidth - BUTTON_EDGE_OFFSET_PX;
    boxes.push({ left: right - BUTTON_SIZE_PX, right, top, bottom });
  }
  return boxes;
}

export function DayNavigationOverlay({ prevHref, nextHref }: DayNavigationOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  // 버튼 자리가 광고와 겹치거나 바로 옆이면 띄우지 않는다(애드센스 오클릭 정책 —
  // docs/P3-adsense-readiness-plan.md Step 10). 탭한 순간뿐 아니라 떠 있는 3초 동안 스크롤로 광고가
  // 밑에 들어와도 바로 숨는다. 화면에 광고가 없으면 항상 false 이고 리스너도 달리지 않는다.
  const overlapsAd = useOverlapsAd(() => buttonBoxes(Boolean(prevHref), Boolean(nextHref)));
  const showButtons = isVisible && !overlapsAd;
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);

  // 화면 클릭 시 화살표 표시
  useEffect(() => {
    function handleClick() {
      setIsVisible(true);

      // 기존 타이머 취소
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }

      // 3초 후 자동 숨김
      const timeout = setTimeout(() => {
        setIsVisible(false);
      }, 3000);

      setHideTimeout(timeout);
    }

    // 모바일 사이즈에서만 적용
    const mediaQuery = window.matchMedia('(max-width: 768px)');

    if (mediaQuery.matches) {
      window.addEventListener('click', handleClick);
    }

    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        window.addEventListener('click', handleClick);
      } else {
        window.removeEventListener('click', handleClick);
        setIsVisible(false);
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('click', handleClick);
      mediaQuery.removeEventListener('change', handleMediaChange);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);

  // 데스크톱에서는 렌더링 안 함
  if (!prevHref && !nextHref) return null;

  return (
    <>
      {/* 이전 버튼 */}
      {prevHref && showButtons && (
        <Link
          href={prevHref}
          className="fixed left-2 top-1/2 -translate-y-1/2 z-40 md:hidden
            w-12 h-12 flex items-center justify-center rounded-full
            bg-fg/20 backdrop-blur-sm hover:bg-fg/30
            transition-all duration-200
            touch-none"
          onClick={(e) => e.stopPropagation()}
          aria-label="Previous day"
        >
          <ChevronLeft className="w-6 h-6 text-fg" strokeWidth={2.5} />
        </Link>
      )}

      {/* 다음 버튼 */}
      {nextHref && showButtons && (
        <Link
          href={nextHref}
          className="fixed right-2 top-1/2 -translate-y-1/2 z-40 md:hidden
            w-12 h-12 flex items-center justify-center rounded-full
            bg-fg/20 backdrop-blur-sm hover:bg-fg/30
            transition-all duration-200
            touch-none"
          onClick={(e) => e.stopPropagation()}
          aria-label="Next day"
        >
          <ChevronRight className="w-6 h-6 text-fg" strokeWidth={2.5} />
        </Link>
      )}
    </>
  );
}
