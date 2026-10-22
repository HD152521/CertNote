import { describe, expect, test } from 'vitest';
import { contentPathExists } from './contentExists';

// docs/SEO-indexing-fix-plan.md Step6 소프트 404 수정 회귀 테스트.
//
// 배경: src/app/loading.tsx가 전역 스트리밍을 켜놓아 존재하지 않는 category/slug/week/day
// 요청도 page.tsx의 notFound()가 200으로 나갔다(헤더가 이미 200으로 나간 뒤라 상태코드를
// 바꿀 수 없음). src/proxy.ts가 렌더 시작 "전"에 이 함수로 존재 여부를 판정해 진짜 404
// 라우트로 rewrite한다 — 이 함수의 판정 로직 자체가 회귀 방지의 핵심이다.
describe('contentPathExists', () => {
  test('1세그먼트(/aws-certs, /en)는 항상 true — 카테고리 라우트가 별도로 처리', async () => {
    expect(await contentPathExists('/aws-certs')).toBe(true);
    expect(await contentPathExists('/en')).toBe(true);
  });

  test('존재하는 자격증 slug(2세그먼트)는 true', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03')).toBe(true);
  });

  test('존재하지 않는 자격증 slug(2세그먼트)는 false', async () => {
    expect(await contentPathExists('/aws-certs/nonexistent-cert')).toBe(false);
  });

  test('존재하지 않는 slug + week1/day(4세그먼트)는 false', async () => {
    expect(await contentPathExists('/aws-certs/nope/week1/day1')).toBe(false);
  });

  test('week1 도 day 번호의 존재를 검증한다 — 없는 day 는 false(렌더되면 200 소프트 404 로 캐시된다)', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/week1/day999')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week1/day99')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week1/day6')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week1/day0')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week1/day5')).toBe(true);
  });

  test('알 수 없는 category 와 대소문자만 다른 category 는 false', async () => {
    expect(await contentPathExists('/foo/bar/week2/day1')).toBe(false);
    expect(await contentPathExists('/foo')).toBe(false);
    expect(await contentPathExists('/AWS/saa-c03/week2/day1')).toBe(false);
    expect(await contentPathExists('/Linux/linux-master-1')).toBe(false);
  });

  test('slug 는 인덱스와 대소문자까지 정확히 일치해야 한다(대소문자 무시 파일시스템에서도)', async () => {
    expect(await contentPathExists('/aws/SAA-C03/week2/day1')).toBe(false);
    expect(await contentPathExists('/aws/Saa-c03')).toBe(false);
    expect(await contentPathExists('/aws/reviews/SAA-C03')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03')).toBe(true);
  });

  test('존재하는 slug + 존재하는 week/day(paid, 4세그먼트)는 true', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/week2/day1')).toBe(true);
  });

  test('존재하는 slug + 존재하지 않는 slug(2세그먼트)/week1이 아닌 잘못된 slug 조합은 false', async () => {
    expect(await contentPathExists('/aws-certs/nope/week2/day1')).toBe(false);
  });

  test('존재하는 slug + 범위를 벗어난 week(4세그먼트, week1 아님)는 false', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/week99/day1')).toBe(false);
  });

  test('week/day 형식이 아니면 false', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/foo/bar')).toBe(false);
  });

  // [week]/[day] 는 URL 별로 캐시된다(docs/P3-step1-day-cache-design.md). 같은 day 를 가리키는
  // 변형 URL 을 존재한다고 판정하면 변형마다 본문이 따로 캐시되므로 정규형만 통과시킨다.
  test('숫자 뒤에 다른 문자가 붙은 week/day 세그먼트는 false', async () => {
    expect(await contentPathExists('/aws/saa-c03/week2/day1abc')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week2abc/day1')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week2/day1.5')).toBe(false);
  });

  test('선행 0 이 붙은 week/day 세그먼트는 false', async () => {
    expect(await contentPathExists('/aws/saa-c03/week02/day1')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week2/day01')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week01/day1')).toBe(false);
  });

  test('week1 도 day 세그먼트는 정규형이어야 한다(day 번호의 존재 여부만 검증하지 않는다)', async () => {
    expect(await contentPathExists('/aws/saa-c03/week1/day1')).toBe(true);
    expect(await contentPathExists('/aws/saa-c03/week1/day1abc')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week1/day01')).toBe(false);
  });

  test('정규형 섹션 URL(week2 이상)은 기존대로 true, 없는 day 번호는 false', async () => {
    expect(await contentPathExists('/aws/saa-c03/week2/day1')).toBe(true);
    expect(await contentPathExists('/en/saa-c03/week2/day1')).toBe(true);
    expect(await contentPathExists('/aws/saa-c03/week2/day9')).toBe(false);
    expect(await contentPathExists('/linux/saa-c03/week2/day1')).toBe(false);
  });

  test('3세그먼트(어떤 라우트도 매칭하지 않는 깊이)는 검증 없이 true — 이미 라우트 매칭 단계에서 404 처리됨', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/bogus')).toBe(true);
  });
});
