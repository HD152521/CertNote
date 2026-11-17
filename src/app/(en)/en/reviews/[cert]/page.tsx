import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';
import { getCertMeta, listCerts } from '@/lib/content';
import { getAggregate, listReviews } from '@/lib/reviews/reviewsRepository';
import { getCurrentUser } from '@/lib/auth/currentUser';
import ReviewList from '@/components/reviews/ReviewList';
import ReviewForm from '@/components/reviews/ReviewForm';

interface PageProps {
  params: Promise<{ cert: string }>;
}

// 한국어 후기 본문이 섞이므로 항상 noindex(자세한 이유는 ../page.tsx).
const SECTION = 'aws';

export const dynamic = 'force-dynamic';

async function loadCert(cert: string) {
  const certs = await listCerts('en');
  if (!certs.some((c) => c.slug === cert)) return null;
  return getCertMeta('en', cert).catch(() => null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cert } = await params;
  const meta = await loadCert(cert);
  if (!meta) return {};
  return {
    title: `${meta.code} reviews`,
    description: `Pass reports and study tips for ${meta.code} (${meta.name}). Most reviews are written in Korean.`,
    alternates: { canonical: `/en/reviews/${cert}` },
    robots: { index: false, follow: true },
  };
}

export default async function EnCertReviewsPage({ params }: PageProps) {
  const { cert } = await params;
  const meta = await loadCert(cert);
  if (!meta) notFound();

  const [reviews, agg, session] = await Promise.all([
    listReviews(SECTION, cert),
    getAggregate(SECTION, cert),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <Link href="/en/reviews" className="hover:text-fg">← AWS reviews</Link>
          <span className="text-fg-faint">/</span>
          <span>{meta.code}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{meta.code} reviews</h1>
        <p className="text-sm text-fg-muted">{meta.name}</p>
        {agg.count > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={n <= Math.round(agg.average) ? 'h-4 w-4 fill-accent text-accent' : 'h-4 w-4 text-border-strong'} />
              ))}
            </span>
            <span className="text-sm font-medium tabular-nums text-fg">{agg.average}</span>
            <span className="text-sm text-fg-faint">· {agg.count} reviews</span>
          </div>
        )}
        <p>
          <Link href={`/en/${cert}`} className="text-sm text-accent hover:underline">{`Study ${meta.code} →`}</Link>
        </p>
      </header>

      {session ? (
        <ReviewForm section={SECTION} certs={[{ slug: meta.slug, code: meta.code, name: meta.name }]} lang="en" lockedCert={cert} />
      ) : (
        <p className="rounded-lg border border-border bg-bg-subtle px-4 py-4 text-sm text-fg-muted">
          Passed {meta.code}?{' '}
          <Link href={`/login?next=/en/reviews/${cert}`} className="font-medium text-accent hover:underline">Log in</Link> to share your review.
        </p>
      )}

      <ReviewList reviews={reviews} lang="en" />
    </div>
  );
}
