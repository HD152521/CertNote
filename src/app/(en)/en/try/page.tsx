import type { Metadata } from 'next';
import { TryContent } from '@/components/exam/TryContent';
import { pick } from '@/lib/strings/dict';
import { tryStrings } from '@/lib/strings/try';

// 영어판 맛보기. 한국어 /try 와 같은 정책: noindex, 사이트맵·hreflang 없음(canonical 은 자기 자신).
export const dynamic = 'force-dynamic';

const s = pick(tryStrings, 'en');

export const metadata: Metadata = {
  title: s.metaTitle,
  description: s.metaDescription,
  alternates: { canonical: '/en/try' },
  robots: { index: false, follow: true },
};

interface TryPageProps { searchParams: Promise<{ cert?: string | string[] }> }

export default async function EnTryPage({ searchParams }: TryPageProps) {
  const { cert } = await searchParams;
  return <TryContent lang="en" certParam={cert} />;
}
