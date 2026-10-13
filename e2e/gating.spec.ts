import { test, expect } from '@playwright/test';

// 구독제 보류(policy.ts PAYWALL_ENABLED=false) 이후의 접근 시나리오.
// 노트는 전 주차가 누구에게나 열리고, 모의고사는 로그인만 하면(플랜 무관) 응시할 수 있다.
// 로그인 상태는 auth.setup.ts가 저장한 storageState를 재사용한다(레이트리밋 회피).
const WEEK1_DAY = '/aws/saa-c03/week1/day1';
const WEEK2_DAY = '/aws/saa-c03/week2/day1';
const PAYWALL_TEXT = '여기부터는 Pro 전용입니다';
const EXAM_BODY = { certSlug: 'saa-c03', count: 5 };

test.describe('비로그인', () => {
  for (const url of [WEEK1_DAY, WEEK2_DAY]) {
    test(`${url} 본문이 열리고 페이월이 없다`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('div.article').first()).toBeVisible();
      await expect(page.getByText(PAYWALL_TEXT)).toHaveCount(0);
    });
  }

  test('모의고사 API는 401(회원가입 필요)', async ({ page }) => {
    const res = await page.request.post('/api/exam/start', { data: EXAM_BODY });
    expect(res.status()).toBe(401);
  });

  test('AI 튜터 API는 401(회원가입 필요)', async ({ page }) => {
    const res = await page.request.post('/api/tutor', { data: { questionId: 'x', selected: 'A', history: [] } });
    expect(res.status()).toBe(401);
  });

  test('/pricing은 홈으로 돌려보낸다', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Free 사용자', () => {
  test.use({ storageState: 'e2e/.auth/free.json' });

  test('Week2 본문이 열린다', async ({ page }) => {
    await page.goto(WEEK2_DAY);
    await expect(page.locator('div.article').first()).toBeVisible();
    await expect(page.getByText(PAYWALL_TEXT)).toHaveCount(0);
  });

  test('모의고사 API가 허용된다(플랜 무관)', async ({ page }) => {
    const res = await page.request.post('/api/exam/start', { data: EXAM_BODY });
    expect(res.status(), `Free exam start: ${res.status()}`).toBeLessThan(400);
  });
});
