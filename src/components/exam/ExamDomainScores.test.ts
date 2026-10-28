import { describe, expect, it } from 'vitest';
import { weakDomains, type DomainScore } from './ExamDomainScores';

const row = (domain: string, rate: number): DomainScore => ({ slug: 'saa-c03', domain, total: 10, correct: rate / 10, rate });

describe('weakDomains', () => {
  it('returns every domain under the passing mark', () => {
    expect(weakDomains([row('a', 40), row('b', 60), row('c', 90)], 72).map((d) => d.domain)).toEqual(['a', 'b']);
  });
  it('falls back to the lowest domain when all pass', () => {
    expect(weakDomains([row('a', 80), row('b', 95)], 72).map((d) => d.domain)).toEqual(['a']);
  });
  it('returns nothing for no rows', () => {
    expect(weakDomains([], 72)).toEqual([]);
  });
});
