import { defineConfig, devices } from '@playwright/test';
import { E2E_TUTOR_DAILY_LIMIT } from './e2e/constants';

// 게이팅 E2E는 프로덕션 빌드 기준으로 돌려야 한다(dev 서버는 항상 동적 렌더라
// 정적/동적 게이팅 충돌을 못 잡는다 — a86f9bb 회귀의 교훈). `npm run test:e2e`가
// build → start → test 순서를 보장한다.
export default defineConfig({
  testDir: './e2e',
  // seo-smoke.spec.ts는 DB 없이 도는 별도 스위트(playwright.seo.config.ts, Step7-B)라 여기서
  // 중복 실행하지 않는다. 이 config는 계속 auth 의존 흐름(gating.spec.ts 등) 전용으로 둔다.
  testIgnore: /seo-smoke\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  // 서버가 force-dynamic 페이지를 첫 요청에 콜드 렌더하면(수십 초) 기본 30s 로는 page.goto 가 타임아웃 난다(실측).
  // 임의 대기가 아니라 상한만 넉넉히 잡는다.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], grepInvert: /@tutor/ },
    // 튜터 한도/환불 테스트는 스트림을 일부러 중간에 끊고(연결 abort) 계정 단위 쿼터를 공유한다.
    // 다른 테스트와 동시에 돌리면 간헐적 ECONNRESET 이 관찰돼(실측) 나머지가 끝난 뒤에 돌린다.
    { name: 'tutor', use: { ...devices['Desktop Chrome'] }, dependencies: ['chromium'], grep: /@tutor/ },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    // 가짜 튜터(E2E_FAKE_TUTOR)와 한도(TUTOR_DAILY_LIMIT)가 이 서버에 설정돼 있어야 gating.spec.ts 가
    // 결정적이다. 그래서 이미 떠 있는 서버를 재사용하지 않는다(재사용하면 env 가 빠진 서버를 만날 수 있다).
    // E2E_FAKE_TUTOR 는 Vercel 에서는 무시된다(src/lib/tutor/fakeTutor.ts). 운영 환경변수에 넣지 말 것.
    reuseExistingServer: false,
    env: { E2E_FAKE_TUTOR: '1', TUTOR_DAILY_LIMIT: String(E2E_TUTOR_DAILY_LIMIT) },
    timeout: 120_000,
  },
});
