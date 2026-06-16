import { query } from '../db';
import type { EntitlementRecord, EntitlementRepository, Plan } from './types';

interface Row {
  plan: Plan;
  plan_status: string | null;
  plan_since: string | null;
  current_period_end: string | null;
}

// EntitlementRepository의 Postgres 구현. users 테이블의 plan 컬럼을 읽고 쓴다(DIP).
export class PgEntitlementRepository implements EntitlementRepository {
  async getByUserId(userId: string): Promise<EntitlementRecord | null> {
    const rows = await query<Row>(
      'SELECT plan, plan_status, plan_since, current_period_end FROM users WHERE id = $1',
      [userId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      plan: r.plan === 'pro' ? 'pro' : 'free',
      planStatus: r.plan_status,
      planSince: r.plan_since,
      currentPeriodEnd: r.current_period_end,
    };
  }

  // until=null 이면 무기한 Pro(수동 부여). 결제 연동 시 webhook이 기간을 넘긴다.
  async grantPro(userId: string, until: Date | null): Promise<void> {
    await query(
      `UPDATE users
         SET plan = 'pro', plan_status = 'active', plan_since = now(), current_period_end = $2
       WHERE id = $1`,
      [userId, until],
    );
  }

  async revoke(userId: string): Promise<void> {
    await query(
      `UPDATE users
         SET plan = 'free', plan_status = 'canceled', current_period_end = now()
       WHERE id = $1`,
      [userId],
    );
  }
}
