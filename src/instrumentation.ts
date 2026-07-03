import * as Sentry from '@sentry/nextjs';

// Next.js 서버 기동 시 1회 호출되어 런타임별 Sentry 설정을 로드한다.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// 서버 렌더/라우트 핸들러/서버 액션에서 잡힌 에러를 요청 컨텍스트와 함께 Sentry로 전송.
export const onRequestError = Sentry.captureRequestError;
