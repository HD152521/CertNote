// SM-2(SuperMemo-2) 간격 반복. Leitner보다 개인 난이도(EF)를 반영해 간격을 조정한다.
// box(마스터/카운트 표시)는 기존대로 유지하고, 다음 복습일(due_at)만 SM-2가 개인화한다.

const MIN_EF = 1.3; // EF 하한(SM-2 표준). 이 아래로는 간격이 무의미하게 짧아짐.
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Sm2State {
  ef: number; // easiness factor(난이도계수), 기본 2.5
  interval: number; // 현재 간격(일)
  reps: number; // 연속 정답 횟수
}

export interface Sm2Result extends Sm2State {
  dueAt: Date;
}

// 정답 여부 → SM-2 quality(0~5). 초기엔 이진(정답 4 / 오답 2). 향후 응답속도로 5까지 세분 가능.
export function qualityFromResult(correct: boolean): number {
  return correct ? 4 : 2;
}

// 현재 상태 + 채점 quality → 다음 상태·복습일(순수). now 주입으로 테스트 용이.
export function nextScheduleSM2(state: Sm2State, quality: number, now: Date = new Date()): Sm2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let ef = state.ef >= MIN_EF ? state.ef : MIN_EF; // 저장된 EF가 손상돼도 방어.
  let interval = state.interval;
  let reps = state.reps;

  if (q < 3) {
    // 실패: 연속 정답 리셋, 즉시 재복습(1일).
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.max(1, Math.round(interval * ef));
    reps += 1;
  }

  // EF 갱신(SM-2 표준식). quality가 높을수록 EF 상승, 낮을수록 하락.
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < MIN_EF) ef = MIN_EF;

  return {
    ef: Number(ef.toFixed(4)),
    interval,
    reps,
    dueAt: new Date(now.getTime() + interval * DAY_MS),
  };
}
