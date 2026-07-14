import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { NotebookList } from '@/components/review/NotebookList';
import type { Language } from '@/lib/i18n-client';

export const dynamic = 'force-dynamic';

export default async function NotebookPage() {
  const headersList = await headers();
  const lang = (headersList.get('x-language') || 'ko') as Language;

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/notebook');

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{lang === 'en' ? 'Incorrect Answers' : '오답노트'}</h1>
        <p className="text-sm text-fg-muted">
          {lang === 'en' ? `Mistakes from practice problems are collected here. ` : '연습 문제를 틀리면 자동으로 모입니다. '}
          <Link href="/review" className="text-accent underline underline-offset-4">
            {lang === 'en' ? 'Start Review' : '복습 시작'}
          </Link>
        </p>
      </header>
      <NotebookList />
    </div>
  );
}
