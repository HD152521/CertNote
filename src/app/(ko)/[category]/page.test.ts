import { describe, expect, test } from 'vitest';
import { EN_CATEGORY, SUPPORTED_CATEGORIES } from '@/lib/category';
import { dynamicParams, generateStaticParams } from './page';

// docs/SEO-indexing-fix-plan.md Step6 — 소프트 404 수정 가드 테스트.
//
// 배경: 목록 밖 category(예: /totally-bogus-path)로 요청하면 이 라우트의 notFound()가
// root loading.tsx의 전역 스트리밍 때문에 HTTP 200으로 나갔다. category는 코드 상수
// (src/lib/category.ts)라 콘텐츠 동기화만으로는 늘지 않으므로, dynamicParams=false로 잠가
// Next 라우팅 단계에서 목록 밖 category를 즉시 "라우트 없음"(진짜 404)으로 처리하게 했다.
// 이 값이 실수로 true로 되돌아가면 실측으로 잡히지 않는 조용한 회귀라 가드가 필요하다.
describe('[category]/page — dynamicParams 가드', () => {
  test('dynamicParams는 false다 — true로 되돌리면 소프트 404가 재발한다', () => {
    expect(
      dynamicParams,
      'dynamicParams가 false가 아니면 목록 밖 category 요청이 다시 런타임 notFound()를 타 ' +
        '(root loading.tsx 스트리밍 때문에) HTTP 200 소프트 404로 되돌아간다.',
    ).toBe(false);
  });

  // en 은 일부러 뺀다 — /en 은 (en) 루트 그룹의 정적 라우트(app/(en)/en/page.tsx, <html lang="en">)가 서빙한다.
  // 여기서도 만들면 같은 경로가 (ko) 루트(lang="ko")로 이중 생성된다.
  test('generateStaticParams는 SUPPORTED_CATEGORIES 중 en 을 뺀 전부를 포함한다 — 하나라도 빠지면 그 카테고리가 항상 404', async () => {
    const params = await generateStaticParams();
    const categories = params.map((p) => p.category);
    expect(categories).not.toContain(EN_CATEGORY);
    for (const category of SUPPORTED_CATEGORIES.filter((c) => c !== EN_CATEGORY)) {
      expect(categories, `${category}가 generateStaticParams에 없으면 dynamicParams=false 때문에 항상 404가 난다`).toContain(category);
    }
  });
});
