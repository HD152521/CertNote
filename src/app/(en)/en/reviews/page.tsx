import type { Metadata } from 'next';
import Link from 'next/link';
import { listCerts } from '@/lib/content';
import { getAggregate, listReviews } from '@/lib/reviews/reviewsRepository';
import { getCurrentUser } from '@/lib/auth/currentUser';
import ReviewList from '@/components/reviews/ReviewList';
import ReviewForm from '@/components/reviews/ReviewForm';
import { cn } from '@/lib/cn';

interface PageProps {
  searchParams: Promise<{ cert?: string }>;
}

// 후기는 한국어 사용자가 쓴 글이라 본문이 한국어다. 영어 화면에 섞인 언어 페이지가 색인되지 않도록
// 영어판 후기는 항상 noindex(follow 유지) — 색인 대상은 한국어 /aws/reviews 쪽이다.
// 후기 데이터는 한국어판과 같은 AWS 섹션을 그대로 읽는다.
const SECTION = 'aws';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'AWS certification reviews',
    description: 'Pass reports and study tips from people who earned AWS certifications. Most reviews are written in Korean.',
    alternates: { canonical: '/en/reviews' },
    robots: { index: false, follow: true },
  };
}

export default async function EnReviewsPage({ searchParams }: PageProps) {
  const { cert: certParam } = await searchParams;
  const certs = await listCerts('en');
  const certFilter = certParam && certs.some((c) => c.slug === certParam) ? certParam : null;
  const [reviews, agg, session] = await Promise.all([
    listReviews(SECTION, certFilter),
    getAggregate(SECTION, certFilter),
    getCurrentUser(),
  ]);
  const certOptions = certs.map((c) => ({ slug: c.slug, code: c.code, name: c.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <Link href="/en" className="hover:text-fg">← AWS</Link>
          <span className="text-fg-faint">/</span>
          <span>Reviews</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">AWS certification reviews</h1>
        <p className="text-fg-muted leading-relaxed">
          Real pass experiences and study tips from people who earned AWS certifications. Most reviewers write in Korean.
        </p>
      </header>

      {certs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/en/reviews"
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition',
              !certFilter ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted hover:border-border-strong',
            )}
          >
            All
          </Link>
          {certs.map((c) => (
            <Link
              key={c.slug}
              href={`/en/reviews?cert=${c.slug}`}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-xs uppercase transition',
                certFilter === c.slug ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted hover:border-border-strong',
              )}
            >
              {c.code}
            </Link>
          ))}
        </div>
      )}

      {session ? (
        <ReviewForm section={SECTION} certs={certOptions} lang="en" lockedCert={certFilter ?? undefined} />
      ) : (
        <p className="rounded-lg border border-border bg-bg-subtle px-4 py-4 text-sm text-fg-muted">
          Want to share your experience?{' '}
          <Link href="/login?next=/en/reviews" className="font-medium text-accent hover:underline">Log in</Link> to write a review.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-fg-muted">{`${agg.count} review${agg.count === 1 ? '' : 's'}`}</h2>
        <ReviewList reviews={reviews} lang="en" showCert={!certFilter} />
      </section>
    </div>
  );
}
