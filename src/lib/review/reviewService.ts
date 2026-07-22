import { AppError } from '../auth/errors';
import { getQuestionById, type IndexedQuestion } from '../questions';
import { isSelectionCorrect, normalizeSelection } from '../quiz/correctness';
import { isMastered, nextSchedule } from './schedule';
import { nextScheduleSM2, qualityFromResult } from './sm2';
import type { ReviewCounts, ReviewItem, ReviewRepository, WrongReason } from './types';

// 클라이언트로 보낼 복습 카드(문제 본문 + 일정 메타).
export interface ReviewCard {
  questionId: string;
  box: number;
  mastered: boolean;
  dueAt: string;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation: string;
  slug: string;
  week: number; // 모의고사 문제는 0(주차 없음).
  day: number;
  domain?: string; // 모의고사 문제의 도메인.
}

function toCard(item: ReviewItem, q: IndexedQuestion): ReviewCard {
  return {
    questionId: item.questionId,
    box: item.box,
    mastered: isMastered(item.box),
    dueAt: item.dueAt,
    number: q.number,
    prompt: q.prompt,
    choices: q.choices,
    answer: q.answer,
    explanation: q.explanation,
    slug: q.slug,
    week: q.week,
    day: q.day,
    domain: q.domain,
  };
}

// 오답노트/복습 로직. 채점은 서버에서 문제 인덱스로 판정한다(클라이언트 신뢰 X).
export class ReviewService {
  constructor(private readonly repo: ReviewRepository) {}

  async listDue(userId: string, limit = 30): Promise<ReviewCard[]> {
    return this.enrich(await this.repo.listDue(userId, limit));
  }

  async listNotebook(userId: string, limit = 300): Promise<ReviewCard[]> {
    return this.enrich(await this.repo.listAll(userId, limit));
  }

  stats(userId: string): Promise<ReviewCounts> {
    return this.repo.counts(userId);
  }

  // 복습 한 문제 채점 + 다음 일정 갱신.
  async review(
    userId: string,
    questionId: string,
    selected: string,
  ): Promise<{ correct: boolean; mastered: boolean; dueAt: string }> {
    const choice = normalizeSelection(selected);
    if (!choice) {
      throw new AppError(400, 'invalid_choice', '보기를 하나 이상 선택해야 합니다.');
    }
    const question = getQuestionById(questionId);
    if (!question) {
      throw new AppError(404, 'question_not_found', '존재하지 않는 문제입니다.');
    }
    const correct = isSelectionCorrect(question.answer, choice);
    const existing = await this.repo.find(userId, questionId);

    // box는 카운트/마스터 표시용으로 기존 Leitner 로직 유지, 다음 복습일은 SM-2가 개인화.
    const { box } = nextSchedule(existing?.box ?? 0, correct);
    const sm2 = nextScheduleSM2(
      { ef: existing?.ef ?? 2.5, interval: existing?.interval ?? 0, reps: existing?.reps ?? 0 },
      qualityFromResult(correct),
    );
    await this.repo.applySchedule(userId, questionId, {
      box,
      dueAt: sm2.dueAt,
      correct,
      ef: sm2.ef,
      interval: sm2.interval,
      reps: sm2.reps,
    });
    return { correct, mastered: isMastered(box), dueAt: sm2.dueAt.toISOString() };
  }

  // 오답 이유 기록(채점과 분리 — 결과를 본 뒤 사용자가 고른다).
  setReason(userId: string, questionId: string, reason: WrongReason): Promise<void> {
    return this.repo.setReason(userId, questionId, reason);
  }

  // 큐 항목을 문제 본문과 합친다. 인덱스에 없는(삭제된) 문제는 건너뛴다.
  private enrich(items: ReviewItem[]): ReviewCard[] {
    const cards: ReviewCard[] = [];
    for (const item of items) {
      const q = getQuestionById(item.questionId);
      if (q) cards.push(toCard(item, q));
    }
    return cards;
  }
}
