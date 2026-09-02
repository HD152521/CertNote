import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATEGORY } from './category';
import { certHref, getCertMeta } from './content';
import { getExamInfo, type ExamInfo } from './examInfo';

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
  // 이 순서를 쓰는 이유(역할마다 고유한 산문). 6개 역할 페이지가 서로 중복으로 접히지 않게
  // 하는 유일한 재료다 — 자격증 목록과 시험 사실은 역할끼리 겹치기 때문에 차별화가 안 된다.
  // 선택 필드: 없으면 문단을 생략한다(기존 데이터 하위호환).
  why?: string;
  steps: RoadmapStep[];
}

// cert 메타를 결합한 렌더용 단계.
//
// weeks/dayCount(커리큘럼 분량)와 exam(공식 시험 정보)을 함께 싣는다. 이 값들은 **자격증마다
// 달라지므로 역할 페이지마다 다른 사실**이 된다 — 6개 역할 페이지가 공통 설명만 나열해 서로
// 유사해지는 것(중복 색인)을 막는 유일한 재료다. 없는 값을 지어내지 않고 null 로 둔다.
export interface EnrichedStep {
  slug: string;
  code: string;
  name: string;
  level: string;
  href: string; // 공개 URL (/aws/<slug> 등)
  note: string;
  weeks: number;
  dayCount: number;
  exam: ExamInfo | null; // content/exam-info/<slug>.json 없으면 null(리눅스 등)
}

// 역할 단위 합계. 표시용이지 계산의 권위가 아니므로, **하나라도 모르면 합계를 내지 않는다**
// (모르는 값을 0으로 더하면 화면에 조용히 틀린 총액이 나간다).
export interface RoadmapTotals {
  certCount: number;
  weeks: number;
  days: number;
  costUsd: number | null;
}

export interface EnrichedRole {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  why?: string;
  steps: EnrichedStep[];
  totals: RoadmapTotals;
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
    (v.why === undefined || typeof v.why === 'string') &&
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
        weeks: meta.weeks,
        dayCount: meta.dayCount,
        exam: getExamInfo(meta.slug),
      });
    } catch {
      // 존재하지 않는 자격증 — 이 단계만 생략.
    }
  }
  return {
    slug: role.slug,
    title: role.title,
    tagline: role.tagline,
    description: role.description,
    ...(role.why ? { why: role.why } : {}),
    steps,
    totals: totalsOf(steps, role.steps.length),
  };
}

// 단계 합계.
//
// costUsd 는 **선언된 단계가 하나도 빠지지 않았고 전부 시험 정보를 가질 때만** 낸다.
// 두 번째 조건만으로는 부족하다 — enrichRole 이 getCertMeta 실패 시 그 단계를 조용히 버리므로,
// 살아남은 단계만 더하면 "자격증 2개 · 18주 · $450" 처럼 3단계 로드맵의 부분합이 확정된 총액처럼
// 보인다. declaredSteps 와 대조해 하나라도 유실됐으면 합계를 내지 않는다.
export function totalsOf(steps: EnrichedStep[], declaredSteps: number = steps.length): RoadmapTotals {
  const complete = steps.length > 0 && steps.length === declaredSteps;
  // exam-info 는 섹션 중립 스키마라 costUsd 가 optional 이다 — 다단계 시험(리눅스마스터 1차/2차)은
  // 단계마다 비용이 달라 phases[] 에 들어가고 최상위 costUsd 가 없다. 그런 자격증이 섞이면
  // 단일 합계 자체가 성립하지 않으므로 합계를 내지 않는다.
  const allPriced = complete && steps.every((s) => typeof s.exam?.costUsd === 'number');
  return {
    certCount: steps.length,
    weeks: steps.reduce((n, s) => n + s.weeks, 0),
    days: steps.reduce((n, s) => n + s.dayCount, 0),
    costUsd: allPriced ? steps.reduce((n, s) => n + (s.exam!.costUsd as number), 0) : null,
  };
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
