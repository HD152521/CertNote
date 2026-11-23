'use client';

import { useLayoutEffect, useRef } from 'react';
import { COUNT_UP_MS, formatFigure, isAnimatable, valueAt, type FigureFormat } from '@/components/marketing/countUpFormat';

interface CountUpProps extends FigureFormat {
  value: number;
  className?: string;
}

// 숫자가 0 에서 최종값까지 올라가는 효과(홈 숫자 띠). 서버 HTML 에는 최종값이 그대로 들어 있고(SEO·JS 없는 환경),
// 효과는 마운트 뒤 DOM 텍스트만 직접 바꾼다 — React 상태를 쓰지 않아 hydration 불일치와 재렌더가 없다.
// 마운트 시점에 화면 밖이던 숫자만 들어올 때 한 번 재생하고, 이미 화면 안이면 최종값을 그대로 둔다(깜박임 없음).
// 폭은 최종값 글자 수(ch)로 고정해 자릿수가 바뀌어도 레이아웃이 움직이지 않는다.
export function CountUp({ value, prefix, suffix, locale, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = formatFigure(value, { prefix, suffix, locale });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !isAnimatable(value)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let observer: IntersectionObserver | null = null;
    const fmt = { prefix, suffix, locale };

    const play = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        el.textContent = formatFigure(valueAt(elapsed, value), fmt);
        if (elapsed < COUNT_UP_MS) frame = requestAnimationFrame(tick);
      };
      el.textContent = formatFigure(0, fmt);
      frame = requestAnimationFrame(tick);
    };

    // 마운트 시점에 이미 화면 안이면 효과 없이 최종값 유지(최종값→0 깜박임 방지). 화면 밖(아래)이면 들어올 때 한 번 재생한다.
    const rect = el.getBoundingClientRect();
    const isVisibleNow = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisibleNow && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer?.disconnect();
        play();
      });
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = finalText;
    };
  }, [value, prefix, suffix, locale, finalText]);

  return (
    <span
      ref={ref}
      className={`inline-block tabular-nums ${className ?? ''}`.trim()}
      style={{ minWidth: `${finalText.length}ch` }}
    >
      {finalText}
    </span>
  );
}
