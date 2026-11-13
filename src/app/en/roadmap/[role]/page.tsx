import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { EN_CATEGORY, certLevelLabel } from '@/lib/category';
import { localizeExamInfo } from '@/lib/examInfo';
import { getRoadmapRole, loadRoadmapRoles } from '@/lib/roadmap';
import { ROADMAP_EN, buildRoleDurationFaqEn } from '@/lib/enPages/roadmapEn';
import { infoAlternates } from '@/lib/infoAlternates';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { JsonLd } from '@/components/JsonLd';
import { buildItemListLd, buildBreadcrumbLd, buildFaqPageLd } from '@/lib/structuredData';

interface PageProps { params: Promise<{ role: string }>; }

// 영어판 직무 로드맵. 한국어판(/roadmap/[role])과 같은 역할 slug·같은 숫자 데이터를 쓰고 글만 영어다.
// slug 집합이 한국어판과 같도록 한국어 데이터에서 만들되, 영어 문구가 있는 역할만 낸다.
export function generateStaticParams() {
  return loadRoadmapRoles().filter((r) => ROADMAP_EN[r.slug]).map((r) => ({ role: r.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { role: slug } = await params;
  const en = ROADMAP_EN[slug];
  if (!en || !(await getRoadmapRole(slug))) return {};
  const url = `/en/roadmap/${slug}`;
  return {
    title: en.seoTitle,
    description: en.description,
    alternates: infoAlternates(url),
    openGraph: { title: en.seoTitle, description: en.description, url, type: 'website' },
  };
}

export default async function EnRoadmapRolePage({ params }: PageProps) {
  const { role: slug } = await params;
  const en = ROADMAP_EN[slug];
  const role = en ? await getRoadmapRole(slug) : null;
  if (!en || !role) notFound();

  const stepHref = (certSlug: string) => `/${EN_CATEGORY}/${certSlug}`;
  const noteOf = (certSlug: string) => en.stepNotes.find((n) => n.cert === certSlug)?.note ?? '';
  const url = `/en/roadmap/${slug}`;

  const itemListLd = buildItemListLd(
    `${en.title} certification order`,
    role.steps.map((s) => ({ code: s.code, name: s.name, url: `${SITE_URL}${stepHref(s.slug)}` })),
  );
  const breadcrumbLd = buildBreadcrumbLd([
    { name: 'Home', url: '/en' },
    { name: 'Certification roadmap', url: '/en/roadmap' },
    { name: en.title, url },
  ]);
  const examSteps = role.steps.flatMap((s) =>
    s.exam?.questionCount != null && s.exam.durationMin != null
      ? [{ ...s, exam: localizeExamInfo(s.exam, s.slug, 'en') }]
      : [],
  );
  const faq = [
    ...en.faq,
    buildRoleDurationFaqEn(en.title, role.steps.map((s) => s.code), role.totals),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <JsonLd data={itemListLd} />
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={buildFaqPageLd([...faq])} />
      <header className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <Link href="/en/roadmap" className="hover:text-fg">← All roadmaps</Link>
          <span className="text-fg-faint">/</span>
          <span>{en.title}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{en.title} roadmap</h1>
        <p className="text-fg-muted leading-relaxed">{en.description}</p>
      </header>

      <p className="border-l-2 border-accent/40 pl-4 leading-relaxed text-fg-muted">{en.why}</p>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <div className="bg-bg-elevated px-4 py-3">
          <dt className="text-xs text-fg-muted">Certifications</dt>
          <dd className="mt-0.5 text-lg font-semibold">{role.totals.certCount}</dd>
        </div>
        <div className="bg-bg-elevated px-4 py-3">
          <dt className="text-xs text-fg-muted">Curriculum length</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {role.totals.weeks} weeks <span className="text-sm font-normal text-fg-muted">· {role.totals.days} days</span>
          </dd>
        </div>
        {role.totals.costUsd !== null && (
          <div className="col-span-2 bg-bg-elevated px-4 py-3 sm:col-span-1">
            <dt className="text-xs text-fg-muted">Total exam fees</dt>
            <dd className="mt-0.5 text-lg font-semibold">${role.totals.costUsd.toLocaleString('en-US')}</dd>
          </div>
        )}
      </dl>

      <ol className="space-y-3">
        {role.steps.map((step, i) => (
          <li key={step.slug} className="relative">
            <Link
              href={stepHref(step.slug)}
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
                  <span className="min-w-0">{noteOf(step.slug)}</span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs text-fg-muted transition group-hover:text-accent">
                  Start from Week 1 <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {examSteps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{en.title} certification exams at a glance</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-bg-subtle text-xs text-fg-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Exam</th>
                  <th className="px-3 py-2 font-medium">Questions · Time</th>
                  <th className="px-3 py-2 font-medium">Passing score</th>
                  <th className="px-3 py-2 font-medium">Exam fee</th>
                  <th className="px-3 py-2 font-medium">Recommended level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-bg-elevated">
                {examSteps.map(({ slug: certSlug, code, exam }) => (
                  <tr key={certSlug}>
                    <td className="px-3 py-2 font-mono text-xs">{code}</td>
                    <td className="px-3 py-2">{exam.questionCount} questions · {exam.durationMin} min</td>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">How to study for the {en.title} certifications</h2>
        <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-fg-muted">
          {en.studyTips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Frequently asked questions</h2>
        <dl className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
          {faq.map((f) => (
            <div key={f.q} className="space-y-1 px-4 py-3">
              <dt className="font-medium">{f.q}</dt>
              <dd className="text-sm leading-relaxed text-fg-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-fg-faint">
        The notes for every certification are free in every week. Prepare in order to fit your target role. Exam fees are based on
        the official AWS exam guides; exchange rates and taxes at the time of payment are extra.
      </p>
      <p className="sr-only">{SITE_NAME}</p>
    </div>
  );
}
