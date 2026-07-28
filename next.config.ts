import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// 정식 도메인. Vercel 기본 도메인(cert-note.vercel.app)이 같은 앱을 200으로 서빙해
// 구글이 중복 색인 → 검색결과에 vercel 주소가 노출되는 문제. 여기서 301로 통합한다.
// (vercel 도메인을 '삭제'하면 구글 결과 클릭 시 죽은 페이지가 되므로, 삭제가 아니라 리다이렉트.)
const PRODUCTION_HOST = 'cert.juganlab.com';
const VERCEL_HOST = 'cert-note.vercel.app';

const nextConfig: NextConfig = {
  experimental: {
    // src/app/global-not-found.tsx 활성화(docs/SEO-indexing-fix-plan.md Step6).
    // 루트 레이아웃을 거치지 않는 전역 404라 홈 title/전역 JSON-LD가 섞여 나가는 소프트 404
    // 문제를 구조적으로 차단한다. app/not-found.tsx(세그먼트 notFound() 방어선)와 공존한다.
    globalNotFound: true,
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: VERCEL_HOST }],
        destination: `https://${PRODUCTION_HOST}/:path*`,
        permanent: true, // 301 — 구글에 canonical 이전 신호.
      },
    ];
  },
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
