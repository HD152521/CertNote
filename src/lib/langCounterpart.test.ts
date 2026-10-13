import { describe, expect, test } from 'vitest';
import { counterpart } from './langCounterpart';

// 헤더 KO/EN 토글의 도착지. 핵심: 한국어 week2+ 에서 EN 을 눌러도 리다이렉트 루프·404 가 없어야 한다.
describe('counterpart — 한국어에서 EN', () => {
  test('week1 day 는 같은 영어 day 로', () => {
    expect(counterpart('/aws/saa-c03/week1/day3', 'en')).toBe('/en/saa-c03/week1/day3');
  });

  test('week2+ day 는 영어 day 가 아니라 같은 자격증의 영어 허브로(한도 밖이면 307 로 되돌아오는 길을 만들지 않는다)', () => {
    for (const w of [2, 3, 12]) expect(counterpart(`/aws/saa-c03/week${w}/day1`, 'en')).toBe('/en/saa-c03');
  });

  test('허브는 영어 허브로, linux 와 그 밖의 경로는 영어 홈으로', () => {
    expect(counterpart('/aws/saa-c03', 'en')).toBe('/en/saa-c03');
    expect(counterpart('/linux/linux-master-1', 'en')).toBe('/en');
    expect(counterpart('/linux/linux-master-1/week2/day1', 'en')).toBe('/en');
    expect(counterpart('/', 'en')).toBe('/en');
  });

  test('도착지는 영어 day 가 필요한 경우를 빼면 절대 week2+ 영어 day URL 이 아니다', () => {
    for (let w = 2; w <= 16; w++) expect(counterpart(`/aws/dva-c02/week${w}/day2`, 'en')).not.toMatch(/\/en\/.+\/week/);
  });
});

describe('counterpart — 영어에서 KO', () => {
  test('영어 day/허브는 aws 섹션의 같은 자리로', () => {
    expect(counterpart('/en/saa-c03/week1/day2', 'ko')).toBe('/aws/saa-c03/week1/day2');
    expect(counterpart('/en/saa-c03', 'ko')).toBe('/aws/saa-c03');
    expect(counterpart('/en', 'ko')).toBe('/');
  });
});
