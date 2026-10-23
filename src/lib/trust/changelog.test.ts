import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { getChangelog, groupChangelogByDate, parseChangelog } from './changelog';

describe('parseChangelog', () => {
  test('배열이 아니면 빈 목록', () => {
    expect(parseChangelog({})).toEqual([]);
  });

  test('형식이 틀린 항목은 버린다', () => {
    const entries = parseChangelog([
      { date: '2026-10-23', kind: 'fact', summary: '정상' },
      { date: '2026-10', kind: 'fact', summary: '날짜 형식' },
      { date: '2026-10-23', kind: 'unknown', summary: '종류' },
      { date: '2026-10-23', kind: 'fact', summary: '  ' },
      { date: '2026-10-23', kind: 'fact', summary: '빈 cert', cert: '' },
    ]);
    expect(entries.map((e) => e.summary)).toEqual(['정상']);
  });

  test('날짜 역순, 같은 날짜는 파일 순서 유지', () => {
    const entries = parseChangelog([
      { date: '2026-10-01', kind: 'fact', summary: 'a' },
      { date: '2026-10-23', kind: 'exam', summary: 'b' },
      { date: '2026-10-23', kind: 'copy', summary: 'c' },
      { date: '2026-11-02', kind: 'quiz', summary: 'd' },
    ]);
    expect(entries.map((e) => e.summary)).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('groupChangelogByDate', () => {
  test('연속한 같은 날짜를 한 묶음으로', () => {
    const days = groupChangelogByDate(
      parseChangelog([
        { date: '2026-10-23', kind: 'exam', summary: 'b' },
        { date: '2026-10-23', kind: 'copy', summary: 'c' },
        { date: '2026-10-01', kind: 'fact', summary: 'a' },
      ]),
    );
    expect(days.map((d) => [d.date, d.entries.length])).toEqual([
      ['2026-10-23', 2],
      ['2026-10-01', 1],
    ]);
  });
});

describe('content/changelog.json', () => {
  test('모든 항목이 형식을 지킨다(틀린 항목이 조용히 버려지지 않게)', () => {
    const raw: unknown = JSON.parse(readFileSync(path.join(process.cwd(), 'content', 'changelog.json'), 'utf8'));
    expect(Array.isArray(raw)).toBe(true);
    expect(parseChangelog(raw)).toHaveLength((raw as unknown[]).length);
  });

  test('P4(2026-10-23) 수정 항목이 첫 기록으로 실려 있다', () => {
    const p4 = getChangelog().filter((e) => e.date === '2026-10-23').map((e) => e.summary);
    expect(p4.some((s) => s.includes('SAP-C02 시험 안내의 문항당 시간 계산 오류'))).toBe(true);
    expect(p4.some((s) => s.includes('홈 화면의 확인할 수 없는 비교·최상급 표현 삭제'))).toBe(true);
    expect(p4.length).toBeGreaterThanOrEqual(8);
  });
});
