import { describe, expect, test } from 'vitest';
import { MAX_ENTRIES, pickCurrentHeading, putPosition, resumeHref, shouldOfferResume, type ReadingPosition } from './readingPosition';

const pos = (over: Partial<ReadingPosition> = {}): ReadingPosition => ({
  headingId: 'iam-정책',
  headingText: 'IAM 정책',
  ratio: 0.5,
  at: 1000,
  ...over,
});

describe('shouldOfferResume', () => {
  test('offers resume in the middle of a note', () => {
    expect(shouldOfferResume(pos())).toBe(true);
  });

  test('skips when barely started, finished, missing, or without a heading', () => {
    expect(shouldOfferResume(pos({ ratio: 0.05 }))).toBe(false);
    expect(shouldOfferResume(pos({ ratio: 0.99 }))).toBe(false);
    expect(shouldOfferResume(undefined)).toBe(false);
    expect(shouldOfferResume(pos({ headingId: '' }))).toBe(false);
  });
});

describe('putPosition', () => {
  test('does not mutate the input store', () => {
    const store = { '/a': pos() };
    putPosition(store, '/b', pos({ at: 2000 }));
    expect(Object.keys(store)).toEqual(['/a']);
  });

  test('keeps only the most recent entries', () => {
    let store = {};
    for (let i = 0; i < MAX_ENTRIES + 5; i++) store = putPosition(store, `/d${i}`, pos({ at: i }));
    const keys = Object.keys(store);
    expect(keys).toHaveLength(MAX_ENTRIES);
    expect(keys).toContain(`/d${MAX_ENTRIES + 4}`);
    expect(keys).not.toContain('/d0');
  });

  test('overwrites the same note', () => {
    const store = putPosition({ '/a': pos({ at: 1 }) }, '/a', pos({ at: 2, headingId: 'x' }));
    expect(store['/a'].headingId).toBe('x');
  });
});

describe('pickCurrentHeading', () => {
  const hs = [{ id: 'a', top: 500 }, { id: 'b', top: 1500 }, { id: 'c', top: 3000 }];

  test('returns null before the first heading', () => {
    expect(pickCurrentHeading(hs, 0)).toBeNull();
  });

  test('returns the last heading that passed the top offset', () => {
    expect(pickCurrentHeading(hs, 1404)?.id).toBe('b');
    expect(pickCurrentHeading(hs, 1403)?.id).toBe('a');
    expect(pickCurrentHeading(hs, 99999)?.id).toBe('c');
  });
});

describe('resumeHref', () => {
  test('adds an encoded heading anchor only when resume is worth offering', () => {
    expect(resumeHref('/aws/saa-c03/week1/day2', pos())).toBe(`/aws/saa-c03/week1/day2#${encodeURIComponent('iam-정책')}`);
    expect(resumeHref('/aws/saa-c03/week1/day2', pos({ ratio: 0.02 }))).toBe('/aws/saa-c03/week1/day2');
    expect(resumeHref('/x', undefined)).toBe('/x');
  });
});
