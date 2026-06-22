import { DEFAULT_CATEGORY } from '@/lib/category';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { listCerts } from '@/lib/content';
import { getExamCertSlugs } from '@/lib/exam/examBank';
import { ExamRunner } from '@/components/exam/ExamRunner';

export const dynamic = 'force-dynamic';

// 모의고사 모드. 로그인 필요. 자격증 목록만 서버에서 넘기고 진행은 클라이언트가 한다.
export default async function ExamPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/exam');

  // 모의고사 문제가 준비된 자격증만 범위 선택지로 노출.
  const examSlugs = new Set(getExamCertSlugs());
  const certs = (await listCerts(DEFAULT_CATEGORY))
    .filter((c) => examSlugs.has(c.slug))
    .map((c) => ({ slug: c.slug, code: c.code, name: c.name }));

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Mock Exam</p>
        <h1 className="text-2xl font-semibold tracking-tight">모의고사</h1>
        <p className="text-sm text-fg-muted">실제 시험처럼 풀고 제출 후 한 번에 채점받으세요.</p>
      </header>
      <ExamRunner certs={certs} />
    </div>
  );
}
