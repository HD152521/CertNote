// 서버 렌더 HTML 의 <a href> 만으로 내부 링크 그래프를 만들어 크롤 발견성을 측정한다(JS 실행 없음).
//
// 사용: node scripts/link-graph.mjs [baseUrl=http://localhost:3201] [--json out.json]
// 전제: `next start` 가 baseUrl 에서 돌고 있다. 외부 네트워크는 쓰지 않는다(localhost 만).
//
// 출력: URL 그룹별 도달 여부 · 진입점(/ 또는 /en)에서의 최소 클릭 깊이 · 인링크 수(서로 다른 페이지) ·
// 고아(진입점에서 도달 불가) 수, 그리고 발견된 모든 내부 링크 대상의 상태 코드와 언어 교차 링크 점검.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
const BASE = (args.find((a, i) => !a.startsWith('--') && i !== jsonIdx + 1) ?? 'http://localhost:3201').replace(/\/$/, '');
const CONCURRENCY = 12;

const HREF_RE = /<a\s[^>]*?href="([^"]*)"[^>]*>/gi;

/** 정규화: 같은 출처 내부 경로만, 해시·쿼리 제거, 끝 슬래시 제거. */
export function normalize(href) {
  if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
  let u;
  try {
    u = new URL(href.replaceAll('&amp;', '&'), BASE + '/');
  } catch {
    return null;
  }
  if (u.origin !== new URL(BASE).origin) return null;
  const p = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname;
  return p;
}

/** HTML 에서 (path, nofollow) 목록을 뽑는다. */
export function extractLinks(html) {
  const out = [];
  for (const m of html.matchAll(HREF_RE)) {
    const path = normalize(m[1]);
    if (!path) continue;
    const nofollow = /\brel="[^"]*nofollow/i.test(m[0]);
    out.push({ path, nofollow });
  }
  return out;
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const body = res.status === 200 ? await res.text() : '';
  return { status: res.status, body, location: res.headers.get('location') ?? '' };
}

async function pool(items, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    }),
  );
  return results;
}

const isEn = (p) => p === '/en' || p.startsWith('/en/');

export function groupOf(p) {
  const en = isEn(p);
  const q = en ? p.slice(3) || '/' : p;
  const lang = en ? 'en' : 'ko';
  if (q === '/') return `${lang} home`;
  let m;
  if ((m = q.match(/\/week(\d+)\/day\d+$/))) return `${lang} day ${Number(m[1]) === 1 ? 'week1' : 'week2+'}`;
  if (q === '/lab' || q.startsWith('/lab/')) return `${lang} lab`;
  if (q === '/roadmap' || q.startsWith('/roadmap/')) return `${lang} roadmap`;
  if (/^\/(about|changelog|contact|terms|privacy)(\/|$)/.test(q)) return `${lang} info`;
  const segs = q.split('/').filter(Boolean);
  if (en) return segs.length === 1 ? 'en cert hub' : `en other`;
  if (segs.length === 1) return 'ko hubs';
  if (segs.length === 2) return 'ko cert hubs';
  return 'ko other';
}

