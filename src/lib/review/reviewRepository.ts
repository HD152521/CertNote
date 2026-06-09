import { query } from '../db';
import { MAX_BOX } from './schedule';
import type { ReviewCounts, ReviewItem, ReviewRepository } from './types';

interface ReviewRow {
  question_id: string;
  box: number;
  due_at: string;
  last_result: boolean | null;
}

function mapRow(row: ReviewRow): ReviewItem {
  return { questionId: row.question_id, box: row.box, dueAt: row.due_at, lastResult: row.last_result };
}

// review_items 테이블 데이터 접근. 모든 입력은 파라미터 바인딩으로 처리(SQL 인젝션 방지).
export class PgReviewRepository implements ReviewRepository {
  // 오답 발생 시 큐에 적재. 이미 있으면 박스 0으로 리셋해 즉시 복습 대상으로.
  async enqueueWrong(userId: string, questionId: string): Promise<void> {
    await query(
      `INSERT INTO review_items (user_id, question_id, box, due_at, last_result)
       VALUES ($1, $2, 0, now(), false)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET box = 0, due_at = now(), last_result = false, updated_at = now()`,
      [userId, questionId],
    );
  }

  async find(userId: string, questionId: string): Promise<ReviewItem | null> {
    const rows = await query<ReviewRow>(
      `SELECT question_id, box, due_at, last_result FROM review_items
       WHERE user_id = $1 AND question_id = $2`,
      [userId, questionId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  // 복습 채점 결과로 일정 갱신. 큐에 없던 문제도 안전하게 적재(upsert).
  async applySchedule(userId: string, questionId: string, box: number, dueAt: Date, correct: boolean): Promise<void> {
    await query(
      `INSERT INTO review_items (user_id, question_id, box, due_at, last_result)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET box = $3, due_at = $4, last_result = $5, updated_at = now()`,
      [userId, questionId, box, dueAt.toISOString(), correct],
    );
  }

  async listDue(userId: string, limit: number): Promise<ReviewItem[]> {
    const rows = await query<ReviewRow>(
      `SELECT question_id, box, due_at, last_result FROM review_items
       WHERE user_id = $1 AND due_at <= now() ORDER BY due_at ASC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapRow);
  }

  async listAll(userId: string, limit: number): Promise<ReviewItem[]> {
    const rows = await query<ReviewRow>(
      `SELECT question_id, box, due_at, last_result FROM review_items
       WHERE user_id = $1 ORDER BY due_at ASC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapRow);
  }

  async counts(userId: string): Promise<ReviewCounts> {
    const rows = await query<{ total: string; due: string; mastered: string }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE due_at <= now()) AS due,
         COUNT(*) FILTER (WHERE box >= $2) AS mastered
       FROM review_items WHERE user_id = $1`,
      [userId, MAX_BOX],
    );
    const r = rows[0] ?? { total: '0', due: '0', mastered: '0' };
    return { total: Number(r.total), due: Number(r.due), mastered: Number(r.mastered) };
  }
}
