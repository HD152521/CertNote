import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';
import { isSection, langOfCategory, sectionLabel, sectionOfCategory } from '@/lib/category';
import { getCertMeta, listCerts } from '@/lib/content';
import { getAggregate, listReviews } from '@/lib/reviews/reviewsRepository';
import { reviewRobots, safeAggregate } from '@/lib/reviews/indexPolicy';
import { getCurrentUser } from '@/lib/auth/currentUser';
import ReviewList from '@/components/reviews/ReviewList';
import ReviewForm from '@/components/reviews/ReviewForm';
import { JsonLd } from '@/components/JsonLd';
import { buildBreadcrumbLd, buildCourseReviewLd } from '@/lib/structuredData';

interface PageProps { params: Promise<{ category: string; cert: string }>; }

export const dynamic = 'force-dynamic';

async function loadCert(category: string, cert: string) {
  if (!isSection(category)) return null;
  const certs = await listCerts(category);
  if (!certs.some((c) => c.slug === cert)) return null;
  return getCertMeta(category, cert).catch(() => null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, cert } = await params;
  const meta = await loadCert(category, cert);
  if (!meta) return {};
  const agg = await safeAggregate(category, cert);
  const name = sectionLabel(sectionOfCategory(category));
  const title = `${meta.code} 합격 후기 — ${name} ${meta.name} 리뷰`;
  const description =
    agg.count > 0
      ? `${meta.code} 자격증 합격 후기 ${agg.count}개(평균 ${agg.average}점). 실제 응시자의 공부법과 경험을 확인하세요.`
      : `${meta.code}(${meta.name}) 합격 후기를 남겨보세요. 첫 후기의 주인공이 되어보세요.`;
  const url = `/${category}/reviews/${cert}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // 후기가 충분히 쌓이기 전엔 thin content라 noindex(작성은 계속 가능).
    ...reviewRobots(agg.count),
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function CertReviewsPage({ params }: PageProps) {
  const { category, cert } = await params;
  const meta = await loadCert(category, cert);
  if (!meta) notFound();

  const lang = langOfCategory(category);
  const en = lang === 'en';
  const sectionName = sectionLabel(sectionOfCategory(category));
  const [reviews, agg, session] = await Promise.all([
    listReviews(category, cert),
    getAggregate(category, cert),
    getCurrentUser(),
  ]);

  const breadcrumbLd = buildBreadcrumbLd([
    { name: '홈', url: '/' },
    { name: `${sectionName} 자격증`, url: `/${category}` },
    { name: `${meta.code} 후기`, url: `/${category}/reviews/${cert}` },
  ]);
  // Review/AggregateRating 은 실제 후기가 1건 이상일 때만(스팸/수동조치 방지). 화면 렌더와 1:1.
  const reviewLd =
    agg.count > 0
      ? buildCourseReviewLd({
          section: category,
          slug: cert,
          code: meta.code,
          name: meta.name,
          count: agg.count,
          average: agg.average,
          reviews: reviews.map((r) => ({
            rating: r.rating,
            authorName: r.authorName,
            title: r.title,
            body: r.body,
            datePublished: r.createdAt,
          })),
        })
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <JsonLd data={breadcrumbLd} />
      {reviewLd && <JsonLd data={reviewLd} />}
      <header className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <Link href={`/${category}/reviews`} className="hover:text-fg">← {sectionName} {en ? 'reviews' : '후기'}</Link>
          <span className="text-fg-faint">/</span>
          <span>{meta.code}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {meta.code} {en ? 'reviews' : '합격 후기'}
        </h1>
        <p className="text-sm text-fg-muted">{meta.name}</p>
        {agg.count > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={n <= Math.round(agg.average) ? 'h-4 w-4 fill-accent text-accent' : 'h-4 w-4 text-border-strong'} />
              ))}
            </span>
            <span className="text-sm font-medium tabular-nums text-fg">{agg.average}</span>
            <span className="text-sm text-fg-faint">· {en ? `${agg.count} reviews` : `후기 ${agg.count}개`}</span>
          </div>
        )}
        <p>
          <Link href={`/${category}/${cert}`} className="text-sm text-accent hover:underline">
            {en ? `Study ${meta.code} →` : `${meta.code} 학습하러 가기 →`}
          </Link>
        </p>
      </header>

      {session ? (
        <ReviewForm section={category} certs={[{ slug: meta.slug, code: meta.code, name: meta.name }]} lang={lang} lockedCert={cert} />
      ) : (
        <p className="rounded-lg border border-border bg-bg-subtle px-4 py-4 text-sm text-fg-muted">
          {en ? (
            <>Passed {meta.code}? <Link href={`/login?next=/${category}/reviews/${cert}`} className="font-medium text-accent hover:underline">Log in</Link> to share your review.</>
          ) : (
            <>{meta.code}에 합격하셨나요? <Link href={`/login?next=/${category}/reviews/${cert}`} className="font-medium text-accent hover:underline">로그인</Link> 후 후기를 남겨보세요.</>
          )}
        </p>
      )}

      <ReviewList reviews={reviews} lang={lang} />
    </div>
  );
}