async function main() {
  const smRes = await get('/sitemap.xml');
  if (smRes.status !== 200) throw new Error(`sitemap.xml ${smRes.status}`);
  const sitemapPaths = [...smRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => normalize(m[1].replace(/^https?:\/\/[^/]+/, BASE)))
    .filter(Boolean);
  const uniq = [...new Set(sitemapPaths)];
  console.log(`sitemap URLs: ${uniq.length}`);

  // 1) 전체 사이트맵 URL + 두 진입점을 가져와 링크를 뽑는다. (진입점에서 BFS 가 따라가는 건 이 그래프다.)
  const pages = new Map(); // path -> { status, links:Set<path>, nofollow:Set<path>, bytes }
  const fetchPage = async (p) => {
    const r = await get(p);
    pages.set(p, {
      status: r.status,
      location: r.location,
      bytes: Buffer.byteLength(r.body),
      links: new Set(),
      nofollowLinks: new Set(),
    });
    for (const l of extractLinks(r.body)) {
      if (l.nofollow) pages.get(p).nofollowLinks.add(l.path);
      else pages.get(p).links.add(l.path);
    }
  };
  const todo = new Set([...uniq, '/', '/en']);
  await pool([...todo], fetchPage);

  // 2) 사이트맵 밖 링크 대상도 상태 확인 및 (그래프 확장을 위해) 수집한다.
  const targets = new Set();
  for (const pg of pages.values()) for (const t of pg.links) targets.add(t);
  const unknown = [...targets].filter((t) => !pages.has(t));
  await pool(unknown, fetchPage);

  // 3) 진입점별 BFS (크롤러가 따라가는 링크 = nofollow 아님).
  function bfs(entry) {
    const depth = new Map([[entry, 0]]);
    const q = [entry];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      const pg = pages.get(cur);
      if (!pg || pg.status !== 200) continue;
      for (const n of pg.links) {
        if (!depth.has(n)) {
          depth.set(n, depth.get(cur) + 1);
          q.push(n);
        }
      }
    }
    return depth;
  }
  const depthKo = bfs('/');
  const depthEn = bfs('/en');

  // 인링크(서로 다른 페이지, 자기 자신 제외).
  const inDeg = new Map();
  for (const [src, pg] of pages) {
    for (const t of pg.links) {
      if (t === src) continue;
      inDeg.set(t, (inDeg.get(t) ?? 0) + 1);
    }
  }

  // 4) 그룹별 집계.
  const groups = new Map();
  for (const p of uniq) {
    const g = groupOf(p);
    const d = (isEn(p) ? depthEn : depthKo).get(p);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ p, d, inn: inDeg.get(p) ?? 0 });
  }
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : '-');
  const rows = [];
  for (const [g, items] of [...groups].sort()) {
    const reach = items.filter((x) => x.d !== undefined);
    const ds = reach.map((x) => x.d);
    const ins = items.map((x) => x.inn);
    rows.push({
      group: g,
      total: items.length,
      reachable: reach.length,
      orphans: items.length - reach.length,
      minDepth: ds.length ? Math.min(...ds) : '-',
      maxDepth: ds.length ? Math.max(...ds) : '-',
      inMin: Math.min(...ins),
      inMed: med(ins),
      inMax: Math.max(...ins),
    });
  }
  console.log('\n| group | total | reachable | orphans | depth min..max | in-degree min/med/max |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows)
    console.log(`| ${r.group} | ${r.total} | ${r.reachable} | ${r.orphans} | ${r.minDepth}..${r.maxDepth} | ${r.inMin}/${r.inMed}/${r.inMax} |`);
  const totalOrphans = rows.reduce((s, r) => s + r.orphans, 0);
  console.log(`\nTOTAL sitemap ${uniq.length}, orphans ${totalOrphans}`);

  // 5) 진입점이 직접 거는 링크.
  for (const e of ['/', '/en']) {
    console.log(`\nentry ${e}: ${pages.get(e).links.size} followable links, ${pages.get(e).bytes} bytes`);
    const byG = {};
    for (const t of pages.get(e).links) byG[groupOf(t)] = (byG[groupOf(t)] ?? 0) + 1;
    console.log('  by group:', JSON.stringify(byG));
  }

  // 6) 점검: 404 대상, 영어→한국어 링크, 크롤 가능한 차단 URL 링크.
  const BLOCKED = /^\/(login|signup|exam|dashboard|account|admin|api|home|onboarding|welcome|checkout|pricing|notebook|review|forgot|reset|verify)(\/|$)/;
  const bad = [];
  const crossLang = [];
  const blockedLinks = new Map();
  for (const [src, pg] of pages) {
    for (const t of pg.links) {
      const tp = pages.get(t);
      if (tp && tp.status >= 400) bad.push(`${src} -> ${t} (${tp.status})`);
      if (isEn(src) && !isEn(t) && t !== '/' ) crossLang.push(`${src} -> ${t}`);
      if (BLOCKED.test(t)) {
        if (!blockedLinks.has(t)) blockedLinks.set(t, new Set());
        blockedLinks.get(t).add(src);
      }
    }
  }
  const statusCounts = {};
  for (const [, pg] of pages) statusCounts[pg.status] = (statusCounts[pg.status] ?? 0) + 1;
  console.log('\nstatus counts over all fetched pages:', JSON.stringify(statusCounts));
  console.log(`link targets checked: ${pages.size}; 4xx/5xx link edges: ${bad.length}`);
  for (const b of bad.slice(0, 15)) console.log('  BAD', b);
  const redirects = [...pages].filter(([, pg]) => pg.status >= 300 && pg.status < 400);
  console.log(`redirect targets linked: ${redirects.length}`);
  for (const [p, pg] of redirects.slice(0, 10)) console.log('  REDIR', p, '->', pg.location);
  // 영어 → 한국어 교차 링크는 페이지 단위로 묶어 요약(수천 건이 될 수 있다).
  const crossByTarget = {};
  for (const c of crossLang) {
    const [, t] = c.split(' -> ');
    crossByTarget[t] = (crossByTarget[t] ?? 0) + 1;
  }
  console.log(`en->ko link edges: ${crossLang.length}, distinct ko targets: ${Object.keys(crossByTarget).length}`);
  // 언어 토글은 페이지당 정확히 한 개의 반대 언어 링크다. 한 페이지에서 한국어 링크가 2개 이상이면 토글 밖의 교차 링크다.
  const perSrc = {};
  for (const c of crossLang) { const [src] = c.split(' -> '); perSrc[src] = (perSrc[src] ?? 0) + 1; }
  const multi = Object.entries(perSrc).filter(([, n]) => n > 1);
  console.log(`en pages with >1 ko link (beyond the toggle): ${multi.length}`);
  for (const [src, n] of multi.slice(0, 8)) console.log('  ', src, n);
  console.log('  sample:', JSON.stringify(Object.entries(crossByTarget).sort((a, b) => b[1] - a[1]).slice(0, 6)));
  console.log('followable links to blocked/noindex-ish URLs (target: #source pages):');
  for (const [t, s] of blockedLinks) console.log(`  ${t}: ${s.size}`);

  const sizes = {};
  for (const p of ['/', '/en', '/aws/saa-c03/week1/day1', '/en/saa-c03/week1/day1']) {
    if (pages.has(p)) sizes[p] = pages.get(p).bytes;
  }
  console.log('\nHTML bytes:', JSON.stringify(sizes));

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify({ rows, sizes, bad, crossLangCount: crossLang.length, totalOrphans, sitemap: uniq.length }, null, 2),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
