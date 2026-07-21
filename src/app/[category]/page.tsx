import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { DEFAULT_CATEGORY, EN_CATEGORY, certLevelLabel, isSupportedCategory, langOfCategory } from '@/lib/category';
import { listCerts } from '@/lib/content';
import type { CertLevel, CertMeta } from '@/lib/content';
import { SITE_NAME, SITE_URL } from '@/lib/site';

interface PageProps { params: Promise<{ category: string }>; }

// 자격증 허브를 레벨별로 묶는 표시 순서 = 추천 학습 순서.
const LEVEL_ORDER: CertLevel[] = ['foundational', 'associate', 'professional', 'specialty'];

// 정적 생성 대상은 ko 카테고리(aws-certs)뿐. en 은 정적 라우트(app/en/page.tsx)가 우선 매칭한다.
export async function generateStaticParams() {
  return [{ category: DEFAULT_CATEGORY }];
}

// "aws 자격증 순서 / 종류" 검색의 착지 페이지. 전 자격증을 레벨별로 나열한 카테고리 허브.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isSupportedCategory(category)) return {};
  const lang = langOfCategory(category);
  const certs = await listCerts(category).catch(() => []);
  const title =
    lang === 'en'
      ? 'AWS Certifications — Types & Recommended Order (Week 1 Free)'
      : 'AWS 자격증 종류와 추천 순서 — 11종 한국어 학습 로드맵';
  const description =
    lang === 'en'
      ? `All ${certs.length} AWS certification tracks by level: Cloud Practitioner → Associate → Professional → Specialty. Week 1 free.`
      : `AWS 자격증 ${certs.length}종을 레벨별로 정리. Cloud Practitioner(기초) → 어소시에이트(SAA·DVA·SOA) → 프로페셔널(SAP·DOP) → 전문분야 순서로 준비하세요. Week 1 무료.`;
  const url = `/${category}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { ko: `/${DEFAULT_CATEGORY}`, en: `/${EN_CATEGORY}` },
    },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function CategoryHubPage({ params }: PageProps) {
  const { category } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const certs = await listCerts(category).catch(() => []);
  if (certs.length === 0) notFound();

  // 레벨별 그룹(추천 순서). 각 그룹 내부는 order 순.
  const groups = LEVEL_ORDER.map((level) => ({
    level,
    items: certs.filter((c) => c.level === level).sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0);

  // 추천 순서를 그대로 담은 ItemList — "자격증 순서" 검색 의도에 맞춘 구조화 데이터.
  const ordered: CertMeta[] = groups.flatMap((g) => g.items);
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: lang === 'en' ? 'AWS certifications by recommended order' : 'AWS 자격증 추천 순서',
    itemListElement: ordered.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${c.code} ${c.name}`,
      url: `${SITE_URL}/${category}/${c.slug}`,
    })),
  };

  const levelHint: Record<CertLevel, string> = lang === 'en'
    ? {
        foundational: 'Start here — cloud basics, no prerequisites.',
        associate: 'Core job-ready certs. SAA-C03 is the most in-demand.',
        professional: 'Advanced, 2+ years experience recommended.',
        specialty: 'Deep-dive into a specific domain.',
      }
    : {
        foundational: '여기서 시작 — 사전지식 없이 클라우드 기초.',
        associate: '취업 핵심 자격증. SAA-C03가 수요 1위.',
        professional: '심화 단계 — 실무 2년+ 권장.',
        specialty: '특정 분야를 깊게 파는 전문 자격증.',
      };

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">
          {lang === 'en' ? 'AWS Certifications' : 'AWS 자격증'} · {certs.length} tracks
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {lang === 'en' ? (
            <>AWS certification <span className="text-accent">types & order</span></>
          ) : (
            <>AWS 자격증 <span className="text-accent">종류와 추천 순서</span></>
          )}
        </h1>
        <p className="text-fg-muted leading-relaxed">
          {lang === 'en'
            ? 'AWS certifications progress by level: Cloud Practitioner (foundational) → Associate (SAA, DVA, SOA) → Professional (SAP, DOP) → Specialty. Pick your target and start with a free Week 1.'
            : 'AWS 자격증은 기초(Cloud Practitioner) → 어소시에이트(SAA·DVA·SOA) → 프로페셔널(SAP·DOP) → 전문분야 순서로 준비하는 것이 일반적입니다. 목표를 고르고 무료 Week 1부터 시작하세요.'}
        </p>
      </header>

      {groups.map(({ level, items }) => (
        <section key={level} className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{certLevelLabel(level)}</h2>
            <p className="text-sm text-fg-muted">{levelHint[level]}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((c) => (
              <Link
                key={c.slug}
                href={`/${category}/${c.slug}`}
                className="group flex flex-col gap-1 rounded-lg border border-border bg-bg-elevated px-4 py-3 transition hover:border-border-strong"
              >
                <span className="font-mono text-[11px] text-fg-faint">{c.code}</span>
                <span className="text-sm font-medium leading-snug">{c.name}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-fg-muted transition group-hover:text-accent">
                  {lang === 'en' ? `${c.weeks} weeks · ${c.dayCount} days` : `${c.weeks}주 · 총 ${c.dayCount}일`}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-fg-faint">
        {lang === 'en' ? (
          <>Week 1 of every track is free. <Link href="/pricing" className="underline underline-offset-4 hover:text-fg">See pricing</Link> for the full course.</>
        ) : (
          <>모든 트랙 Week 1은 무료입니다. 전체 과정은 <Link href="/pricing" className="underline underline-offset-4 hover:text-fg">요금제</Link>에서 확인하세요.</>
        )}
      </p>
      <p className="sr-only">{SITE_NAME}</p>
    </div>
  );
}
