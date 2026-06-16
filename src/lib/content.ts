import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FREE_WEEK } from './entitlement/policy';

const CONTENT_ROOT = path.join(process.cwd(), 'content');

export type CertLevel = 'associate' | 'professional';

export interface CertMeta {
  slug: string;
  code: string;
  level: CertLevel;
  name: string;
  weeks: number;
  accent: string;
  order: number;
  dayCount: number;
  sourceRepo: string;
  syncedAt: string;
}

export interface CategoryIndex {
  category: string;
  title: string;
  certs: Pick<CertMeta, 'slug' | 'code' | 'level' | 'name' | 'weeks' | 'order'>[];
}

export interface DayRef {
  category: string;
  slug: string;
  week: number;
  day: number;
  title: string;
  href: string;
}

export interface DayContent extends DayRef {
  body: string;
  prev: DayRef | null;
  next: DayRef | null;
  weekFirst: DayRef;
  certMeta: CertMeta;
}

export interface SearchEntry {
  category: string;
  certSlug: string;
  certCode: string;
  certName: string;
  certLevel: CertLevel;
  week: number;
  day: number;
  title: string;
  href: string;
}

// 본문까지 검색하기 위한 확장 엔트리. 페이로드가 크므로 모든 페이지에 인라인하지 않고
// /api/search 에서 온디맨드(정적 캐시)로만 내려준다.
export interface SearchBodyEntry extends SearchEntry {
  body: string;
}

async function readJson<T>(p: string): Promise<T> {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw) as T;
}

export async function getCategoryIndex(category: string): Promise<CategoryIndex> {
  const p = path.join(CONTENT_ROOT, category, 'index.json');
  return readJson<CategoryIndex>(p);
}

export async function getCertMeta(category: string, slug: string): Promise<CertMeta> {
  const p = path.join(CONTENT_ROOT, category, slug, 'meta.json');
  return readJson<CertMeta>(p);
}

export async function getCertReadme(category: string, slug: string): Promise<string> {
  const p = path.join(CONTENT_ROOT, category, slug, 'README.md');
  return fs.readFile(p, 'utf8');
}

function extractTitle(body: string, day: number): string {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return `Day ${day}`;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

const SEARCH_BODY_MAX = 1500;

// 검색용 본문 발췌: 헤딩(개념어)을 앞세우고 마크다운/코드를 제거한 본문 일부를 잇는다.
// 전문이 아니라 발췌인 이유 — 인덱스 페이로드를 제한하기 위함(헤딩+도입부에 핵심어가 몰림).
function extractSearchBody(raw: string): string {
  let s = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''); // frontmatter 제거
  const headings = (s.match(/^#{1,4}\s+.+$/gm) ?? []).map((h) => h.replace(/^#{1,4}\s+/, '').trim());
  s = s
    .replace(/```[\s\S]*?```/g, ' ') // 코드 펜스
    .replace(/`[^`]*`/g, ' ') // 인라인 코드
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트
    .replace(/^#{1,6}\s+/gm, '') // 헤딩 기호
    .replace(/[>*_~#|`-]+/g, ' ') // 마크다운 기호
    .replace(/\s+/g, ' ')
    .trim();
  const headingStr = headings.join(' · ');
  return `${headingStr} ${s.slice(0, SEARCH_BODY_MAX)}`.trim().slice(0, SEARCH_BODY_MAX + 400);
}

// 잠긴(유료) day의 미리보기. frontmatter 제거 후 앞부분 마크다운 일부만 반환한다.
// 정적 페이지에 이 발췌만 싣고 전체 본문은 절대 싣지 않는다(우회 방지).
const PREVIEW_MAX = 800;
export function previewOf(body: string, max: number = PREVIEW_MAX): string {
  const s = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart();
  if (s.length <= max) return s;
  // 단어/문단 경계에서 자연스럽게 자른다.
  const cut = s.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '));
  return (lastBreak > max * 0.5 ? cut.slice(0, lastBreak) : cut).trimEnd();
}

export async function getAllDays(category: string, slug: string): Promise<DayRef[]> {
  const meta = await getCertMeta(category, slug);
  const days: DayRef[] = [];
  for (let w = 1; w <= meta.weeks; w++) {
    for (let d = 1; d <= 5; d++) {
      const p = path.join(CONTENT_ROOT, category, slug, `week${w}`, `day${d}.md`);
      if (!(await fileExists(p))) continue;
      const body = await fs.readFile(p, 'utf8');
      days.push({ category, slug, week: w, day: d, title: extractTitle(body, d), href: `/${category}/${slug}/week${w}/day${d}` });
    }
  }
  return days;
}

export async function getDay(category: string, slug: string, week: number, day: number): Promise<DayContent | null> {
  const p = path.join(CONTENT_ROOT, category, slug, `week${week}`, `day${day}.md`);
  if (!(await fileExists(p))) return null;
  const body = await fs.readFile(p, 'utf8');
  const all = await getAllDays(category, slug);
  const idx = all.findIndex((r) => r.week === week && r.day === day);
  const cur = all[idx];
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;
  const weekFirst = all.find((r) => r.week === week && r.day === 1) ?? cur;
  const certMeta = await getCertMeta(category, slug);
  return { ...cur, body, prev, next, weekFirst, certMeta };
}

export async function listCerts(category: string): Promise<CertMeta[]> {
  const idx = await getCategoryIndex(category);
  const metas = await Promise.all(idx.certs.map((c) => getCertMeta(category, c.slug)));
  return metas.sort((a, b) => a.order - b.order);
}

export async function getAllDayParams(category: string) {
  const certs = await listCerts(category);
  const out: { slug: string; week: string; day: string }[] = [];
  for (const c of certs) {
    const days = await getAllDays(category, c.slug);
    for (const d of days) {
      out.push({ slug: c.slug, week: `week${d.week}`, day: `day${d.day}` });
    }
  }
  return out;
}

export async function buildSearchIndex(category: string): Promise<SearchEntry[]> {
  const certs = await listCerts(category);
  const out: SearchEntry[] = [];
  for (const c of certs) {
    const days = await getAllDays(category, c.slug);
    for (const d of days) {
      out.push({ category, certSlug: c.slug, certCode: c.code, certName: c.name, certLevel: c.level, week: d.week, day: d.day, title: d.title, href: d.href });
    }
  }
  return out;
}

// 본문 발췌까지 포함한 검색 인덱스. 무거우므로 /api/search 라우트에서만(정적 캐시) 사용.
export async function buildSearchBodyIndex(category: string): Promise<SearchBodyEntry[]> {
  const certs = await listCerts(category);
  const out: SearchBodyEntry[] = [];
  for (const c of certs) {
    const days = await getAllDays(category, c.slug);
    for (const d of days) {
      // 유료(Week2+) 본문은 정적 검색 인덱스에 싣지 않는다(이 라우트는 force-static이라
      // 사용자별 게이팅이 불가 → 누구나 받는다). 무료 Week1만 본문 검색, 나머지는 제목만.
      // 결제/Pro 본문 검색은 P1에서 인증된 동적 엔드포인트로 제공.
      const includeBody = d.week <= FREE_WEEK;
      const raw = includeBody
        ? await fs.readFile(path.join(CONTENT_ROOT, category, c.slug, `week${d.week}`, `day${d.day}.md`), 'utf8')
        : '';
      out.push({
        category, certSlug: c.slug, certCode: c.code, certName: c.name, certLevel: c.level,
        week: d.week, day: d.day, title: d.title, href: d.href,
        body: includeBody ? extractSearchBody(raw) : '',
      });
    }
  }
  return out;
}
