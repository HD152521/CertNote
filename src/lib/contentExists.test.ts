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

  test('존재하는 slug + week1 + 존재하지 않는 day는 false(콘텐츠는 배포로만 바뀐다 — 소프트 404·캐시 방지)', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/week1/day999')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week1/day999')).toBe(false);
  });

  test('존재하는 week1 day는 true(섹션 URL·영어판 모두)', async () => {
    expect(await contentPathExists('/aws/saa-c03/week1/day1')).toBe(true);
    expect(await contentPathExists('/en/saa-c03/week1/day1')).toBe(true);
  });

  test.each([
    '/aws/saa-c03/week02/day1',
    '/aws/saa-c03/week2/day01',
    '/aws/saa-c03/week2abc/day1',
    '/aws/saa-c03/week2/day1x',
    '/aws/saa-c03/week2/day1.5',
    '/aws/saa-c03/week0/day1',
    '/aws/saa-c03/week2/day0',
  ])('비정규형 별칭 %s 는 false(같은 본문의 중복 URL·캐시 오염 방지)', async (p) => {
    expect(await contentPathExists(p)).toBe(false);
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

  test('3세그먼트(어떤 라우트도 매칭하지 않는 깊이)는 검증 없이 true — 이미 라우트 매칭 단계에서 404 처리됨', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/bogus')).toBe(true);
  });

  test.each([
    '/foo/bar/week2/day1',
    '/zzz/saa-c03/week5/day3',
    '/AWS/saa-c03/week2/day1',
    '/LINUX/linux-master-1/week2/day1',
    '/foo/bar',
    '/AWS/saa-c03',
    '/AWS',
  ])('알 수 없는/대소문자 다른 category %s 는 false', async (p) => {
    expect(await contentPathExists(p)).toBe(false);
  });

  test.each([
    '/aws/SAA-C03',
    '/aws/Saa-C03/week2/day1',
    '/aws/SAA-C03/week2/day1',
    '/en/SAA-C03/week1/day1',
    '/aws/saa-c03/WEEK2/day1',
  ])('slug·세그먼트 대소문자 불일치 %s 는 false(호스트 파일시스템 대소문자 무시에 의존하지 않는다)', async (p) => {
    expect(await contentPathExists(p)).toBe(false);
  });

  test('다른 섹션의 slug 는 false, 정확한 slug 는 true', async () => {
    expect(await contentPathExists('/linux/saa-c03/week2/day1')).toBe(false);
    expect(await contentPathExists('/aws/saa-c03/week2/day1')).toBe(true);
    expect(await contentPathExists('/aws')).toBe(true);
  });
});
