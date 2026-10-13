import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// SEO 메타데이터/구조화 데이터 스모크 테스트(docs/SEO-indexing-fix-plan.md Step7-B).
//
// 이 파일만 별도(playwright.seo.config.ts)로 돌릴 수 있게 설계했다 — 전부 "공개 페이지를
// 읽기만" 하고 로그인·DB 상태를 전혀 건드리지 않는다(e2e/global-setup.ts가 요구하는
// certnote_dev DB 시드가 필요 없다). e2e/gating.spec.ts(로그인·구독 게이팅)와는 관심사가
// 분리되어 있어 같은 파일에 섞지 않는다.
//
// vitest 단위 테스트(generateMetadata 직접 호출)와의 차이: 여기는 실제 프로덕션 빌드를
// 서버로 띄워 proxy(src/proxy.ts)·global-not-found·스트리밍까지 포함한 "진짜 HTTP 응답"을
// 검증한다. 상태코드·robots 메타 중복(Step7-A-2, Next의 자동 NonIndex 주입) 같은 문제는
// 단위 테스트로는 재현되지 않는다 — 이번 세션에서 실제로 이 방식으로 발견했다.

// 페이지의 모든 JSON-LD 블록을 파싱해 @type 목록과 블록 수를 반환한다.
async function readJsonLdTypes(page: Page): Promise<{ count: number; types: string[] }> {
  const blocks = page.locator('script[type="application/ld+json"]');
  const count = await blocks.count();
  const types: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = await blocks.nth(i).textContent();
    expect(raw, `${i}번째 JSON-LD가 JSON.parse에 실패하면 안 된다`).toBeTruthy();
    const parsed = JSON.parse(raw ?? '');
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      const t = node['@type'];
      if (Array.isArray(t)) types.push(...t);
      else types.push(t);
    }
  }
  return { count, types };
}

test.describe('canonical/hreflang — 최상위', () => {
  test('홈은 자기참조 canonical만 있고 hreflang은 없다', async ({ page }) => {
    await page.goto('/');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', 'https://cert.juganlab.com');
    expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBe(0);
  });

  test('/aws와 /en이 완전히 동일한 hreflang 집합으로 상호 참조한다', async ({ page }) => {
    const readHreflangSet = async (url: string) => {
      await page.goto(url);
      const links = page.locator('link[rel="alternate"][hreflang]');
      const count = await links.count();
      const pairs: Record<string, string> = {};
      for (let i = 0; i < count; i++) {
        const el = links.nth(i);
        const lang = await el.getAttribute('hreflang');
        const href = await el.getAttribute('href');
        if (lang && href) pairs[lang] = href;
      }
      return pairs;
    };

    const awsHreflang = await readHreflangSet('/aws');
    const enHreflang = await readHreflangSet('/en');

    expect(awsHreflang).toEqual(enHreflang);
    expect(awsHreflang).toEqual({
      ko: 'https://cert.juganlab.com/aws',
      en: 'https://cert.juganlab.com/en',
      'x-default': 'https://cert.juganlab.com/aws',
    });
  });
});

test.describe('무료 day — /aws/saa-c03/week1/day1', () => {
  const url = '/aws/saa-c03/week1/day1';

  test('자기참조 canonical + ko/en 상호 hreflang', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://cert.juganlab.com/aws/saa-c03/week1/day1',
    );
    const ko = page.locator('link[rel="alternate"][hreflang="ko"]');
    const en = page.locator('link[rel="alternate"][hreflang="en"]');
    await expect(ko).toHaveAttribute('href', 'https://cert.juganlab.com/aws/saa-c03/week1/day1');
    await expect(en).toHaveAttribute('href', 'https://cert.juganlab.com/en/saa-c03/week1/day1');
  });

  test('robots 메타가 없다(무료는 기본 색인 허용)', async ({ page }) => {
    await page.goto(url);
    expect(await page.locator('meta[name="robots"]').count()).toBe(0);
  });

  test('Article/LearningResource + BreadcrumbList JSON-LD를 포함해 총 3개의 JSON-LD 블록이 있다', async ({ page }) => {
    await page.goto(url);
    const blocks = page.locator('script[type="application/ld+json"]');
    const count = await blocks.count();
    expect(count).toBe(3); // 전역 Organization+WebSite(1) + Article(1) + BreadcrumbList(1)

    const types: string[] = [];
    for (let i = 0; i < count; i++) {
      const raw = await blocks.nth(i).textContent();
      expect(raw, `${i}번째 JSON-LD가 JSON.parse에 실패하면 안 된다`).toBeTruthy();
      const parsed = JSON.parse(raw ?? '');
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const t = node['@type'];
        if (Array.isArray(t)) types.push(...t);
        else types.push(t);
      }
    }
    expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'Article', 'BreadcrumbList']));
  });
});

