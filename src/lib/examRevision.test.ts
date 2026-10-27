import { describe, expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { getExamInfo, isExamRevision } from './examInfo';
import { formatKoDate } from '@/components/ExamRevisionSection';
import { withAnd, withTo } from './koParticle';
import { isExamUpcoming, isUpcomingActive } from './examInfo';

const VALID = {
  previousCode: 'DOP-C01',
  newSince: '2023-03-07',
  changes: ['변경점'],
  sources: ['https://aws.amazon.com/'],
  checkedAt: '2026-10-27',
};

describe('isExamRevision', () => {
  test('accepts a minimal valid revision', () => {
    expect(isExamRevision(VALID)).toBe(true);
  });

  test('rejects a revision without changes or sources', () => {
    expect(isExamRevision({ ...VALID, changes: [] })).toBe(false);
    expect(isExamRevision({ ...VALID, sources: [] })).toBe(false);
    expect(isExamRevision({ ...VALID, changes: ['  '] })).toBe(false);
  });

  test('rejects dates that are not YYYY-MM-DD', () => {
    expect(isExamRevision({ ...VALID, newSince: '2023/03/07' })).toBe(false);
    expect(isExamRevision({ ...VALID, oldUntil: 'March 2023' })).toBe(false);
    expect(isExamRevision({ ...VALID, checkedAt: '' })).toBe(false);
  });

  test('rejects old domains without names', () => {
    expect(isExamRevision({ ...VALID, oldDomains: [{ weight: 20 }] })).toBe(false);
  });
});

describe('revision data in content/exam-info', () => {
  const slugs = readdirSync('content/exam-info').map((f) => f.replace(/\.json$/, ''));

  test('every authored revision is valid (an invalid one would be silently dropped)', async () => {
    const { readFileSync } = await import('node:fs');
    for (const slug of slugs) {
      const raw = JSON.parse(readFileSync(`content/exam-info/${slug}.json`, 'utf8'));
      if (raw.revision === undefined) continue;
      expect(isExamRevision(raw.revision), slug).toBe(true);
      expect(getExamInfo(slug)?.revision, slug).toBeDefined();
    }
  });

  test('old domain weights add up to 100 when given', () => {
    for (const slug of slugs) {
      const old = getExamInfo(slug)?.revision?.oldDomains;
      if (!old || !old.every((d) => typeof d.weight === 'number')) continue;
      expect(old.reduce((s, d) => s + (d.weight ?? 0), 0), slug).toBe(100);
    }
  });

  test('the previous code differs from the current code', () => {
    for (const slug of slugs) {
      const info = getExamInfo(slug);
      if (info?.revision) expect(info.revision.previousCode, slug).not.toBe(info.examCode);
    }
  });
});

describe('ExamRevisionSection helpers', () => {
  test('formats ISO dates in Korean without timezone shifts', () => {
    expect(formatKoDate('2023-03-07')).toBe('2023년 3월 7일');
  });

  test('picks 과/와 by how the last character is read', () => {
    expect(withAnd('DOP-C01')).toBe('DOP-C01과');
    expect(withAnd('SAA-C02')).toBe('SAA-C02와');
    expect(withAnd('DAS-C01')).toBe('DAS-C01과');
    expect(withAnd('SCS-C02')).toBe('SCS-C02와');
  });

  test('picks 으로/로 by how the last character is read', () => {
    expect(withTo('SAP-C03')).toBe('SAP-C03으로');
    expect(withTo('SAP-C02')).toBe('SAP-C02로');
    expect(withTo('DOP-C01')).toBe('DOP-C01로');
  });
});

describe('upcoming exam', () => {
  const U = { code: 'SAP-C03', since: '2026-11-17', changes: ['x'], sources: ['https://aws.amazon.com/'], checkedAt: '2026-10-27' };

  test('validates shape and dates', () => {
    expect(isExamUpcoming(U)).toBe(true);
    expect(isExamUpcoming({ ...U, since: 'soon' })).toBe(false);
    expect(isExamUpcoming({ ...U, changes: [] })).toBe(false);
  });

  test('is shown only before the first exam day', () => {
    expect(isUpcomingActive(U, '2026-11-16')).toBe(true);
    expect(isUpcomingActive(U, '2026-11-17')).toBe(false);
  });
});
