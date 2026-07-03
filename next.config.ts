import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry 빌드 래핑: 소스맵 업로드는 SENTRY_AUTH_TOKEN이 있을 때만(없어도 빌드·에러 수집은 정상,
// 스택트레이스가 난독화된 채로 보일 뿐). 런타임 no-op 여부는 sentry.*.config.ts의 enabled가 결정.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // 광고차단기가 Sentry 요청을 막는 걸 우회하는 프록시 라우트.
  tunnelRoute: "/monitoring",
  // 프로덕션 클라 번들에서 Sentry logger 구문 제거(번들 축소).
  disableLogger: true,
});
