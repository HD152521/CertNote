import { test, expect, type Page } from '@playwright/test';

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

// 구독제 보류 이후 noindex로 남는 day는 번역이 덜 된 영어판 week2+뿐이다(src/lib/day/indexPolicy.ts).
test.describe('noindex day — /en/saa-c03/week2/day1', () => {
  const url = '/en/saa-c03/week2/day1';

  test('자기참조 canonical + noindex,nofollow + hreflang 0개', async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://cert.juganlab.com/en/saa-c03/week2/day1',
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBe(0);
  });

  test('신규 JSON-LD가 없다 — 전역 Organization/WebSite 블록 1개만 남는다', async ({ page }) => {
    await page.goto(url);
    const blocks = page.locator('script[type="application/ld+json"]');
    expect(await blocks.count()).toBe(1);
    const raw = await blocks.first().textContent();
    const parsed = JSON.parse(raw ?? '');
    const types = (Array.isArray(parsed) ? parsed : [parsed]).map((n: Record<string, unknown>) => n['@type']);
    expect(types.sort()).toEqual(['Organization', 'WebSite']);
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

  // day 라우트는 첫 요청 때 생성돼 캐시된다. 렌더 도중 notFound()는 스트리밍 때문에 200 이 되므로,
  // 없는 주소가 한 번이라도 200 으로 나가면 그 응답이 캐시된다 — 두 번 요청해 둘 다 404 인지 본다.
  const NEVER_200 = [
    '/aws/saa-c03/week1/day99', // week1 의 없는 day(예전엔 day 번호를 검증하지 않아 200 + noindex)
    '/aws/saa-c03/week1/day6',
    '/aws/saa-c03/week2/day9',
    '/aws/saa-c03/week99/day1',
    '/aws/saa-c03/week02/day1', // 정규형이 아닌 별칭
    '/aws/SAA-C03/week2/day1', // slug 대소문자
    '/AWS/saa-c03/week2/day1', // category 대소문자
    '/linux/saa-c03/week2/day1', // 교차 섹션
    '/foo/bar/week2/day1', // 콘텐츠 접두사 밖 4세그먼트
    '/foo/bar/baz/qux',
    '/foo/bar/week1/x',
    '/api/foo/bar/baz',
    '/_next/foo/bar/baz',
  ];
  for (const url of NEVER_200) {
    test(`${url} 은 두 번 요청해도 404다(캐시된 소프트 404 방지)`, async ({ request }) => {
      for (let i = 0; i < 2; i++) {
        const res = await request.get(url, { maxRedirects: 0 });
        expect(res.status(), `${url} ${i + 1}번째 요청`).toBe(404);
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
