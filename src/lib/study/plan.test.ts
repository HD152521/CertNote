import { describe, expect, it } from 'vitest';
import { normalizeGoals } from './plan';

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
