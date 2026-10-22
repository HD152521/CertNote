import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { certLevelLabel } from '@/lib/category';
import { buildRoleFaq, getRoadmapRole, loadRoadmapRoles } from '@/lib/roadmap';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { JsonLd } from '@/components/JsonLd';
import { buildItemListLd, buildBreadcrumbLd, buildFaqPageLd } from '@/lib/structuredData';

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
  const title = role.seoTitle ?? `${role.title} AWS 자격증 로드맵 — 준비 순서`;
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
  // 단일 응시 시험(문항 수·시간이 있는 AWS 시험)만 표로 싣는다. 다단계 시험은 자격증 허브가 보여 준다.
  const examSteps = role.steps.flatMap((s) =>
    s.exam?.questionCount != null && s.exam.durationMin != null ? [{ ...s, exam: s.exam }] : [],
  );
  const faq = buildRoleFaq(role);

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <JsonLd data={itemListLd} />
      <JsonLd data={breadcrumbLd} />
      {faq.length > 0 && <JsonLd data={buildFaqPageLd(faq)} />}
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
          // 모바일은 2열 그리드라 타일 3개면 4번째 칸이 비어 bg-border 가 회색 블록으로 노출된다
          // (320px 실측). 마지막 타일이 두 칸을 차지하게 해 빈 칸 자체를 없앤다.
          <div className="col-span-2 bg-bg-elevated px-4 py-3 sm:col-span-1">
            <dt className="text-xs text-fg-muted">응시료 합계</dt>
            <dd className="mt-0.5 text-lg font-semibold">${role.totals.costUsd.toLocaleString('en-US')}</dd>
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
                  Week 1부터 시작 <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {/* 시험 사실은 content/exam-info(공식 시험 가이드 동기화)에서만 온다 — 여기서 숫자를 쓰지 않는다. */}
      {examSteps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{role.title} 자격증 시험 한눈에 보기</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-bg-subtle text-xs text-fg-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">시험</th>
                  <th className="px-3 py-2 font-medium">문항 · 시간</th>
                  <th className="px-3 py-2 font-medium">합격 점수</th>
                  <th className="px-3 py-2 font-medium">응시료</th>
                  <th className="px-3 py-2 font-medium">권장 수준</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-bg-elevated">
                {examSteps.map(({ slug: certSlug, code, exam }) => (
                  <tr key={certSlug}>
                    <td className="px-3 py-2 font-mono text-xs">{code}</td>
                    <td className="px-3 py-2">{exam.questionCount}문항 · {exam.durationMin}분</td>
                    <td className="px-3 py-2">
                      {exam.passingScore != null && exam.scoreMax != null ? `${exam.passingScore} / ${exam.scoreMax}` : (exam.passingCriteria ?? '—')}
                    </td>
                    <td className="px-3 py-2">{exam.costUsd != null ? `$${exam.costUsd}` : '—'}</td>
                    <td className="px-3 py-2 text-fg-muted">{exam.difficulty ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {role.studyTips && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{role.title} 자격증 공부법</h2>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-fg-muted">
            {role.studyTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ol>
        </section>
      )}

      {faq.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">자주 묻는 질문</h2>
          <dl className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
            {faq.map((f) => (
              <div key={f.q} className="space-y-1 px-4 py-3">
                <dt className="font-medium">{f.q}</dt>
                <dd className="text-sm leading-relaxed text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="text-xs text-fg-faint">
        각 자격증의 노트는 전 주차 무료입니다. 목표 직무에 맞춰 순서대로 준비해 보세요.
        응시료는 AWS 공식 시험 가이드 기준이며 결제 시점 환율과 세금은 별도입니다.
      </p>
      <p className="sr-only">{SITE_NAME}</p>
    </div>
  );
}
