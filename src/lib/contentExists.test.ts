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

  test('존재하는 slug + week1 + 임의 day는 true(day 존재 여부는 검증하지 않음 — 신규 day 콘텐츠가 재배포 전에도 열람 가능해야 함)', async () => {
    expect(await contentPathExists('/aws-certs/saa-c03/week1/day999')).toBe(true);
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
});
