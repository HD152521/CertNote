// Leitner 간격 반복(SRS). 박스가 오를수록 복습 간격이 길어진다.
// box 0=오답 직후(즉시), 1=1일, 2=3일, 3=7일, 4=14일, 5=30일(마스터).
export const MAX_BOX = 5;
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

// 채점 결과로 다음 박스와 복습 예정일을 계산한다(순수 함수).
export function nextSchedule(box: number, correct: boolean, now: Date = new Date()): { box: number; dueAt: Date } {
  if (!correct) {
    // 틀리면 박스 0으로 리셋 — 즉시 다시 복습 대상이 된다.
    return { box: 0, dueAt: now };
  }
  const nextBox = Math.min(box + 1, MAX_BOX);
  const days = INTERVAL_DAYS[nextBox] ?? INTERVAL_DAYS[MAX_BOX];
  return { box: nextBox, dueAt: new Date(now.getTime() + days * DAY_MS) };
}

export function isMastered(box: number): boolean {
  return box >= MAX_BOX;
}
