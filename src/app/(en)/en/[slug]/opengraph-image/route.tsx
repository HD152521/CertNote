import { EN_CATEGORY } from '@/lib/category';
import { renderCertOgImage } from '@/lib/ogCards';

// /en/<slug>/opengraph-image — 영어 자격증 허브·day 페이지의 OG 카드. (ko) 쪽과 같은 렌더러를 category='en' 으로 호출한다.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderCertOgImage(EN_CATEGORY, slug);
}
