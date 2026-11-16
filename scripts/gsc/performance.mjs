// searchAnalytics (date, page) 최근 90일 -> 그룹별 합계, 기준선(sa.json) 대비. 읽기 전용.
// 사용: node performance.mjs [--baseline <sa.json>] [--days 90] [--since 2026-11-15] [--out DIR]
// 주의: Search Console 데이터는 약 3일 지연되므로 종료일을 오늘-3일로 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { api, SITE_URL } from './auth.mjs';
import { parseArgs, groupOf, GROUPS, today, addDays, defaultOut } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const days = +(a.days || 90), since = a.since || '2026-11-15';
const end = addDays(today(), -3), start = addDays(end, -(days - 1));
const outDir = a.out || defaultOut();
const r = await api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
  startDate: start, endDate: end, dimensions: ['date', 'page'], rowLimit: 25000,
  dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: 'cert.juganlab.com' }] }],
});
if (r.status !== 200) { console.error('조회 실패', r.status, JSON.stringify(r.j).slice(0, 200)); process.exit(1); }
const rows = r.j.rows || [];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `performance-${today()}.json`), JSON.stringify(rows));

const sum = (rs) => rs.reduce((t, x) => ({ c: t.c + x.clicks, i: t.i + x.impressions }), { c: 0, i: 0 });
const byGroup = (rs, pageIdx) => { const m = {}; for (const x of rs) (m[groupOf(x.keys[pageIdx])] ??= []).push(x); return m; };
const cur = byGroup(rows, 1);
const post = byGroup(rows.filter((x) => x.keys[0] >= since), 1);
let base = null;
if (a.baseline) { const s = JSON.parse(fs.readFileSync(a.baseline, 'utf8')); base = byGroup(s.byPage || [], 0); }

console.log(`# GSC 검색 성과 (${start} ~ ${end})\n`);
console.log(`> Search Console 데이터는 약 3일 지연됩니다. 종료일을 오늘-3일(${end})로 잡았습니다.` +
  (since > end ? ` ${since} 이후 데이터는 아직 조회 불가(이후 열은 0).` : ` ${since} 이후 열은 ${since} ~ ${end} 구간입니다.`) + '\n');
console.log(`| 그룹 | 클릭 | 노출 | ${since} 이후 클릭 | ${since} 이후 노출 |${base ? ' 기준선 클릭 | 기준선 노출 |' : ''}\n|${'---|'.repeat(base ? 7 : 5)}`);
let T = { c: 0, i: 0 }, P = { c: 0, i: 0 }, B = { c: 0, i: 0 };
for (const g of GROUPS) {
  if (!(cur[g] || base?.[g])) continue;
  const s = sum(cur[g] || []), p = sum(post[g] || []), b = sum(base?.[g] || []);
  T = { c: T.c + s.c, i: T.i + s.i }; P = { c: P.c + p.c, i: P.i + p.i }; B = { c: B.c + b.c, i: B.i + b.i };
  console.log(`| ${g} | ${s.c} | ${s.i} | ${p.c} | ${p.i} |${base ? ` ${b.c} | ${b.i} |` : ''}`);
}
console.log(`| **합계** | ${T.c} | ${T.i} | ${P.c} | ${P.i} |${base ? ` ${B.c} | ${B.i} |` : ''}`);
const top = rows.reduce((m, x) => { m[x.keys[1]] = (m[x.keys[1]] || 0) + x.impressions; return m; }, {});
console.log('\n노출 상위 페이지:');
Object.entries(top).sort((x, y) => y[1] - x[1]).slice(0, 5).forEach(([u, n]) => console.log(`- ${u.replace('https://cert.juganlab.com', '') || '/'}: ${n}`));
