import reviewLogData from '../../../content/review-log.json';

// 노트 검수 기록(docs/P4-trust-quality-plan.md Step 5a). day 페이지 메타 줄의 "마지막 검수 YYYY-MM"
// 근거다. 기록이 없는 노트에는 날짜를 표시하지 않는다 — 날짜를 추측하거나 파일 수정 시각으로
// 대신하지 않는다(검수하지 않은 노트에 검수일이 붙으면 그 자체가 틀린 주장이 된다).
//
// 데이터: content/review-log.json — 배열. 항목 하나가 범위 하나를 덮는다.
//   { cert, reviewedAt }              → 그 자격증의 모든 노트
//   { cert, week, reviewedAt }        → 그 주차의 모든 노트
//   { cert, week, day, reviewedAt }   → 노트 한 편
// 기록은 한국어 원문 노트의 검수다. 영어판(content/en)은 번역본이라 같은 기록을 쓰지 않는다.
//
// JSON 을 정적 import 하므로 번들에 들어간다 — fs·요청별 API 를 쓰지 않아 day 라우트의
// 정적 캐시 계약(src/lib/day/cacheContract.test.ts)과 무관하다.

export interface ReviewLogEntry {
  cert: string; // 자격증 slug (content/aws-certs/<slug>)
  week?: number;
  day?: number;
  reviewedAt: string; // YYYY-MM-DD
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isReviewLogEntry(v: unknown): v is ReviewLogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  if (typeof e.cert !== 'string' || e.cert === '') return false;
  if (typeof e.reviewedAt !== 'string' || !DATE_RE.test(e.reviewedAt)) return false;
  if (Number.isNaN(Date.parse(e.reviewedAt))) return false;
  if (e.week !== undefined && !isPositiveInt(e.week)) return false;
  if (e.day !== undefined && !isPositiveInt(e.day)) return false;
  // day 만 있고 week 가 없으면 어느 노트인지 정할 수 없다.
  if (e.day !== undefined && e.week === undefined) return false;
  return true;
}

// 형식이 틀린 항목은 버린다(틀린 기록으로 날짜를 내보내느니 표시하지 않는다).
export function parseReviewLog(raw: unknown): ReviewLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isReviewLogEntry);
}

function covers(entry: ReviewLogEntry, cert: string, week: number, day: number): boolean {
  if (entry.cert !== cert) return false;
  if (entry.week !== undefined && entry.week !== week) return false;
  if (entry.day !== undefined && entry.day !== day) return false;
  return true;
}

// 이 노트를 덮는 기록 중 가장 최근 검수 월(YYYY-MM). 없으면 null.
export function lastReviewedMonth(entries: readonly ReviewLogEntry[], cert: string, week: number, day: number): string | null {
  const dates = entries.filter((e) => covers(e, cert, week, day)).map((e) => e.reviewedAt);
  if (dates.length === 0) return null;
  const latest = dates.reduce((a, b) => (a > b ? a : b)); // YYYY-MM-DD 는 문자열 비교로 정렬된다.
  return latest.slice(0, 7);
}

const REVIEW_LOG: readonly ReviewLogEntry[] = parseReviewLog(reviewLogData as unknown);

// 노트(한국어 원문)의 마지막 검수 월. 영어판은 항상 null.
export function getLastReviewedMonth(lang: 'ko' | 'en', cert: string, week: number, day: number): string | null {
  if (lang !== 'ko') return null;
  return lastReviewedMonth(REVIEW_LOG, cert, week, day);
}
