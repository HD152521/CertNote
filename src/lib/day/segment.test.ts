import { describe, expect, test } from 'vitest';
import { parseDaySegment } from './segment';

// [week]/[day] 는 첫 요청 때 렌더되어 URL 별로 캐시된다(docs/P3-step1-day-cache-design.md).
// 같은 day 를 가리키는 변형 세그먼트("day1abc", "week02")를 받아들이면 변형마다 본문이 따로
// 캐시되므로 정규형만 통과시킨다.
describe('parseDaySegment', () => {
  test('정규형 세그먼트는 숫자로 파싱한다', () => {
    expect(parseDaySegment('week2', 'week')).toBe(2);
    expect(parseDaySegment('week12', 'week')).toBe(12);
    expect(parseDaySegment('day1', 'day')).toBe(1);
    expect(parseDaySegment('day10', 'day')).toBe(10);
  });

  test('prefix 가 다르거나 숫자가 없으면 null', () => {
    expect(parseDaySegment('day1', 'week')).toBeNull();
    expect(parseDaySegment('week', 'week')).toBeNull();
    expect(parseDaySegment('foo', 'day')).toBeNull();
    expect(parseDaySegment('', 'day')).toBeNull();
  });

  test('숫자 뒤에 다른 문자가 붙으면 null', () => {
    expect(parseDaySegment('day1abc', 'day')).toBeNull();
    expect(parseDaySegment('week2x', 'week')).toBeNull();
    expect(parseDaySegment('day1.5', 'day')).toBeNull();
    expect(parseDaySegment('day1 ', 'day')).toBeNull();
  });

  test('선행 0·부호·공백이 있으면 null', () => {
    expect(parseDaySegment('week02', 'week')).toBeNull();
    expect(parseDaySegment('day01', 'day')).toBeNull();
    expect(parseDaySegment('day-1', 'day')).toBeNull();
    expect(parseDaySegment('day+1', 'day')).toBeNull();
    expect(parseDaySegment('day 1', 'day')).toBeNull();
  });

  test('대소문자가 다른 prefix 는 null', () => {
    expect(parseDaySegment('Week2', 'week')).toBeNull();
    expect(parseDaySegment('DAY1', 'day')).toBeNull();
  });
});
