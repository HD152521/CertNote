import type { Metadata } from 'next';
import { LabDetailView } from '@/components/lab/LabDetailView';
import { infoAlternates } from '@/lib/infoAlternates';
import { LAB_CATALOG_EN } from '@/lib/labCatalogEn';
import { labByIdFor, labGroupsFor } from '@/lib/labCatalogLang';
import { withDefaultOgImage } from '@/lib/ogImages';

export const dynamic = 'error';
export const dynamicParams = false;

export function generateStaticParams() {
  return LAB_CATALOG_EN.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const lab = labByIdFor((await params).id, 'en');
  if (!lab) return {};
  const group = labGroupsFor('en').find((g) => g.kind === lab.kind)!;
  const title = `${lab.title} - ${group.title} Lab`;
  const path = `/en/lab/${lab.id}`;
  return {
    title,
    description: lab.summary,
    alternates: infoAlternates(path),
    openGraph: withDefaultOgImage({ title, description: lab.summary, url: path, type: 'article' }),
  };
}

export default async function EnLabPage({ params }: { params: Promise<{ id: string }> }) {
  return <LabDetailView id={(await params).id} lang="en" />;
}
