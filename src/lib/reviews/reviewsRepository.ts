import { query } from '../db';
import { AppError } from '../auth/errors';
import type { AdminReview, CreateReviewInput, Review, ReviewAggregate } from './types';

// 후기 데이터 접근. reviews 테이블은 수동 마이그레이션(npm run db:migrate) 대상이라,
// 배포가 마이그레이션을 앞질러도 프로덕션이 500으로 죽지 않게 '테이블 부재'를 graceful 처리한다:
//  - 읽기(list/aggregate): 빈 결과로 폴백(후기 영역만 조용히 비활성).
//  - 쓰기(create): 503(준비 중)으로 명확히 응답(사용자에게 재시도 안내).
// Postgres undefined_table 에러코드는 '42P01'.
function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

interface ReviewRow {
  id: string | number;
  section: string;
  cert_slug: string;
  rating: number;
  passed: boolean | null;
  title: string | null;
  body: string;
  author_name: string | null;
  created_at: string;
  hidden?: boolean;
}

// 표시 이름 마스킹: 첫 글자만 남기고 이후는 '*'. 이름이 없으면 '익명'.
export function maskName(name: string | null): string {
  if (!name) return '익명';
  const chars = [...name.trim()];
  if (chars.length === 0) return '익명';
  if (chars.length === 1) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(Math.min(chars.length - 1, 3))}`;
}

function mapRow(row: ReviewRow): Review {
  return {
    id: String(row.id),
    section: row.section,
    certSlug: row.cert_slug,
    rating: row.rating,
    passed: row.passed,
    title: row.title,
    body: row.body,
    authorName: maskName(row.author_name),
    createdAt: row.created_at,
  };
}

const SELECT_COLS = `r.id, r.section, r.cert_slug, r.rating, r.passed, r.title, r.body,
  u.name AS author_name,
  to_char(r.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS created_at`;

const DEFAULT_LIMIT = 100;

// 공개 후기 목록(숨김 제외). certSlug 미지정이면 섹션 전체.
export async function listReviews(section: string, certSlug: string | null, limit = DEFAULT_LIMIT): Promise<Review[]> {
  try {
    const where = certSlug
      ? 'r.section = $1 AND r.cert_slug = $2 AND r.hidden = false'
      : 'r.section = $1 AND r.hidden = false';
    const params = certSlug ? [section, certSlug, limit] : [section, limit];
    const rows = await query<ReviewRow>(
      `SELECT ${SELECT_COLS}
       FROM reviews r LEFT JOIN users u ON u.id = r.user_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${certSlug ? 3 : 2}`,
      params,
    );
    return rows.map(mapRow);
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

// 노출 후기 집계(AggregateRating·요약). 테이블/데이터 없으면 count 0.
export async function getAggregate(section: string, certSlug: string | null): Promise<ReviewAggregate> {
  try {
    const where = certSlug
      ? 'section = $1 AND cert_slug = $2 AND hidden = false'
      : 'section = $1 AND hidden = false';
    const params = certSlug ? [section, certSlug] : [section];
    const rows = await query<{ cnt: string; avg: string | null }>(
      `SELECT COUNT(*)::text AS cnt, AVG(rating)::text AS avg FROM reviews WHERE ${where}`,
      params,
    );
    const cnt = Number(rows[0]?.cnt ?? 0);
    const avgRaw = rows[0]?.avg;
    const average = avgRaw ? Math.round(Number(avgRaw) * 10) / 10 : 0;
    return { count: cnt, average };
  } catch (err) {
    if (isMissingTable(err)) return { count: 0, average: 0 };
    throw err;
  }
}

// 후기 작성. 테이블 부재 시 503(준비 중)로 명확히 알린다(조용한 실패 금지).
export async function createReview(input: CreateReviewInput): Promise<void> {
  try {
    await query(
      `INSERT INTO reviews (user_id, section, cert_slug, rating, passed, title, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.userId, input.section, input.certSlug, input.rating, input.passed, input.title, input.body],
    );
  } catch (err) {
    if (isMissingTable(err)) {
      throw new AppError(503, 'reviews_unavailable', '후기 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.');
    }
    throw err;
  }
}

// ── 관리자 ────────────────────────────────────────────────────────────────
// 관리자 목록(숨김 포함). 최신순.
export async function listAllReviews(limit = 200): Promise<AdminReview[]> {
  try {
    const rows = await query<ReviewRow>(
      `SELECT ${SELECT_COLS}, r.hidden
       FROM reviews r LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({ ...mapRow(row), hidden: Boolean(row.hidden) }));
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

// 후기 숨김/노출 토글(관리자).
export async function setReviewHidden(id: string, hidden: boolean): Promise<void> {
  try {
    await query('UPDATE reviews SET hidden = $2 WHERE id = $1', [id, hidden]);
  } catch (err) {
    if (isMissingTable(err)) {
      throw new AppError(503, 'reviews_unavailable', '후기 기능을 준비 중입니다.');
    }
    throw err;
  }
}
