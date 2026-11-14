// OG/Twitter 이미지 URL·메타 — 한 곳에서만 만든다.
//
// 이미지는 `opengraph-image.tsx` 파일 규칙이 아니라 같은 URL 의 라우트 핸들러(src/app/**/opengraph-image/route.tsx)다.
// 라우트 그룹((ko)·(en)) 안의 파일 규칙 이미지는 Next 가 경로에 해시 접미사(/opengraph-image-35zee7)를 붙여
// 이미 배포된 URL(/opengraph-image, /aws/saa-c03/opengraph-image)과 달라지고, 모든 day 페이지가 옛 URL 을 박아 둔다.
// 그래서 URL 을 고정하고 metadata 의 images 를 명시한다(해시 접미사 금지 — ogImages.test.ts 가 지킨다).

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_TYPE = 'image/png';
export const OG_DEFAULT_ALT = 'CertNote — AWS Certification Study Notes';
export const OG_CERT_ALT = 'CertNote certification study track';

export interface OgImageDescriptor {
  url: string;
  width: number;
  height: number;
  type: string;
  alt: string;
}

/** 사이트 기본 카드. 자체 openGraph 를 정의하지 않는 페이지(홈·로그인 등)가 루트 metadata 로 물려받는다. */
export const DEFAULT_OG_IMAGE: OgImageDescriptor = {
  url: '/opengraph-image',
  ...OG_IMAGE_SIZE,
  type: OG_IMAGE_TYPE,
  alt: OG_DEFAULT_ALT,
};

/** 자격증 허브 카드의 공개 경로. day 페이지의 og:image·JSON-LD 도 같은 경로를 쓴다. */
export function certOgImagePath(category: string, slug: string): string {
  return `/${category}/${slug}/opengraph-image`;
}

export function certOgImage(category: string, slug: string): OgImageDescriptor {
  return { url: certOgImagePath(category, slug), ...OG_IMAGE_SIZE, type: OG_IMAGE_TYPE, alt: OG_CERT_ALT };
}
