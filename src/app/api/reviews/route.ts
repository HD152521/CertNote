import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getVerificationStatus } from '@/lib/auth/emailVerification';
import { rateLimit } from '@/lib/rateLimit';
import { isSection } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { createReview, listReviews } from '@/lib/reviews/reviewsRepository';

// 사용자별 시간당 작성 상한(스팸/도배 방지). 로그인 사용자 기준이라 sub로 키한다.
const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

const BODY_MIN = 10;
const BODY_MAX = 2000;
const TITLE_MAX = 100;

export const dynamic = 'force-dynamic';

// GET /api/reviews?section=aws&cert=saa-c03 — 공개 후기 목록(숨김 제외). cert 생략 시 섹션 전체.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section') ?? '';
    if (!isSection(section)) throw new AppError(400, 'invalid_section', '알 수 없는 섹션입니다.');
    const cert = searchParams.get('cert');
    const reviews = await listReviews(section, cert && /^[a-z0-9-]+$/.test(cert) ? cert : null);
    return Response.json({ reviews });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/reviews — 후기 작성(로그인 + 이메일 인증 필요).
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');

    // 미인증 이메일은 작성 차단(스팸 계정 방지). OAuth/레거시는 verified 취급(?? true).
    const status = await getVerificationStatus(session.sub);
    if (status && !status.emailVerified) {
      throw new AppError(403, 'email_unverified', '이메일 인증 후 후기를 작성할 수 있습니다.');
    }

    const rl = rateLimit(`reviews:${session.sub}`, CREATE_LIMIT, CREATE_WINDOW_MS);
    if (!rl.ok) throw new AppError(429, 'rate_limited', '후기 작성이 잠시 제한되었습니다. 나중에 다시 시도해 주세요.');

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');

    const section = typeof body.section === 'string' ? body.section : '';
    if (!isSection(section)) throw new AppError(400, 'invalid_section', '알 수 없는 섹션입니다.');

    const certSlug = typeof body.certSlug === 'string' ? body.certSlug : '';
    if (!/^[a-z0-9-]+$/.test(certSlug)) throw new AppError(400, 'invalid_cert', '자격증을 선택해 주세요.');
    // 섹션 내에 실제로 존재하는 자격증인지 검증(listCerts(section)은 meta.section으로 필터됨).
    const certs = await listCerts(section);
    if (!certs.some((c) => c.slug === certSlug)) {
      throw new AppError(400, 'unknown_cert', '해당 섹션에 존재하지 않는 자격증입니다.');
    }

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError(400, 'invalid_rating', '별점은 1~5 사이여야 합니다.');
    }

    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (text.length < BODY_MIN || text.length > BODY_MAX) {
      throw new AppError(400, 'invalid_review_body', `후기 내용은 ${BODY_MIN}자 이상 ${BODY_MAX}자 이하로 작성해 주세요.`);
    }

    const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
    if (rawTitle.length > TITLE_MAX) throw new AppError(400, 'invalid_title', `제목은 ${TITLE_MAX}자 이하로 작성해 주세요.`);
    const title = rawTitle.length > 0 ? rawTitle : null;

    const passed = typeof body.passed === 'boolean' ? body.passed : null;

    await createReview({ userId: session.sub, section, certSlug, rating, passed, title, body: text });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
