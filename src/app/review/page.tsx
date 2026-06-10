import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { ReviewSession } from '@/components/review/ReviewSession';

// 오늘 복습할(due) 문제를 한 문제씩 풀이하는 세션 페이지. 로그인 필요.
export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/review');

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">복습</h1>
        <p className="text-sm text-fg-muted">
          틀린 문제를 간격 반복(Leitner)으로 다시 풉니다.{' '}
          <Link href="/notebook" className="text-accent underline underline-offset-4">오답노트</Link>
        </p>
      </header>
      <ReviewSession />
    </div>
  );
}
