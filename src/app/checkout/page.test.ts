import { describe, expect, test } from 'vitest';
import { metadata } from './page';

// SEO 색인 오류 회귀 테스트(docs/SEO-indexing-fix-plan.md Step 2).
//
// 배경: /checkout은 robots.txt에 차단되지 않은 공개 라우트인데 canonical을 지정하지 않아
// 루트 레이아웃의 canonical('/')을 그대로 상속했다. 결제 페이지가 홈을 자기 표준 URL로
// 선언하는 오신호였다.
describe('metadata — /checkout', () => {
  test('canonical이 홈이 아니라 자기 자신의 URL이다', () => {
    expect(metadata.alternates?.canonical).toBe('/checkout');
    expect(metadata.alternates?.canonical).not.toBe('/');
  });
});
