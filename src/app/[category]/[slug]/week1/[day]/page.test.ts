import { beforeAll, describe, expect, test } from 'vitest';
import sitemap from '@/app/sitemap';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { SITE_URL } from '@/lib/site';
import { generateStaticParams } from './page';

// generateStaticParams()는 전 인증서(ko+en, 20여 개)의 content 디렉터리를 fs로 순회한다.
// 테스트 환경(NODE_ENV=test)은 프로덕션과 달리 content.ts의 메모이즈 캐시를 쓰지 않으므로
// (src/lib/content.ts CONTENT_CACHE 참고 — 개발 중 콘텐츠 편집이 즉시 반영되게 하려는 의도적 설계)
// 매 호출이 디스크 전체를 다시 읽는다. beforeAll에서 한 번만 호출해 두 테스트가 재사용한다.
let staticParams: Awaited<ReturnType<typeof generateStaticParams>>;
beforeAll(async () => {
  staticParams = await generateStaticParams();
}, 20000);

// week1 전용 정적 라우트 결합도 가드 테스트(docs/SEO-indexing-fix-plan.md Step5 A-3).
//
// 이 라우트는 "week1"이라는 리터럴 폴더명으로 무료 주차를 하드코딩한다. FREE_WEEK 상수가
// 바뀌었는데 폴더명을 안 바꾸면(또는 그 반대) generateStaticParams가 실제로는 유료가 된 주차를
// 계속 정적 생성하거나, 무료가 된 주차를 정적 생성에서 빠뜨린다 — 둘 다 조용히 깨진다.

describe('FREE_WEEK ↔ week1 폴더명 결합', () => {
  test('FREE_WEEK는 1이다 — 바꾸려면 src/app/[category]/[slug]/week1/ 폴더명도 함께 바꿔야 한다', () => {
    expect(
      FREE_WEEK,
      'FREE_WEEK가 1이 아니면 src/app/[category]/[slug]/week1/[day]/page.tsx의 리터럴 세그먼트 ' +
        '폴더명(week1)도 함께 바꿔야 한다. 안 바꾸면 이 정적 라우트가 실제 무료 경계와 어긋난 주차를 ' +
        '정적 생성하거나 무료가 된 주차를 빠뜨린다.',
    ).toBe(1);
  });
});

describe('generateStaticParams — week1 전용 필터(week2+ 혼입 방지)', () => {
  test('무료 인증서 개수만큼 param을 반환하고, 전부 day1~day5 형태이며 week 세그먼트를 포함하지 않는다', () => {
    expect(staticParams.length).toBeGreaterThan(0);
    for (const p of staticParams) {
      expect(p).not.toHaveProperty('week');
      expect(p.day).toMatch(/^day[1-5]$/);
      expect([DEFAULT_CATEGORY, EN_CATEGORY]).toContain(p.category);
    }
  });

  test('사이트맵의 week1 URL 집합이 generateStaticParams() 출력에 전부 포함된다(수용 기준)', async () => {
    const generated = new Set(
      staticParams.map((p) => `${SITE_URL}/${p.category}/${p.slug}/week${FREE_WEEK}/${p.day}`),
    );

    const entries = await sitemap();
    const week1SitemapUrls = entries
      .map((e) => e.url)
      .filter((url) => {
        const isAwsOrEn = url.startsWith(`${SITE_URL}/${DEFAULT_CATEGORY}/`) || url.startsWith(`${SITE_URL}/${EN_CATEGORY}/`);
        return isAwsOrEn && url.includes(`/week${FREE_WEEK}/day`);
      });

    // 사이트맵에 week1 URL이 실제로 존재하는지도 함께 확인(빈 배열이면 이 테스트가 무의미해진다).
    expect(week1SitemapUrls.length).toBeGreaterThan(0);
    for (const url of week1SitemapUrls) {
      expect(generated.has(url), `사이트맵의 ${url}이 week1 정적 라우트의 generateStaticParams() 출력에 없다`).toBe(true);
    }
  });
});
