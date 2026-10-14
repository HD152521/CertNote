import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

// 쿼터 SQL 의 원자성을 실제 Postgres 로 증명하는 통합 테스트. 개발 DB(certnote_dev)에서만 돈다.
// .env 가 없거나 DATABASE_URL 이 certnote_dev 가 아니면 건너뛴다(운영 DB 보호).
// 전역 카운터는 "오늘" 행 하나뿐이라 E2E 와 동시에 돌리지 말 것(서로의 카운트를 건드린다).
async function loadDevDatabaseUrl(): Promise<string | null> {
  try {
    const { readDatabaseUrl } = await import('../../../e2e/db');
    const url = readDatabaseUrl();
    return url.includes('certnote_dev') ? url : null;
  } catch {
    return null;
  }
}

const devUrl = await loadDevDatabaseUrl();

describe.skipIf(!devUrl)('tutor 쿼터 SQL (실 DB)', () => {
  let pool: Pool;
  let userId: string;
  let service: typeof import('./tutorService');

  const todayUsage = async () => {
    const r = await pool.query<{ count: number }>(
      `SELECT count FROM tutor_usage WHERE user_id = $1 AND day = (now() AT TIME ZONE 'Asia/Seoul')::date`,
      [userId],
    );
    return r.rows[0]?.count ?? 0;
  };
  const todayGlobal = async () => {
    const r = await pool.query<{ count: number }>(
      `SELECT count FROM tutor_global_usage WHERE day = (now() AT TIME ZONE 'Asia/Seoul')::date`,
    );
    return r.rows[0]?.count ?? 0;
  };
  const todayKst = async () => {
    const r = await pool.query<{ d: string }>(`SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS d`);
    return r.rows[0].d;
  };
  const resetCounters = async () => {
    await pool.query('DELETE FROM tutor_usage WHERE user_id = $1', [userId]);
    await pool.query(`DELETE FROM tutor_global_usage WHERE day = (now() AT TIME ZONE 'Asia/Seoul')::date`);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = devUrl!;
    const { Pool: PgPool } = await import('pg');
    pool = new PgPool({ connectionString: devUrl! });
    service = await import('./tutorService');
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`vitest-quota-${randomUUID()}@test.local`],
    );
    userId = String(r.rows[0].id);
    await resetCounters();
  });

  afterAll(async () => {
    if (!pool) return;
    await resetCounters();
    await pool.query('DELETE FROM users WHERE id = $1', [userId]); // tutor_usage 는 CASCADE
    await pool.end();
  });

  it('사용자 쿼터: 병렬 10건 중 정확히 한도만큼만 허용되고 카운트는 한도에서 멈춘다', async () => {
    await resetCounters();
    const limit = 3;
    const results = await Promise.all(Array.from({ length: 10 }, () => service.consumeTutorQuota(userId, limit)));
    expect(results.filter((r) => r.allowed)).toHaveLength(limit);
    expect(results.filter((r) => !r.allowed)).toHaveLength(7);
    expect(await todayUsage()).toBe(limit);
  });

  it('사용자 쿼터: 거부된 호출을 더 보내도 카운트가 늘지 않는다', async () => {
    await resetCounters();
    const limit = 3;
    for (let i = 0; i < limit; i++) await service.consumeTutorQuota(userId, limit);
    for (let i = 0; i < 5; i++) {
      const denied = await service.consumeTutorQuota(userId, limit);
      expect(denied).toEqual({ allowed: false, count: limit, limit });
    }
    expect(await todayUsage()).toBe(limit);
  });

  it('사용자 쿼터: 환불하면 정확히 한 번 더 허용된다', async () => {
    await resetCounters();
    const limit = 2;
    await service.consumeTutorQuota(userId, limit);
    await service.consumeTutorQuota(userId, limit);
    expect((await service.consumeTutorQuota(userId, limit)).allowed).toBe(false);
    await service.refundTutorQuota(userId, await todayKst());
    expect(await todayUsage()).toBe(limit - 1);
    expect((await service.consumeTutorQuota(userId, limit)).allowed).toBe(true);
    expect((await service.consumeTutorQuota(userId, limit)).allowed).toBe(false);
  });

  it('사용자 쿼터: 한도 0 이하면 행을 만들지 않고 거부한다', async () => {
    await resetCounters();
    expect((await service.consumeTutorQuota(userId, 0)).allowed).toBe(false);
    expect(await todayUsage()).toBe(0);
  });

  it('전역 쿼터: 병렬 12건 중 정확히 한도만큼만 허용되고 카운트는 한도에서 멈춘다', async () => {
    await resetCounters();
    const limit = 5;
    const results = await Promise.all(Array.from({ length: 12 }, () => service.consumeGlobalTutorQuota(limit)));
    expect(results.filter((r) => r.allowed)).toHaveLength(limit);
    expect(await todayGlobal()).toBe(limit);
  });

  it('전역 쿼터: 거부된 호출은 카운트를 올리지 않고, 환불하면 다시 허용된다', async () => {
    await resetCounters();
    const limit = 2;
    await service.consumeGlobalTutorQuota(limit);
    await service.consumeGlobalTutorQuota(limit);
    expect(await service.consumeGlobalTutorQuota(limit)).toEqual({ allowed: false, count: limit, limit });
    expect(await todayGlobal()).toBe(limit);
    await service.refundGlobalTutorQuota(await todayKst());
    expect(await todayGlobal()).toBe(limit - 1);
    expect((await service.consumeGlobalTutorQuota(limit)).allowed).toBe(true);
  });

  it('전역 쿼터: 한도 0 이하면 첫 호출도 거부한다(행 생성 경로로 우회되지 않음)', async () => {
    await resetCounters();
    expect((await service.consumeGlobalTutorQuota(0)).allowed).toBe(false);
    expect(await todayGlobal()).toBe(0);
  });

  // 환불은 차감한 날짜의 행만 건드린다(자정을 넘겨 실패한 호출이 다음 날 행을 깎지 않는다).
  describe('날짜 지정 환불', () => {
    const setUserDay = (day: string, count: number) =>
      pool.query(
        `INSERT INTO tutor_usage (user_id, day, count) VALUES ($1, $2::date, $3)
         ON CONFLICT (user_id, day) DO UPDATE SET count = $3`,
        [userId, day, count],
      );
    const userDayCount = async (day: string) =>
      (await pool.query<{ count: number }>('SELECT count FROM tutor_usage WHERE user_id = $1 AND day = $2::date', [userId, day]))
        .rows[0]?.count;
    const setGlobalDay = (day: string, count: number) =>
      pool.query(
        `INSERT INTO tutor_global_usage (day, count) VALUES ($1::date, $2)
         ON CONFLICT (day) DO UPDATE SET count = $2`,
        [day, count],
      );
    const globalDayCount = async (day: string) =>
      (await pool.query<{ count: number }>('SELECT count FROM tutor_global_usage WHERE day = $1::date', [day])).rows[0]?.count;
    // 실제 오늘과 겹치지 않는 먼 미래의 연속된 두 날(D, D+1).
    const D = '2099-01-01';
    const D1 = '2099-01-02';
    const cleanup = async () => {
      await pool.query(`DELETE FROM tutor_usage WHERE user_id = $1 AND day IN ($2::date, $3::date)`, [userId, D, D1]);
      await pool.query(`DELETE FROM tutor_global_usage WHERE day IN ($1::date, $2::date)`, [D, D1]);
    };
    beforeEach(cleanup);
    afterAll(cleanup);

    it('consume 은 차감한 KST 날짜를 돌려준다', async () => {
      await resetCounters();
      const user = await service.consumeTutorQuota(userId, 3);
      const global = await service.consumeGlobalTutorQuota(3);
      const today = await todayKst();
      expect(user.day).toBe(today);
      expect(global.day).toBe(today);
    });

    it('사용자: D 환불은 D+1 행을 바꾸지 않고, D+1 환불은 D 행을 바꾸지 않는다', async () => {
      await setUserDay(D, 3);
      await setUserDay(D1, 2);
      await service.refundTutorQuota(userId, D);
      expect(await userDayCount(D)).toBe(2);
      expect(await userDayCount(D1)).toBe(2);
      await service.refundTutorQuota(userId, D1);
      expect(await userDayCount(D)).toBe(2);
      expect(await userDayCount(D1)).toBe(1);
    });

    it('전역: D 환불은 D+1 행을 바꾸지 않고, D+1 환불은 D 행을 바꾸지 않는다', async () => {
      await setGlobalDay(D, 5);
      await setGlobalDay(D1, 4);
      await service.refundGlobalTutorQuota(D);
      expect(await globalDayCount(D)).toBe(4);
      expect(await globalDayCount(D1)).toBe(4);
      await service.refundGlobalTutorQuota(D1);
      expect(await globalDayCount(D)).toBe(4);
      expect(await globalDayCount(D1)).toBe(3);
    });

    it('행이 없는 날을 환불해도 행을 만들거나 음수로 만들지 않는다', async () => {
      await service.refundTutorQuota(userId, D);
      await service.refundGlobalTutorQuota(D);
      expect(await userDayCount(D)).toBeUndefined();
      expect(await globalDayCount(D)).toBeUndefined();
      await setUserDay(D, 0);
      await service.refundTutorQuota(userId, D);
      expect(await userDayCount(D)).toBe(0);
    });
  });
});
