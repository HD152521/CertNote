import { describe, expect, it } from 'vitest';
import { canAccessWeek, canTakeExam, FREE_WEEK, resolveEntitlement } from './policy';
import type { EntitlementRecord } from './types';

describe('canAccessWeek', () => {
  it('allows week1 for free plan', () => {
    expect(canAccessWeek('free', 1)).toBe(true);
  });

  it('blocks week2+ for free plan', () => {
    expect(canAccessWeek('free', 2)).toBe(false);
    expect(canAccessWeek('free', 16)).toBe(false);
  });

  it('allows every week for pro plan', () => {
    expect(canAccessWeek('pro', 1)).toBe(true);
    expect(canAccessWeek('pro', 16)).toBe(true);
  });

  it('honors FREE_WEEK boundary exactly', () => {
    expect(canAccessWeek('free', FREE_WEEK)).toBe(true);
    expect(canAccessWeek('free', FREE_WEEK + 1)).toBe(false);
  });
});

describe('canTakeExam', () => {
  it('is pro-only', () => {
    expect(canTakeExam('pro')).toBe(true);
    expect(canTakeExam('free')).toBe(false);
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
