import { describe, expect, test } from 'vitest';
import { parseDaySegment } from './segment';

describe('parseDaySegment', () => {
  test('정규형 세그먼트는 정수로 파싱한다', () => {
    expect(parseDaySegment('week1', 'week')).toBe(1);
    expect(parseDaySegment('week12', 'week')).toBe(12);
    expect(parseDaySegment('day5', 'day')).toBe(5);
  });

  test.each(['week02', 'week0', 'week2abc', 'week2.5', 'week-1', 'week+2', 'week 2', 'week', 'week١', 'week2e1'])(
    '비정규형 %s 는 null(같은 본문의 별칭 URL·캐시 오염 방지)',
    (seg) => {
      expect(parseDaySegment(seg, 'week')).toBeNull();
    },
  );

  test('prefix 불일치·대소문자 불일치는 null', () => {
    expect(parseDaySegment('day1', 'week')).toBeNull();
    expect(parseDaySegment('Week1', 'week')).toBeNull();
    expect(parseDaySegment('', 'week')).toBeNull();
  });

  test('안전 정수 범위를 넘는 값은 null', () => {
    expect(parseDaySegment('day99999999999999999999', 'day')).toBeNull();
  });
});
