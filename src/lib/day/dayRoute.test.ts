import { describe, expect, test } from 'vitest';
import { dayRouteMetadata, renderDayRoute, renderWeek1Route, week1RouteMetadata } from './dayRoute';

// SEO 색인 오류 회귀 테스트(docs/SEO-indexing-fix-plan.md Step 1).
//
// 배경: noindex day에서 generateMetadata가 { robots: 'noindex, nofollow' }만 반환하면 alternates를
// 지정하지 않은 셈이 되어 루트 레이아웃(src/app/layout.tsx)의 canonical('/')·languages(ko/en/x-default
// 전부 '/')를 그대로 상속한다. 그 결과 "noindex인데 canonical은 홈"이라는 Google이 금지하는 충돌
// 신호가 나갔다. 구독제 보류 이후 noindex로 남는 건 번역이 덜 된 영어판 Week2+뿐이다.
describe('generateMetadata — noindex day(영어판 week2+)', () => {
  const category = 'en';
  const params = { slug: 'saa-c03', week: 'week2', day: 'day1' };

  test('robots는 noindex, nofollow를 유지한다', async () => {
    const meta = await dayRouteMetadata(category, params);
    expect(meta.robots).toBe('noindex, nofollow');
  });

  test('canonical이 홈이 아니라 자기 자신의 URL이다', async () => {
    const meta = await dayRouteMetadata(category, params);
    expect(meta.alternates?.canonical).toBe('/en/saa-c03/week2/day1');
  });

  test('루트 레이아웃에서 상속된 languages(홈을 가리키는 hreflang)가 남지 않는다', async () => {
    const meta = await dayRouteMetadata(category, params);
    expect(meta.alternates?.languages).toBeUndefined();
  });
});

// 구독제 보류로 한국어 week2+는 색인 대상이 됐다.
describe('generateMetadata — 한국어 week2+ day 페이지(전 주차 공개)', () => {
  const category = 'aws';
  const params = { slug: 'saa-c03', week: 'week2', day: 'day1' };

  test('robots가 없고(색인 허용) 제목·설명·자기참조 canonical을 갖는다', async () => {
    const meta = await dayRouteMetadata(category, params);
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toEqual(expect.stringContaining('SAA-C03'));
    expect(meta.description).toBeTruthy();
    expect(meta.alternates?.canonical).toBe('/aws/saa-c03/week2/day1');
  });

  test('영어판 짝이 noindex라 hreflang을 걸지 않는다(noindex를 가리키면 클러스터 무효화)', async () => {
    const meta = await dayRouteMetadata(category, params);
    expect(meta.alternates?.languages).toBeUndefined();
  });
});

// 회귀 방지: 무료 주차(week1)는 이번 변경의 대상이 아니며 기존 canonical/hreflang이 유지돼야 한다.
describe('generateMetadata — 무료 주차(week1) day 페이지 (회귀 확인)', () => {
  test('robots가 설정되지 않고(기본 색인 허용) 자기참조 canonical과 상호 hreflang을 반환한다', async () => {
  const category = 'aws';
  const params = { slug: 'saa-c03', week: 'week1', day: 'day1' };
    const meta = await dayRouteMetadata(category, params);
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe('/aws/saa-c03/week1/day1');
    expect(meta.alternates?.languages).toEqual({
      ko: '/aws/saa-c03/week1/day1',
      en: '/en/saa-c03/week1/day1',
    });
  });
});

// 교차 섹션 URL 방어(P3 Step 5 이월): aws·linux 는 같은 content 폴더에 공존해 파일 존재만으로는
// /linux/saa-c03/week2/day1 을 거르지 못한다. 지금은 프록시가 404 로 막지만 라우트 로직도 스스로 거부해야 한다.
describe('교차 섹션 URL — 라우트 로직이 스스로 404', () => {
  const isNotFound = (e: unknown) => expect((e as { digest?: string }).digest).toContain('404');

  test('aws 자격증을 linux 섹션 아래로 요청하면 notFound', async () => {
    const err = await renderDayRoute('linux', { slug: 'saa-c03', week: 'week2', day: 'day1' }).catch((e) => e);
    isNotFound(err);
  });

  test('linux 자격증을 aws 섹션 아래로 요청하면 notFound(week1 래퍼 포함)', async () => {
    isNotFound(await renderDayRoute('aws', { slug: 'linux-master-2', week: 'week2', day: 'day1' }).catch((e) => e));
    isNotFound(await renderWeek1Route('aws', { slug: 'linux-master-2', day: 'day1' }).catch((e) => e));
  });

  test('올바른 섹션의 같은 day 는 렌더된다(과차단 없음)', async () => {
    await expect(renderDayRoute('aws', { slug: 'saa-c03', week: 'week2', day: 'day1' })).resolves.toBeTruthy();
    await expect(renderDayRoute('linux', { slug: 'linux-master-2', week: 'week2', day: 'day1' })).resolves.toBeTruthy();
  });

  test('교차 섹션 메타데이터는 비어 있다(타 섹션 canonical 을 만들지 않는다)', async () => {
    expect(await dayRouteMetadata('linux', { slug: 'saa-c03', week: 'week2', day: 'day1' })).toEqual({});
    expect(await week1RouteMetadata('aws', { slug: 'linux-master-2', day: 'day1' })).toEqual({});
  });

  test('영어판은 섹션 축이 없어 영향받지 않는다', async () => {
    await expect(renderDayRoute('en', { slug: 'saa-c03', week: 'week1', day: 'day1' })).resolves.toBeTruthy();
  });
});
