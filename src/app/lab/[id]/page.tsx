import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { CliLab } from '@/components/cli-lab/CliLab';
import { JsonLd } from '@/components/JsonLd';
import { ShellLab } from '@/components/shell-lab/ShellLab';
import { LABS } from '@/lib/cli-lab/labs';
import { LAB_CATALOG, LAB_GROUPS, labById } from '@/lib/labCatalog';
import { SHELL_LABS } from '@/lib/shell-lab/labs';
import { buildBreadcrumbLd } from '@/lib/structuredData';

// 실습 한 개. 소개 → 단계 목록 → 연습장 → 관련 노트.
// 본문을 .article 로 감싸 연습장이 노트 안에 들어갔을 때와 같은 CSS 환경에서 보이게 한다.
export const dynamic = 'error';
export const dynamicParams = false;

export function generateStaticParams() {
  return LAB_CATALOG.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const lab = labById((await params).id);
  if (!lab) return {};
  const group = LAB_GROUPS.find((g) => g.kind === lab.kind)!;
  const title = `${lab.title} — ${group.title} 실습`;
  return {
    title,
    description: lab.summary,
    alternates: { canonical: `/lab/${lab.id}` },
    openGraph: { title, description: lab.summary, url: `/lab/${lab.id}`, type: 'article' },
  };
}

export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const lab = labById((await params).id);
  if (!lab) notFound();
  const group = LAB_GROUPS.find((g) => g.kind === lab.kind)!;
  const steps = (lab.kind === 'linux' ? SHELL_LABS : LABS).find((l) => l.id === lab.id)?.steps.map((s) => s.title) ?? [];
  const breadcrumbLd = buildBreadcrumbLd([
    { name: '홈', url: '/' },
    { name: '실습', url: '/lab' },
    { name: lab.title, url: `/lab/${lab.id}` },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbLd} />
      <Link href="/lab" className="inline-flex items-center gap-1 text-sm text-fg-muted transition hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> 실습 목록
      </Link>
      <article className="article mt-4">
        <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-fg-muted">
          {lab.code} · {group.title}
        </div>
        <h1>{lab.title}</h1>
        {lab.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <h2 id="steps">이 실습에서 할 일</h2>
        <ol>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p>
          막히면 단계마다 있는 힌트를 먼저 보고, 그래도 어려우면 정답을 입력창에 넣어 실행해 보세요. 오류를 만나는 것도
          실습의 일부입니다. 처음 상태로 돌아가려면 터미널에 <code>reset</code> 을 입력합니다.
        </p>

        {lab.kind === 'linux' ? <ShellLab labId={lab.id} /> : <CliLab labId={lab.id} />}

        {lab.related.length > 0 && (
          <>
            <h2 id="related">함께 읽을 노트</h2>
            <ul>
              {lab.related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden /> {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}
