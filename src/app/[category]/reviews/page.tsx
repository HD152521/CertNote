import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isSection, langOfCategory, sectionLabel, sectionOfCategory } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { listReviews } from '@/lib/reviews/reviewsRepository';
import { reviewRobots, safeAggregate } from '@/lib/reviews/indexPolicy';
import { getCurrentUser } from '@/lib/auth/currentUser';
import ReviewList from '@/components/reviews/ReviewList';
import ReviewForm from '@/components/reviews/ReviewForm';
import { cn } from '@/lib/cn';

interface PageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ cert?: string }>;
}

// 쿠키(로그인)·DB를 읽으므로 동적 렌더.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isSection(category)) return {};
  const name = sectionLabel(sectionOfCategory(category));
  const title = `${name} 자격증 합격 후기 — 실제 응시자 리뷰`;
  const description = `${name} 자격증을 취득한 사람들의 합격 후기와 공부법. 별점·합격 여부와 함께 실제 경험을 확인하세요.`;
  // 섹션 전체 후기 수가 기준 미만이면 허브도 thin content라 noindex(자격증별 페이지와 동일 기준).
  // COUNT 한 번이며, safeAggregate 는 DB 미설정·장애에서도 던지지 않고 0 을 돌려준다
  // (metadata 가 죽으면 페이지 전체가 죽으므로 이 경로는 반드시 무해해야 한다).
  const agg = await safeAggregate(category, null);
  // ?cert= 는 UX 필터라 canonical은 항상 base(/{section}/reviews)로 통합(중복 색인 방지).
  return {
    title,
    description,
    alternates: { canonical: `/${category}/reviews` },
    ...reviewRobots(agg.count),
    openGraph: { title, description, url: `/${category}/reviews`, type: 'website' },
  };
}

export default async function SectionReviewsPage({ params, searchParams }: PageProps) {
  const { category } = await params;
  if (!isSection(category)) notFound();
  const { cert: certParam } = await searchParams;
  const lang = langOfCategory(category);
  const section = sectionOfCategory(category);
  const sectionName = sectionLabel(section);

  const certs = await listCerts(category);
  const certFilter = certParam && certs.some((c) => c.slug === certParam) ? certParam : null;
  const [reviews, session] = await Promise.all([listReviews(category, certFilter), getCurrentUser()]);

  const en = lang === 'en';
  const certOptions = certs.map((c) => ({ slug: c.slug, code: c.code, name: c.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <Link href={`/${category}`} className="hover:text-fg">← {sectionName}</Link>
          <span className="text-fg-faint">/</span>
          <span>{en ? 'Reviews' : '합격 후기'}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {sectionName} {en ? 'certification reviews' : '자격증 합격 후기'}
        </h1>
        <p className="text-fg-muted leading-relaxed">
          {en
            ? `Real pass experiences and study tips from people who earned ${sectionName} certifications.`
            : `${sectionName} 자격증을 취득한 사람들의 실제 합격 후기와 공부법입니다.`}
        </p>
      </header>

      {/* 자격증 필터(경로 아닌 쿼리 — UX용, canonical은 base로 통합) */}
      {certs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/${category}/reviews`}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition',
              !certFilter ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted hover:border-border-strong',
            )}
          >
            {en ? 'All' : '전체'}
          </Link>
          {certs.map((c) => (
            <Link
              key={c.slug}
              href={`/${category}/reviews?cert=${c.slug}`}
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
        <ReviewForm section={category} certs={certOptions} lang={lang} lockedCert={certFilter ?? undefined} />
      ) : (
        <p className="rounded-lg border border-border bg-bg-subtle px-4 py-4 text-sm text-fg-muted">
          {en ? (
            <>Want to share your experience? <Link href={`/login?next=/${category}/reviews`} className="font-medium text-accent hover:underline">Log in</Link> to write a review.</>
          ) : (
            <>후기를 남기고 싶으신가요? <Link href={`/login?next=/${category}/reviews`} className="font-medium text-accent hover:underline">로그인</Link> 후 작성할 수 있어요.</>
          )}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-fg-muted">
          {en ? `${reviews.length} review${reviews.length === 1 ? '' : 's'}` : `후기 ${reviews.length}개`}
        </h2>
        <ReviewList reviews={reviews} lang={lang} showCert={!certFilter} />
      </section>
    </div>
  );
}
