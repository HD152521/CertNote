import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';

// 관리자 1회 환경변수 백업용 임시 엔드포인트. Vercel Sensitive 값은 대시보드에서 다시 못 보므로,
// 이미 배포돼 돌고 있는 함수의 process.env 에서 꺼내 파일로 내려준다.
// ⚠️ 사용 즉시 이 파일을 지우고 재배포할 것 — 영구히 열어두는 용도가 아니다.
const ENV_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'APP_URL',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'CRON_SECRET',
  'ANTHROPIC_API_KEY',
  'TUTOR_MODEL',
  'TUTOR_DAILY_LIMIT',
  'TUTOR_GLOBAL_DAILY_LIMIT',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_ADSENSE_CLIENT',
  'NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP',
  'NEXT_PUBLIC_ADSENSE_SLOT_DAY_BOTTOM',
  'NEXT_PUBLIC_ADSENSE_SLOT_HUB',
] as const;

export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session || session.role !== 'admin') {
      throw new AppError(403, 'forbidden', '권한이 없습니다.');
    }

    const lines = ENV_KEYS.map((key) => `${key}=${process.env[key] ?? ''}`);
    const body = lines.join('\n') + '\n';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="certnote.env"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
