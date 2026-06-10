import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { NotebookList } from '@/components/review/NotebookList';

// 틀린 문제 모음(오답노트). 마스터 포함 전체를 보여준다. 로그인 필요.
export default async function NotebookPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/notebook');

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">오답노트</h1>
        <p className="text-sm text-fg-muted">
          연습 문제를 틀리면 자동으로 모입니다.{' '}
          <Link href="/review" className="text-accent underline underline-offset-4">복습 시작</Link>
        </p>
      </header>
      <NotebookList />
    </div>
  );
}
