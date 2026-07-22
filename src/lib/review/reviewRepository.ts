import { query } from '../db';
import { MAX_BOX } from './schedule';
import type { ReviewCounts, ReviewItem, ReviewRepository, ReviewScheduleUpdate, WrongReason } from './types';

interface ReviewRow {
  question_id: string;
  box: number;
  due_at: string;
  last_result: boolean | null;
  ef: number;
  interval: number;
  reps: number;
  last_reason: string | null;
}

// SELECT 공통 컬럼(모든 조회가 SM-2 상태를 함께 읽어야 review()가 다음 간격을 계산할 수 있다).
const COLS = 'question_id, box, due_at, last_result, ef, interval, reps, last_reason';

function mapRow(row: ReviewRow): ReviewItem {
  return {
    questionId: row.question_id,
    box: row.box,
    dueAt: row.due_at,
    lastResult: row.last_result,
    ef: Number(row.ef),
    interval: row.interval,
    reps: row.reps,
    lastReason: (row.last_reason as WrongReason | null) ?? null,
  };
}

// review_items 테이블 데이터 접근. 모든 입력은 파라미터 바인딩으로 처리(SQL 인젝션 방지).
export class PgReviewRepository implements ReviewRepository {
  // 오답 발생 시 큐에 적재. 이미 있으면 박스 0·간격 1일로 리셋해 즉시 복습 대상으로(SM-2 baseline).
  async enqueueWrong(userId: string, questionId: string): Promise<void> {
    await query(
      `INSERT INTO review_items (user_id, question_id, box, due_at, last_result, interval, reps)
       VALUES ($1, $2, 0, now(), false, 1, 0)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET box = 0, due_at = now(), last_result = false, interval = 1, reps = 0, updated_at = now()`,
      [userId, questionId],
    );
  }

  async find(userId: string, questionId: string): Promise<ReviewItem | null> {
    const rows = await query<ReviewRow>(
      `SELECT ${COLS} FROM review_items WHERE user_id = $1 AND question_id = $2`,
      [userId, questionId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  // 복습 채점 결과로 일정 갱신. 큐에 없던 문제도 안전하게 적재(upsert). due_at은 SM-2가 결정.
  async applySchedule(userId: string, questionId: string, u: ReviewScheduleUpdate): Promise<void> {
    await query(
      `INSERT INTO review_items (user_id, question_id, box, due_at, last_result, ef, interval, reps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET box = $3, due_at = $4, last_result = $5, ef = $6, interval = $7, reps = $8, updated_at = now()`,
      [userId, questionId, u.box, u.dueAt.toISOString(), u.correct, u.ef, u.interval, u.reps],
    );
  }

  // 오답 이유 기록(약점 분석용). 큐에 없으면 조용히 무시(오답은 항상 enqueue되므로 정상 흐름엔 존재).
  async setReason(userId: string, questionId: string, reason: WrongReason): Promise<void> {
    await query(
      `UPDATE review_items SET last_reason = $3, updated_at = now()
       WHERE user_id = $1 AND question_id = $2`,
      [userId, questionId, reason],
    );
  }

  async listDue(userId: string, limit: number): Promise<ReviewItem[]> {
    const rows = await query<ReviewRow>(
      `SELECT ${COLS} FROM review_items
       WHERE user_id = $1 AND due_at <= now() ORDER BY due_at ASC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapRow);
  }

  async listAll(userId: string, limit: number): Promise<ReviewItem[]> {
    const rows = await query<ReviewRow>(
      `SELECT ${COLS} FROM review_items
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
