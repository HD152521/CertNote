import { test, expect } from '@playwright/test';
import { readTutorCount, resetTutorState } from './db';
import { E2E_TUTOR_DAILY_LIMIT } from './constants';
import { E2E_FREE } from './global-setup';

// 구독제 보류(policy.ts PAYWALL_ENABLED=false) 이후의 접근 시나리오.
// 노트는 전 주차가 누구에게나 열리고, 모의고사는 로그인만 하면(플랜 무관) 응시할 수 있다.
// 로그인 상태는 auth.setup.ts가 저장한 storageState를 재사용한다(레이트리밋 회피).
const WEEK1_DAY = '/aws/saa-c03/week1/day1';
const WEEK2_DAY = '/aws/saa-c03/week2/day1';
const PAYWALL_TEXT = '여기부터는 Pro 전용입니다';
const FAKE_TEXT_PREFIX = '[E2E-FAKE]';
// 가짜 튜터 센티널(src/lib/tutor/fakeTutor.ts). 실패 모드는 요청의 selected 값으로 고른다.
const FAIL_BEFORE_TEXT = 'E2E_FAIL_BEFORE_TEXT';
const FAIL_MID_STREAM = 'E2E_FAIL_MID_STREAM';
// 서버가 첫 요청들을 콜드 렌더하는 동안 새 연결이 간헐적으로 ECONNRESET 된다(로컬 실측, 서버 로그에는 오류 없음).
// 멱등 호출(모의고사 시작)에만 Playwright 의 ECONNRESET 재시도를 쓴다. 튜터 호출에는 쓰지 않는다 — 그쪽은 연결 끊김 자체가 검증 대상이다.
const RETRY_RESET = { maxRetries: 3 };
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
    const res = await page.request.post('/api/exam/start', { data: EXAM_BODY, ...RETRY_RESET });
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
    const res = await page.request.post('/api/exam/start', { data: EXAM_BODY, ...RETRY_RESET });
    expect(res.status(), `Free exam start: ${res.status()} ${await res.text()}`).toBeLessThan(400);
  });

  test('모의고사 시작 후 제출하면 채점 결과가 온다', async ({ page }) => {
    const startRes = await page.request.post('/api/exam/start', { data: EXAM_BODY, ...RETRY_RESET });
    expect(startRes.status(), `exam start: ${startRes.status()}`).toBe(200);
    const { questions } = (await startRes.json()) as { questions: { questionId: string }[] };
    expect(questions.length).toBeGreaterThan(0);
    // 시작 응답에는 정답이 내려가지 않는다.
    expect(JSON.stringify(questions)).not.toContain('"answer"');

    const questionIds = questions.map((q) => q.questionId);
    const answers = Object.fromEntries(questionIds.map((id) => [id, 'A']));
    const submitRes = await page.request.post('/api/exam/submit', { data: { questionIds, answers } });
    expect(submitRes.status(), `exam submit: ${submitRes.status()} ${await submitRes.text()}`).toBe(200);
    const result = await submitRes.json();
    // 문항이 실제로 채점됐는지(빈 입력이 200 으로 통과한 게 아닌지) 확인한다.
    expect(result).toMatchObject({ total: questionIds.length, answered: questionIds.length });
    expect(result.items).toHaveLength(questionIds.length);
  });
});

// AI 튜터: 실제 LLM 대신 가짜 스트림을 쓴다(playwright.config.ts webServer 의 E2E_FAKE_TUTOR=1).
// 한도 카운터를 공유하므로 직렬로 돌리고(--repeat-each 는 반복본끼리 같은 계정을 공유해 충돌하니 --workers=1 과 함께 쓸 것), 테스트마다 e2e 계정의 오늘 사용량을 비운다.
// history 를 비우지 않는 이유: 첫 설명(history 없음)은 tutor_explanations 캐시를 거쳐 한도를 차감하지 않기 때문이다.
test.describe('Free 사용자 — AI 튜터 한도/환불 @tutor', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'e2e/.auth/free.json' });

  const tutorBody = (selected: string) => ({
    selected,
    history: [{ role: 'user', text: '후속 질문' }],
  });

  let questionId: string;
  test.beforeEach(async ({ request }) => {
    await resetTutorState(E2E_FREE.email);
    if (!questionId) {
      const res = await request.post('/api/exam/start', { data: EXAM_BODY, ...RETRY_RESET });
      questionId = ((await res.json()) as { questions: { questionId: string }[] }).questions[0].questionId;
    }
  });

  const callTutor = (request: import('@playwright/test').APIRequestContext, selected: string) =>
    request.post('/api/tutor', { data: { ...tutorBody(selected), questionId } });

  test('한도 안에서는 200 + 가짜 설명 스트림, 초과하면 429 daily_limit', async ({ request }) => {
    for (let i = 1; i <= E2E_TUTOR_DAILY_LIMIT; i++) {
      const res = await callTutor(request, 'B');
      expect(res.status(), `${i}번째 호출: ${await res.text()}`).toBe(200);
      expect(await res.text()).toContain(FAKE_TEXT_PREFIX);
    }
    expect(await readTutorCount(E2E_FREE.email)).toBe(E2E_TUTOR_DAILY_LIMIT);

    const over = await callTutor(request, 'B');
    expect(over.status()).toBe(429);
    expect(((await over.json()) as { error?: string })).toMatchObject({ error: 'daily_limit' });
  });

  test('텍스트 전에 실패한 호출은 횟수를 소모하지 않는다', async ({ request }) => {
    // 첫 바이트 전에 스트림이 오류로 끝나면 연결이 끊겨(socket hang up) 요청 자체가 reject 될 수 있다.
    // 응답 모양이 아니라 DB 의 사용량으로 판정한다.
    await callTutor(request, FAIL_BEFORE_TEXT).then((r) => r.body()).catch(() => undefined);

    // 환불은 스트림 오류 처리 중에 일어난다 — 시간이 아니라 DB 상태를 기다린다.
    await expect.poll(() => readTutorCount(E2E_FREE.email)).toBe(0);

    // 한도만큼 정상 호출이 여전히 가능하다(실패가 한 번도 차감되지 않았다는 증거).
    for (let i = 1; i <= E2E_TUTOR_DAILY_LIMIT; i++) {
      const res = await callTutor(request, 'B');
      expect(res.status(), `환불 후 ${i}번째 호출`).toBe(200);
      await res.text();
    }
    expect(await readTutorCount(E2E_FREE.email)).toBe(E2E_TUTOR_DAILY_LIMIT);
  });

  test('일부 텍스트가 나간 뒤 실패한 호출은 환불하지 않는다', async ({ request }) => {
    await callTutor(request, FAIL_MID_STREAM).then((r) => r.body()).catch(() => undefined);
    // 환불 여부는 한도 소진으로 증명한다: 환불됐다면 아래 마지막 호출이 허용됐을 것이다(시간 대기 불필요).
    for (let i = 1; i < E2E_TUTOR_DAILY_LIMIT; i++) {
      const ok = await callTutor(request, 'B');
      expect(ok.status()).toBe(200);
      await ok.text();
    }
    const over = await callTutor(request, 'B');
    expect(over.status()).toBe(429);
    expect(await readTutorCount(E2E_FREE.email)).toBeGreaterThanOrEqual(E2E_TUTOR_DAILY_LIMIT);
  });
});
