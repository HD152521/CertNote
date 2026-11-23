'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useLanguage, t, type Language } from '@/lib/i18n-client';
import { cn } from '@/lib/cn';
import { useOverlapsAd } from '@/lib/ads/useOverlapsAd';
import {
  dismissToast, getServerToastSnapshot, getToastSnapshot, pauseAllToasts, pauseToast, resumeAllToasts, resumeToast, subscribeToasts,
  type ToastItem,
} from '@/lib/toast';

interface ToastListProps {
  items: readonly ToastItem[];
  lang: Language;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}

// 표시만 맡는 부분(시험하기 쉽게 스토어와 분리). 오류는 role="alert"(즉시 읽음), 나머지는 status(조용히 읽음).
// 등장 모션은 .toast-enter — globals.css 에서 prefers-reduced-motion: no-preference 일 때만 움직인다.
export function ToastList({ items, lang, onDismiss, onPause, onResume }: ToastListProps) {
  return (
    <>
      {items.map((item) => {
        const isError = item.tone === 'error';
        return (
          <div
            key={item.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            data-tone={item.tone}
            onMouseEnter={() => onPause(item.id)}
            onMouseLeave={() => onResume(item.id)}
            onFocus={() => onPause(item.id)}
            onBlur={() => onResume(item.id)}
            className={cn(
              'toast-enter pointer-events-auto flex max-w-full items-center gap-1 rounded-full border bg-bg-elevated py-1 pl-4 pr-1 text-sm shadow-lg',
              isError ? 'border-danger text-danger' : 'border-border text-fg',
            )}
          >
            <span className="min-w-0 py-1.5 pr-1.5">{item.message}</span>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onAction();
                  onDismiss(item.id);
                }}
                className="shrink-0 rounded-full px-3 py-1.5 text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label={t(lang, 'close')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-faint transition hover:bg-bg-subtle hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </>
  );
}

// AppShell 에 한 번만 마운트한다. 위치는 헤더 바로 아래 가운데(ResumeReading 이 쓰던 top-[4.5rem]):
// 아래쪽은 피드백 버튼·광고·고정 풀이 버튼이 모이는 곳이라 피한다. 그래도 본문 광고 위에 놓이면
// (애드센스 오클릭 정책) 감추고 남은 시간을 멈췄다가 광고가 지나가면 이어서 보여 준다.
export function ToastViewport() {
  const lang = useLanguage();
  const items = useSyncExternalStore(subscribeToasts, getToastSnapshot, getServerToastSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const overlapsAd = useOverlapsAd(() => {
    const el = ref.current;
    return el && items.length > 0 ? [el.getBoundingClientRect()] : [];
  });

  useEffect(() => {
    if (overlapsAd) pauseAllToasts();
    else resumeAllToasts();
  }, [overlapsAd, items.length]);

  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-[4.5rem] z-30 flex flex-col items-center gap-2 px-4',
        overlapsAd && 'invisible',
      )}
    >
      <ToastList items={items} lang={lang} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />
    </div>
  );
}
