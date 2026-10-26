import { describe, expect, test } from 'vitest';
import { countCompletedDays, pickFocusPlan } from './focusPlan';

const plans = [
  { certSlug: 'clf-c02', examDate: '2026-10-01' },
  { certSlug: 'saa-c03', examDate: '2026-12-14' },
  { certSlug: 'dva-c02', examDate: '2027-02-01' },
];

describe('pickFocusPlan', () => {
  test('플랜이 없으면 null', () => {
    expect(pickFocusPlan([], 'saa-c03', '2026-10-26')).toBeNull();
  });

  test('프로필 목표 자격증의 플랜이 있으면 그것을 고른다', () => {
    expect(pickFocusPlan(plans, 'dva-c02', '2026-10-26')?.certSlug).toBe('dva-c02');
  });

  test('목표 플랜이 없으면 아직 지나지 않은 가장 가까운 시험', () => {
    expect(pickFocusPlan(plans, null, '2026-10-26')?.certSlug).toBe('saa-c03');
    expect(pickFocusPlan(plans, 'ans-c01', '2026-10-26')?.certSlug).toBe('saa-c03');
  });

  test('모든 시험이 지났으면 첫 플랜', () => {
    expect(pickFocusPlan(plans, null, '2027-03-01')?.certSlug).toBe('clf-c02');
  });
});

describe('countCompletedDays', () => {
  const qs: Record<string, { slug: string; week: number; day: number }> = {
    a: { slug: 'saa-c03', week: 1, day: 1 },
    b: { slug: 'saa-c03', week: 1, day: 1 },
    c: { slug: 'saa-c03', week: 1, day: 2 },
    d: { slug: 'saa-c03', week: 0, day: 0 },
    e: { slug: 'clf-c02', week: 1, day: 1 },
  };
  test('같은 day 의 여러 문제는 한 번, 모의고사·다른 자격증·없는 문제는 빼고 센다', () => {
    const attempts = ['a', 'b', 'c', 'd', 'e', 'zzz'].map((questionId) => ({ questionId }));
    expect(countCompletedDays(attempts, (id) => qs[id], 'saa-c03')).toBe(2);
  });
});
