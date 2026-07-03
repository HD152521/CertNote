import * as Sentry from '@sentry/nextjs';

// Node.js 런타임(서버 컴포넌트·라우트 핸들러·서버 액션) 에러 추적.
// DSN 미설정 시 완전 no-op(PostHog와 동일한 opt-in 패턴). 프로덕션에서만 전송.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 에러 전용으로 운영(무료 티어 쿼터 보호). 성능 트레이싱은 필요해지면 올린다.
  tracesSampleRate: 0,
});
