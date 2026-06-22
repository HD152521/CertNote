import { query } from '../db';

// 관리자 대시보드용 간략 지표. 모든 날짜는 KST 기준 집계.
const DAYS = 14;

export interface DailyPoint {
  date: string; // 'MM-DD'
  signups: number;
  active: number; // 그날 학습 활동(읽기/퀴즈/복습)한 distinct 유저
  attempts: number; // 그날 푼 문제 수
}

export interface AdminStats {
  totals: {
    users: number;
    pro: number;
    free: number;
    waitlist: number;
    pushDevices: number;
    dauToday: number;
  };
  daily: DailyPoint[]; // 오래된→최신
}

interface DayRow {
  d: string; // 'YYYY-MM-DD'
  n: number;
}

function kstToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const base = new Date(`${kstToday()}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function getAdminStats(): Promise<AdminStats> {
  const since = `${DAYS} days`;
  const [totalsRows, signups, active, attempts] = await Promise.all([
    query<{ users: number; pro: number; waitlist: number; push_devices: number; dau_today: number }>(
      `SELECT
         (SELECT count(*) FROM users)::int AS users,
         (SELECT count(*) FROM users WHERE plan = 'pro')::int AS pro,
         (SELECT count(*) FROM waitlist)::int AS waitlist,
         (SELECT count(*) FROM push_subscriptions)::int AS push_devices,
         (SELECT count(DISTINCT user_id) FROM daily_activity
            WHERE activity_date = (now() AT TIME ZONE 'Asia/Seoul')::date)::int AS dau_today`,
    ),
    query<DayRow>(
      `SELECT to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS d, count(*)::int AS n
       FROM users WHERE created_at >= now() - $1::interval GROUP BY 1`,
      [since],
    ),
    query<DayRow>(
      `SELECT to_char(activity_date, 'YYYY-MM-DD') AS d, count(DISTINCT user_id)::int AS n
       FROM daily_activity WHERE activity_date >= (now() AT TIME ZONE 'Asia/Seoul')::date - $1::int GROUP BY 1`,
      [DAYS],
    ),
    query<DayRow>(
      `SELECT to_char((attempted_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS d, count(*)::int AS n
       FROM quiz_attempts WHERE attempted_at >= now() - $1::interval GROUP BY 1`,
      [since],
    ),
  ]);

  const t = totalsRows[0] ?? { users: 0, pro: 0, waitlist: 0, push_devices: 0, dau_today: 0 };
  const sMap = new Map(signups.map((r) => [r.d, r.n]));
  const aMap = new Map(active.map((r) => [r.d, r.n]));
  const qMap = new Map(attempts.map((r) => [r.d, r.n]));

  const daily: DailyPoint[] = lastNDates(DAYS).map((d) => ({
    date: d.slice(5), // MM-DD
    signups: sMap.get(d) ?? 0,
    active: aMap.get(d) ?? 0,
    attempts: qMap.get(d) ?? 0,
  }));

  return {
    totals: {
      users: t.users,
      pro: t.pro,
      free: t.users - t.pro,
      waitlist: t.waitlist,
      pushDevices: t.push_devices,
      dauToday: t.dau_today,
    },
    daily,
  };
}
