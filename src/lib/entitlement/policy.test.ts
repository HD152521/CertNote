import { describe, expect, it } from 'vitest';
import { canAccessWeek, canTakeExam, FREE_WEEK, isPaidWeek, PAYWALL_ENABLED, resolveEntitlement } from './policy';
import type { EntitlementRecord } from './types';

// 구독제 보류(PAYWALL_ENABLED=false) 기준. 페이월을 되살리면 이 블록의 기대값이 전부 뒤집힌다 —
// 그때는 Week1 무료 / Week2+·모의고사 Pro 전용 단언으로 되돌린다.
describe('페이월이 꺼져 있을 때의 접근 판정', () => {
  it('스위치가 꺼져 있다', () => {
    expect(PAYWALL_ENABLED).toBe(false);
  });

  it('어떤 주차도 유료가 아니다', () => {
    expect(isPaidWeek(FREE_WEEK)).toBe(false);
    expect(isPaidWeek(FREE_WEEK + 1)).toBe(false);
    expect(isPaidWeek(16)).toBe(false);
  });

  it('free 플랜도 전 주차를 볼 수 있다', () => {
    expect(canAccessWeek('free', 1)).toBe(true);
    expect(canAccessWeek('free', 2)).toBe(true);
    expect(canAccessWeek('free', 16)).toBe(true);
    expect(canAccessWeek('pro', 16)).toBe(true);
  });

  it('모의고사는 플랜과 무관하게 허용된다(로그인 여부는 라우트가 판정)', () => {
    expect(canTakeExam('free')).toBe(true);
    expect(canTakeExam('pro')).toBe(true);
  });
});

describe('resolveEntitlement', () => {
  const now = new Date('2026-06-11T00:00:00Z');

  it('returns free for missing record', () => {
    expect(resolveEntitlement(null, now)).toEqual({ plan: 'free', isPro: false, periodEnd: null });
  });

  it('keeps pro when period has not ended', () => {
    const rec: EntitlementRecord = {
      plan: 'pro',
      planStatus: 'active',
      planSince: '2026-06-01T00:00:00Z',
      currentPeriodEnd: '2026-07-11T00:00:00Z',
    };
    expect(resolveEntitlement(rec, now).isPro).toBe(true);
  });

  it('keeps pro indefinitely when periodEnd is null (manual grant)', () => {
    const rec: EntitlementRecord = { plan: 'pro', planStatus: 'active', planSince: null, currentPeriodEnd: null };
    expect(resolveEntitlement(rec, now).isPro).toBe(true);
  });

  it('downgrades expired pro to free', () => {
    const rec: EntitlementRecord = {
      plan: 'pro',
      planStatus: 'active',
      planSince: '2026-04-01T00:00:00Z',
      currentPeriodEnd: '2026-05-01T00:00:00Z', // 과거
    };
    const ent = resolveEntitlement(rec, now);
    expect(ent.plan).toBe('free');
    expect(ent.isPro).toBe(false);
  });
});
