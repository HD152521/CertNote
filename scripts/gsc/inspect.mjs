// URL Inspection 읽기 전용 수집. 색인 요청/사이트맵 제출 같은 쓰기는 구현하지 않음.
// 사용: node scripts/gsc/inspect.mjs [--sitemap URL] [--seed 7] [--same-as baseline.json] [--limit N]
//        [--out DIR] [--concurrency 4] [--cap-day-w1 120] [--cap-day-w2 250] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { api, SITE_URL } from './auth.mjs';
import { parseArgs, groupOf, GROUPS, seededRandom, shuffle, today, defaultOut } from './lib.mjs';

const DAILY_QUOTA = 1500; // 실제 한도는 속성당 2000/일, 여유를 둔다
const ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const MAX_RETRY = 5;
const a = parseArgs(process.argv.slice(2));
const outDir = a.out || defaultOut();
const sitemap = a.sitemap || 'https://cert.juganlab.com/sitemap.xml';
const seed = a.seed ?? 7;
const conc = Math.max(1, Math.min(8, Number(a.concurrency) || 4));
const capW1 = +(a['cap-day-w1'] ?? 120), capW2 = +(a['cap-day-w2'] ?? 250);
const caps = { ko_day_w1: capW1, en_day_w1: capW1, 'ko_day_w2+': capW2, 'en_day_w2+': capW2 };
fs.mkdirSync(outDir, { recursive: true });

// ---- 일일 쿼터 장부 (out 폴더에 날짜별 누적) ----
const quotaFile = path.join(outDir, `quota-${today()}.json`);
const readUsed = () => { try { return JSON.parse(fs.readFileSync(quotaFile, 'utf8')).used || 0; } catch { return 0; } };
let used = readUsed();
const bump = () => { used++; fs.writeFileSync(quotaFile, JSON.stringify({ date: today(), used })); };

async function pickUrls() {
  if (a['same-as']) {
    const base = JSON.parse(fs.readFileSync(a['same-as'], 'utf8'));
    return base.map((x) => ({ g: groupOf(x.u), u: x.u }));
  }
  const res = await fetch(sitemap);
  if (!res.ok) throw new Error(`사이트맵 가져오기 실패 HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const by = {};
  urls.forEach((u) => (by[groupOf(u)] ??= []).push(u));
  const rnd = seededRandom(seed);
  const out = [];
  for (const g of GROUPS) {
    let l = by[g] || [];
    console.log(`그룹 ${g}: 전체 ${l.length}`);
    if (caps[g] && l.length > caps[g]) l = shuffle(l, rnd).slice(0, caps[g]);
    l.forEach((u) => out.push({ g, u }));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function inspectOne({ g, u }) {
  for (let t = 0; t <= MAX_RETRY; t++) {
    if (used >= DAILY_QUOTA) throw Object.assign(new Error('quota'), { quota: true });
    bump();
    let r;
    try { r = await api(ENDPOINT, { inspectionUrl: u, siteUrl: SITE_URL }); }
    catch (e) { r = { status: 0, j: { raw: e.message } }; }
    if (r.status === 200) {
      const s = r.j.inspectionResult?.indexStatusResult || {};
      return { g, u, cov: s.coverageState, idx: s.indexingState, rob: s.robotsTxtState, fetch: s.pageFetchState, crawl: s.lastCrawlTime, gc: s.googleCanonical, uc: s.userCanonical, as: s.crawledAs, ref: s.referringUrls, sm: s.sitemap, verdict: s.verdict };
    }
    if (r.status === 401 || r.status === 403) return { g, u, err: r.status, m: String(r.j.error?.message || '').slice(0, 150) };
    if (t < MAX_RETRY && (r.status === 429 || r.status >= 500 || r.status === 0)) { await sleep(2000 * 2 ** t + Math.random() * 500); continue; }
    return { g, u, err: r.status, m: JSON.stringify(r.j).slice(0, 150) };
  }
}

let list = await pickUrls();
if (a.limit) list = shuffle(list, seededRandom(seed)).slice(0, +a.limit);
const remaining = DAILY_QUOTA - used;
console.log(`대상 ${list.length}건, 오늘 사용 ${used}/${DAILY_QUOTA}`);
if (list.length > remaining) {
  console.error(`쿼터 초과 예상: 대상 ${list.length} > 남은 ${remaining} (일일 상한 ${DAILY_QUOTA}). --limit ${remaining} 로 줄이거나 내일 실행하세요. (중단)`);
  process.exit(2);
}

const results = []; let idx = 0, stopped = false;
async function worker() {
  while (idx < list.length && !stopped) {
    const item = list[idx++];
    try { results.push(await inspectOne(item)); }
    catch (e) { if (e.quota) { stopped = true; console.error('일일 쿼터 한도 도달, 중단'); } else throw e; }
    if (results.length % 100 === 0 && results.length) console.log(`${results.length}/${list.length}`);
  }
}
try { await Promise.all(Array.from({ length: conc }, worker)); }
catch (e) { console.error('오류:', e.message); }

let file = path.join(outDir, `inspect-${today()}.json`);
if (fs.existsSync(file)) file = path.join(outDir, `inspect-${today()}-${new Date().toTimeString().slice(0, 5).replace(':', '')}.json`);
fs.writeFileSync(file, JSON.stringify(results));
const errs = results.filter((x) => x.err).length;
console.log(`완료 ${results.length}건 (오류 ${errs}), 오늘 쿼터 ${used}/${DAILY_QUOTA}\n저장: ${file}`);
if (stopped || errs > results.length / 2) process.exit(1);
