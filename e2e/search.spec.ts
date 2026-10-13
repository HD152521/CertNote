import { test, expect, type Page } from '@playwright/test';

// 검색창: 첫 오픈은 제목 매니페스트만 받고, 본문 샤드(자격증별)는 입력을 시작하면 받는다.
// DB·로그인 없이 공개 페이지만 쓴다.

// 제목과 week1 본문 어디에도 없고 week2+ 본문에만 있는 실제 용어(src/lib/search/searcher.test.ts 가 전제를 검증한다).
const WEEK2_PLUS_ONLY = [
  { label: '한국어 용어', query: '슬라이스', href: '/aws/saa-c03/week2/day1' },
  { label: '영문 약어', query: 'NGFW', href: '/aws/saa-c03/week3/day5' },
  { label: '리눅스 트랙 용어', query: 'lilo', href: '/linux/linux-master-2/week2/day4' },
];
const SHARD_COUNT = 13;
const SEARCH_BUTTON = /검색|search/i;
const isShardPath = (p: string) => /^\/api\/search\/[a-z0-9-]+\.[0-9a-f]{10}$/.test(p);

async function openSearch(page: Page, url = '/') {
  await page.goto(url);
  // 하이드레이션 전에 단축키를 누르면 핸들러가 없다 — 검색 버튼을 눌러 연다.
  await page.getByRole('button', { name: SEARCH_BUTTON }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

function trackShards(page: Page) {
  const paths: string[] = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (isShardPath(p)) paths.push(p); });
  return paths;
}

test.describe('검색창 본문 검색', () => {
  for (const { label, query, href } of WEEK2_PLUS_ONLY) {
    test(`week2+ 전용 ${label}(${query}) 로 검색하면 해당 day 링크가 나온다`, async ({ page }) => {
      const dialog = await openSearch(page);
      await dialog.getByRole('textbox').fill(query);
      const link = dialog.locator(`a[href="${href}"]`);
      await expect(link).toBeVisible();
      // 공개 섹션 URL 만 쓴다(레거시 /aws-certs 는 301 이다).
      expect(await dialog.locator('a[href^="/aws-certs"]').count()).toBe(0);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
  }

  test('문서 뒤쪽에만 있는 용어(앞 1,800자 밖)도 찾는다', async ({ page }) => {
    const dialog = await openSearch(page);
    await dialog.getByRole('textbox').fill('시그모이드');
    await expect(dialog.locator('a[href="/aws/mls-c01/week8/day4"]')).toBeVisible();
    await dialog.getByRole('textbox').fill('채팅방');
    await expect(dialog.locator('a[href="/aws/dva-c02/week4/day5"]')).toBeVisible();
  });

  test('짧은 약어(IKE)가 퍼지 제목 일치에 밀리지 않고 첫 결과로 나온다', async ({ page }) => {
    const dialog = await openSearch(page);
    await dialog.getByRole('textbox').fill('IKE');
    await expect(dialog.locator('a').first()).toHaveAttribute('href', '/aws/sap-c02/week3/day3');
  });

  test('첫 오픈은 매니페스트만 받고, 입력을 시작해야 샤드를 받으며, 다시 열어도 같은 샤드를 다시 받지 않는다', async ({ page }) => {
    const shardRequests = trackShards(page);
    let manifestRequests = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/search') manifestRequests++; });
    const dialog = await openSearch(page);
    await expect(dialog.locator('a').first()).toBeVisible(); // 매니페스트 도착(빈 검색어도 목록을 보여준다)
    expect(manifestRequests).toBe(1);
    expect(shardRequests).toEqual([]);

    await dialog.getByRole('textbox').fill('NGFW');
    await expect(dialog.locator('a[href="/aws/saa-c03/week3/day5"]')).toBeVisible();
    await expect.poll(() => shardRequests.length).toBe(SHARD_COUNT);
    expect(shardRequests.filter((p) => p.startsWith('/api/search/saa-c03.'))).toHaveLength(1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: SEARCH_BUTTON }).first().click();
    await page.getByRole('dialog').getByRole('textbox').fill('NGFW');
    await expect(page.getByRole('dialog').locator('a[href="/aws/saa-c03/week3/day5"]')).toBeVisible();
    expect(shardRequests).toHaveLength(SHARD_COUNT); // 재오픈이 샤드를 다시 받지 않았다
  });

  test('지금 보고 있는 자격증의 샤드를 가장 먼저 받는다', async ({ page }) => {
    const shardRequests = trackShards(page);
    const dialog = await openSearch(page, '/aws/dop-c02/week1/day1');
    await dialog.getByRole('textbox').fill('ab');
    await expect.poll(() => shardRequests.length).toBeGreaterThan(0);
    expect(shardRequests[0]).toMatch(/^\/api\/search\/dop-c02\./);
  });

  test('제목 일치는 본문 일치보다 위에 나온다', async ({ page }) => {
    const dialog = await openSearch(page);
    await dialog.getByRole('textbox').fill('Lambda');
    await expect.poll(async () => dialog.locator('a').count()).toBeGreaterThan(1);
    await expect(dialog.locator('a').first()).toContainText(/lambda/i);
  });

  test('Enter 는 현재 입력에 대한 첫 결과를 연다', async ({ page }) => {
    const dialog = await openSearch(page);
    const input = dialog.getByRole('textbox');
    await input.fill('NGFW');
    await expect(dialog.locator('a').first()).toHaveAttribute('href', /\/aws\/saa-c03\/week3\//);
    await input.fill('lilo');
    await expect(dialog.locator('a[href="/linux/linux-master-2/week2/day4"]')).toBeVisible();
    await input.press('Enter');
    await expect(page).toHaveURL(/\/linux\/linux-master-2\/week2\/day4$/);
  });

  test('Escape 로 닫으면 검색 버튼으로 포커스가 돌아온다', async ({ page }) => {
    const dialog = await openSearch(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: SEARCH_BUTTON }).first()).toBeFocused();
  });

  test('샤드 요청이 전부 실패해도 제목 검색은 계속 동작하고 오류 화면이 없다', async ({ page }) => {
    let aborted = 0;
    await page.route('**/api/search/*', (route) => { aborted++; return route.abort('failed'); });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const dialog = await openSearch(page);
    const input = dialog.getByRole('textbox');
    await input.fill('Lambda');
    await expect(dialog.locator('a').first()).toContainText(/lambda/i);
    await expect.poll(() => aborted).toBeGreaterThan(0); // 실제로 샤드 요청이 막혔다

    // 본문에만 있는 용어는 못 찾지만 대화상자는 살아 있고 "결과 없음"을 보여준다.
    await input.fill('NGFW');
    await expect(dialog.locator('a[href="/aws/saa-c03/week3/day5"]')).toHaveCount(0);
    await expect(dialog).toContainText(/결과 없음|No results/);

    await input.fill('Lambda');
    await expect(dialog.locator('a').first()).toContainText(/lambda/i);
    expect(pageErrors).toEqual([]);
  });

  test('일부 샤드만 실패하면 나머지 자격증의 본문 검색은 계속 된다', async ({ page }) => {
    await page.route('**/api/search/saa-c03.*', (route) => route.abort('failed'));
    const dialog = await openSearch(page);
    await dialog.getByRole('textbox').fill('lilo');
    await expect(dialog.locator('a[href="/linux/linux-master-2/week2/day4"]')).toBeVisible();
  });
});

