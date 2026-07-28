import { defineConfig, devices } from '@playwright/test';

// 게이팅 E2E는 프로덕션 빌드 기준으로 돌려야 한다(dev 서버는 항상 동적 렌더라
// 정적/동적 게이팅 충돌을 못 잡는다 — a86f9bb 회귀의 교훈). `npm run test:e2e`가
// build → start → test 순서를 보장한다.
export default defineConfig({
  testDir: './e2e',
  // seo-smoke.spec.ts는 DB 없이 도는 별도 스위트(playwright.seo.config.ts, Step7-B)라 여기서
  // 중복 실행하지 않는다. 이 config는 계속 auth 의존 흐름(gating.spec.ts 등) 전용으로 둔다.
  testIgnore: /seo-smoke\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
