import { describe, expect, test } from 'vitest';
import { dayHeadline, stripDayPrefix } from './dayTitle';

describe('stripDayPrefix — 본문 제목 앞 "Day N -" 를 뗀다', () => {
  test.each([
    ['Day 1 - AWS 인프라의 지도', 'AWS 인프라의 지도'],
    ['Day 12 – EBS vs Instance Store', 'EBS vs Instance Store'],
    ['day 3 -  공백이 많아도', '공백이 많아도'],
    ['Day 2: 콜론 표기', '콜론 표기'],
  ])('%s', (raw, expected) => {
    expect(stripDayPrefix(raw)).toBe(expected);
  });

  test('접두어가 없으면 그대로 둔다', () => {
    expect(stripDayPrefix('S3 스토리지 클래스')).toBe('S3 스토리지 클래스');
    expect(stripDayPrefix('Daydream - 제목')).toBe('Daydream - 제목');
  });

  test('접두어만 있는 제목은 비우지 않는다', () => {
    expect(stripDayPrefix('Day 5')).toBe('Day 5');
  });
});

describe('dayHeadline — 검색 결과 제목(title·headline)', () => {
  test('주제어를 앞세우고 시험 코드를 붙인다', () => {
    expect(dayHeadline('Day 1 - AWS 인프라의 지도', 'SAA-C03')).toBe('AWS 인프라의 지도 — SAA-C03');
  });
});
