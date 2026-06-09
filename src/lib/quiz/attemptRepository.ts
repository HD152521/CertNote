import { query } from '../db';

export interface AttemptRecord {
  id: string;
  userId: string;
  questionId: string;
  selected: string | null;
  correct: boolean;
  attemptedAt: string;
}

// 퀴즈 풀이 기록 데이터 접근 추상화(DIP).
export interface AttemptRepository {
  create(input: { userId: string; questionId: string; selected: string | null; correct: boolean }): Promise<void>;
  listByUser(userId: string, limit: number): Promise<AttemptRecord[]>;
}

interface AttemptRow {
  id: string;
  user_id: string;
  question_id: string;
  selected: string | null;
  correct: boolean;
  attempted_at: string;
}

function mapRow(row: AttemptRow): AttemptRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    questionId: row.question_id,
    selected: row.selected,
    correct: row.correct,
    attemptedAt: row.attempted_at,
  };
}

export class PgAttemptRepository implements AttemptRepository {
  async create(input: { userId: string; questionId: string; selected: string | null; correct: boolean }): Promise<void> {
    await query(
      'INSERT INTO quiz_attempts (user_id, question_id, selected, correct) VALUES ($1, $2, $3, $4)',
      [input.userId, input.questionId, input.selected, input.correct],
    );
  }

  async listByUser(userId: string, limit: number): Promise<AttemptRecord[]> {
    const rows = await query<AttemptRow>(
      'SELECT * FROM quiz_attempts WHERE user_id = $1 ORDER BY attempted_at DESC LIMIT $2',
      [userId, limit],
    );
    return rows.map(mapRow);
  }
}
