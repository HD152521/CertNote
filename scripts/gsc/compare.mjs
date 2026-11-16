// 두 inspect.json 비교 -> 한국어 마크다운 리포트. 사용: node compare.mjs <전> <후> [--since 2026-11-15]
import fs from 'node:fs';
import { parseArgs, GROUPS, groupOf } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
if (a._.length < 2) { console.error('사용법: node compare.mjs <baseline.json> <new.json> [--since YYYY-MM-DD]'); process.exit(1); }
const since = a.since || '2026-11-15';
const load = (p) => new Map(JSON.parse(fs.readFileSync(p, 'utf8')).map((x) => [x.u, x]));
const A = load(a._[0]), B = load(a._[1]);

const CATS = ['색인됨', '크롤됨-미색인', '발견됨-미색인', 'URL 모름', 'noindex 제외', '중복-canonical', '기타', '오류'];
function cat(x) {
  if (x.err) return '오류';
  const c = x.cov || '';
  if (/Crawled/i.test(c)) return '크롤됨-미색인';
  if (/Discovered/i.test(c)) return '발견됨-미색인';
  if (/unknown/i.test(c)) return 'URL 모름';
  if (/noindex/i.test(c)) return 'noindex 제외';
  if (/duplicate|canonical/i.test(c)) return '중복-canonical';
  if (/indexed/i.test(c)) return '색인됨';
  return '기타';
}
const grp = (x) => groupOf(x.u);
const common = [...B.keys()].filter((u) => A.has(u));
const onlyB = B.size - common.length;
const pairs = common.map((u) => [A.get(u), B.get(u)]);
const delta = (n) => (n > 0 ? `+${n}` : String(n));
const cnt = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
const short = (u) => u.replace('https://cert.juganlab.com', '') || '/';

console.log('# GSC 색인 재점검 비교\n');
console.log(`- 이전: \`${a._[0]}\` (${A.size}건), 이후: \`${a._[1]}\` (${B.size}건)`);
console.log(`- 비교 대상(양쪽 모두 있는 URL): **${common.length}건**${onlyB ? ` (이후에만 있는 ${onlyB}건 제외)` : ''}${common.length < A.size ? ` - 이전 전체의 ${(100 * common.length / A.size).toFixed(0)}%만 겹침(부분 비교)` : ''}`);
console.log(`- 크롤 기준일: ${since}\n`);

console.log('## 그룹별 색인 상태 (이전 -> 이후, 괄호는 증감)\n');
console.log(`| 그룹 | n | ${CATS.join(' | ')} |\n|${'---|'.repeat(CATS.length + 2)}`);
const tot = { a: {}, b: {} };
for (const g of GROUPS) {
  const ps = pairs.filter(([x]) => grp(x) === g);
  if (!ps.length) continue;
  const ca = cnt(ps, ([x]) => cat(x)), cb = cnt(ps, ([, y]) => cat(y));
  const cells = CATS.map((c) => {
    const p = ca[c] || 0, q = cb[c] || 0;
    tot.a[c] = (tot.a[c] || 0) + p; tot.b[c] = (tot.b[c] || 0) + q;
    return p === 0 && q === 0 ? '-' : `${p} -> ${q} (${delta(q - p)})`;
  });
  console.log(`| ${g} | ${ps.length} | ${cells.join(' | ')} |`);
}
console.log(`| **합계** | ${pairs.length} | ${CATS.map((c) => `${tot.a[c] || 0} -> ${tot.b[c] || 0} (${delta((tot.b[c] || 0) - (tot.a[c] || 0))})`).join(' | ')} |\n`);

const after = (x) => x.crawl && x.crawl.slice(0, 10) >= since;
const crawledAfter = pairs.filter(([, y]) => after(y));
const newlyCrawled = pairs.filter(([x, y]) => after(y) && !after(x));
const newlyKnown = pairs.filter(([x, y]) => cat(x) === 'URL 모름' && cat(y) !== 'URL 모름' && cat(y) !== '오류');
console.log('## 크롤 이동\n');
console.log(`- ${since} 이후 크롤된 URL: ${crawledAfter.length}건 (이전 측정 시점: ${pairs.filter(([x]) => after(x)).length}건)`);
console.log(`- 기준일 이후 새로 크롤된 URL(이전 기록은 기준일 이전): ${newlyCrawled.length}건`);
console.log(`- 새로 알려진(URL 모름 -> 알려짐) URL: ${newlyKnown.length}건`);
console.log(`- 아직 한 번도 크롤 안 됨: ${pairs.filter(([, y]) => !y.crawl).length}건`);
if (newlyKnown.length) console.log(`- 새로 알려진 그룹 분포: ${Object.entries(cnt(newlyKnown, ([, y]) => grp(y))).map(([g, n]) => `${g} ${n}`).join(', ')}`);
console.log('');

const mism = (x) => x.gc && x.uc && x.gc !== x.uc;
const mA = pairs.filter(([x]) => mism(x)).length, mB = pairs.filter(([, y]) => mism(y)).length;
const nA = tot.a['noindex 제외'] || 0, nB = tot.b['noindex 제외'] || 0;
const stillNoindex = pairs.filter(([x, y]) => cat(x) === 'noindex 제외' && cat(y) === 'noindex 제외');
const submitted = pairs.filter(([, y]) => /^Submitted and indexed/i.test(y.cov || '')).length;
const idxA = tot.a['색인됨'] || 0, idxB = tot.b['색인됨'] || 0;
console.log('## 핵심 지표\n');
console.log(`- canonical 불일치(Google 선택 != 사용자 지정): ${mA} -> ${mB} (${delta(mB - mA)})`);
console.log(`- noindex 제외: ${nA} -> ${nB} (${delta(nB - nA)}) ${nB < nA ? '(감소: 좋음)' : nB === nA ? '(변화 없음: 재크롤 대기)' : '(증가: 확인 필요)'}`);
console.log(`- 여전히 noindex 인 URL: ${stillNoindex.length}건${stillNoindex.length ? ' 예: ' + stillNoindex.slice(0, 3).map(([x]) => short(x.u)).join(', ') : ''}`);
console.log(`- "Submitted and indexed": ${submitted}건${submitted > 0 ? ' (성공 기준 충족)' : ''}`);
console.log(`- 색인됨 합계: ${idxA} -> ${idxB}\n`);

const trans = cnt(pairs.filter(([x, y]) => cat(x) !== cat(y)), ([x, y]) => `${cat(x)} -> ${cat(y)}`);
const top = Object.entries(trans).sort((p, q) => q[1] - p[1]).slice(0, 8);
console.log('## 무엇이 바뀌었나\n');
if (!top.length) console.log('- 상태가 바뀐 URL 없음 (구글이 아직 재방문하지 않았을 가능성).');
else top.forEach(([k, n]) => console.log(`- ${k}: ${n}건`));
const lines = [];
if (nB < nA) lines.push(`noindex 제외 ${nA} -> ${nB} 로 감소`);
if (newlyKnown.length) lines.push(`URL 모름에서 ${newlyKnown.length}건이 새로 인지됨`);
if (idxB > idxA) lines.push(`색인됨 +${idxB - idxA}`);
if (submitted) lines.push(`Submitted and indexed ${submitted}건 등장`);
console.log(`\n**요약**: ${lines.length ? lines.join('; ') + '.' : '뚜렷한 개선 신호 없음. 크롤 이동 수치로 구글 재방문 여부부터 확인.'}`);
