import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ExamDomain {
  name: string;
  weight: number;
}

export interface ExamInfo {
  examCode: string;
  fullName: string;
  level: 'foundational' | 'associate' | 'professional' | 'specialty';
  questionCount: number;
  durationMin: number;
  passingScore: number;
  scoreMax: number;
  costUsd: number;
  validityYears: number;
  languages: string[];
  prerequisites: string;
  format: string;
  domains: ExamDomain[];
  officialUrl: string;
  registerUrl: string;
}

const EXAM_INFO_ROOT = path.join(process.cwd(), 'content', 'exam-info');

// 시험 정보는 빌드 후 불변이라 프로세스 단위로 메모이즈한다(디스크 재독 제거).
// content.ts 의 CONTENT_CACHE 패턴과 동일하게 프로덕션에서만 캐시한다.
const EXAM_INFO_CACHE = process.env.NODE_ENV === 'production';
const cache = new Map<string, ExamInfo | null>();

function isExamInfo(value: unknown): value is ExamInfo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.examCode === 'string' &&
    typeof v.fullName === 'string' &&
    typeof v.level === 'string' &&
    typeof v.questionCount === 'number' &&
    typeof v.durationMin === 'number' &&
    typeof v.passingScore === 'number' &&
    typeof v.scoreMax === 'number' &&
    typeof v.costUsd === 'number' &&
    typeof v.validityYears === 'number' &&
    Array.isArray(v.languages) &&
    typeof v.prerequisites === 'string' &&
    typeof v.format === 'string' &&
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
