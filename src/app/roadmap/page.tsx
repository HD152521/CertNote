import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Route } from 'lucide-react';
import { getRoadmapRoles } from '@/lib/roadmap';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { JsonLd } from '@/components/JsonLd';
import { buildItemListLd, buildBreadcrumbLd } from '@/lib/structuredData';

// "어떤 직무를 노리느냐에 따라 어떤 자격증을 어떤 순서로 딸까"를 안내하는 정보 허브.
// 검색 의도("aws 자격증 순서/추천/로드맵")에 정면으로 대응하는 색인 대상 페이지.
export const dynamic = 'error'; // 정적 생성 강제(동적 API 사용 시 빌드 실패로 회귀 감지).

export const metadata: Metadata = {
  title: 'AWS 자격증 로드맵 — 직무별 추천 순서',
  description:
    '솔루션스 아키텍트·개발자·DevOps·데이터·머신러닝·보안 등 목표 직무에 따라 AWS 자격증을 어떤 순서로 준비하면 되는지 정리한 로드맵. 각 단계의 이유와 Week 1 무료 학습으로 바로 연결됩니다.',
  alternates: { canonical: '/roadmap' },
  openGraph: {
    title: 'AWS 자격증 로드맵 — 직무별 추천 순서',
    description: '목표 직무별로 AWS 자격증을 어떤 순서로 딸지 안내하는 로드맵.',
    url: '/roadmap',
    type: 'website',
  },
};

export default async function RoadmapHubPage() {
  const roles = await getRoadmapRoles();

  const itemListLd = buildItemListLd(
    'AWS 자격증 직무별 로드맵',
    roles.map((r) => ({ code: r.title, name: r.tagline, url: `${SITE_URL}/roadmap/${r.slug}` })),
  );
  const breadcrumbLd = buildBreadcrumbLd([
    { name: '홈', url: '/' },
    { name: '자격증 로드맵', url: '/roadmap' },
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <JsonLd data={itemListLd} />
      <JsonLd data={breadcrumbLd} />
      <header className="space-y-4">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-fg-faint">
          <Route className="h-3.5 w-3.5 text-accent" /> Roadmap · {roles.length} roles
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          직무별 <span className="text-accent">AWS 자격증 로드맵</span>
        </h1>
        <p className="text-fg-muted leading-relaxed">
          자격증은 &quot;몇 개를 따느냐&quot;가 아니라 &quot;목표 직무에 맞는 순서로 따느냐&quot;가 중요합니다.
          노리는 직무를 고르면 기초 → 핵심 → 전문 순서와 각 단계의 이유를 정리해 드립니다.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <Link
            key={role.slug}
            href={`/roadmap/${role.slug}`}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-5 transition hover:border-border-strong"
          >
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{role.title}</h2>
              <p className="text-sm text-fg-muted">{role.tagline}</p>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-fg-faint">
              {role.steps.map((s, i) => (
                <span key={s.slug} className="flex items-center gap-1.5">
                  {i > 0 && <ArrowRight className="h-3 w-3 text-fg-faint/60" />}
                  <span className="rounded bg-bg-subtle px-1.5 py-0.5">{s.code}</span>
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      <p className="sr-only">{SITE_NAME}</p>
    </div>
  );
}
