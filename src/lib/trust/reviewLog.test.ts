import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { getLastReviewedMonth, lastReviewedMonth, parseReviewLog } from './reviewLog';

describe('parseReviewLog', () => {
  test('배열이 아니면 빈 목록', () => {
    expect(parseReviewLog({})).toEqual([]);
    expect(parseReviewLog(null)).toEqual([]);
  });

  test('형식이 틀린 항목은 버린다', () => {
    const entries = parseReviewLog([
      { cert: 'saa-c03', reviewedAt: '2026-10-20' },
      { cert: 'saa-c03', reviewedAt: '2026-10' }, // 일까지 없음
      { cert: '', reviewedAt: '2026-10-20' },
      { cert: 'saa-c03', week: 0, reviewedAt: '2026-10-20' },
      { cert: 'saa-c03', day: 2, reviewedAt: '2026-10-20' }, // week 없이 day
      { cert: 'saa-c03', week: 1, day: 1.5, reviewedAt: '2026-10-20' },
      'saa-c03',
    ]);
    expect(entries).toEqual([{ cert: 'saa-c03', reviewedAt: '2026-10-20' }]);
  });
});

describe('lastReviewedMonth', () => {
  const entries = parseReviewLog([
    { cert: 'saa-c03', reviewedAt: '2026-09-01' },
    { cert: 'saa-c03', week: 2, reviewedAt: '2026-10-05' },
    { cert: 'saa-c03', week: 2, day: 3, reviewedAt: '2026-11-02' },
    { cert: 'clf-c02', week: 1, day: 1, reviewedAt: '2026-10-23' },
  ]);

  test('기록이 없으면 null(날짜를 표시하지 않는다)', () => {
    expect(lastReviewedMonth(entries, 'dva-c02', 1, 1)).toBeNull();
    expect(lastReviewedMonth(entries, 'clf-c02', 1, 2)).toBeNull();
    expect(lastReviewedMonth([], 'saa-c03', 1, 1)).toBeNull();
  });

  test('자격증·주차·노트 범위 중 이 노트를 덮는 가장 최근 기록의 연월', () => {
    expect(lastReviewedMonth(entries, 'saa-c03', 1, 1)).toBe('2026-09');
    expect(lastReviewedMonth(entries, 'saa-c03', 2, 1)).toBe('2026-10');
    expect(lastReviewedMonth(entries, 'saa-c03', 2, 3)).toBe('2026-11');
    expect(lastReviewedMonth(entries, 'clf-c02', 1, 1)).toBe('2026-10');
  });
});

describe('content/review-log.json', () => {
  test('파일이 배열이고 모든 항목이 형식을 지킨다(틀린 항목이 조용히 버려지지 않게)', () => {
    const raw: unknown = JSON.parse(readFileSync(path.join(process.cwd(), 'content', 'review-log.json'), 'utf8'));
    expect(Array.isArray(raw)).toBe(true);
    expect(parseReviewLog(raw)).toHaveLength((raw as unknown[]).length);
  });

  test('영어판은 검수 기록을 쓰지 않는다', () => {
    expect(getLastReviewedMonth('en', 'saa-c03', 1, 1)).toBeNull();
  });
});
