// 복습 항목(오답노트 1건)의 도메인 표현.
export interface ReviewItem {
  questionId: string;
  box: number;
  dueAt: string;
  lastResult: boolean | null;
}

export interface ReviewCounts {
  total: number;
  due: number;
  mastered: number;
}

// 오답 큐에 적재하는 최소 인터페이스 — AttemptService가 이것에만 의존한다(ISP).
export interface ReviewEnqueuer {
  enqueueWrong(userId: string, questionId: string): Promise<void>;
}

// 복습 데이터 접근 추상화(DIP).
export interface ReviewRepository extends ReviewEnqueuer {
  find(userId: string, questionId: string): Promise<ReviewItem | null>;
  applySchedule(userId: string, questionId: string, box: number, dueAt: Date, correct: boolean): Promise<void>;
  listDue(userId: string, limit: number): Promise<ReviewItem[]>;
  listAll(userId: string, limit: number): Promise<ReviewItem[]>;
  counts(userId: string): Promise<ReviewCounts>;
}
