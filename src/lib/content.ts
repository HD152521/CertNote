import { promises as fs } from 'node:fs';
import path from 'node:path';

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
