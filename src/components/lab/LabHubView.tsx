import Link from 'next/link';
import { ArrowRight, TerminalSquare } from 'lucide-react';
import { JsonLd } from '@/components/JsonLd';
import { labCatalogFor, labGroupsFor, labHref, labHubHref, type LabLang } from '@/lib/labCatalogLang';
import { SITE_URL } from '@/lib/site';
import { buildBreadcrumbLd, buildItemListLd } from '@/lib/structuredData';

const COPY = {
  ko: {
    listName: 'CertNote 실습',
    home: '홈',
    crumb: '실습',
    lead: (
      <>
        읽은 걸 <span className="text-accent">손으로 쳐 보는</span> 실습
      </>
    ),
    body: '노트로 읽은 명령을 브라우저 안의 터미널에서 직접 실행해 봅니다. 서버나 AWS 계정은 필요 없습니다. 명령을 치면 가상 파일 시스템과 계정의 상태가 실제로 바뀌고, 오류도 진짜 시스템이 내는 문구 그대로 나옵니다. 단계를 통과할 때마다 그 동작이 시험에서 어떻게 나오는지 정리해 드립니다.',
  },
  en: {
    listName: 'CertNote Labs',
    home: 'Home',
    crumb: 'Labs',
    lead: (
      <>
        <span className="text-accent">Type it out</span> to make what you read stick
      </>
    ),
    body: 'Run the commands from the notes yourself in a terminal inside your browser. No server or AWS account is needed. When you type a command, the state of the virtual file system or account really changes, and errors come back in the exact wording the real system prints. Each time you pass a step, we show how that behavior appears on the exam.',
  },
} as const;

// "실습" 허브 본문(한국어 /lab · 영어 /en/lab 공용). 화면 언어는 URL 이 정하므로 lang 을 prop 으로 받는다.
export function LabHubView({ lang }: { lang: LabLang }) {
  const copy = COPY[lang];
  const catalog = labCatalogFor(lang);
  const itemListLd = buildItemListLd(
    copy.listName,
    catalog.map((l) => ({ code: l.code, name: l.title, url: `${SITE_URL}${labHref(l.id, lang)}` })),
  );
  const breadcrumbLd = buildBreadcrumbLd([
    { name: copy.home, url: lang === 'en' ? '/en' : '/' },
    { name: copy.crumb, url: labHubHref(lang) },
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-12 py-6">
      <JsonLd data={itemListLd} />
      <JsonLd data={breadcrumbLd} />
      <header className="space-y-4">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-fg-faint">
          <TerminalSquare className="h-3.5 w-3.5 text-accent" /> Lab · {catalog.length} exercises
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.lead}</h1>
        <p className="leading-relaxed text-fg-muted">{copy.body}</p>
      </header>

      {labGroupsFor(lang).map((group) => (
        <section key={group.kind} aria-labelledby={`lab-${group.kind}`} className="space-y-4">
          <div className="space-y-1.5">
            <h2 id={`lab-${group.kind}`} className="scroll-mt-20 text-xl font-semibold tracking-tight">
              {group.title}
            </h2>
            <p className="text-sm leading-relaxed text-fg-muted">{group.description}</p>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated">
            {catalog
              .filter((l) => l.kind === group.kind)
              .map((lab) => (
                <li key={lab.id}>
                  <Link
                    href={labHref(lab.id, lang)}
                    className="group flex items-center gap-3 px-4 py-3 transition hover:bg-bg-subtle sm:gap-4"
                  >
                    <span className="w-7 shrink-0 font-mono sm:w-12 text-[11px] uppercase tracking-wider text-fg-faint">
                      {lab.code.replace('LAB ', '')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug text-fg">{lab.title}</span>
                      <span className="mt-0.5 hidden truncate text-[13px] text-fg-muted sm:block">{lab.summary}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
