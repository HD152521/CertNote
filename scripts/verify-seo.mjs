#!/usr/bin/env node
// 배포본 SEO 신호 검증 (docs/SEO-indexing-fix-plan.md Step 8).
//
// 로컬 e2e/seo-smoke.spec.ts 는 빌드 산출물을 검증하지만, 이 스크립트는 "실제로 배포된 호스트"를
// 친다. Vercel 리다이렉트·CDN 캐시·프록시가 끼어들면 로컬과 결과가 달라질 수 있어 배포 직후
// 한 번 더 확인하는 용도다.
//
// 사용법:
//   node scripts/verify-seo.mjs                        # 프로덕션(cert.juganlab.com)
//   node scripts/verify-seo.mjs https://staging.example.com
//
// 종료 코드: 실패 0건이면 0, 하나라도 실패하면 1 (CI 게이트로 쓸 수 있다).

const BASE = (process.argv[2] ?? 'https://cert.juganlab.com').replace(/\/$/, '');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function fetchPage(path, ua) {
  const res = await fetch(`${BASE}${path}`, {
    headers: ua ? { 'user-agent': ua } : {},
    redirect: 'manual',
  });
  const html = res.status === 200 ? await res.text() : '';
  return { status: res.status, html };
}

const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;

// canonical 은 metadataBase(src/lib/site.ts 의 SITE_URL)를 따르므로 로컬 빌드를 검증할 때도
// 항상 프로덕션 도메인으로 나온다. 호스트를 비교하면 로컬에서 항상 실패하므로 경로만 비교한다.
function canonicalPathOf(html) {
  const raw = canonicalOf(html);
  if (!raw) return null;
  try {
    const p = new URL(raw).pathname;
    return p === '/' ? '/' : p.replace(/\/$/, '');
  } catch {
    return raw;
  }
}
const robotsOf = (html) => [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1]);
const hreflangsOf = (html) =>
  [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)]
    .map((m) => `${m[1]}=${m[2]}`)
    .sort();

function jsonLdOf(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const types = [];
  for (const b of blocks) {
    // Next 가 XSS 방지로 '<' 를 유니코드 이스케이프해 내보내므로 되돌린 뒤 파싱한다.
    const parsed = JSON.parse(b[1].replace(/\\u003c/g, '<'));
    for (const obj of Array.isArray(parsed) ? parsed : [parsed]) {
      types.push(Array.isArray(obj['@type']) ? obj['@type'].join('+') : obj['@type']);
    }
  }
  return types;
}

