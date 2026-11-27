import type { Metadata } from 'next';
import ExamInfoPage, { generateMetadata as examInfoMetadata } from '@/app/(ko)/[category]/[slug]/exam-info/page';
import { EN_CATEGORY } from '@/lib/category';
import { getExamInfo } from '@/lib/examInfo';
import { listCerts } from '@/lib/content';

// /en/<slug>/exam-info. 구현은 (ko)/[category]/[slug]/exam-info 에 있고 여기서는 category 를
// 'en' 으로 고정해 호출만 한다 — (en)/en/[slug]/page.tsx 와 같은 얇은 어댑터 패턴.
interface PageProps { params: Promise<{ slug: string }>; }

const withEnCategory = async (params: PageProps['params']) => ({ category: EN_CATEGORY, slug: (await params).slug });

export async function generateStaticParams() {
  const certs = await listCerts(EN_CATEGORY).catch(() => []);
  return certs.filter((c) => getExamInfo(c.slug)).map((c) => ({ slug: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return examInfoMetadata({ params: withEnCategory(params) });
}

export default async function EnExamInfoPage({ params }: PageProps) {
  return ExamInfoPage({ params: withEnCategory(params) });
}