// 구독제 보류 이후 한국어 week2+도 색인 대상이다(src/lib/day/indexPolicy.ts isIndexableDay).
test.describe('색인 대상 week2 day — /aws/saa-c03/week2/day1', () => {
  const url = '/aws/saa-c03/week2/day1';

  test('본문(h1)이 렌더되고 페이월 문구가 없다', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('div.article').first()).toBeVisible();
    await expect(page.getByText('여기부터는 Pro 전용입니다')).toHaveCount(0);
  });

  test('robots 메타가 없고 자기참조 canonical이 있다', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://cert.juganlab.com/aws/saa-c03/week2/day1',
    );
    expect(await page.locator('meta[name="robots"]').count()).toBe(0);
  });

  test('Article + BreadcrumbList JSON-LD를 포함해 총 3개의 JSON-LD 블록이 있다', async ({ page }) => {
    await page.goto(url);
    const { count, types } = await readJsonLdTypes(page);
    expect(count).toBe(3); // 전역 Organization+WebSite(1) + Article(1) + BreadcrumbList(1)
    expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'Article', 'BreadcrumbList']));
  });
});

// 옛 /aws-certs 주소는 섹션 URL로 영구 이동한다(회귀 방지).
test('옛 /aws-certs/... 주소는 /aws/... 로 308 이동한다', async ({ request }) => {
  const res = await request.get('/aws-certs/saa-c03/week1/day1', { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()['location']).toMatch(/\/aws\/saa-c03\/week1\/day1$/);
});

// 영어판 day 노출 정책(src/lib/day/presentable.ts): 한글이 남은 영어 day 는 내비게이션에 없고, 직접 들어오면 같은 day 의
// 한국어 페이지로 307 이동한다. "보여줄 수 있는 영어 day 집합"은 사이트맵과 정확히 같다(단위 테스트가 고정) — 그래서
// 한도 값을 하드코딩하지 않고 사이트맵의 영어 day 를 기준으로 DOM 을 검사한다.
const EN_DAY_HREF = /^\/en\/([^/]+)\/week(\d+)\/day(\d+)$/;

async function presentableEnDays(request: APIRequestContext): Promise<Set<string>> {
  const xml = await (await request.get('/sitemap.xml')).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://cert.juganlab.com', ''));
  return new Set(urls.filter((u) => EN_DAY_HREF.test(u)));
}

async function enDayHrefsOnPage(page: Page, slug: string): Promise<string[]> {
  const hrefs = await page.locator(`a[href^="/en/${slug}/week"]`).evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  return [...new Set(hrefs)].filter((h) => EN_DAY_HREF.test(h));
}

test.describe('영어 day 노출 — 한글이 남은 주차는 내비게이션에 없다', () => {
  for (const slug of ['saa-c03', 'dea-c01']) {
    test(`/en/${slug} 허브의 day 목록 = 노출 가능한 day 집합(사이트맵)`, async ({ page, request }) => {
      const allowed = [...(await presentableEnDays(request))].filter((u) => u.startsWith(`/en/${slug}/`));
      expect(allowed.length).toBeGreaterThan(0);
      await page.goto(`/en/${slug}`);
      const linked = await enDayHrefsOnPage(page, slug);
      expect(linked.sort()).toEqual(allowed.sort());
      // 숨긴 주차를 광고하지 않는다 — 안내 문구가 실제 범위를 말한다.
      await expect(page.getByText(/available in English/).first()).toBeVisible();
      expect(await page.getByText(/free to read|fully translated/i).count()).toBe(0);
    });

    test(`/en/${slug} 사이드바(데스크탑·모바일 드로어)에 노출 불가 day 링크가 없다`, async ({ page, request }) => {
      const allowed = await presentableEnDays(request);
      await page.goto(`/en/${slug}`);
      const linked = await enDayHrefsOnPage(page, slug);
      expect(linked.length).toBeGreaterThan(0);
      for (const h of linked) expect(allowed.has(h), `${h} 는 노출 불가인데 링크됨`).toBe(true);
    });
  }

  test('마지막 노출 day 의 "다음"이 노출 불가 day 로 이어지지 않는다', async ({ page, request }) => {
    const allowed = await presentableEnDays(request);
    const saa = [...allowed].filter((u) => u.startsWith('/en/saa-c03/'));
    const key = (u: string) => { const m = u.match(EN_DAY_HREF)!; return Number(m[2]) * 1000 + Number(m[3]); };
    const last = saa.sort((a, b) => key(a) - key(b)).at(-1)!;
    await page.goto(last);
    const linked = await enDayHrefsOnPage(page, 'saa-c03');
    for (const h of linked) expect(allowed.has(h), `${last} 에서 ${h} 로 링크됨`).toBe(true);
  });

  test('노출 가능한 week2+ 영어 day(있다면)는 색인 대상이다 — robots 없음·JSON-LD 있음', async ({ page, request }) => {
    const later = [...(await presentableEnDays(request))].find((u) => Number(u.match(EN_DAY_HREF)![2]) >= 2);
    test.skip(!later, '현재 week2+ 가 열린 영어 자격증이 없다');
    const res = await page.goto(later!);
    expect(res?.status()).toBe(200);
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);
    const { types } = await readJsonLdTypes(page);
    expect(types).toEqual(expect.arrayContaining(['Article', 'BreadcrumbList']));
  });
});