async function main() {
  console.log(`\nSEO 검증 대상: ${BASE}\n`);

  // --- Step 1: 유료 day 가 자기참조 canonical + noindex, 홈 hreflang 누수 없음 ---
  console.log('[Step 1] 유료 day canonical/hreflang 누수');
  const paid = await fetchPage('/aws-certs/saa-c03/week2/day1');
  check('유료 day 200 응답', paid.status === 200, `status=${paid.status}`);
  check(
    '유료 day canonical 이 자기참조',
    canonicalPathOf(paid.html) === '/aws-certs/saa-c03/week2/day1',
    canonicalOf(paid.html) ?? 'none',
  );
  check('유료 day robots=noindex, nofollow', robotsOf(paid.html).includes('noindex, nofollow'));
  check('유료 day 에 hreflang 없음', hreflangsOf(paid.html).length === 0);
  check('유료 day 에 신규 JSON-LD 없음', !jsonLdOf(paid.html).some((t) => /Article|Breadcrumb|Course/.test(t)));

  // --- Step 2: 루트 canonical 상속 제거 ---
  console.log('\n[Step 2] canonical 상속');
  const home = await fetchPage('/');
  check('홈 canonical 유지', canonicalPathOf(home.html) === '/', canonicalOf(home.html) ?? 'none');
  const checkout = await fetchPage('/checkout');
  check(
    '/checkout canonical 이 홈이 아님',
    canonicalPathOf(checkout.html) === '/checkout',
    canonicalOf(checkout.html) ?? 'none',
  );

  // --- Step 3: hreflang 상호 참조 ---
  console.log('\n[Step 3] hreflang 상호 참조');
  const ko = await fetchPage('/aws-certs');
  const en = await fetchPage('/en');
  const koSet = hreflangsOf(ko.html).join(' | ');
  const enSet = hreflangsOf(en.html).join(' | ');
  check('/aws-certs 와 /en 의 hreflang 집합이 동일', koSet === enSet && koSet.length > 0, koSet || 'none');
  const xDefaults = hreflangsOf(ko.html).filter((h) => h.startsWith('x-default='));
  check('x-default 가 정확히 1개', xDefaults.length === 1, xDefaults.join(','));

  // --- Step 4: 구조화 데이터 ---
  console.log('\n[Step 4] 구조화 데이터');
  const free = await fetchPage('/aws-certs/saa-c03/week1/day1');
  const freeTypes = jsonLdOf(free.html);
  check('무료 day 에 Article 계열 JSON-LD', freeTypes.some((t) => t.includes('Article')), freeTypes.join(', '));
  check('무료 day 에 BreadcrumbList', freeTypes.includes('BreadcrumbList'));
  check('전역 Organization 유지', freeTypes.includes('Organization'));

  // --- Step 5: 무료 day 정적 렌더 + 유료 500 회귀 ---
  console.log('\n[Step 5] 렌더 전략');
  check(
    '무료 day canonical 자기참조',
    canonicalPathOf(free.html) === '/aws-certs/saa-c03/week1/day1',
    canonicalOf(free.html) ?? 'none',
  );
  check('무료 day 에 robots 메타 없음(색인 허용)', robotsOf(free.html).length === 0);
  for (const path of [
    '/aws-certs/saa-c03/week2/day1',
    '/aws-certs/saa-c03/week12/day5',
    '/en/saa-c03/week2/day1',
  ]) {
    const r = await fetchPage(path, GOOGLEBOT);
    check(`Googlebot 유료 day 500 회귀 없음 ${path}`, r.status === 200, `status=${r.status}`);
  }

  // --- Step 6: 소프트 404 + 사이트맵 ---
  console.log('\n[Step 6] 404 / 사이트맵');
  for (const path of [
    '/aws-certs/nope/week1/day1',
    '/aws-certs/saa-c03/week99/day1',
    '/aws-certs/nonexistent-cert',
    '/foo/bar',
    '/totally-bogus-path',
  ]) {
    const r = await fetchPage(path);
    check(`존재하지 않는 URL 이 진짜 404 ${path}`, r.status === 404, `status=${r.status}`);
  }

  const smRes = await fetch(`${BASE}/sitemap.xml`);
  const smXml = await smRes.text();
  // <loc> 는 항상 프로덕션 절대 URL(metadataBase)이다. 그대로 fetch 하면 로컬 빌드를 검증하려다
  // 조용히 프로덕션을 치게 되므로, 경로만 떼어 검증 대상 호스트에 다시 붙인다.
  const locs = [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try {
      return `${BASE}${new URL(m[1]).pathname}`;
    } catch {
      return m[1];
    }
  });
  check('사이트맵 응답 200', smRes.status === 200);
  check('사이트맵에 /privacy 포함', locs.some((u) => u.endsWith('/privacy')));

  const lastmods = new Set([...smXml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]));
  check(
    'lastmod 가 빌드시각 고정값이 아님(값이 여러 개)',
    lastmods.size > 1,
    `고유값 ${lastmods.size}개`,
  );

  // 사이트맵 전 URL 상태코드. 배포본은 네트워크 왕복이라 동시 실행으로 묶는다.
  console.log(`\n[Step 6] 사이트맵 URL ${locs.length}개 상태코드 확인 중...`);
  const bad = [];
  const BATCH = 10;
  for (let i = 0; i < locs.length; i += BATCH) {
    const slice = locs.slice(i, i + BATCH);
    const codes = await Promise.all(
      slice.map((u) => fetch(u, { redirect: 'manual' }).then((r) => r.status).catch(() => 0)),
    );
    codes.forEach((c, j) => c !== 200 && bad.push(`${c} ${slice[j]}`));
  }
  check(`사이트맵 전 URL 200`, bad.length === 0, bad.length ? bad.slice(0, 5).join(' / ') : `${locs.length}개 정상`);

  // --- 요약 ---
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`총 ${results.length}개 검사, 통과 ${results.length - failed.length}, 실패 ${failed.length}`);
  if (failed.length) {
    console.log('\n실패 항목:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`));
  }
  console.log(`${'='.repeat(60)}\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('검증 스크립트 실행 실패:', err);
  process.exit(1);
});
