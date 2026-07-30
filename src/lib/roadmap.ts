import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATEGORY } from './category';
import { certHref, getCertMeta } from './content';

// 직무별 자격증 로드맵. "어떤 직무를 노리느냐에 따라 자격증을 어떤 순서로 딸까"를 안내하는
// 정보 페이지(사용자 요구: 정보페이지 하나 + 직무별 순서)의 단일 데이터 소스.
// 데이터는 정적 파일(content/roadmaps.json), 렌더 시 cert 메타(코드·이름·URL)로 enrich한다.

export interface RoadmapStep {
  cert: string; // 자격증 slug (content/aws-certs/<slug>)
  note: string; // 이 단계를 밟는 이유(한 줄)
}

export interface RoadmapRole {
  slug: string; // URL 세그먼트 (/roadmap/<slug>)
  title: string;
  tagline: string;
  description: string;
  steps: RoadmapStep[];
}

// cert 메타를 결합한 렌더용 단계.
export interface EnrichedStep {
  slug: string;
  code: string;
  name: string;
  level: string;
  href: string; // 공개 URL (/aws/<slug> 등)
  note: string;
}

export interface EnrichedRole {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  steps: EnrichedStep[];
}

const ROADMAP_FILE = path.join(process.cwd(), 'content', 'roadmaps.json');

// examInfo/content 와 동일하게 프로덕션에서만 프로세스 단위 메모이즈(정적 파일이라 불변).
const ROADMAP_CACHE = process.env.NODE_ENV === 'production';
let rolesCache: RoadmapRole[] | null = null;

function isRoadmapRole(value: unknown): value is RoadmapRole {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === 'string' &&
    /^[a-z0-9-]+$/.test(v.slug) &&
    typeof v.title === 'string' &&
    typeof v.tagline === 'string' &&
    typeof v.description === 'string' &&
    Array.isArray(v.steps) &&
    v.steps.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>).cert === 'string' &&
        typeof (s as Record<string, unknown>).note === 'string',
    )
  );
}

// 정적 파일에서 역할 목록을 읽어 검증한다. 파일 부재·JSON 손상·스키마 불일치는 빈 배열로
// graceful 처리한다(로드맵 미노출 — 페이지·사이트맵·네비가 알아서 빈 상태를 처리).
export function loadRoadmapRoles(): RoadmapRole[] {
  if (ROADMAP_CACHE && rolesCache) return rolesCache;
  let roles: RoadmapRole[] = [];
  try {
    const raw = readFileSync(ROADMAP_FILE, 'utf8');
    const json: unknown = JSON.parse(raw);
    const list = (json as { roles?: unknown }).roles;
    if (Array.isArray(list)) roles = list.filter(isRoadmapRole);
  } catch {
    roles = [];
  }
  if (ROADMAP_CACHE) rolesCache = roles;
  return roles;
}

// 단계를 cert 메타로 enrich한다. 존재하지 않는 자격증 slug 는 조용히 건너뛴다(콘텐츠가
// 아직 없는 섹션/자격증을 로드맵이 참조해도 페이지가 깨지지 않도록).
async function enrichRole(role: RoadmapRole): Promise<EnrichedRole> {
  const steps: EnrichedStep[] = [];
  for (const step of role.steps) {
    try {
      const meta = await getCertMeta(DEFAULT_CATEGORY, step.cert);
      steps.push({
        slug: meta.slug,
        code: meta.code,
        name: meta.name,
        level: meta.level,
        href: certHref(meta),
        note: step.note,
      });
    } catch {
      // 존재하지 않는 자격증 — 이 단계만 생략.
    }
  }
  return { slug: role.slug, title: role.title, tagline: role.tagline, description: role.description, steps };
}

// 모든 직무 로드맵(enrich 완료). 단계가 하나도 남지 않은 역할은 제외한다.
export async function getRoadmapRoles(): Promise<EnrichedRole[]> {
  const roles = loadRoadmapRoles();
  const enriched = await Promise.all(roles.map(enrichRole));
  return enriched.filter((r) => r.steps.length > 0);
}

// 단일 직무 로드맵. slug 가 없거나 유효 단계가 없으면 null.
export async function getRoadmapRole(slug: string): Promise<EnrichedRole | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const role = loadRoadmapRoles().find((r) => r.slug === slug);
  if (!role) return null;
  const enriched = await enrichRole(role);
  return enriched.steps.length > 0 ? enriched : null;
}