test.describe('한도 밖 영어 day 직접 접근 — 한국어 같은 day 로 307', () => {
  for (const [url, ko] of [
    ['/en/saa-c03/week2/day1', '/aws/saa-c03/week2/day1'],
    ['/en/saa-c03/week12/day5', '/aws/saa-c03/week12/day5'],
    ['/en/clf-c02/week4/day3', '/aws/clf-c02/week4/day3'],
  ]) {
    test(`${url} → 307 ${ko}, 두 번 모두, 캐시되지 않는다`, async ({ request }) => {
      for (const attempt of [1, 2]) {
        const res = await request.get(url, { maxRedirects: 0 });
        expect(res.status(), `${attempt}번째`).toBe(307);
        expect(new URL(res.headers()['location'], 'http://localhost:3000').pathname, `${attempt}번째 Location: ${res.headers()['location']}`).toBe(ko);
        const h = res.headers();
        expect(h['cache-control'], `${attempt}번째 캐시 헤더`).toBe('no-store');
        expect(h['x-nextjs-cache'], `${attempt}번째 Next 캐시 기록`).toBeUndefined();
        expect(h['x-vercel-cache']).toBeUndefined();
      }
    });
  }

  test('브라우저로 따라가면 한국어 day 가 200 으로 열리고 색인 대상이다', async ({ page }) => {
    const res = await page.goto('/en/saa-c03/week2/day1');
    expect(new URL(page.url()).pathname).toBe('/aws/saa-c03/week2/day1');
    expect(res?.status()).toBe(200);
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);
  });

  for (const url of ['/en/saa-c03/week99/day1', '/en/saa-c03/week2/day99', '/en/nope-c99/week1/day1', '/en/saa-c03/week02/day1']) {
    test(`${url} (존재하지 않는 영어 day)는 리다이렉트가 아니라 1·2번째 모두 진짜 404다`, async ({ request }) => {
      for (const attempt of [1, 2]) {
        const res = await request.get(url, { maxRedirects: 0 });
        expect(res.status(), `${attempt}번째`).toBe(404);
        expect(res.headers()['location']).toBeUndefined();
      }
    });
  }
});

