import * as Sentry from '@sentry/nextjs';

// 브라우저 에러 추적. DSN 미설정 시 완전 no-op, 프로덕션에서만 전송(PostHog와 동일 정책).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 에러 전용(성능 트레이싱·리플레이 없음): 클라 번들 무게와 무료 티어 쿼터 보호.
  tracesSampleRate: 0,
  // 확장프로그램·네트워크 일시 장애 등 조치 불가능한 브라우저 노이즈 차단.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    /^Failed to fetch$/,
    /^Load failed$/,
    /^NetworkError/,
    'AbortError',
  ],
});

// App Router 소프트 내비게이션을 Sentry 브레드크럼으로 기록(에러 재현 경로 파악용).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
