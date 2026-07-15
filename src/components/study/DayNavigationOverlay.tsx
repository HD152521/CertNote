'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DayNavigationOverlayProps {
  prevHref?: string;
  nextHref?: string;
}

export function DayNavigationOverlay({ prevHref, nextHref }: DayNavigationOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
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
      {prevHref && isVisible && (
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
      {nextHref && isVisible && (
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
