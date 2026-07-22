import { describe, expect, it } from 'vitest';
import { computeCatchUp, normalizeGoals } from './plan';

describe('normalizeGoals', () => {
  it('clamps target accuracy into 0~100 and rounds', () => {
    expect(normalizeGoals({ targetAccuracy: 82.6 }).targetAccuracy).toBe(83);
    expect(normalizeGoals({ targetAccuracy: 140 }).targetAccuracy).toBe(100);
    expect(normalizeGoals({ targetAccuracy: -5 }).targetAccuracy).toBe(0);
  });

  it('defaults to 70 when accuracy is missing or non-numeric', () => {
    expect(normalizeGoals({}).targetAccuracy).toBe(70);
    expect(normalizeGoals({ targetAccuracy: 'abc' }).targetAccuracy).toBe(70);
  });

  it('treats empty/null daily minutes as no goal', () => {
    expect(normalizeGoals({ dailyMinutesGoal: '' }).dailyMinutesGoal).toBeNull();
    expect(normalizeGoals({ dailyMinutesGoal: null }).dailyMinutesGoal).toBeNull();
    expect(normalizeGoals({}).dailyMinutesGoal).toBeNull();
  });

  it('accepts positive daily minutes, caps at 600, rejects non-positive', () => {
    expect(normalizeGoals({ dailyMinutesGoal: 45 }).dailyMinutesGoal).toBe(45);
    expect(normalizeGoals({ dailyMinutesGoal: 999 }).dailyMinutesGoal).toBe(600);
    expect(normalizeGoals({ dailyMinutesGoal: 0 }).dailyMinutesGoal).toBeNull();
    expect(normalizeGoals({ dailyMinutesGoal: -10 }).dailyMinutesGoal).toBeNull();
  });
});

describe('computeCatchUp', () => {
  const base = { totalDays: 100, basePerDay: 2 };

  it('is not behind when within threshold', () => {
    // 기대 20, 완료 18 → 2일 뒤(임계 3 미만).
    const r = computeCatchUp({ ...base, scheduledIndex: 20, completedDays: 18, dday: 40 });
    expect(r.isBehind).toBe(false);
    expect(r.perDay).toBe(2);
    expect(r.behindBy).toBe(2);
  });

  it('flags behind and raises perDay past the threshold', () => {
    // 기대 30, 완료 20 → 10일 뒤처짐. 남은 80일치를 남은 40일에 → 2/day였지만 catch-up.
    const r = computeCatchUp({ ...base, scheduledIndex: 30, completedDays: 20, dday: 40 });
    expect(r.isBehind).toBe(true);
    expect(r.behindBy).toBe(10);
    expect(r.perDay).toBeGreaterThanOrEqual(2);
  });

  it('redistributes remaining work across remaining days', () => {
    // 완료 20 → 남은 80, dday 20 → 4/day 필요.
    const r = computeCatchUp({ totalDays: 100, basePerDay: 2, scheduledIndex: 40, completedDays: 20, dday: 20 });
    expect(r.perDay).toBe(4);
  });

  it('caps intensity at MAX_INTENSITY× base', () => {
    // 매우 뒤처짐 + 짧은 기간 → 상한(base*3=6)으로 제한.
    const r = computeCatchUp({ totalDays: 100, basePerDay: 2, scheduledIndex: 90, completedDays: 10, dday: 2 });
    expect(r.perDay).toBe(6);
  });

  it('never drops perDay below base even when behind', () => {
    const r = computeCatchUp({ totalDays: 100, basePerDay: 5, scheduledIndex: 50, completedDays: 40, dday: 200 });
    expect(r.perDay).toBeGreaterThanOrEqual(5);
  });
});
