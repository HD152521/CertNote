import { query } from '../db';
import { computeStreak, daysBetween } from './streak';

// 모든 날짜 계산은 KST(Asia/Seoul) 기준. 사용자가 한국 출퇴근 학습이 전제.

// 오늘(KST) 활동 기록. 읽기/퀴즈/복습 어느 것에서 호출해도 하루 1행으로 수렴.
export async function recordActivity(userId: string): Promise<void> {
  await query(
    `INSERT INTO daily_activity (user_id, activity_date)
     VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date)
     ON CONFLICT (user_id, activity_date) DO NOTHING`,
    [userId],
  );
}

// 'YYYY-MM-DD' (KST 오늘).
export function kstToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export interface StreakInfo {
  current: number; // 연속 학습 일수(프리즈 반영)
  longest: number; // 역대 최장 연속 일수
  activeToday: boolean; // 오늘 이미 활동했는지
  freezeTokens: number; // 남은 스트릭 프리즈 토큰
  frozenDate: string | null; // 프리즈로 메운 날짜(캘린더 표시용)
}

interface FreezeRow {
  tokens: number;
  frozen: string | null;
}

// 오늘(또는 오늘 미활동이면 어제)부터 거꾸로 연속 활동일을 센다. 프리즈 토큰으로 1일 공백을 메운다.
// 프리즈 소비/주간 재충전은 상태가 실제로 바뀔 때만 1회 UPDATE(읽기 위주 유지).
export async function getStreak(userId: string): Promise<StreakInfo> {
  const today = kstToday();
  const [actRows, userRows] = await Promise.all([
    query<{ d: string }>(
      `SELECT to_char(activity_date, 'YYYY-MM-DD') AS d
       FROM daily_activity WHERE user_id = $1
       ORDER BY activity_date DESC LIMIT 400`,
      [userId],
    ),
    query<FreezeRow>(
      `SELECT streak_freeze_tokens AS tokens, to_char(last_freeze_at, 'YYYY-MM-DD') AS frozen
       FROM users WHERE id = $1`,
      [userId],
    ),
  ]);

  const u = userRows[0] ?? { tokens: 0, frozen: null };
  const startTokens = u.tokens ?? 0;
  const res = computeStreak(
    actRows.map((r) => r.d),
    today,
    { tokensAvailable: startTokens > 0, frozenDate: u.frozen },
  );

  let tokens = startTokens;
  let frozen = u.frozen;
  if (res.freezeUsedOn) {
    tokens = Math.max(0, startTokens - 1); // 새 공백을 메우며 토큰 소비.
    frozen = res.freezeUsedOn;
  } else if (tokens < 1 && u.frozen && daysBetween(u.frozen, today) >= 7) {
    tokens = 1; // 주 1회 재충전.
  }
  if (tokens !== startTokens || frozen !== u.frozen) {
    await query('UPDATE users SET streak_freeze_tokens = $2, last_freeze_at = $3 WHERE id = $1', [userId, tokens, frozen]);
  }

  return {
    current: res.current,
    longest: res.longest,
    activeToday: res.activeToday,
    freezeTokens: tokens,
    frozenDate: frozen,
  };
}

// 최근 days일의 활동 날짜 목록(캘린더 히트맵용, KST 'YYYY-MM-DD').
export async function listRecentActivity(userId: string, days: number): Promise<string[]> {
  const rows = await query<{ d: string }>(
    `SELECT to_char(activity_date, 'YYYY-MM-DD') AS d
     FROM daily_activity
     WHERE user_id = $1 AND activity_date >= (now() AT TIME ZONE 'Asia/Seoul')::date - $2::int
     ORDER BY activity_date DESC`,
    [userId, days],
  );
  return rows.map((r) => r.d);
}
