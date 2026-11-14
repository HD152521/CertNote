import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { CliLab } from '@/components/cli-lab/CliLab';
import { JsonLd } from '@/components/JsonLd';
import { ShellDrill } from '@/components/shell-lab/ShellDrill';
import { ShellLab } from '@/components/shell-lab/ShellLab';
import { SqlLab } from '@/components/sql-lab/SqlLab';
import { cliLabsFor } from '@/lib/cli-lab/labsEn';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { certHref, listCerts } from '@/lib/content';
import type { LabEntry } from '@/lib/labCatalog';
import { labByIdFor, labGroupsFor, labHref, labHubHref, type LabLang } from '@/lib/labCatalogLang';
import { shellDrillsFor } from '@/lib/shell-lab/drillsEn';
import { shellLabsFor } from '@/lib/shell-lab/labsEn';
import { sqlTaskSetsFor } from '@/lib/sql-lab/tasks';
import { buildBreadcrumbLd } from '@/lib/structuredData';

const COPY = {
  ko: {
    home: '홈',
    hub: '실습',
    back: '실습 목록',
    stepsLab: '이 실습에서 할 일',
    stepsSql: '과제 목록',
    stepsDrill: '문제 목록',
    related: '함께 읽을 노트',
    curriculum: (code: string, weeks: number) => `${code} 전체 커리큘럼 (${weeks}주)`,
  },
  en: {
    home: 'Home',
    hub: 'Labs',
    back: 'All labs',
    stepsLab: 'What you will do in this lab',
    stepsSql: 'Task list',
    stepsDrill: 'Problem list',
    related: 'Related notes',
    curriculum: (code: string, weeks: number) => `${code} full curriculum (${weeks} weeks)`,
  },
} as const;

/** 엔진 데이터에서 단계(문제·과제) 제목만 뽑는다. 영어판은 *For('en') 접근자의 번역본을 읽는다. */
export function stepTitles(lab: LabEntry, lang: LabLang): string[] {
  if (lab.kind === 'practical') return shellDrillsFor(lang).find((d) => d.id === lab.id)?.items.map((i) => i.title) ?? [];
  if (lab.kind === 'sql') return sqlTaskSetsFor(lang).find((s) => s.id === lab.id)?.items.map((i) => i.title) ?? [];
  const labs = lab.kind === 'linux' ? shellLabsFor(lang) : cliLabsFor(lang);
  return labs.find((l) => l.id === lab.id)?.steps.map((s) => s.title) ?? [];
}

function Explainer({ kind, lang }: { kind: LabEntry['kind']; lang: LabLang }) {
  if (lang === 'en') {
    if (kind === 'sql') {
      return (
        <p>
          Each task is graded as soon as you write a SELECT and run it. You can chain several statements with <code>;</code>, and grading
          uses the result of the last statement. If you get stuck, look at the hint first, and if that is still not enough, open the model
          answer and explanation. Dates are shown as YYYY-MM-DD (the default display of a real Oracle depends on its environment settings).
        </p>
      );
    }
    if (kind === 'practical') {
      return (
        <p>
          Work as you would in the exam room: try it on your own first, and open the model answer and explanation only when you are stuck.
          Every problem has its own starting state, so you can solve them in any order, and if you break something, type{' '}
          <code>reset</code> in the terminal to restart that problem from the beginning.
        </p>
      );
    }
    return (
      <p>
        If you get stuck, look at the hint on each step first, and if that is still not enough, type the answer into the input box and run
        it. Running into errors is part of the lab. To return to the initial state, type <code>reset</code> in the terminal.
      </p>
    );
  }
  if (kind === 'sql') {
    return (
      <p>
        과제마다 SELECT 를 쓰고 실행하면 바로 채점합니다. 여러 문장을 <code>;</code> 로 이어 써도 되고, 채점은 마지막 문장의 결과로
        합니다. 막히면 힌트를 먼저 보고, 그래도 어려우면 모범 답안과 해설을 여세요. 날짜는 YYYY-MM-DD 로 보입니다(실제 Oracle 의 기본
        표시는 환경 설정에 따라 다릅니다).
      </p>
    );
  }
  if (kind === 'practical') {
    return (
      <p>
        시험장에서처럼 먼저 혼자 풀어 보고, 막히면 모범 답안과 해설을 여세요. 문제마다 처음 상태가 따로 있어서 순서와 상관없이 풀 수
        있고, 망가뜨렸으면 터미널에 <code>reset</code> 을 입력해 그 문제를 처음부터 다시 풉니다.
      </p>
    );
  }
  return (
    <p>
      막히면 단계마다 있는 힌트를 먼저 보고, 그래도 어려우면 정답을 입력창에 넣어 실행해 보세요. 오류를 만나는 것도 실습의 일부입니다.
      처음 상태로 돌아가려면 터미널에 <code>reset</code> 을 입력합니다.
    </p>
  );
}

// 실습 한 개(한국어 /lab/<id> · 영어 /en/lab/<id> 공용). 소개 → 단계 목록 → 연습장 → 관련 노트.
// 본문을 .article 로 감싸 연습장이 노트 안에 들어갔을 때와 같은 CSS 환경에서 보이게 한다.
// 연습장 컴포넌트는 useLanguage()(경로 기반)로 언어를 알아내므로 lang prop 을 넘기지 않는다.
export async function LabDetailView({ id, lang }: { id: string; lang: LabLang }) {
  const lab = labByIdFor(id, lang);
  if (!lab) notFound();
  const copy = COPY[lang];
  const group = labGroupsFor(lang).find((g) => g.kind === lab.kind)!;
  const steps = stepTitles(lab, lang);
  const isDrill = lab.kind === 'practical';
  const isSql = lab.kind === 'sql';
  // 관련 노트가 속한 자격증의 허브(/{section}/{slug} · /en/{slug}). href 의 세 번째 세그먼트가 slug 다.
  const relatedSlugs = new Set(lab.related.map((r) => r.href.split('/')[2]));
  const relatedCerts = (await listCerts(lang === 'en' ? EN_CATEGORY : DEFAULT_CATEGORY)).filter((c) => relatedSlugs.has(c.slug));
  const certLink = (c: (typeof relatedCerts)[number]) => (lang === 'en' ? `/${EN_CATEGORY}/${c.slug}` : certHref(c));
  const breadcrumbLd = buildBreadcrumbLd([
    { name: copy.home, url: lang === 'en' ? '/en' : '/' },
    { name: copy.hub, url: labHubHref(lang) },
    { name: lab.title, url: labHref(lab.id, lang) },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbLd} />
      <Link href={labHubHref(lang)} className="inline-flex items-center gap-1 text-sm text-fg-muted transition hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> {copy.back}
      </Link>
      <article className="article mt-4">
        <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-fg-muted">
          {lab.code} · {group.title}
        </div>
        <h1>{lab.title}</h1>
        {lab.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <h2 id="steps">{isDrill ? copy.stepsDrill : isSql ? copy.stepsSql : copy.stepsLab}</h2>
        <ol>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Explainer kind={lab.kind} lang={lang} />

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
            <h2 id="related">{copy.related}</h2>
            <ul>
              {lab.related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden /> {r.label}
                  </Link>
                </li>
              ))}
              {relatedCerts.map((c) => (
                <li key={c.slug}>
                  <Link href={certLink(c)} className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden /> {copy.curriculum(c.code, c.weeks)}
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
