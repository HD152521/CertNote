import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FREE_WEEK } from './entitlement/policy';
import { getManifestMtime } from './contentManifest';

// 주당 day 상한. 대부분 5일이지만 출제기준 보충 등으로 6일 이상이 될 수 있어 여유를 둔다.
// 존재하지 않는 day 는 fileExists 검사에서 건너뛰므로 상한을 올려도 부작용이 없다.
const MAX_DAYS_PER_WEEK = 10;
const CONTENT_ROOT = path.join(process.cwd(), 'content');

// 콘텐츠는 빌드 후 불변이라 프로덕션에선 프로세스 단위로 메모이즈한다(디스크 재독 제거).
// day 페이지(getDay→getAllDays)·대시보드·알림 크론이 모두 이 핫패스를 공유하므로 효과가 크다.
// 개발 중엔 캐시하지 않아 콘텐츠 편집이 즉시 반영된다.
const CONTENT_CACHE = process.env.NODE_ENV === 'production';
const indexCache = new Map<string, CategoryIndex>();
const metaCache = new Map<string, CertMeta>();
const daysCache = new Map<string, DayRef[]>();

// 섹션별 티어 라벨(자유 문자열). 알려진 값: AWS foundational/associate/professional/specialty,
// Linux grade-1/grade-2 등. 섹션 확장을 위해 유니온 대신 string으로 넓힌다(라벨/정렬은 levels.ts).
export type CertLevel = string;
// 레벨 표시 라벨은 fs 비의존 모듈에 둔다 — 클라이언트 컴포넌트(SidebarNav)도 안전하게 import.
export { certLevelLabel } from './category';
import type { Section } from './category';
// 공개 URL category(섹션 'aws'/'linux' 또는 'en'/레거시 'aws-certs')를 물리 디렉터리로 매핑.
// 파일 읽기는 모두 이 함수를 통과하고, href/캐시키는 URL category를 그대로 유지한다.
import { contentDirOf, isSection } from './category';

export interface CertMeta {
  slug: string;
  code: string;
  level: CertLevel;
  section?: Section; // Phase0 추가(옵셔널·하위호환). Phase1에서 라우팅/그룹핑에 사용.
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
  const cached = CONTENT_CACHE ? indexCache.get(category) : undefined;
  if (cached) return cached;
  const p = path.join(CONTENT_ROOT, contentDirOf(category), 'index.json');
  const idx = await readJson<CategoryIndex>(p);
  if (CONTENT_CACHE) indexCache.set(category, idx);
  return idx;
}

export async function getCertMeta(category: string, slug: string): Promise<CertMeta> {
  const key = `${category}/${slug}`;
  const cached = CONTENT_CACHE ? metaCache.get(key) : undefined;
  if (cached) return cached;
  const p = path.join(CONTENT_ROOT, contentDirOf(category), slug, 'meta.json');
  const meta = await readJson<CertMeta>(p);
  if (CONTENT_CACHE) metaCache.set(key, meta);
  return meta;
}

export async function getCertReadme(category: string, slug: string): Promise<string> {
  const p = path.join(CONTENT_ROOT, contentDirOf(category), slug, 'README.md');
  return fs.readFile(p, 'utf8');
}

// 자격증 메타 → 공개 URL(섹션 세그먼트). 홈·목록 등 "전체 자격증을 한 번에 나열"하는 화면이
// 자격증마다 올바른 섹션(/aws vs /linux)으로 링크하도록 하는 단일 출처. section 미기록(레거시)은 aws.
export function certHref(meta: Pick<CertMeta, 'slug' | 'section'>): string {
  return `/${meta.section ?? 'aws'}/${meta.slug}`;
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

// day 마크다운 파일의 마지막 변경 시각(sitemap lastModified · day 페이지 Article dateModified용).
// 원래 fs.stat(파일 mtime)을 썼으나, git이 파일 mtime을 보존하지 않아 Vercel 체크아웃 시 전부
// "빌드 시각"으로 뭉개지는 사고가 났다(docs/SEO-indexing-fix-plan.md Step6 후속, 실측 확인).
// 이제 git 커밋 시각 기반 매니페스트(src/lib/contentManifest.ts)를 조회한다 — 빌드 환경의
// mtime과 무관하게 결정적이다. 매니페스트에 없으면 undefined(조용히 생략, 날짜 추측 금지).
export async function getDayMtime(category: string, slug: string, week: number, day: number): Promise<Date | undefined> {
  return getManifestMtime(`content/${contentDirOf(category)}/${slug}/week${week}/day${day}.md`);
}

// 자격증 허브(meta.json) 마지막 변경 시각(sitemap lastModified용, Step6). getDayMtime과 동일한
// 이유로 매니페스트를 조회한다.
export async function getCertMetaMtime(category: string, slug: string): Promise<Date | undefined> {
  return getManifestMtime(`content/${contentDirOf(category)}/${slug}/meta.json`);
}

export async function getAllDays(category: string, slug: string): Promise<DayRef[]> {
  const key = `${category}/${slug}`;
  const cached = CONTENT_CACHE ? daysCache.get(key) : undefined;
  if (cached) return cached;
  const meta = await getCertMeta(category, slug);
  const dir = contentDirOf(category);
  const days: DayRef[] = [];
  for (let w = 1; w <= meta.weeks; w++) {
    for (let d = 1; d <= MAX_DAYS_PER_WEEK; d++) {
      const p = path.join(CONTENT_ROOT, dir, slug, `week${w}`, `day${d}.md`);
      if (!(await fileExists(p))) continue;
      const body = await fs.readFile(p, 'utf8');
      // href는 공개 URL category(섹션 세그먼트)를 유지 — 파일 읽기(dir)와 분리한다.
      days.push({ category, slug, week: w, day: d, title: extractTitle(body, d), href: `/${category}/${slug}/week${w}/day${d}` });
    }
  }
  if (CONTENT_CACHE) daysCache.set(key, days);
  return days;
}

export async function getDay(category: string, slug: string, week: number, day: number): Promise<DayContent | null> {
  const p = path.join(CONTENT_ROOT, contentDirOf(category), slug, `week${week}`, `day${day}.md`);
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
  // category가 섹션이면(공개 URL /aws·/linux) 그 섹션 자격증만 노출한다 — aws·linux가 같은
  // content/aws-certs/ 폴더에 공존하므로 meta.section으로 가른다. 레거시 category('aws-certs'·'en')는
  // 필터하지 않아(전체 반환) 대시보드·네비 등 13개 소비처의 기존 동작(linux 포함)이 그대로 유지된다.
  const filtered = isSection(category) ? metas.filter((m) => m.section === category) : metas;
  return filtered.sort((a, b) => a.order - b.order);
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
        ? await fs.readFile(path.join(CONTENT_ROOT, contentDirOf(category), c.slug, `week${d.week}`, `day${d.day}.md`), 'utf8')
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
