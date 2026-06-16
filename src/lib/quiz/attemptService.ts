import { AppError } from '../auth/errors';
import { getQuestionById } from '../questions';
import { getReviewRepository } from '../review/factory';
import type { ReviewEnqueuer } from '../review/types';
import { isSelectionCorrect, normalizeSelection } from './correctness';
import { PgAttemptRepository, type AttemptRecord, type AttemptRepository } from './attemptRepository';

// 퀴즈 풀이 기록 로직. 정답 여부는 서버에서 문제 인덱스로 판정한다(클라이언트 신뢰 X).
// 오답이면 복습 큐(SRS)에도 적재한다 — 큐 의존은 ReviewEnqueuer 인터페이스로만(DIP).
export class AttemptService {
  constructor(
    private readonly attempts: AttemptRepository,
    private readonly reviewQueue?: ReviewEnqueuer,
  ) {}

  async record(userId: string, questionId: string, selected: string): Promise<{ correct: boolean }> {
    const choice = normalizeSelection(selected);
    if (!choice) {
      throw new AppError(400, 'invalid_choice', '보기를 하나 이상 선택해야 합니다.');
    }
    const question = getQuestionById(questionId);
    if (!question) {
      throw new AppError(404, 'question_not_found', '존재하지 않는 문제입니다.');
    }
    const correct = isSelectionCorrect(question.answer, choice);
    await this.attempts.create({ userId, questionId, selected: choice, correct });
    if (!correct && this.reviewQueue) {
      await this.reviewQueue.enqueueWrong(userId, questionId);
    }
    return { correct };
  }

  list(userId: string, limit = 200): Promise<AttemptRecord[]> {
    return this.attempts.listByUser(userId, limit);
  }
}

export function getAttemptService(): AttemptService {
  return new AttemptService(new PgAttemptRepository(), getReviewRepository());
}
