import { describe, expect, it } from 'vitest';
import { predictPass, type PassPredictorInput } from './passPredictor';

const base: PassPredictorInput = {
  coverage: 50,
  accuracy: 70,
  recentAccuracy: null,
  totalQuestions: 100,
  attemptedQuestions: 50,
  dday: 30,
};

const withInput = (over: Partial<PassPredictorInput>): PassPredictorInput => ({ ...base, ...over });

describe('predictPass', () => {
  it('caps probability very low before any practice (cold start)', () => {
    const p = predictPass(withInput({ coverage: 0, accuracy: 0, attemptedQuestions: 0 }));
    expect(p.probability).toBeLessThanOrEqual(10);
    expect(p.verdict).toBe('at_risk');
  });

  it('predicts high with full coverage, strong accuracy, and ample time', () => {
    const p = predictPass(
      withInput({ coverage: 100, accuracy: 90, attemptedQuestions: 100, dday: 30 }),
    );
    expect(p.probability).toBeGreaterThanOrEqual(80);
    expect(p.verdict).toBe('on_track');
    expect(p.requiredDailyQuestions).toBe(0); // 이미 목표 도달
  });

  it('flags at_risk when the exam has passed but coverage is low', () => {
    const p = predictPass(withInput({ dday: 0, coverage: 20, accuracy: 60, attemptedQuestions: 20 }));
    expect(p.probability).toBeLessThanOrEqual(35);
    expect(p.verdict).toBe('at_risk');
  });

  it('computes required daily pace toward target coverage', () => {
    // target 90% of 100 = 90 needed, attempted 50 → remaining 40, over 20 days = 2/day.
    const p = predictPass(withInput({ coverage: 50, attemptedQuestions: 50, dday: 20 }));
    expect(p.requiredDailyQuestions).toBe(2);
    expect(p.requiredDailyMinutes).toBe(4);
  });

  it('penalizes when required pace exceeds a feasible daily load', () => {
    // remaining 40, dday 1 → 40/day (over feasible 20) → time-pressure haircut.
    const tight = predictPass(withInput({ dday: 1, coverage: 50, attemptedQuestions: 50, accuracy: 80 }));
    const relaxed = predictPass(withInput({ dday: 40, coverage: 50, attemptedQuestions: 50, accuracy: 80 }));
    expect(tight.requiredDailyQuestions).toBeGreaterThan(20);
    expect(tight.probability).toBeLessThan(relaxed.probability);
  });

  it('marks no schedule when dday is null and still returns a probability', () => {
    const p = predictPass(withInput({ dday: null, coverage: 80, accuracy: 85, attemptedQuestions: 80 }));
    expect(p.hasSchedule).toBe(false);
    expect(p.requiredDailyQuestions).toBe(0);
    expect(p.probability).toBeGreaterThan(0);
  });

  it('uses recentAccuracy over overall accuracy when provided (trend-aware)', () => {
    const declining = predictPass(withInput({ accuracy: 80, recentAccuracy: 40 }));
    const improving = predictPass(withInput({ accuracy: 80, recentAccuracy: 95 }));
    expect(declining.probability).toBeLessThan(improving.probability);
  });

  it('keeps probability within 0~100', () => {
    const p = predictPass(withInput({ coverage: 100, accuracy: 100, recentAccuracy: 100, attemptedQuestions: 100 }));
    expect(p.probability).toBeGreaterThanOrEqual(0);
    expect(p.probability).toBeLessThanOrEqual(100);
  });
});
