import type { Metadata } from 'next';
import { LabDetailView } from '@/components/lab/LabDetailView';
import { infoAlternates } from '@/lib/infoAlternates';
import { LAB_CATALOG, labById } from '@/lib/labCatalog';
import { labGroupsFor } from '@/lib/labCatalogLang';
import { withDefaultOgImage } from '@/lib/ogImages';

// 실습 한 개. 본문은 한국어·영어판이 같은 LabDetailView 를 쓴다.
export const dynamic = 'error';
export const dynamicParams = false;

export function generateStaticParams() {
  return LAB_CATALOG.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const lab = labById((await params).id);
  if (!lab) return {};
  const group = labGroupsFor('ko').find((g) => g.kind === lab.kind)!;
  const title = `${lab.title} — ${group.title} 실습`;
  const path = `/lab/${lab.id}`;
  return {
    title,
    description: lab.summary,
    alternates: infoAlternates(path),
    openGraph: withDefaultOgImage({ title, description: lab.summary, url: path, type: 'article' }),
  };
}

export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  return <LabDetailView id={(await params).id} lang="ko" />;
}