test.describe('KO/EN 토글 — 한국어 week2+ 에서', () => {
  test('/aws/saa-c03/week2/day1 의 EN 은 영어 허브로 가고(루프·404 없음) 허브에는 week2 링크가 없다', async ({ page, request }) => {
    await page.goto('/aws/saa-c03/week2/day1');
    const en = page.getByLabel('Language').getByRole('link', { name: 'EN' });
    await expect(en).toHaveAttribute('href', '/en/saa-c03');
    const hub = await request.get('/en/saa-c03', { maxRedirects: 0 });
    expect(hub.status()).toBe(200);
    await en.click();
    await expect(page).toHaveURL(/\/en\/saa-c03$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const allowed = await presentableEnDays(request);
    for (const h of await enDayHrefsOnPage(page, 'saa-c03')) expect(allowed.has(h), h).toBe(true);
  });

  test('영어 허브의 KO 는 같은 자격증의 한국어 허브로 간다', async ({ page }) => {
    await page.goto('/en/saa-c03');
    await expect(page.getByLabel('Language').getByRole('link', { name: 'KO' })).toHaveAttribute('href', '/aws/saa-c03');
  });
});

test.describe('존재하지 않는 URL — 소프트 404 회귀 방지', () => {
  test('실제 HTTP 404를 반환하고 robots 메타가 정확히 1개(중복 없음)다', async ({ page }) => {
    const res = await page.goto('/aws/nope/week1/day1');
    expect(res?.status()).toBe(404);
    const robots = page.locator('meta[name="robots"]');
    expect(await robots.count()).toBe(1); // Step7-A-2 회귀 가드 — Next 자동 noindex와 중복 선언 금지
    await expect(robots).toHaveAttribute('content', /noindex/);
  });

  test('JSON-LD가 0개다', async ({ page }) => {
    await page.goto('/aws/nope/week1/day1');
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0);
  });

  test('/foo/bar(콘텐츠 접두사 밖 2세그먼트)도 실제 HTTP 404다(Step7-A-1)', async ({ page }) => {
    const res = await page.goto('/foo/bar');
    expect(res?.status()).toBe(404);
  });

  // day 라우트는 렌더 결과를 URL 단위로 캐시한다 — 존재하지 않는 category·slug·대소문자 변형이 200(소프트 404)으로
  // 나가면 무한한 캐시 키가 생긴다. 1·2번째 요청 모두 진짜 404여야 한다(2번째가 캐시 HIT 200으로 바뀌지 않는지).
  for (const url of [
    '/foo/bar/week2/day1',
    '/zzz/saa-c03/week5/day3',
    '/AWS/saa-c03/week2/day1',
    '/LINUX/linux-master-1/week2/day1',
    '/aws/SAA-C03/week2/day1',
    '/aws/saa-c03/week99/day1',
    '/aws/saa-c03/week02/day1',
    '/foo/bar/baz/qux',
    '/foo/bar/Week2/day1',
    '/foo/bar/week2/Day1',
    '/foo/bar/week1/x',
    '/foo/bar/baz/qux/quux',
    '/api/foo/bar/baz',
    '/api/auth/google/nope',
    '/api/x/week2/day1',
    '/_next/foo/bar/baz',
    '/_next/static/chunks/nope.js',
    '/aws/saa-c03/baz/qux',
    '/aws/saa-c03/week2/day1/extra',
    '/foo/bar',
    '/AWS/saa-c03',
    '/AWS',
  ]) {
    test(`${url} 는 1·2번째 요청 모두 실제 HTTP 404다`, async ({ request }) => {
      for (const attempt of [1, 2]) {
        const res = await request.get(url);
        expect(res.status(), `${url} ${attempt}번째 요청`).toBe(404);
        expect(res.headers()['cache-control'] ?? '', `${url} ${attempt}번째 요청은 CDN 캐시 대상이 아니다`).not.toMatch(/s-maxage=\d{5,}/);
      }
    });
  }
});

// request(APIRequestContext)로 HEAD 대신 GET만 쏘고 렌더링은 하지 않는다 — page.goto()로
// 143개를 전부 순회하면 브라우저 렌더링 비용 때문에 기본 30s 테스트 타임아웃을 넘긴다(실측
// 확인). 상태코드만 확인하면 되므로 API 요청이 훨씬 빠르고 이 테스트의 목적에도 더 맞는다.
const SITEMAP_CONCURRENCY = 8;
test('사이트맵의 모든 URL이 200을 반환한다', async ({ request }) => {
  test.setTimeout(240_000);
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(0);

  // 800여 개를 한꺼번에 쏘면 워커가 비정상 종료한다(실측: code=3221226505). 고정 동시성 풀로 나눠 보낸다.
  const results: { path: string; status: number }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const path = url.replace('https://cert.juganlab.com', '') || '/';
      const pageRes = await request.get(path);
      results.push({ path, status: pageRes.status() });
    }
  };
  await Promise.all(Array.from({ length: SITEMAP_CONCURRENCY }, worker));

  const failures = results.filter((r) => r.status !== 200);
  expect(failures, `200이 아닌 URL: ${JSON.stringify(failures)}`).toEqual([]);
});
