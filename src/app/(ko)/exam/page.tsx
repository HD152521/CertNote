import { DEFAULT_CATEGORY } from '@/lib/category';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { listCerts } from '@/lib/content';
import { getDomainLabelsEn, getExamCertSlugs, getExamQuestionsByCert } from '@/lib/exam/examBank';
import { ExamRunner } from '@/components/exam/ExamRunner';
import type { Language } from '@/lib/i18n-client';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

// 로그인 뒤 앱 화면이라 언어는 쿠키(x-language)가 정한다. 영어면 탭 제목도 영어로.
export async function generateMetadata(): Promise<Metadata> {
  const lang = (await headers()).get('x-language');
  return { title: lang === 'en' ? 'Mock Exams' : '모의고사' };
}

interface ExamPageProps { searchParams: Promise<{ cert?: string | string[] }> }

export default async function ExamPage({ searchParams }: ExamPageProps) {
  const headersList = await headers();
  const { cert } = await searchParams;
  // 자격증 허브의 "모의고사 풀기"(/exam?cert=<slug>)가 그 자격증을 미리 골라 둔다. 문제 은행에 없는 값은 버린다.
  const requested = typeof cert === 'string' ? cert : '';
  const lang = (headersList.get('x-language') || 'ko') as Language;

  const user = await getCurrentUser();
  const examSlugs = new Set(getExamCertSlugs());
  const initialCert = examSlugs.has(requested) ? requested : '';
  if (!user) redirect(`/login?next=${encodeURIComponent(initialCert ? `/exam?cert=${initialCert}` : '/exam')}`);

  const certs = (await listCerts(DEFAULT_CATEGORY))
    .filter((c) => examSlugs.has(c.slug))
    .map((c) => ({ slug: c.slug, code: c.code, name: c.name, domains: [...new Set(getExamQuestionsByCert(c.slug).map((q) => q.domain))], domainLabelsEn: getDomainLabelsEn(c.slug) }));

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">{lang === 'en' ? 'Mock Exam' : 'Mock Exam'}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{lang === 'en' ? 'Mock Exams' : '모의고사'}</h1>
        <p className="text-sm text-fg-muted">
          {lang === 'en'
            ? `Take a practice exam like the real test. Submit and get scored instantly.`
            : '실제 시험처럼 풀고 제출 후 한 번에 채점받으세요.'}
        </p>
      </header>
      <ExamRunner certs={certs} initialCert={initialCert} />
    </div>
  );
}
