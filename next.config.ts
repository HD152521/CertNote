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
      // ── 레거시 /aws-certs → 섹션 URL 통합(Phase1) ────────────────────────────
      // 콘텐츠는 물리 이동 없이 content/aws-certs/ 에 공존하되, 공개 URL만 섹션 세그먼트로 바꾼다.
      // 규칙 순서(첫 매치 승리)가 두 가지를 동시에 만족해야 한다:
      //  1) linux 특수 규칙을 aws 일반 규칙보다 먼저 — 안 그러면 /aws-certs/linux-master-1/* 가
      //     존재하지 않는 /aws/linux-master-1/* 로 흡수돼 404 대량 발생(docs/IA-4section-execution.md R3).
      //  2) 각 접두사에서 '정확 일치' 규칙을 ':path*' 규칙보다 먼저 — ':path*'는 빈 매치도 허용해
      //     `/aws-certs`가 `/aws/:path*`(빈 path*)에 걸리면 목적지가 `/aws/`(끝 슬래시)가 되어
      //     `/aws-certs → /aws/ → /aws` 2홉 체인이 생긴다. 정확 규칙을 앞에 둬 허브를 단일 308홉으로.
      // permanent=true 는 308이며, 구글은 308을 301과 동등(메서드 보존+canonical 이전)하게 취급한다.
      {
        source: '/aws-certs/linux-master-1',
        destination: '/linux/linux-master-1',
        permanent: true,
      },
      {
        source: '/aws-certs/linux-master-1/:path*',
        destination: '/linux/linux-master-1/:path*',
        permanent: true,
      },
      {
        source: '/aws-certs',
        destination: '/aws',
        permanent: true,
      },
      {
        source: '/aws-certs/:path*',
        destination: '/aws/:path*',
        permanent: true,
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
