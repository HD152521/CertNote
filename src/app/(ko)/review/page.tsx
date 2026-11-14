import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { ReviewSession } from '@/components/review/ReviewSession';
import { normalizeLanguage } from '@/lib/i18n';
import { pick } from '@/lib/strings/dict';
import { reviewStrings } from '@/lib/strings/review';

// 오늘 복습할(due) 문제를 한 문제씩 풀이하는 세션 페이지. 로그인 필요.
export default async function ReviewPage() {
  // x-language는 proxy.ts가 lang 쿠키를 보고 요청 헤더에 실어준다.
  const headersList = await headers();
  const s = pick(reviewStrings, normalizeLanguage(headersList.get('x-language')));

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/review');

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{s.reviewTitle}</h1>
        <p className="text-sm text-fg-muted">
          {s.reviewSubtitle}{' '}
          <Link href="/notebook" className="text-accent underline underline-offset-4">{s.notebookLink}</Link>
        </p>
      </header>
      <ReviewSession />
    </div>
  );
}
