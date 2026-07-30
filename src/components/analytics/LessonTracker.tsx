'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

interface LessonTrackerProps {
  cert: string;
  week: number;
  day: number;
  locked: boolean;
  loggedIn: boolean;
}

// 레슨 조회 추적(활성화 지표 + 페이월 히트). 서버 컴포넌트 DayView는 track()(클라 전용)을
// 못 부르므로, 마운트 시 1회 이벤트를 쏘는 얇은 클라이언트 컴포넌트로 심는다.
// locked=true 는 무료 사용자가 유료 주차에 막힌 순간 = 업그레이드 의향 신호로 활용.
export function LessonTracker({ cert, week, day, locked, loggedIn }: LessonTrackerProps) {
  useEffect(() => {
    track('lesson_viewed', { cert, week, day, locked, logged_in: loggedIn });
  }, [cert, week, day, locked, loggedIn]);
  return null;
}
