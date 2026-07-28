import { defineConfig, devices } from '@playwright/test';

// DB가 필요 없는 SEO 스모크 테스트 전용 설정(docs/SEO-indexing-fix-plan.md Step7-B).
//
// 왜 별도 config인가: playwright.config.ts의 globalSetup(e2e/global-setup.ts)은 certnote_dev
// DB에 free/pro 테스트 계정을 시드한다 — 이 설정은 config 전체에 걸리는 옵션이라 --project로
// 좁혀도(예: --project=chromium) 우회할 수 없다(globalSetup은 프로젝트 필터와 무관하게 항상
// 먼저 실행된다). e2e/seo-smoke.spec.ts는 로그인·DB 상태를 전혀 쓰지 않는 공개 페이지만
// 읽으므로, globalSetup 자체가 없는 이 config로 완전히 분리해 DB 없는 환경(로컬에 certnote_dev
// 미설치, DB 접근 불가한 CI 등)에서도 SEO 회귀를 잡을 수 있게 했다.
export default defineConfig({
  testDir: './e2e',
  testMatch: /seo-smoke\.spec\.ts/,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
