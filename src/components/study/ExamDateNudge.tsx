'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, X } from 'lucide-react';

const DISMISS_KEY = 'cert-notes:exam-nudge-dismissed';

// 시험일(합격 플랜) 미등록 유저에게 대시보드의 D-day·스트릭·일일 분량 기능을 알린다.
// 리텐션 장치가 /dashboard 안에만 있어 신규 유저가 존재를 모르는 문제 대응.
// 비로그인(401)·플랜 있음·닫은 적 있음 → 렌더하지 않는다.
export function ExamDateNudge() {
  const [show, setShow] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // localStorage 불가 시에도 조회는 진행.
    }
    let active = true;
    fetch('/api/study/today', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data || data.portion) return;
        setStreak(data.streak?.current ?? 0);
        setShow(true);
      })
      .catch(() => {
        // 조회 실패 시 조용히 숨김.
      });
    return () => {
      active = false;
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 저장 실패해도 이번 세션에서는 숨긴다.
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <aside className="flex items-start gap-3 rounded-xl border border-border bg-bg-subtle p-4">
      <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">
          {streak > 0 ? `🔥 ${streak}일 연속 학습 중이에요!` : '시험일을 정해두면 완주가 쉬워져요'}
        </p>
        <p className="text-sm text-fg-muted">
          시험일을 등록하면 D-day 카운트다운과 매일 학습 분량을 챙겨드려요.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          시험일 등록하기 →
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="닫기"
        className="shrink-0 text-fg-faint transition hover:text-fg"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
