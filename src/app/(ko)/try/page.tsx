import type { Metadata } from 'next';
import { TryContent } from '@/components/exam/TryContent';
import { pick } from '@/lib/strings/dict';
import { tryStrings } from '@/lib/strings/try';

// 가입 없이 풀어 보는 5문제. 앱 화면(/exam)과 달리 공개이고, 검색에는 올리지 않는다(허브 링크로만 들어온다).
export const dynamic = 'force-dynamic';

const s = pick(tryStrings, 'ko');

export const metadata: Metadata = {
  title: s.metaTitle,
  description: s.metaDescription,
  robots: { index: false, follow: true },
};

interface TryPageProps { searchParams: Promise<{ cert?: string | string[] }> }

export default async function TryPage({ searchParams }: TryPageProps) {
  const { cert } = await searchParams;
  return <TryContent lang="ko" certParam={cert} />;
}