test.describe('검색창 입력 반응성(데스크톱 Chromium, CPU 4배 스로틀, 샤드 전부 로드 후)', () => {
  const LONG_TASK_BUDGET_MS = 200;
  const KEY_DELAY_MS = 30;
  const TYPING_SLACK_MS = 4500;

  async function typeUnderThrottle(page: Page, text: string) {
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: 'longtask', buffered: true });
    });
    const shardRequests = trackShards(page);
    const dialog = await openSearch(page);
    const input = dialog.getByRole('textbox');
    // 샤드를 전부 받아 둔다(스로틀 전).
    await input.fill('lambda');
    await expect.poll(() => shardRequests.length).toBe(SHARD_COUNT);
    await expect.poll(async () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\/api\/search\/[a-z0-9-]+\.[0-9a-f]{10}$/.test(e.name)).length)).toBe(SHARD_COUNT);
    await input.fill('');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => { (window as unknown as { __long: number[] }).__long.length = 0; });

    const started = Date.now();
    await input.pressSequentially(text, { delay: KEY_DELAY_MS });
    await expect(input).toHaveValue(text);
    const elapsed = Date.now() - started;
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    const longest = long.length ? Math.max(...long) : 0;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return { elapsed, longest, count: long.length };
  }

  test('긴 영어 검색어를 입력해도 입력이 즉시 받아들여지고 메인 스레드가 200ms 이상 막히지 않는다', async ({ page }) => {
    const text = 'lambda concurrency limits throttling';
    expect(text.length).toBeGreaterThanOrEqual(15);
    const { elapsed, longest, count } = await typeUnderThrottle(page, text);
    console.log(`[perf] EN typed ${text.length} chars in ${elapsed}ms at 4x CPU; longest task ${longest.toFixed(0)}ms (${count} long tasks)`);
    // 키 사이 대기(30ms) + Playwright 의 키당 왕복 + 4배 스로틀 처리 시간. 예전 구현은 12~15초였다.
    expect(elapsed, `typing took ${elapsed}ms`).toBeLessThan(text.length * KEY_DELAY_MS + TYPING_SLACK_MS);
    expect(longest, `longest task ${longest}ms`).toBeLessThan(LONG_TASK_BUDGET_MS);
  });

  test('42자 이상의 한국어 검색어도 같은 한도 안에서 입력된다', async ({ page }) => {
    const text = '람다 동시성 제한과 스로틀링에 대해서 알아보고 서버리스 아키텍처에서의 비용 최적화 방법';
    expect(text.length).toBeGreaterThanOrEqual(42);
    const { elapsed, longest, count } = await typeUnderThrottle(page, text);
    console.log(`[perf] KO typed ${text.length} chars in ${elapsed}ms at 4x CPU; longest task ${longest.toFixed(0)}ms (${count} long tasks)`);
    expect(elapsed, `typing took ${elapsed}ms`).toBeLessThan(text.length * KEY_DELAY_MS + TYPING_SLACK_MS);
    expect(longest, `longest task ${longest}ms`).toBeLessThan(LONG_TASK_BUDGET_MS);
  });
});

