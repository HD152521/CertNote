'use client';

import { useEffect, useState } from 'react';
import { ArrowUpToLine, CornerDownRight, X } from 'lucide-react';
import {
  pickCurrentHeading, readPosition, resumeScrollY, savePosition, sectionWithin, shouldOfferResume, takeResumeIntent, type ReadingPosition,
} from '@/lib/readingPosition';

const LABELS = {
  ko: { resumed: '읽던 곳에서 이어 보는 중', top: '처음부터', close: '닫기' },
  en: { resumed: 'Picked up where you left off', top: 'From the top', close: 'Close' },
} as const;

// 저장 빈도. 스크롤마다 쓰지 않고, 멈춘 뒤 한 번만 쓴다.
const SAVE_DELAY_MS = 800;
// 광고 칸·이미지가 늦게 자리를 잡아 밀린 만큼 한 번 더 맞추는 시점.
const SETTLE_MS = 700;
// 안내 알림을 띄워 두는 시간.
const NOTICE_MS = 6000;
const HEADING_SELECTOR = '.article h2[id], .article h3[id]';

function headingLayout(): { id: string; text: string; top: number }[] {
  return Array.from(document.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map((el) => ({
    id: el.id,
    text: (el.textContent ?? '').trim(),
    top: el.getBoundingClientRect().top + window.scrollY,
  }));
}

// 저장한 소제목 + 구간 안 비율 자리로 스크롤. 소제목이 없어졌으면(노트 수정) false.
function scrollToSaved(pos: ReadingPosition): boolean {
  const layout = headingLayout();
  const i = layout.findIndex((h) => h.id === pos.headingId);
  if (i < 0) return false;
  const end = layout[i + 1]?.top ?? document.documentElement.scrollHeight;
  window.scrollTo({ top: resumeScrollY(layout[i].top, end, pos.within ?? 0), behavior: 'auto' });
  return true;
}

function scrollRatio(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

// 노트 페이지에서 읽던 위치를 기억하고, 다시 열면 그 자리로 바로 이동한다(2026-10-29, 사용자 요청 —
// 예전엔 버튼만 띄워서 열 때마다 맨 위로 보였다). 이동했으면 "처음부터" 버튼이 있는 알림을 잠깐 띄운다.
// 이동하지 않는 경우: 막 읽기 시작했거나 다 읽은 노트(shouldOfferResume), 목차 등 #소제목 링크로 들어온 경우,
// 이미 내려가 있는 경우. 단 홈·허브의 "이어서 보기"(#소제목 + markResumeIntent)는 소제목 안 읽던 자리까지 맞춘다.
export function ResumeReading({ href, lang = 'ko' }: { href: string; lang?: 'ko' | 'en' }) {
  const t = LABELS[lang];
  const [notice, setNotice] = useState<ReadingPosition | null>(null);

  useEffect(() => {
    // localStorage 는 마운트 뒤에만 읽을 수 있다(ContinueCards 와 같은 방식).
    const saved = readPosition(href);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const fromResumeLink = !!saved && hash === saved.headingId && takeResumeIntent(href);
    const plainOpen = !hash && window.scrollY < 200;
    const shouldRestore = shouldOfferResume(saved) && (fromResumeLink || plainOpen) && !!document.getElementById(saved.headingId);

    let settle: ReturnType<typeof setTimeout> | undefined;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    // 사용자가 직접 움직이기 시작하면 다시 끌어당기지 않는다.
    const stopSettling = () => {
      if (settle) clearTimeout(settle);
      settle = undefined;
    };
    if (shouldRestore && saved) {
      void document.fonts?.ready.then(() => requestAnimationFrame(() => {
        if (scrollToSaved(saved) && plainOpen) {
          setNotice(saved);
          noticeTimer = setTimeout(() => setNotice(null), NOTICE_MS);
        }
      }));
      settle = setTimeout(() => scrollToSaved(saved), SETTLE_MS);
      window.addEventListener('wheel', stopSettling, { passive: true, once: true });
      window.addEventListener('touchstart', stopSettling, { passive: true, once: true });
      window.addEventListener('keydown', stopSettling, { once: true });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = () => {
      const layout = headingLayout();
      const current = pickCurrentHeading(layout, window.scrollY);
      if (!current) return;
      const within = sectionWithin(layout, layout.indexOf(current), window.scrollY, document.documentElement.scrollHeight);
      savePosition(href, { headingId: current.id, headingText: current.text, ratio: scrollRatio(), within, at: Date.now() });
    };
    const onScroll = () => {
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
      if (noticeTimer) clearTimeout(noticeTimer);
      stopSettling();
      window.removeEventListener('wheel', stopSettling);
      window.removeEventListener('touchstart', stopSettling);
      window.removeEventListener('keydown', stopSettling);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [href]);

  if (!notice) return null;

  const toTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setNotice(null);
  };

  return (
    <div role="status" className="fixed inset-x-0 top-[4.5rem] z-30 flex justify-center px-4">
      <div className="flex max-w-full items-center gap-1 rounded-full border border-border bg-bg-elevated py-1 pl-3 pr-1 shadow-lg">
        <CornerDownRight className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate px-1.5 text-sm text-fg">
          <span className="font-medium">{t.resumed}</span>
          <span className="text-fg-muted"> · {notice.headingText}</span>
        </span>
        <button
          type="button"
          onClick={toTop}
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
        >
          <ArrowUpToLine className="h-3.5 w-3.5" /> {t.top}
        </button>
        <button
          type="button"
          onClick={() => setNotice(null)}
          aria-label={t.close}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-faint transition hover:bg-bg-subtle hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
