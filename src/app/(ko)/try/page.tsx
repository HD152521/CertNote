import type { Metadata } from 'next';
import Link from 'next/link';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { getExamCertSlugs, getExamQuestionsByCert } from '@/lib/exam/examBank';
import { GuestPreview } from '@/components/exam/GuestPreview';

// 가입 없이 풀어 보는 5문제. 앱 화면(/exam)과 달리 공개이고, 검색에는 올리지 않는다(허브 링크로만 들어온다).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '가입 없이 5문제 풀어보기',
  description: '로그인 없이 모의고사 5문제를 풀고 바로 해설을 확인해 보세요.',
  robots: { index: false, follow: true },
};

interface TryPageProps { searchParams: Promise<{ cert?: string | string[] }> }

export default async function TryPage({ searchParams }: TryPageProps) {
  const { cert } = await searchParams;
  const slug = typeof cert === 'string' ? cert : '';
  const examSlugs = new Set(getExamCertSlugs());
  const certs = (await listCerts(DEFAULT_CATEGORY)).filter((c) => examSlugs.has(c.slug));
  const picked = certs.find((c) => c.slug === slug);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Quick Try</p>
        <h1 className="text-2xl font-semibold tracking-tight">{picked ? `${picked.code} 5문제 맛보기` : '가입 없이 5문제 풀어보기'}</h1>
        <p className="text-sm text-fg-muted">로그인 없이 풀고, 문제마다 바로 정답과 해설을 볼 수 있어요. 기록은 저장되지 않아요.</p>
      </header>
      {picked ? (
        <GuestPreview certSlug={picked.slug} certCode={picked.code} totalCount={getExamQuestionsByCert(picked.slug).length} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {certs.map((c) => (
            <li key={c.slug}>
              <Link href={`/try?cert=${c.slug}`} prefetch={false}
                className="block rounded-md border border-border px-3 py-2.5 text-sm transition hover:border-border-strong">
                <span className="font-mono text-xs uppercase text-fg-muted">{c.code}</span>
                <span className="block text-fg">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
