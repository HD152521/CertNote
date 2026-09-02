import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ExamDomain {
  name: string;
  // 배점 비중(%). 공표하지 않는 시험이 있다(리눅스마스터는 과목명만 고시하고 문항 배분은
  // 공개하지 않는다) — 그런 경우 생략하고, 카드는 막대 대신 목록으로 렌더한다.
  // 비중을 지어내면 그 순간 페이지가 거짓이 되므로 optional 이어야 한다.
  weight?: number;
}

// 응시료. AWS는 USD, 국내 자격은 KRW라 통화를 값과 함께 들고 다닌다.
export interface ExamCost {
  amount: number;
  currency: 'USD' | 'KRW';
}

// 다단계 시험(1차 필기 / 2차 실기)의 한 단계.
// AWS처럼 단일 응시로 끝나는 시험은 phases 없이 최상위 단일 값(questionCount 등)을 쓴다.
export interface ExamPhase {
  name: string; // '1차(필기)'
  // 문항 수는 정수로 환원되지 않는 경우가 있다(리눅스마스터 1급 2차 = '필기 10문항 + 실기 5~7문항').
  // 표기 그대로 보존하려고 문자열로 둔다.
  questionCount: string;
  durationMin: number;
  format: string;
  cost?: ExamCost;
  eligibility?: string; // 해당 단계의 응시 자격(예: '1차 합격자에 한해 2년 이내')
}

// 시험 정보 페이지 FAQ(FAQPage JSON-LD의 소스). 화면 렌더 텍스트와 1:1이어야 한다.
export interface ExamFaq {
  q: string;
  a: string;
}

export interface ExamInfo {
  examCode: string;
  fullName: string;
  level: string; // 섹션별 티어(자유 문자열). 알려진 값: foundational/associate/professional/specialty, grade-1 등

  // ── 단일 응시 시험(AWS)의 수치 ────────────────────────────────────────────
  // phases 를 쓰는 다단계 시험에서는 단계마다 값이 달라 최상위에 둘 수 없다 → optional.
  // 둘 중 정확히 한 형태만 채워야 하며, isExamInfo() 가 이를 강제한다.
  questionCount?: number;
  durationMin?: number;
  costUsd?: number;

  // ── 다단계 시험(리눅스마스터 1차/2차)의 단계별 수치 ──────────────────────
  phases?: ExamPhase[];

  // ── 합격 기준 ────────────────────────────────────────────────────────────
  // AWS는 스케일 점수(720/1000)로 고시하지만, 국내 자격은 '60점 이상, 과목당 40% 미만 과락'처럼
  // 점수쌍으로 환원되지 않는 규칙을 쓴다. passingCriteria 가 있으면 그걸 그대로 노출한다.
  passingScore?: number;
  scoreMax?: number;
  passingCriteria?: string;

  // 갱신·만료 개념이 없는 자격이 있다(공식 고시에 없으면 생략 — 없는 규정을 지어내지 않는다).
  validityYears?: number;
  languages: string[];
  prerequisites: string;
  format?: string; // 단일 응시 시험에서만. 다단계는 phases[].format 이 정본이다.

  domains: ExamDomain[];
  officialUrl: string;
  registerUrl: string;
  faq?: ExamFaq[]; // Phase2에서 오써링(FAQPage 스키마). 없으면 FAQ 미표기.
  difficulty?: string; // 난이도 한줄(예: '중급 · 실무 1~2년 권장')
  source?: string; // 정확성 대조용 공식 가이드 URL
  syncedAt?: string; // 최신성 관리(YYYY-MM-DD)
}

// AWS 자격증 공통 시험 혜택·꿀팁(전 자격증 동일이라 공유 상수). 출처: AWS 공식 인증 혜택/FAQ 페이지.
export const AWS_EXAM_TIPS: string[] = [
  '합격하면 다음 시험 50% 할인 바우처가 생깁니다. AWS Certification 계정의 "Benefits"에서 확인하고 재인증·다른 자격증 응시에 쓸 수 있어요(만료일이 있으니 그 전에 사용).',
  '인증은 3년간 유효하며 만료 전 재인증이 필요합니다. 재인증 때도 이 50% 바우처를 쓸 수 있어요.',
  '무료 재응시는 없습니다(매 응시 전액 결제). 첫 시도에 붙는 게 가장 저렴하니, 모의고사로 합격선을 넘긴 뒤 응시하세요.',
  '합격하면 Credly 디지털 배지가 발급돼 링크드인·이메일 서명에 붙일 수 있습니다.',
];

