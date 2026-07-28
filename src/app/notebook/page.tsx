import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { NotebookList } from '@/components/review/NotebookList';
import { normalizeLanguage } from '@/lib/i18n';
import { pick } from '@/lib/strings/dict';
import { reviewStrings } from '@/lib/strings/review';

export const dynamic = 'force-dynamic';

export default async function NotebookPage() {
  // x-language는 proxy.ts가 lang 쿠키를 보고 요청 헤더에 실어준다.
  const headersList = await headers();
  const s = pick(reviewStrings, normalizeLanguage(headersList.get('x-language')));

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/notebook');

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{s.notebookLink}</h1>
        <p className="text-sm text-fg-muted">
          {s.notebookSubtitle}{' '}
          <Link href="/review" className="text-accent underline underline-offset-4">
            {s.startReviewLink}
          </Link>
        </p>
      </header>
      <NotebookList />
    </div>
  );
}
