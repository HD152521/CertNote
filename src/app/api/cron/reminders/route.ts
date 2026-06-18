import { runReminders } from '@/lib/push/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // web-push는 Node 런타임 필요(Edge 불가).

// 알림 발송 크론. 매시 정각 호출되어, 그 시각(KST)에 설정된 사용자에게만 발송.
// 인증: Authorization: Bearer <CRON_SECRET> (Vercel Cron이 자동 첨부) 또는 x-cron-secret 헤더.
// 테스트: ?hour=8 로 특정 시각을 강제할 수 있다(시크릿 필요).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'cron_not_configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  const authorized = auth === `Bearer ${secret}` || headerSecret === secret;
  if (!authorized) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  // KST = UTC+9. 기본은 현재 시각, ?hour=로 override(테스트용).
  const url = new URL(req.url);
  const override = url.searchParams.get('hour');
  const kstHour =
    override !== null && Number.isFinite(Number(override))
      ? ((Number(override) % 24) + 24) % 24
      : (new Date().getUTCHours() + 9) % 24;

  try {
    const result = await runReminders(kstHour);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/reminders] 실패:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
