import { describe, expect, test } from 'vitest';
import { generateMetadata } from './page';

// SEO 색인 오류 회귀 테스트(docs/SEO-indexing-fix-plan.md Step 1).
//
// 배경: noindex day에서 generateMetadata가 { robots: 'noindex, nofollow' }만 반환하면 alternates를
// 지정하지 않은 셈이 되어 루트 레이아웃(src/app/layout.tsx)의 canonical('/')·languages(ko/en/x-default
// 전부 '/')를 그대로 상속한다. 그 결과 "noindex인데 canonical은 홈"이라는 Google이 금지하는 충돌
// 신호가 나갔다. 구독제 보류 이후 noindex로 남는 건 번역이 덜 된 영어판 Week2+뿐이다.
describe('generateMetadata — noindex day(영어판 week2+)', () => {
  const params = Promise.resolve({ category: 'en', slug: 'saa-c03', week: 'week2', day: 'day1' });

  test('robots는 noindex, nofollow를 유지한다', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.robots).toBe('noindex, nofollow');
  });

  test('canonical이 홈이 아니라 자기 자신의 URL이다', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.alternates?.canonical).toBe('/en/saa-c03/week2/day1');
  });

  test('루트 레이아웃에서 상속된 languages(홈을 가리키는 hreflang)가 남지 않는다', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.alternates?.languages).toBeUndefined();
  });
});

// 구독제 보류로 한국어 week2+는 색인 대상이 됐다.
describe('generateMetadata — 한국어 week2+ day 페이지(전 주차 공개)', () => {
  const params = Promise.resolve({ category: 'aws', slug: 'saa-c03', week: 'week2', day: 'day1' });

  test('robots가 없고(색인 허용) 제목·설명·자기참조 canonical을 갖는다', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toEqual(expect.stringContaining('SAA-C03'));
    expect(meta.description).toBeTruthy();
    expect(meta.alternates?.canonical).toBe('/aws/saa-c03/week2/day1');
  });

  test('영어판 짝이 noindex라 hreflang을 걸지 않는다(noindex를 가리키면 클러스터 무효화)', async () => {
    const meta = await generateMetadata({ params });
    expect(meta.alternates?.languages).toBeUndefined();
  });
});

// 회귀 방지: 무료 주차(week1)는 이번 변경의 대상이 아니며 기존 canonical/hreflang이 유지돼야 한다.
describe('generateMetadata — 무료 주차(week1) day 페이지 (회귀 확인)', () => {
  test('robots가 설정되지 않고(기본 색인 허용) 자기참조 canonical과 상호 hreflang을 반환한다', async () => {
    const params = Promise.resolve({ category: 'aws', slug: 'saa-c03', week: 'week1', day: 'day1' });
    const meta = await generateMetadata({ params });
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe('/aws/saa-c03/week1/day1');
    expect(meta.alternates?.languages).toEqual({
      ko: '/aws/saa-c03/week1/day1',
      en: '/en/saa-c03/week1/day1',
    });
  });
});
