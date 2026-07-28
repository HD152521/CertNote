import { describe, expect, test } from 'vitest';
import { SUPPORTED_CATEGORIES } from '@/lib/category';
import { dynamicParams, generateStaticParams } from './page';

// docs/SEO-indexing-fix-plan.md Step7-A-1 — 자격증 slug 소프트 404(/foo/bar류) 가드 테스트.
//
// 배경: 목록 밖 [category]/[slug] 조합(예: /foo/bar)으로 요청하면 이 라우트 내부의
// notFound()가 root loading.tsx의 전역 스트리밍 때문에 HTTP 200으로 나갔다. 자격증 slug는
// content/<category>/index.json(scripts/sync-content.mjs로 동기화)에서 오지만, 이 index.json은
// git에 커밋되어 배포와 함께만 갱신되므로("이 빌드가 서빙하는 content/" == "이
// generateStaticParams가 읽은 content/") dynamicParams=false로 잠가도 "존재하는데 404" 케이스가
// 생길 수 없다. false로 잠가 Next 라우팅 단계에서 목록 밖 조합을 즉시 진짜 404로 처리하게 했다.
describe('[category]/[slug]/page — dynamicParams 가드', () => {
  test('dynamicParams는 false다 — true로 되돌리면 /foo/bar류 소프트 404가 재발한다', () => {
    expect(
      dynamicParams,
      'dynamicParams가 false가 아니면 목록 밖 [category]/[slug] 요청이 다시 런타임 notFound()를 타 ' +
        '(root loading.tsx 스트리밍 때문에) HTTP 200 소프트 404로 되돌아간다.',
    ).toBe(false);
  });

  test('generateStaticParams는 ko(aws-certs)·en 양쪽 카테고리의 slug를 모두 포함한다', async () => {
    const params = await generateStaticParams();
    expect(params.length).toBeGreaterThan(0);

    const categoriesPresent = new Set(params.map((p) => p.category));
    for (const category of SUPPORTED_CATEGORIES) {
      expect(
        categoriesPresent,
        `${category}가 generateStaticParams에 없으면 dynamicParams=false 때문에 그 카테고리의 ` +
          '모든 /<category>/<slug> 허브가 항상 404가 난다(en 허브도 이 라우트가 서빙 — ' +
          'src/app/en/page.tsx는 /en 자체만 처리).',
      ).toContain(category);
    }
  });

  test('각 param은 category+slug 쌍이며 week/day 세그먼트를 포함하지 않는다', async () => {
    const params = await generateStaticParams();
    for (const p of params) {
      expect(Object.keys(p).sort()).toEqual(['category', 'slug']);
      expect(typeof p.slug).toBe('string');
      expect(p.slug.length).toBeGreaterThan(0);
    }
  });
});
