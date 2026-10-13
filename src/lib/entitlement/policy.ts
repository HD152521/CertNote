import type { Entitlement, EntitlementRecord, Plan } from './types';

// 구독제(페이월) 스위치. 2026-10 결정: 구독제를 보류하고 전 주차를 공개한다.
// 모의고사·AI 튜터·마이페이지는 로그인만 요구한다(플랜 무관, 각 라우트가 401로 판정).
// 되살릴 때는 이 값을 true로 — 아래 판정 함수들이 Week1 무료/Pro 전용 규칙으로 돌아간다.
//
// 주의: true 로 되살리려면 src/app/{aws,linux,en}/[slug]/[week]/[day]/page.tsx 세 파일을 다시
// 동적(force-dynamic)으로 돌려야 한다. 그 라우트는 지금 쿠키를 읽지 않는 전제로 요청 시 렌더 결과를 영구 캐시하므로, 그대로
// 두면 잠금이 풀린 페이지가 캐시로 모두에게 나가거나 cookies() 호출이 DYNAMIC_SERVER_USAGE 500 을 낸다.
// (paywallStaticGuard.test.ts 가 이 조합을 실패시킨다.)
// 단, 화면 문구(랜딩·허브·튜터 안내)와 /pricing 리다이렉트(next.config.ts)는 따로 되돌려야 한다.
export const PAYWALL_ENABLED: boolean = false;

// 정적 프리렌더되는 주차(week1/[day] 라우트). 페이월이 켜져 있을 때는 무료 주차의 상한이기도 하다.
export const FREE_WEEK = 1;

// 페이월에 막히는 주차인가. 페이월이 꺼져 있으면 어떤 주차도 유료가 아니다.
export function isPaidWeek(week: number): boolean {
  return PAYWALL_ENABLED && week > FREE_WEEK;
}

// 해당 주차 콘텐츠를 볼 수 있는가.
export function canAccessWeek(plan: Plan, week: number): boolean {
  return !isPaidWeek(week) || plan === 'pro';
}

// 모의고사 응시 가능 여부. 로그인 여부는 라우트가 따로 판정한다.
export function canTakeExam(plan: Plan): boolean {
  return !PAYWALL_ENABLED || plan === 'pro';
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