// 섹션별 시험 꿀팁. AWS는 공통 혜택 팁, 그 외 섹션은 콘텐츠 투입 시 추가(현재 빈 배열).
export function getExamTips(section?: string): string[] {
  return section === undefined || section === 'aws' ? AWS_EXAM_TIPS : [];
}

// 응시료 표기. 천단위 구분은 직접 넣는다 — toLocaleString 은 실행 환경의 ICU 데이터에 따라
// 결과가 달라질 수 있어, 빌드타임 정적 생성 결과가 흔들리지 않도록 결정적 구현을 쓴다.
export function formatCost(cost: ExamCost): string {
  const grouped = String(Math.trunc(cost.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return cost.currency === 'KRW' ? `${grouped}원` : `$${grouped}`;
}

const EXAM_INFO_ROOT = path.join(process.cwd(), 'content', 'exam-info');

// 시험 정보는 빌드 후 불변이라 프로세스 단위로 메모이즈한다(디스크 재독 제거).
// content.ts 의 CONTENT_CACHE 패턴과 동일하게 프로덕션에서만 캐시한다.
const EXAM_INFO_CACHE = process.env.NODE_ENV === 'production';
const cache = new Map<string, ExamInfo | null>();

function isPhase(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.name === 'string' &&
    typeof p.questionCount === 'string' &&
    typeof p.durationMin === 'number' &&
    typeof p.format === 'string'
  );
}

// 시험 수치는 두 형태 중 '정확히 하나'여야 한다.
//  - 단일 응시(AWS): questionCount·durationMin·costUsd·format 을 최상위에 둔다.
//  - 다단계(리눅스마스터 1차/2차): phases[] 에 단계별로 둔다.
// 둘 다 채우면 어느 쪽이 정본인지 알 수 없어 표시가 갈린다 → 둘 다 있으면 거부한다.
function hasExactlyOneShape(v: Record<string, unknown>): boolean {
  const single =
    typeof v.questionCount === 'number' &&
    typeof v.durationMin === 'number' &&
    typeof v.costUsd === 'number' &&
    typeof v.format === 'string';
  const multi = Array.isArray(v.phases) && v.phases.length > 0 && v.phases.every(isPhase);
  return single !== multi;
}

// 합격 기준도 마찬가지다. 점수쌍(720/1000)이거나 서술 규칙이거나, 하나여야 한다.
function hasExactlyOnePassingRule(v: Record<string, unknown>): boolean {
  const score = typeof v.passingScore === 'number' && typeof v.scoreMax === 'number';
  const criteria = typeof v.passingCriteria === 'string' && v.passingCriteria.trim().length > 0;
  return score !== criteria;
}

function isExamInfo(value: unknown): value is ExamInfo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.examCode === 'string' &&
    typeof v.fullName === 'string' &&
    typeof v.level === 'string' &&
    hasExactlyOneShape(v) &&
    hasExactlyOnePassingRule(v) &&
    // validityYears 는 갱신 개념이 없는 자격이 있어 optional — 있으면 숫자여야 한다.
    (v.validityYears === undefined || typeof v.validityYears === 'number') &&
    Array.isArray(v.languages) &&
    typeof v.prerequisites === 'string' &&
    Array.isArray(v.domains) &&
    typeof v.officialUrl === 'string' &&
    typeof v.registerUrl === 'string'
  );
}

// 서버 전용. slug 에 해당하는 시험 정보를 읽어 반환한다.
// 파일이 없거나 JSON 이 깨졌거나 스키마가 맞지 않으면 null (호출 측에서 graceful 처리).
export function getExamInfo(slug: string): ExamInfo | null {
  // slug 는 라우트 세그먼트라 경로 조작을 막기 위해 화이트리스트 패턴으로 검증한다.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (EXAM_INFO_CACHE && cache.has(slug)) return cache.get(slug) ?? null;

  let parsed: ExamInfo | null = null;
  try {
    const raw = readFileSync(path.join(EXAM_INFO_ROOT, `${slug}.json`), 'utf8');
    const json: unknown = JSON.parse(raw);
    parsed = isExamInfo(json) ? json : null;
  } catch {
    parsed = null;
  }

  if (EXAM_INFO_CACHE) cache.set(slug, parsed);
  return parsed;
}
