import { describe, expect, it } from 'vitest';
import { nextScheduleSM2, qualityFromResult, type Sm2State } from './sm2';

const FRESH: Sm2State = { ef: 2.5, interval: 0, reps: 0 };
const NOW = new Date('2026-07-22T00:00:00Z');
const daysAfter = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('qualityFromResult', () => {
  it('maps correct→4, wrong→2', () => {
    expect(qualityFromResult(true)).toBe(4);
    expect(qualityFromResult(false)).toBe(2);
  });
});

describe('nextScheduleSM2', () => {
  it('first correct → interval 1, reps 1', () => {
    const r = nextScheduleSM2(FRESH, 4, NOW);
    expect(r.interval).toBe(1);
    expect(r.reps).toBe(1);
    expect(r.dueAt).toEqual(daysAfter(1));
  });

  it('second correct → interval 6, reps 2', () => {
    const r = nextScheduleSM2({ ef: 2.5, interval: 1, reps: 1 }, 4, NOW);
    expect(r.interval).toBe(6);
    expect(r.reps).toBe(2);
  });

  it('third+ correct → interval = round(prev * EF)', () => {
    const r = nextScheduleSM2({ ef: 2.5, interval: 6, reps: 2 }, 4, NOW);
    expect(r.interval).toBe(15); // round(6 * 2.5)
    expect(r.reps).toBe(3);
  });

  it('wrong answer resets reps and interval to 1', () => {
    const r = nextScheduleSM2({ ef: 2.5, interval: 15, reps: 3 }, 2, NOW);
    expect(r.reps).toBe(0);
    expect(r.interval).toBe(1);
    expect(r.dueAt).toEqual(daysAfter(1));
  });

  it('keeps EF unchanged for a clean correct (q=4)', () => {
    const r = nextScheduleSM2(FRESH, 4, NOW);
    expect(r.ef).toBeCloseTo(2.5, 5);
  });

  it('lowers EF on failure', () => {
    const r = nextScheduleSM2(FRESH, 2, NOW);
    expect(r.ef).toBeLessThan(2.5);
  });

  it('never lets EF fall below 1.3', () => {
    let state: Sm2State = { ef: 1.3, interval: 1, reps: 0 };
    for (let i = 0; i < 5; i += 1) state = nextScheduleSM2(state, 0, NOW);
    expect(state.ef).toBeGreaterThanOrEqual(1.3);
  });

  it('personalizes interval by EF — easier items space out faster', () => {
    const easy = nextScheduleSM2({ ef: 2.8, interval: 6, reps: 2 }, 5, NOW);
    const hard = nextScheduleSM2({ ef: 1.6, interval: 6, reps: 2 }, 3, NOW);
    expect(easy.interval).toBeGreaterThan(hard.interval);
  });

  it('repairs a corrupt below-floor stored EF', () => {
    const r = nextScheduleSM2({ ef: 0.5, interval: 6, reps: 2 }, 4, NOW);
    expect(r.ef).toBeGreaterThanOrEqual(1.3);
    expect(r.interval).toBeGreaterThanOrEqual(1);
  });

  it('clamps out-of-range quality', () => {
    expect(() => nextScheduleSM2(FRESH, 9, NOW)).not.toThrow();
    const r = nextScheduleSM2(FRESH, 9, NOW);
    expect(r.reps).toBe(1); // treated as pass
  });
});
