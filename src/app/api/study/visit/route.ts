import { getCurrentUser } from '@/lib/auth/currentUser';
import { recordActivity } from '@/lib/study/activity';

export const dynamic = 'force-dynamic';

// day 페이지 열람 비콘. 스트릭용 활동 기록만 남긴다(비로그인은 조용히 무시).
export async function POST() {
  const session = await getCurrentUser();
  if (session) await recordActivity(session.sub).catch(() => {});
  return Response.json({ ok: true });
}
