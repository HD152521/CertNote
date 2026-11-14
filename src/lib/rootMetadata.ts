import type { Metadata, Viewport } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/ogImages';
import { SITE_NAME, SITE_TAGLINE, SITE_TAGLINE_EN, SITE_URL } from '@/lib/site';
import { DAILY_STUDY_MINUTES } from '@/lib/studyTime';

// 루트 레이아웃 메타데이터. 루트가 언어별로 둘((ko)·(en) 라우트 그룹)이라 기본값도 둘이다.
// canonical/hreflang은 여기서 선언하지 않는다(docs/SEO-indexing-fix-plan.md Step 2).
// canonical을 지정하지 않은 모든 하위 라우트가 이 값을 그대로 상속해 /checkout 같은
// 무관한 페이지까지 홈을 자기 canonical로 선언하는 사고가 있었다. 홈의 canonical/hreflang은
// src/app/(ko)/page.tsx로 옮기고, 나머지 공개 라우트는 각자 자기참조 canonical을 명시한다.
const APPLE_WEB_APP = { capable: true, statusBarStyle: 'black-translucent', title: 'CertNote' } as const;

export const koRootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  // 네이버 서치어드바이저 권장 80자 이내(검색 스니펫 잘림 방지). og:description도 이 값을 자동 상속한다.
  description: `AWS 자격증 독학 커리큘럼. 하루 ${DAILY_STUDY_MINUTES}분 한국어 노트로 SAA·DVA·SOA 합격 준비. 전 과정 무료.`,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ko_KR',
    url: '/',
    // 자체 openGraph 를 정의하지 않는 페이지(홈·로그인 등)가 기본 카드를 물려받는다(예전 루트 파일 규칙 이미지 대체).
    // twitter:image 는 Next 가 openGraph.images 로 채운다.
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: { card: 'summary_large_image' },
  // 매니페스트(app/manifest.ts)는 Next가 자동 링크하지만, iOS 홈화면 설치 동작은 아래 메타가 담당.
  // 아이콘은 파일 규칙(app/icon.svg·apple-icon.png·favicon.ico, scripts/gen-icons.mjs 가 생성)으로 링크된다.
  appleWebApp: APPLE_WEB_APP,
};

// 영어 루트 — 자체 metadata 를 두지 않는 /en/* 페이지가 한글 기본 제목·설명을 물려받지 않게 한다.
export const enRootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE_EN}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: `Free study notes for AWS, SQLD and Linux Master certifications, in English. About ${DAILY_STUDY_MINUTES} minutes a day.`,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: '/en',
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: { card: 'summary_large_image' },
  appleWebApp: APPLE_WEB_APP,
};

export const rootViewport: Viewport = {
  themeColor: '#0a0a0a',
};
