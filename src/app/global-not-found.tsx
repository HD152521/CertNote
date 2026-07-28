// 실험적 전역 404(Next.js 16 globalNotFound, next.config.ts에서 활성화).
// docs/SEO-indexing-fix-plan.md Step6 — 라우트 자체가 존재하지 않는 요청(진짜 미매칭 URL,
// src/proxy.ts가 콘텐츠 미존재 요청을 rewrite하는 3세그먼트 마커 포함)에 대해 Next가
// 렌더링을 아예 건너뛰고 이 파일만 정적으로 내보낸다 — 루트 레이아웃(layout.tsx)을 거치지
// 않으므로 전역 Organization/WebSite JSON-LD와 홈 title이 섞여 나가는 문제가 구조적으로
// 발생하지 않는다(app/not-found.tsx는 레이아웃 하위에서 렌더돼 이 문제를 못 피한다).
// 레이아웃을 안 거치므로 html/body와 전역 스타일을 이 파일이 직접 책임진다.
import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';
import { DEFAULT_CATEGORY } from '@/lib/category';

export const metadata: Metadata = {
  // 루트 레이아웃을 거치지 않아 metadataBase를 상속받지 못한다 — 여기서 직접 지정.
  metadataBase: new URL(SITE_URL),
  title: `페이지를 찾을 수 없음 | ${SITE_NAME}`,
  description: `요청하신 페이지를 찾을 수 없습니다. ${SITE_NAME} — ${SITE_TAGLINE}`,
  // robots 필드를 여기서 다시 선언하지 않는다(Step7-A-2 회귀 수정). Next.js는 statusCode>400인
  // 모든 응답에 <meta name="robots" content="noindex"/>를 app-render.js의 NonIndex 컴포넌트로
  // "항상" 자동 주입한다(node_modules/next/dist/server/app-render/app-render.js의 NonIndex 참고 —
  // 우리 metadata.robots 설정과 무관하게 always-on). 여기서 robots: {index:false, follow:false}를
  // 또 선언하면 noindex 태그가 두 번(Next 자동 "noindex" + 우리 선언 "noindex, nofollow") 나가
  // 검증 도구가 중복 경고를 낸다(실측 확인). 404 페이지엔 내부 링크(홈/자격증 목록) 2개뿐이라
  // nofollow를 강제할 실익도 없다 — Next의 자동 noindex 하나로 충분하다.
};

export default function GlobalNotFound() {
  return (
    <html lang="ko">
      <body className="min-h-full bg-bg text-fg antialiased">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">404</p>
          <h1 className="text-xl font-semibold text-fg">페이지를 찾을 수 없습니다</h1>
          <p className="text-sm text-fg-muted">요청하신 페이지가 존재하지 않거나 이동되었어요.</p>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
            >
              홈으로
            </Link>
            <Link
              href={`/${DEFAULT_CATEGORY}`}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-border-strong"
            >
              AWS 자격증 목록
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
