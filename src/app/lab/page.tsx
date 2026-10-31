import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, TerminalSquare } from 'lucide-react';
import { JsonLd } from '@/components/JsonLd';
import { LAB_CATALOG, LAB_GROUPS } from '@/lib/labCatalog';
import { SITE_URL } from '@/lib/site';
import { buildBreadcrumbLd, buildItemListLd } from '@/lib/structuredData';

// "실습" 카테고리 목록. 브라우저에서 도는 터미널 연습장(리눅스 셸·AWS CLI)을 모아 둔다.
export const dynamic = 'error'; // 정적 생성 강제

const TITLE = '실습 — 리눅스 셸·AWS CLI 를 브라우저에서 직접 쳐 보기';
const DESCRIPTION =
  '리눅스마스터 권한·링크·사용자 관리와 AWS 리전·S3·IAM 을 설치 없이 브라우저 터미널에서 실습합니다. 명령을 치면 가상 파일 시스템과 계정이 실제로 바뀌고, 단계마다 시험 포인트를 정리해 줍니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/lab' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/lab', type: 'website' },
};

export default function LabHubPage() {
  const itemListLd = buildItemListLd(
    'CertNote 실습',
    LAB_CATALOG.map((l) => ({ code: l.code, name: l.title, url: `${SITE_URL}/lab/${l.id}` })),
  );
  const breadcrumbLd = buildBreadcrumbLd([
    { name: '홈', url: '/' },
    { name: '실습', url: '/lab' },
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-12 py-6">
      <JsonLd data={itemListLd} />
      <JsonLd data={breadcrumbLd} />
      <header className="space-y-4">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-fg-faint">
          <TerminalSquare className="h-3.5 w-3.5 text-accent" /> Lab · {LAB_CATALOG.length} exercises
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          읽은 걸 <span className="text-accent">손으로 쳐 보는</span> 실습
        </h1>
        <p className="leading-relaxed text-fg-muted">
          노트로 읽은 명령을 브라우저 안의 터미널에서 직접 실행해 봅니다. 서버나 AWS 계정은 필요 없습니다. 명령을 치면
          가상 파일 시스템과 계정의 상태가 실제로 바뀌고, 오류도 진짜 시스템이 내는 문구 그대로 나옵니다. 단계를 통과할
          때마다 그 동작이 시험에서 어떻게 나오는지 정리해 드립니다.
        </p>
      </header>

      {LAB_GROUPS.map((group) => (
        <section key={group.kind} aria-labelledby={`lab-${group.kind}`} className="space-y-4">
          <div className="space-y-1.5">
            <h2 id={`lab-${group.kind}`} className="text-xl font-semibold tracking-tight">
              {group.title}
            </h2>
            <p className="text-sm leading-relaxed text-fg-muted">{group.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LAB_CATALOG.filter((l) => l.kind === group.kind).map((lab) => (
              <Link
                key={lab.id}
                href={`/lab/${lab.id}`}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-5 transition hover:border-border-strong"
              >
                <div className="space-y-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint">{lab.code}</span>
                  <h3 className="font-semibold leading-snug">{lab.title}</h3>
                  <p className="text-sm leading-relaxed text-fg-muted">{lab.summary}</p>
                </div>
                <span className="mt-auto flex items-center gap-1 text-[12.5px] text-fg-faint group-hover:text-accent">
                  실습하기 <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
