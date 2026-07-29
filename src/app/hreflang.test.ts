import { describe, expect, test } from 'vitest';
import { metadata as homeMetadata } from './page';
import { metadata as enHomeMetadata } from './en/page';
import { generateMetadata as generateCategoryMetadata } from './[category]/page';
import { generateMetadata as generateCertMetadata } from './[category]/[slug]/page';
import { generateMetadata as generateDayMetadata } from './[category]/[slug]/[week]/[day]/page';

// SEO 색인 오류 회귀 테스트(docs/SEO-indexing-fix-plan.md Step 3).
//
// 배경: `/`와 `/aws-certs`가 둘 다 `/en`을 자기 영어판이라 주장했지만 `/en`은 `/`만 되받아
// 상호 참조가 성립하지 않았다. hreflang은 A→B, B→A가 모두 성립해야 유효하고, 하나라도
// 깨지면 구글이 클러스터 전체를 무시한다. 이 파일은 실제 페이지 모듈의 generateMetadata를
// 호출해 "A가 B를 가리키면 B도 A를 가리킨다"를 자동으로 검증한다.

describe('hreflang 상호 참조 — 최상위 3개(/, /aws, /en)', () => {
  test('홈(/)은 hreflang 언어 쌍을 선언하지 않는다(영어판 URL이 따로 없음)', () => {
    expect(homeMetadata.alternates?.canonical).toBe('/');
    expect(homeMetadata.alternates?.languages).toBeUndefined();
  });

  test('/aws ↔ /en 이 완전히 동일한 languages 객체로 상호 참조한다', async () => {
    const hub = await generateCategoryMetadata({ params: Promise.resolve({ category: 'aws' }) });

    expect(hub.alternates?.canonical).toBe('/aws');
    expect(enHomeMetadata.alternates?.canonical).toBe('/en');

    // 자기참조 + 상호참조: 두 페이지가 선언하는 languages 객체가 완전히 같아야 한다.
    expect(hub.alternates?.languages).toEqual(enHomeMetadata.alternates?.languages);
    expect(hub.alternates?.languages).toEqual({ ko: '/aws', en: '/en', 'x-default': '/aws' });
  });

  test('x-default는 사이트 전체에서 정확히 하나의 URL(/aws)만 가리킨다', async () => {
    const hub = await generateCategoryMetadata({ params: Promise.resolve({ category: 'aws' }) });
    expect(hub.alternates?.languages).toMatchObject({ 'x-default': '/aws' });
    expect(enHomeMetadata.alternates?.languages).toMatchObject({ 'x-default': '/aws' });
    // 홈은 hreflang 자체가 없으므로 x-default도 선언하지 않는다 — 중복 선언 방지.
    expect(homeMetadata.alternates?.languages).toBeUndefined();
  });
});

describe('hreflang 상호 참조 — 자격증 허브(/aws/saa-c03 ↔ /en/saa-c03)', () => {
  test('양쪽 페이지의 languages가 완전히 동일하다(회귀 확인)', async () => {
    const ko = await generateCertMetadata({ params: Promise.resolve({ category: 'aws', slug: 'saa-c03' }) });
    const en = await generateCertMetadata({ params: Promise.resolve({ category: 'en', slug: 'saa-c03' }) });

    expect(ko.alternates?.canonical).toBe('/aws/saa-c03');
    expect(en.alternates?.canonical).toBe('/en/saa-c03');
    expect(ko.alternates?.languages).toEqual(en.alternates?.languages);
    expect(ko.alternates?.languages).toEqual({ ko: '/aws/saa-c03', en: '/en/saa-c03' });
  });

  test('영어판이 없는 자격증(linux-master-1)은 깨진 hreflang을 만들지 않는다', async () => {
    const meta = await generateCertMetadata({ params: Promise.resolve({ category: 'linux', slug: 'linux-master-1' }) });
    expect(meta.alternates?.canonical).toBe('/linux/linux-master-1');
    expect(meta.alternates?.languages).toBeUndefined();
  });
});

describe('hreflang 상호 참조 — day 페이지(week1, 무료)', () => {
  test('/aws/saa-c03/week1/day1 ↔ /en/saa-c03/week1/day1 languages가 완전히 동일하다', async () => {
    const ko = await generateDayMetadata({
      params: Promise.resolve({ category: 'aws', slug: 'saa-c03', week: 'week1', day: 'day1' }),
    });
    const en = await generateDayMetadata({
      params: Promise.resolve({ category: 'en', slug: 'saa-c03', week: 'week1', day: 'day1' }),
    });

    expect(ko.alternates?.languages).toEqual(en.alternates?.languages);
    expect(ko.alternates?.languages).toEqual({
      ko: '/aws/saa-c03/week1/day1',
      en: '/en/saa-c03/week1/day1',
    });
  });

  test('linux-master-1(영어판 없음)의 무료 주차는 hreflang을 선언하지 않는다', async () => {
    const meta = await generateDayMetadata({
      params: Promise.resolve({ category: 'linux', slug: 'linux-master-1', week: 'week1', day: 'day1' }),
    });
    expect(meta.alternates?.languages).toBeUndefined();
  });
});