test.describe('낡은 매니페스트 복구', () => {
  test('탭이 들고 있던 매니페스트의 샤드 해시가 틀려 404 가 나면 매니페스트를 다시 받아 새 해시로 본문 검색이 된다', async ({ page }) => {
    let manifestRequests = 0;
    await page.route('**/api/search', async (route) => {
      manifestRequests++;
      if (manifestRequests === 1) {
        // 새 배포 전의 매니페스트처럼 모든 해시를 틀리게 만든다.
        const res = await route.fetch();
        const json = await res.json();
        for (const c of json.certs) c.h = '0000000000';
        return route.fulfill({ response: res, json });
      }
      return route.continue();
    });
    const notFound: string[] = [];
    page.on('response', (r) => { const p = new URL(r.url()).pathname; if (isShardPath(p) && r.status() === 404) notFound.push(p); });

    const dialog = await openSearch(page);
    await dialog.getByRole('textbox').fill('NGFW');
    await expect(dialog.locator('a[href="/aws/saa-c03/week3/day5"]')).toBeVisible();
    expect(manifestRequests, '매니페스트는 정확히 한 번 더 받는다').toBe(2);
    expect(notFound.length, '낡은 해시 요청이 404 였다').toBeGreaterThan(0);
    // 재요청이 HTTP 캐시를 우회하는지(cache: 'reload')는 Playwright 라우팅이 캐시를 끄므로 loader.test.ts 가 검증한다.
  });
});

test.describe('검색 샤드 캐시', () => {
  test('두 번째 페이지 로드에서는 샤드가 네트워크가 아니라 브라우저 캐시에서 온다', async ({ page }) => {
    const shardTransfer = async () => page.evaluate(() => performance.getEntriesByType('resource')
      .filter((e) => /\/api\/search\/[a-z0-9-]+\.[0-9a-f]{10}$/.test(e.name))
      .map((e) => (e as PerformanceResourceTiming).transferSize));

    let dialog = await openSearch(page);
    await dialog.getByRole('textbox').fill('lambda');
    await expect.poll(async () => (await shardTransfer()).length).toBe(SHARD_COUNT);
    const first = await shardTransfer();
    expect(first.filter((n) => n > 0)).toHaveLength(SHARD_COUNT); // 첫 로드는 전부 네트워크

    dialog = await openSearch(page, '/linux'); // 새 문서 로드(전체 페이지 로드)
    await dialog.getByRole('textbox').fill('lambda');
    await expect.poll(async () => (await shardTransfer()).length).toBe(SHARD_COUNT);
    const second = await shardTransfer();
    const network = second.filter((n) => n > 0).length;
    console.log(`[cache] second page load: ${network} of ${second.length} shard requests hit the network`);
    expect(network).toBe(0);
  });
});

test.describe('검색 엔드포인트', () => {
  test('유효한 샤드 키는 영구 캐시 헤더와 함께 200, 목록 밖 키·해시 없는 slug·낡은 해시는 진짜 404 다', async ({ request }) => {
    const manifest = await (await request.get('/api/search')).json();
    const cert = manifest.certs[0];
    const ok = await request.get(`/api/search/${cert.slug}.${cert.h}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()['cache-control']).toContain('immutable');
    expect((await ok.json()).slug).toBe(cert.slug);

    const bad = [
      '/api/search/not-a-cert', `/api/search/${cert.slug}`, `/api/search/${cert.slug}.0000000000`,
      `/api/search/${cert.slug.toUpperCase()}.${cert.h}`, '/api/search/%2e%2e', `/api/search/${cert.slug}.${cert.h}/extra/deeper`,
    ];
    for (const path of bad) expect((await request.get(path)).status(), path).toBe(404);
  });

  test('매니페스트는 정적으로 서빙되고 본문 사전을 싣지 않는다', async ({ request }) => {
    const res = await request.get('/api/search');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control'] ?? '').toMatch(/s-maxage=\d+|max-age=\d+/);
    expect(await res.text()).not.toContain('"dict"');
  });
});
