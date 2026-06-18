import { query } from '../db';

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

function prevDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface StreakInfo {
  current: number; // 연속 학습 일수
  activeToday: boolean; // 오늘 이미 활동했는지
}

// 오늘(또는 오늘 미활동이면 어제)부터 거꾸로 연속된 활동일을 센다.
export async function getStreak(userId: string): Promise<StreakInfo> {
  const rows = await query<{ d: string }>(
    `SELECT to_char(activity_date, 'YYYY-MM-DD') AS d
     FROM daily_activity WHERE user_id = $1
     ORDER BY activity_date DESC LIMIT 400`,
    [userId],
  );
  const set = new Set(rows.map((r) => r.d));
  const today = kstToday();
  const activeToday = set.has(today);

  // 오늘 활동했으면 오늘부터, 아니면 어제부터 카운트(오늘은 아직 진행 가능하므로 끊긴 게 아님).
  let cursor = activeToday ? today : prevDate(today);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = prevDate(cursor);
  }
  return { current, activeToday };
}
