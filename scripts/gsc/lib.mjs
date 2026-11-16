// 공통: 인자 파싱, URL 그룹 분류(기준선 11-15 와 동일), 시드 난수, 날짜.
export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) o[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[k] = argv[++i];
      else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

export const GROUPS = ['ko_day_w1', 'ko_day_w2+', 'ko_hub', 'ko_lab', 'ko_info', 'en_day_w1', 'en_day_w2+', 'en_hub', 'en_lab', 'en_info'];
const ORIGIN = 'https://cert.juganlab.com';
const EN_INFO_NAMES = /\/(about|roadmap|changelog|contact|terms|privacy|lab)$/;

export function groupOf(url) {
  const p = url.replace(ORIGIN, '').replace(/[?#].*$/, '') || '/';
  const en = p === '/en' || p.startsWith('/en/');
  const l = en ? 'en' : 'ko';
  const m = p.match(/\/week(\d+)\/day\d+$/);
  if (m) return l + (m[1] === '1' ? '_day_w1' : '_day_w2+');
  if (/\/lab(\/|$)/.test(p)) return l + '_lab';
  if (/\/(aws|linux|data)(\/|$)/.test(p) || p === '/en') return l + '_hub';
  // 기준선 agg.mjs 규칙: /en/<slug> 한 단계(정보 페이지 제외)는 en 자격증 허브
  if (en && /^\/en\/[a-z0-9-]+$/.test(p) && !EN_INFO_NAMES.test(p)) return 'en_hub';
  return l + '_info';
}

export function seededRandom(seed) {
  let s = Number(seed) >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const today = () => {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const defaultOut = () => (process.env.TEMP || process.env.TMPDIR || '/tmp') + '/gsc-analysis';
