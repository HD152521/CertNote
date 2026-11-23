'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useLanguage, t, type Language } from '@/lib/i18n-client';
import { cn } from '@/lib/cn';
import { useOverlapsAd } from '@/lib/ads/useOverlapsAd';
import {
  dismissToast, getServerToastSnapshot, getToastSnapshot, pauseToast, resumeToast, setToastsAdPaused, subscribeToasts,
  type ToastItem,
} from '@/lib/toast';

interface ToastListProps {
  items: readonly ToastItem[];
  lang: Language;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}

// 표시만 맡는 부분(시험하기 쉽게 스토어와 분리). live region 역할은 이 목록을 감싸는 ToastViewport 의
// 컨테이너가 맡는다. 등장 모션은 .toast-enter — globals.css 에서 prefers-reduced-motion: no-preference 일 때만 움직인다.
export function ToastList({ items, lang, onDismiss, onPause, onResume }: ToastListProps) {
  return (
    <>
      {items.map((item) => {
        const isError = item.tone === 'error';
        const Icon = item.icon;
        const ActionIcon = item.action?.icon;
        // detail 이 있는 한 줄형(이어 읽기 안내의 소제목 등)은 알약 + 말줄임, 일반 문구는 줄바꿈을 허용한다.
        const oneLine = item.detail !== undefined;
        return (
          <div
            key={item.id}
            data-tone={item.tone}
            onMouseEnter={() => onPause(item.id)}
            onMouseLeave={() => onResume(item.id)}
            onFocus={() => onPause(item.id)}
            onBlur={() => onResume(item.id)}
            className={cn(
              'toast-enter pointer-events-auto flex max-w-full items-center gap-1 border bg-bg-elevated py-1 pr-1 text-sm shadow-lg sm:max-w-lg',
              oneLine ? 'rounded-full' : 'rounded-2xl',
              Icon ? 'pl-3' : 'pl-4',
              isError ? 'border-danger text-danger' : 'border-border text-fg',
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0 text-accent" />}
            <span className={cn('min-w-0 px-1.5 py-1.5', oneLine && 'truncate')}>
              <span className={oneLine ? 'font-medium' : undefined}>{item.message}</span>
              {oneLine && <span className="text-fg-muted"> · {item.detail}</span>}
            </span>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onAction();
                  onDismiss(item.id);
                }}
                className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
              >
                {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />} {item.action.label}
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
// live region 두 개(polite status / assertive alert)는 항상 DOM 에 있어야 스크린리더가 나중에 들어오는
// 내용을 읽는다 — 그래서 광고 겹침도 컨테이너를 없애지 않고 invisible 로만 감춘다.
export function ToastViewport() {
  const lang = useLanguage();
  const items = useSyncExternalStore(subscribeToasts, getToastSnapshot, getServerToastSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const overlapsAd = useOverlapsAd(() => {
    const el = ref.current;
    return el && items.length > 0 ? [el.getBoundingClientRect()] : [];
  });

  useEffect(() => {
    setToastsAdPaused(overlapsAd);
  }, [overlapsAd]);

  const polite = items.filter((x) => x.tone !== 'error');
  const assertive = items.filter((x) => x.tone === 'error');
  const regionClass = 'flex flex-col items-center gap-2 pb-2 empty:pb-0';
  const listProps = { lang, onDismiss: dismissToast, onPause: pauseToast, onResume: resumeToast };

  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-[4.5rem] z-30 flex flex-col items-center px-4',
        overlapsAd && 'invisible',
      )}
    >
      <div role="status" aria-live="polite" className={regionClass}>
        <ToastList items={polite} {...listProps} />
      </div>
      <div role="alert" aria-live="assertive" className={regionClass}>
        <ToastList items={assertive} {...listProps} />
      </div>
    </div>
  );
}
