import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getDay } from '@/lib/content';

// 잠긴(유료) day의 전체 본문을 권한 확인 후에만 내려준다.
// 정적 페이지에는 미리보기 발췌만 싣고, Pro 사용자는 이 엔드포인트로 본문을 받아 렌더한다.
// 권한 없으면 403 — 본문은 응답에 절대 포함되지 않는다(우회 방지).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') ?? 'aws-certs';
    const slug = searchParams.get('slug');
    const week = Number(searchParams.get('week'));
    const day = Number(searchParams.get('day'));
    if (!slug || !Number.isFinite(week) || !Number.isFinite(day)) {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const session = await getCurrentUser();
    await getEntitlementService().assertWeekAccess(session?.sub ?? null, week);
    const content = await getDay(category, slug, week, day);
    if (!content) {
      throw new AppError(404, 'not_found', '존재하지 않는 콘텐츠입니다.');
    }
    return Response.json({ title: content.title, body: content.body });
  } catch (err) {
    return errorResponse(err);
  }
}
