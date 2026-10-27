'use client';

import { useEffect, useRef, useState } from 'react';
import { CornerDownRight, X } from 'lucide-react';
import { pickCurrentHeading, readPosition, savePosition, shouldOfferResume, type ReadingPosition } from '@/lib/readingPosition';

const LABELS = {
  ko: { jump: '읽던 곳으로 이동', close: '닫기' },
  en: { jump: 'Jump back to where you left off', close: 'Close' },
} as const;

// 저장 빈도. 스크롤마다 쓰지 않고, 멈춘 뒤 한 번만 쓴다.
const SAVE_DELAY_MS = 800;
const HEADING_SELECTOR = '.article h2[id], .article h3[id]';

function headingLayout(): { id: string; text: string; top: number }[] {
  return Array.from(document.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map((el) => ({
    id: el.id,
    text: (el.textContent ?? '').trim(),
    top: el.getBoundingClientRect().top + window.scrollY,
  }));
}

function scrollRatio(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

// 노트 페이지에서 읽던 위치를 기억하고, 다시 열었을 때 "읽던 곳으로 이동" 버튼을 띄운다.
// 자동으로 스크롤하지 않는다 — 처음부터 다시 보려는 사람도 있고, 페이지가 저절로 움직이면 당황스럽다.
// 주소에 #소제목이 붙어 들어왔거나(목차·이어 보기 링크) 이미 내려가 있으면 버튼을 띄우지 않는다.
export function ResumeReading({ href, lang = 'ko' }: { href: string; lang?: 'ko' | 'en' }) {
  const t = LABELS[lang];
  const [offer, setOffer] = useState<ReadingPosition | null>(null);
  const offerRef = useRef<ReadingPosition | null>(null);

  useEffect(() => {
    // localStorage 는 마운트 뒤에만 읽을 수 있다(ContinueCards 와 같은 방식).
    const restore = () => {
      const saved = readPosition(href);
      if (shouldOfferResume(saved) && !window.location.hash && window.scrollY < 200 && document.getElementById(saved.headingId)) {
        offerRef.current = saved;
        setOffer(saved);
      }
    };
    restore();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = () => {
      const current = pickCurrentHeading(headingLayout(), window.scrollY);
      if (!current) return;
      savePosition(href, { headingId: current.id, headingText: current.text, ratio: scrollRatio(), at: Date.now() });
    };
    const onScroll = () => {
      // 사용자가 직접 그 소제목까지 내려가면 버튼은 더 필요 없다.
      const target = offerRef.current;
      if (target) {
        const el = document.getElementById(target.headingId);
        if (el && el.getBoundingClientRect().top < window.innerHeight / 2) {
          offerRef.current = null;
          setOffer(null);
        }
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(record, SAVE_DELAY_MS);
    };
    // 탭을 닫거나 다른 앱으로 갈 때도 마지막 위치를 남긴다(대기 중인 저장이 날아가지 않게).
    const onHide = () => {
      if (document.visibilityState === 'hidden') record();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [href]);

  if (!offer) return null;

  const jump = () => {
    document.getElementById(offer.headingId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    offerRef.current = null;
    setOffer(null);
  };
  const dismiss = () => {
    offerRef.current = null;
    setOffer(null);
  };

  return (
    <div role="status" className="fixed inset-x-0 top-[4.5rem] z-30 flex justify-center px-4">
      <div className="flex max-w-full items-center gap-1 rounded-full border border-border bg-bg-elevated py-1 pl-1 pr-1 shadow-lg">
        <button
          type="button"
          onClick={jump}
          className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm text-fg transition hover:bg-bg-subtle"
        >
          <CornerDownRight className="h-4 w-4 shrink-0 text-accent" />
          <span className="shrink-0 font-medium">{t.jump}</span>
          <span className="min-w-0 truncate text-fg-muted">· {offer.headingText}</span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.close}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-faint transition hover:bg-bg-subtle hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
