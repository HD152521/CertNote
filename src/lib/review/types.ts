// 복습 항목(오답노트 1건)의 도메인 표현.
export interface ReviewItem {
  questionId: string;
  box: number;
  dueAt: string;
  lastResult: boolean | null;
  ef: number; // SM-2 난이도계수(기본 2.5)
  interval: number; // SM-2 현재 간격(일)
  reps: number; // SM-2 연속 정답 횟수
  lastReason: WrongReason | null; // 최근 오답 이유
}

export interface ReviewCounts {
  total: number;
  due: number;
  mastered: number;
}

// 오답 이유(약점 분석 정밀화용). 코드로 저장해 다국어/집계에 안정적.
export type WrongReason = 'concept' | 'mistake' | 'forgot';
export const WRONG_REASONS: readonly WrongReason[] = ['concept', 'mistake', 'forgot'] as const;

// 복습 채점 결과로 저장할 일정 갱신값. box(카운트/마스터용) + SM-2 상태.
export interface ReviewScheduleUpdate {
  box: number;
  dueAt: Date;
  correct: boolean;
  ef: number;
  interval: number;
  reps: number;
}

// 오답 큐에 적재하는 최소 인터페이스 — AttemptService가 이것에만 의존한다(ISP).
export interface ReviewEnqueuer {
  enqueueWrong(userId: string, questionId: string): Promise<void>;
}

// 복습 데이터 접근 추상화(DIP).
export interface ReviewRepository extends ReviewEnqueuer {
  find(userId: string, questionId: string): Promise<ReviewItem | null>;
  applySchedule(userId: string, questionId: string, update: ReviewScheduleUpdate): Promise<void>;
  setReason(userId: string, questionId: string, reason: WrongReason): Promise<void>;
  listDue(userId: string, limit: number): Promise<ReviewItem[]>;
  listAll(userId: string, limit: number): Promise<ReviewItem[]>;
  counts(userId: string): Promise<ReviewCounts>;
}
