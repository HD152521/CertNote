import type { Metadata } from 'next';
import CertIndexPage, { generateMetadata as certMetadata } from '@/app/(ko)/[category]/[slug]/page';
import { EN_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';

// /en/<slug> 영어 자격증 허브. 구현은 한국어 섹션과 같은 (ko)/[category]/[slug] 에 있고 여기서는
// category 를 'en' 으로 고정해 호출만 한다 — 영어 페이지가 (en) 루트 레이아웃(<html lang="en">) 아래에
// 있어야 해서 라우트만 이쪽에 둔 얇은 어댑터다.
interface PageProps { params: Promise<{ slug: string }>; }

const withEnCategory = async (params: PageProps['params']) => ({ category: EN_CATEGORY, slug: (await params).slug });

// 영어 자격증 목록 밖 slug 는 라우팅 단계에서 404 (근거는 (ko)/[category]/[slug]/page.tsx 의 dynamicParams 주석).
export async function generateStaticParams() {
  const certs = await listCerts(EN_CATEGORY).catch(() => []);
  return certs.map((c) => ({ slug: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return certMetadata({ params: withEnCategory(params) });
}

export default async function EnCertIndexPage({ params }: PageProps) {
  return CertIndexPage({ params: withEnCategory(params) });
}
