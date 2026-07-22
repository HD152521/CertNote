import { describe, expect, it } from 'vitest';
import { parseSentCodes, pickMilestone } from './milestones';

const none = new Set<string>();

describe('pickMilestone', () => {
  it('returns null when no threshold met', () => {
    expect(pickMilestone({ streak: 3, coverage: 20 }, none)).toBeNull();
  });

  it('celebrates the highest-priority achievement first', () => {
    // streak30 + cov50 동시 → 우선순위상 streak30이 cov50보다 위.
    expect(pickMilestone({ streak: 30, coverage: 50 }, none)?.code).toBe('streak30');
    // cov100이 최상위.
    expect(pickMilestone({ streak: 30, coverage: 100 }, none)?.code).toBe('cov100');
  });

  it('picks streak7 at exactly 7 days', () => {
    expect(pickMilestone({ streak: 7, coverage: 0 }, none)?.code).toBe('streak7');
  });

  it('skips already-celebrated codes', () => {
    const sent = new Set(['streak7']);
    // streak 8 → streak7 이미 보냄, 다른 임계 미달 → null.
    expect(pickMilestone({ streak: 8, coverage: 10 }, sent)).toBeNull();
  });

  it('advances to the next milestone after a lower one was sent', () => {
    const sent = new Set(['streak7', 'cov50']);
    expect(pickMilestone({ streak: 30, coverage: 60 }, sent)?.code).toBe('streak30');
  });

  it('does not resend a lower milestone after a higher one', () => {
    const sent = new Set(['cov100', 'streak30', 'cov50', 'streak7']);
    expect(pickMilestone({ streak: 40, coverage: 100 }, sent)).toBeNull();
  });
});

describe('parseSentCodes', () => {
  it('parses a CSV into a set', () => {
    expect([...parseSentCodes('streak7,cov50')].sort()).toEqual(['cov50', 'streak7']);
  });
  it('handles null and empty', () => {
    expect(parseSentCodes(null).size).toBe(0);
    expect(parseSentCodes('').size).toBe(0);
  });
});
