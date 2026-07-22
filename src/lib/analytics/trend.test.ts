import { describe, expect, it } from 'vitest';
import { buildDailyTrend } from './trend';

const DAYS = ['2026-07-20', '2026-07-21', '2026-07-22'];

describe('buildDailyTrend', () => {
  it('aggregates attempts per day with accuracy', () => {
    const trend = buildDailyTrend(
      [
        { day: '2026-07-21', correct: true },
        { day: '2026-07-21', correct: false },
        { day: '2026-07-22', correct: true },
      ],
      DAYS,
    );
    expect(trend).toEqual([
      { date: '2026-07-20', attempts: 0, correct: 0, accuracy: null },
      { date: '2026-07-21', attempts: 2, correct: 1, accuracy: 50 },
      { date: '2026-07-22', attempts: 1, correct: 1, accuracy: 100 },
    ]);
  });

  it('fills empty days with null accuracy (distinct from 0%)', () => {
    const trend = buildDailyTrend([], DAYS);
    expect(trend.every((p) => p.attempts === 0 && p.accuracy === null)).toBe(true);
    expect(trend).toHaveLength(3);
  });

  it('ignores attempts outside the window', () => {
    const trend = buildDailyTrend([{ day: '2026-01-01', correct: true }], DAYS);
    expect(trend.reduce((s, p) => s + p.attempts, 0)).toBe(0);
  });

  it('preserves the given day order', () => {
    const trend = buildDailyTrend([], DAYS);
    expect(trend.map((p) => p.date)).toEqual(DAYS);
  });
});
