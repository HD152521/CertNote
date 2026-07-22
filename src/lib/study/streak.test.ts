import { describe, expect, it } from 'vitest';
import { computeStreak, daysBetween, longestRunOf, nextDate, prevDate } from './streak';

const TODAY = '2026-07-22';
const NO_FREEZE = { tokensAvailable: false, frozenDate: null };

describe('date helpers', () => {
  it('prev/next date cross month boundaries', () => {
    expect(prevDate('2026-08-01')).toBe('2026-07-31');
    expect(nextDate('2026-07-31')).toBe('2026-08-01');
  });
  it('daysBetween counts calendar days', () => {
    expect(daysBetween('2026-07-15', '2026-07-22')).toBe(7);
  });
});

describe('computeStreak', () => {
  it('counts consecutive days up to today', () => {
    const r = computeStreak(['2026-07-22', '2026-07-21', '2026-07-20'], TODAY, NO_FREEZE);
    expect(r.current).toBe(3);
    expect(r.activeToday).toBe(true);
  });

  it('counts from yesterday when today is not yet active', () => {
    const r = computeStreak(['2026-07-21', '2026-07-20'], TODAY, NO_FREEZE);
    expect(r.current).toBe(2);
    expect(r.activeToday).toBe(false);
  });

  it('breaks at the first gap without a freeze', () => {
    const r = computeStreak(['2026-07-22', '2026-07-20', '2026-07-19'], TODAY, NO_FREEZE);
    expect(r.current).toBe(1); // 21일 공백에서 끊김
    expect(r.freezeUsedOn).toBeNull();
  });

  it('bridges a single gap with a fresh freeze token', () => {
    const r = computeStreak(['2026-07-22', '2026-07-20', '2026-07-19'], TODAY, {
      tokensAvailable: true,
      frozenDate: null,
    });
    expect(r.current).toBe(3); // 22 + (21 메움) + 20 + 19 → 활동 3일
    expect(r.freezeUsedOn).toBe('2026-07-21');
  });

  it('keeps an already-frozen day bridged without spending a new token', () => {
    const r = computeStreak(['2026-07-22', '2026-07-20', '2026-07-19'], TODAY, {
      tokensAvailable: false,
      frozenDate: '2026-07-21',
    });
    expect(r.current).toBe(3);
    expect(r.freezeUsedOn).toBeNull(); // 이미 메운 날 → 추가 소비 없음
  });

  it('bridges only one gap even with a token', () => {
    const r = computeStreak(['2026-07-22', '2026-07-20', '2026-07-18'], TODAY, {
      tokensAvailable: true,
      frozenDate: null,
    });
    expect(r.current).toBe(2); // 22 + (21 메움) + 20, 그다음 19 공백은 못 메움
    expect(r.freezeUsedOn).toBe('2026-07-21');
  });

  it('returns 0 when nothing recent', () => {
    const r = computeStreak(['2026-06-01'], TODAY, NO_FREEZE);
    expect(r.current).toBe(0);
  });

  it('computes longest run independent of current', () => {
    // 최장 5일 구간(과거) + 현재 1일.
    const r = computeStreak(
      ['2026-07-22', '2026-07-10', '2026-07-09', '2026-07-08', '2026-07-07', '2026-07-06'],
      TODAY,
      NO_FREEZE,
    );
    expect(r.current).toBe(1);
    expect(r.longest).toBe(5);
  });
});

describe('longestRunOf', () => {
  it('finds the longest consecutive run', () => {
    expect(longestRunOf(new Set(['2026-07-01', '2026-07-02', '2026-07-05']))).toBe(2);
  });
  it('is 0 for empty', () => {
    expect(longestRunOf(new Set())).toBe(0);
  });
});
