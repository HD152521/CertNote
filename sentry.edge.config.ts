import * as Sentry from '@sentry/nextjs';

// Edge 런타임(middleware.ts) 에러 추적. 설정은 서버와 동일 정책.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
