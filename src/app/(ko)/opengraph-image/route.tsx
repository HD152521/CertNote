import { renderHomeOgImage } from '@/lib/ogCards';

// /opengraph-image — 사이트 기본 OG 카드. 파일 규칙(opengraph-image.tsx)이 아니라 라우트 핸들러인 이유는
// src/lib/ogImages.ts 참고(라우트 그룹 안에서는 URL 에 해시 접미사가 붙는다). 예전처럼 빌드 때 정적 생성한다.
export const dynamic = 'force-static';

export function GET() {
  return renderHomeOgImage();
}
