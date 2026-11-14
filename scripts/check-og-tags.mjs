// 빌드된 서버(next start)의 HTML 에서 og/twitter 이미지 태그를 검사한다. 로컬 서버만 쓰며 외부 네트워크는 쓰지 않는다.
//   BASE=http://localhost:3191 node scripts/check-og-tags.mjs [DAY_SAMPLE=60]
// 사이트맵의 모든 비-day URL + 표본 day URL 을 가져와 태그 누락·해시 접미사 URL 을 표로 출력한다. 누락이 있으면 종료코드 1.
const BASE = process.env.BASE ?? 'http://localhost:3191';
const DAY_SAMPLE = Number(process.env.DAY_SAMPLE ?? 60);
const DAY_RE = /\/week\d+\/day\d+$/;
const LEGACY_IMAGE = /^https?:\/\/[^/]+\/(?:(?:aws|linux|data|en)\/[a-z0-9-]+\/)?opengraph-image$/;

const meta = (html, attr, key) => {
  const re = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`);
  return html.match(re)?.[1];
};

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const nonDay = paths.filter((p) => !DAY_RE.test(p));
const days = paths.filter((p) => DAY_RE.test(p));
const step = Math.max(1, Math.floor(days.length / DAY_SAMPLE));
const sampled = days.filter((_, i) => i % step === 0).slice(0, DAY_SAMPLE);
const targets = [...new Set(['/', '/login', '/signup', ...nonDay, ...sampled])];

const REQUIRED = [
  ['property', 'og:image'], ['property', 'og:image:width'], ['property', 'og:image:height'], ['property', 'og:image:type'], ['property', 'og:image:alt'],
  ['name', 'twitter:image'], ['name', 'twitter:card'],
];
const problems = [];
for (const p of targets) {
  const res = await fetch(BASE + p, { redirect: 'manual' });
  if (res.status !== 200) { problems.push([p, `status ${res.status}`]); continue; }
  const html = await res.text();
  const isDay = DAY_RE.test(p);
  const missing = REQUIRED.filter(([a, k]) => !(isDay && /:(width|height|type|alt)$/.test(k)) && !meta(html, a, k)).map(([, k]) => k);
  const og = meta(html, 'property', 'og:image');
  const tw = meta(html, 'name', 'twitter:image');
  if (og && !LEGACY_IMAGE.test(og)) missing.push(`og:image path ${og}`);
  if (tw && !LEGACY_IMAGE.test(tw)) missing.push(`twitter:image path ${tw}`);
  if (missing.length) problems.push([p, missing.join(', ')]);
}
console.log(`checked ${targets.length} URLs (${nonDay.length} non-day from sitemap + ${sampled.length} sampled day + extras)`);
if (problems.length) {
  console.log('URL | problem');
  for (const [p, m] of problems) console.log(`${p} | ${m}`);
  process.exit(1);
}
console.log('all pages have og:image(+width/height/type), twitter:image, twitter:card with legacy bare image paths');
