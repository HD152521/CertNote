import { renderCertOgImage } from '@/lib/ogCards';

// /<category>/<slug>/opengraph-image — 자격증별 OG 카드(허브와 day 페이지가 같은 URL 을 쓴다).
// 파일 규칙이 아니라 라우트 핸들러인 이유는 src/lib/ogImages.ts 참고. 예전과 같이 요청 시 렌더한다.
export async function GET(_req: Request, { params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  return renderCertOgImage(category, slug);
}
