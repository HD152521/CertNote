import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { CliLab } from '@/components/cli-lab/CliLab';
import { JsonLd } from '@/components/JsonLd';
import { ShellDrill } from '@/components/shell-lab/ShellDrill';
import { ShellLab } from '@/components/shell-lab/ShellLab';
import { SqlLab } from '@/components/sql-lab/SqlLab';
import { LABS } from '@/lib/cli-lab/labs';
import { LAB_CATALOG, LAB_GROUPS, labById } from '@/lib/labCatalog';
import { SHELL_DRILLS } from '@/lib/shell-lab/drills';
import { SHELL_LABS } from '@/lib/shell-lab/labs';
import { SQL_TASK_SETS } from '@/lib/sql-lab/tasks';
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
  const steps =
    lab.kind === 'practical'
      ? (SHELL_DRILLS.find((d) => d.id === lab.id)?.items.map((i) => i.title) ?? [])
      : lab.kind === 'sql'
        ? (SQL_TASK_SETS.find((s) => s.id === lab.id)?.items.map((i) => i.title) ?? [])
        : ((lab.kind === 'linux' ? SHELL_LABS : LABS).find((l) => l.id === lab.id)?.steps.map((s) => s.title) ?? []);
  const isDrill = lab.kind === 'practical';
  const isSql = lab.kind === 'sql';
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
        <h2 id="steps">{isDrill ? '문제 목록' : isSql ? '과제 목록' : '이 실습에서 할 일'}</h2>
        <ol>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {isSql ? (
          <p>
            과제마다 SELECT 를 쓰고 실행하면 바로 채점합니다. 여러 문장을 <code>;</code> 로 이어 써도 되고, 채점은 마지막
            문장의 결과로 합니다. 막히면 힌트를 먼저 보고, 그래도 어려우면 모범 답안과 해설을 여세요. 날짜는
            YYYY-MM-DD 로 보입니다(실제 Oracle 의 기본 표시는 환경 설정에 따라 다릅니다).
          </p>
        ) : isDrill ? (
          <p>
            시험장에서처럼 먼저 혼자 풀어 보고, 막히면 모범 답안과 해설을 여세요. 문제마다 처음 상태가 따로 있어서 순서와
            상관없이 풀 수 있고, 망가뜨렸으면 터미널에 <code>reset</code> 을 입력해 그 문제를 처음부터 다시 풉니다.
          </p>
        ) : (
          <p>
            막히면 단계마다 있는 힌트를 먼저 보고, 그래도 어려우면 정답을 입력창에 넣어 실행해 보세요. 오류를 만나는 것도
            실습의 일부입니다. 처음 상태로 돌아가려면 터미널에 <code>reset</code> 을 입력합니다.
          </p>
        )}

        {lab.kind === 'sql' ? (
          <SqlLab setId={lab.id} />
        ) : lab.kind === 'practical' ? (
          <ShellDrill drillId={lab.id} />
        ) : lab.kind === 'linux' ? (
          <ShellLab labId={lab.id} />
        ) : (
          <CliLab labId={lab.id} />
        )}

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
