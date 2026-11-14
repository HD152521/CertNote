import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Route } from 'lucide-react';
import { getRoadmapRoles } from '@/lib/roadmap';
import { ROADMAP_EN } from '@/lib/enPages/roadmapEn';
import { infoAlternates } from '@/lib/infoAlternates';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { JsonLd } from '@/components/JsonLd';
import { buildItemListLd, buildBreadcrumbLd } from '@/lib/structuredData';
import { withDefaultOgImage } from '@/lib/ogImages';

// 영어판 직무별 로드맵 허브. 한국어판(/roadmap)과 같은 데이터(content/roadmaps.json)를 쓰고 글만 영어다.
export const dynamic = 'error'; // 정적 생성 강제(한국어판과 동일).

const TITLE = 'AWS Certification Roadmap by Job Role — Study Order for DevOps, Developer, Data and Security';
const DESCRIPTION =
  'A roadmap showing the order in which to prepare for AWS certifications depending on your target role: solutions architect, developer, DevOps, data, machine learning and security. Each step comes with the reason for it and links straight to free study notes you can read without signing in.';
const PATH = '/en/roadmap';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: withDefaultOgImage({
    title: TITLE,
    description: 'A roadmap showing which AWS certifications to earn, and in what order, for each target role.',
    url: PATH,
    type: 'website',
  }),
};

export default async function EnRoadmapHubPage() {
  const roles = (await getRoadmapRoles()).filter((r) => ROADMAP_EN[r.slug]);

  const itemListLd = buildItemListLd(
    'AWS certification roadmaps by job role',
    roles.map((r) => ({ code: ROADMAP_EN[r.slug].title, name: ROADMAP_EN[r.slug].tagline, url: `${SITE_URL}/en/roadmap/${r.slug}` })),
  );
  const breadcrumbLd = buildBreadcrumbLd([
    { name: 'Home', url: '/en' },
    { name: 'Certification roadmap', url: PATH },
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
          <span className="text-accent">AWS certification roadmap</span> by job role
        </h1>
        <p className="text-fg-muted leading-relaxed">
          What matters about certifications is not &quot;how many you earn&quot; but &quot;whether you earn them in the order that
          fits your target role.&quot; Pick the role you are aiming for and we lay out the order from foundation to core to
          specialty, with the reason for each step.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <Link
            key={role.slug}
            href={`/en/roadmap/${role.slug}`}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-5 transition hover:border-border-strong"
          >
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{ROADMAP_EN[role.slug].title}</h2>
              <p className="text-sm text-fg-muted">{ROADMAP_EN[role.slug].tagline}</p>
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
