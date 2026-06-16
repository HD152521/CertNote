import type { Entitlement, EntitlementRecord, Plan } from './types';

// 무료로 열어주는 최대 주차. 마케팅 실험 시 이 상수 하나만 바꾼다.
export const FREE_WEEK = 1;

// 해당 주차 콘텐츠를 볼 수 있는가. week1(이하)은 누구나, 그 이상은 Pro만.
export function canAccessWeek(plan: Plan, week: number): boolean {
  return week <= FREE_WEEK || plan === 'pro';
}

// 모의고사는 Pro 전용.
export function canTakeExam(plan: Plan): boolean {
  return plan === 'pro';
}

export function isPro(ent: Entitlement): boolean {
  return ent.isPro;
}

// DB 레코드 → 유효 권한. Pro라도 기간이 지났으면 free로 강등한다(읽을 때 판정 — cron 불필요).
// now를 주입받아 순수 함수로 유지(테스트 용이).
export function resolveEntitlement(rec: EntitlementRecord | null, now: Date = new Date()): Entitlement {
  if (!rec) return { plan: 'free', isPro: false, periodEnd: null };
  let plan: Plan = rec.plan === 'pro' ? 'pro' : 'free';
  if (plan === 'pro' && rec.currentPeriodEnd && new Date(rec.currentPeriodEnd).getTime() < now.getTime()) {
    plan = 'free';
  }
  return { plan, isPro: plan === 'pro', periodEnd: rec.currentPeriodEnd };
}
