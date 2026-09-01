import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { certLevelLabel } from '@/lib/category';
import { getRoadmapRole, loadRoadmapRoles } from '@/lib/roadmap';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { JsonLd } from '@/components/JsonLd';
import { buildItemListLd, buildBreadcrumbLd } from '@/lib/structuredData';

interface PageProps { params: Promise<{ role: string }>; }

// 로드맵 역할 slug 는 정적 파일(content/roadmaps.json)에서 온다 — 코드 배포 없이 늘지 않으므로
// dynamicParams=false 로 잠가 목록 밖 요청은 즉시 진짜 404 (soft-404 방지, [category] 라우트와 동일).
export function generateStaticParams() {
  return loadRoadmapRoles().map((r) => ({ role: r.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { role: slug } = await params;
  const role = await getRoadmapRole(slug);
  if (!role) return {};
  const title = `${role.title} AWS 자격증 로드맵 — 준비 순서`;
  const url = `/roadmap/${role.slug}`;
  return {
    title,
    description: role.description,
    alternates: { canonical: url },
    openGraph: { title, description: role.description, url, type: 'website' },
  };
}

export default async function RoadmapRolePage({ params }: PageProps) {
  const { role: slug } = await params;
  const role = await getRoadmapRole(slug);
  if (!role) notFound();

  const itemListLd = buildItemListLd(
    `${role.title} 자격증 준비 순서`,
    role.steps.map((s) => ({ code: s.code, name: s.name, url: `${SITE_URL}${s.href}` })),
  );
  const breadcrumbLd = buildBreadcrumbLd([
    { name: '홈', url: '/' },
    { name: '자격증 로드맵', url: '/roadmap' },
    { name: role.title, url: `/roadmap/${role.slug}` },
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <JsonLd data={itemListLd} />
      <JsonLd data={breadcrumbLd} />
      <header className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <Link href="/roadmap" className="hover:text-fg">← 전체 로드맵</Link>
          <span className="text-fg-faint">/</span>
          <span>{role.title}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{role.title} 로드맵</h1>
        <p className="text-fg-muted leading-relaxed">{role.description}</p>
      </header>

      {role.why && (
        <p className="border-l-2 border-accent/40 pl-4 leading-relaxed text-fg-muted">{role.why}</p>
      )}

      {/* 역할별 합계 — 자격증 구성이 다르면 값이 전부 달라진다(6개 역할 페이지의 차별화 재료). */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <div className="bg-bg-elevated px-4 py-3">
          <dt className="text-xs text-fg-muted">자격증</dt>
          <dd className="mt-0.5 text-lg font-semibold">{role.totals.certCount}개</dd>
        </div>
        <div className="bg-bg-elevated px-4 py-3">
          <dt className="text-xs text-fg-muted">커리큘럼 분량</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {role.totals.weeks}주 <span className="text-sm font-normal text-fg-muted">· {role.totals.days}일</span>
          </dd>
        </div>
        {role.totals.costUsd !== null && (
          <div className="bg-bg-elevated px-4 py-3">
            <dt className="text-xs text-fg-muted">응시료 합계</dt>
            <dd className="mt-0.5 text-lg font-semibold">${role.totals.costUsd}</dd>
          </div>
        )}
      </dl>

      <ol className="space-y-3">
        {role.steps.map((step, i) => (
          <li key={step.slug} className="relative">
            <Link
              href={step.href}
              className="group flex items-start gap-4 rounded-xl border border-border bg-bg-elevated p-4 transition hover:border-border-strong sm:p-5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-sm font-semibold text-accent">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-fg-faint">{step.code}</span>
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-faint">
                    {certLevelLabel(step.level, 'aws')}
                  </span>
                </span>
                <span className="block text-sm font-medium leading-snug">{step.name}</span>
                <span className="flex items-start gap-1.5 text-sm text-fg-muted">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="min-w-0">{step.note}</span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs text-fg-muted transition group-hover:text-accent">
                  Week {FREE_WEEK} 무료로 시작 <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="text-xs text-fg-faint">
        각 자격증의 Week {FREE_WEEK}은 무료입니다. 목표 직무에 맞춰 순서대로 준비해 보세요.
        응시료·문항 수·합격 점수는 AWS 공식 시험 가이드 기준이며 결제 시점 환율과 세금은 별도입니다.
      </p>
      <p className="sr-only">{SITE_NAME}</p>
    </div>
  );
}
