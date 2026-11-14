import { describe, expect, test } from 'vitest';
import { metadata } from './page';

// SEO 색인 오류 회귀 테스트(docs/SEO-indexing-fix-plan.md Step 2).
//
// 배경: /onboarding/profile도 robots.txt disallow 목록(/login, /account 등)에 없어 크롤
// 가능한데 canonical이 없어 루트 레이아웃의 canonical('/')을 상속했다.
describe('metadata — /onboarding/profile', () => {
  test('canonical이 홈이 아니라 자기 자신의 URL이다', () => {
    expect(metadata.alternates?.canonical).toBe('/onboarding/profile');
    expect(metadata.alternates?.canonical).not.toBe('/');
  });
});
