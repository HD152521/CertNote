import { test, expect } from '@playwright/test';

// 구독 게이팅 P0 시나리오. "돈 냈는데 안 열림 / 안 냈는데 열림"을 막는 최소 안전망.
// 로그인 상태는 auth.setup.ts가 저장한 storageState를 재사용한다(레이트리밋 회피).
const FREE_DAY = '/aws-certs/saa-c03/week1/day1';
const PAID_DAY = '/aws-certs/saa-c03/week2/day1';
const PAYWALL_TEXT = '여기부터는 Pro 전용입니다';
const EXAM_BODY = { certSlug: 'saa-c03', count: 5 };

test.describe('비로그인', () => {
  test('Week1은 무료로 열리고 페이월이 없다', async ({ page }) => {
    await page.goto(FREE_DAY);
    await expect(page.locator('div.article').first()).toBeVisible();
    await expect(page.getByText(PAYWALL_TEXT)).toHaveCount(0);
  });

  test('Week2는 페이월이 뜬다', async ({ page }) => {
    await page.goto(PAID_DAY);
    await expect(page.getByText(PAYWALL_TEXT)).toBeVisible();
  });
});

test.describe('Free 사용자', () => {
  test.use({ storageState: 'e2e/.auth/free.json' });

  test('Week2는 여전히 페이월', async ({ page }) => {
    await page.goto(PAID_DAY);
    await expect(page.getByText(PAYWALL_TEXT)).toBeVisible();
  });

  test('모의고사 API는 403', async ({ page }) => {
    const res = await page.request.post('/api/exam/start', { data: EXAM_BODY });
    expect(res.status()).toBe(403);
  });
});

test.describe('Pro 사용자', () => {
  test.use({ storageState: 'e2e/.auth/pro.json' });

  test('Week2 본문이 열리고 페이월이 없다', async ({ page }) => {
    await page.goto(PAID_DAY);
    await expect(page.locator('div.article').first()).toBeVisible();
    await expect(page.getByText(PAYWALL_TEXT)).toHaveCount(0);
  });

  test('모의고사 API가 허용된다', async ({ page }) => {
    const res = await page.request.post('/api/exam/start', { data: EXAM_BODY });
    expect(res.status(), `Pro exam start: ${res.status()}`).toBeLessThan(400);
  });

  // 로그아웃 후 유료 콘텐츠가 다시 잠기는지 — 63c03c7(쿠키 미삭제)·b61905c(라우터 캐시) 회귀 방지.
  test('로그아웃 후 Week2가 다시 잠긴다', async ({ page }) => {
    await page.goto(PAID_DAY);
    await expect(page.getByText(PAYWALL_TEXT)).toHaveCount(0);

    const res = await page.request.post('/api/auth/logout');
    expect(res.ok()).toBe(true);

    await page.goto(PAID_DAY);
    await expect(page.getByText(PAYWALL_TEXT)).toBeVisible();
  });
});
