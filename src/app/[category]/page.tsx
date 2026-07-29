import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { EN_CATEGORY, SUPPORTED_CATEGORIES, certLevelLabel, isSupportedCategory, langOfCategory, sectionLabel, sectionOfCategory } from '@/lib/category';
import { listCerts } from '@/lib/content';
import type { CertMeta } from '@/lib/content';
import { groupCertsByLevel } from '@/lib/levels';
import { hreflangPair } from '@/lib/i18n';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { JsonLd } from '@/components/JsonLd';
import { buildItemListLd, buildBreadcrumbLd } from '@/lib/structuredData';

interface PageProps { params: Promise<{ category: string }>; }

// 정적 생성 대상은 ko 카테고리(aws-certs)뿐. en 은 정적 라우트(app/en/page.tsx)가 우선 매칭해
// 이 동적 라우트까지 내려오지 않는다(en도 목록에 넣어두는 이유는 아래 dynamicParams 주석 참고).
export async function generateStaticParams() {
  return SUPPORTED_CATEGORIES.map((category) => ({ category }));
}

// SUPPORTED_CATEGORIES는 코드 상수(src/lib/category.ts)라 콘텐츠 동기화만으로는 늘지 않는다 —
// 카테고리 추가는 항상 코드 배포를 동반하므로 week1/[day](day 콘텐츠, 배포 없이도 늘 수 있음)와
// 달리 dynamicParams=false로 잠가도 "새 카테고리가 재배포 전까지 404" 같은 회귀가 생기지 않는다.
// false로 잠그면 목록 밖 category(예: /totally-bogus-path)는 Next 라우팅 단계에서 즉시
// "라우트 없음"으로 처리되어 진짜 404가 나간다(docs/SEO-indexing-fix-plan.md Step6 소프트 404 수정
// — 런타임 notFound()는 root loading.tsx의 스트리밍 때문에 200으로 나가 이 경로로는 못 고친다).
export const dynamicParams = false;

// "aws 자격증 순서 / 종류" 검색의 착지 페이지. 전 자격증을 레벨별로 나열한 카테고리 허브.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isSupportedCategory(category)) return {};
  const lang = langOfCategory(category);
  const section = sectionOfCategory(category);
  const sectionName = sectionLabel(section);
  const certs = await listCerts(category).catch(() => []);
  const title =
    lang === 'en'
      ? `${sectionName} Certifications — Types & Recommended Order (Week 1 Free)`
      : `${sectionName} 자격증 종류와 추천 순서 — ${certs.length}종 한국어 학습 로드맵`;
  const description =
    section === 'aws'
      ? `AWS 자격증 ${certs.length}종을 레벨별로 정리. Cloud Practitioner(기초) → 어소시에이트(SAA·DVA·SOA) → 프로페셔널(SAP·DOP) → 전문분야 순서로 준비하세요. Week 1 무료.`
      : `${sectionName} 자격증 ${certs.length}종을 레벨별로 정리하고 추천 순서로 준비하세요. 매일 읽는 심화 노트 + 연습 문제. Week 1 무료.`;
  const url = `/${category}`;
  // aws 허브만 영어판(/en)이 존재해 hreflang을 선언한다. linux 등 다른 섹션은 영어판이 없어
  // 상호 참조가 성립하지 않으므로 languages를 아예 넣지 않는다(없는 URL을 가리키면 클러스터 무효화).
  // x-default(비ko/비en 대체 URL)는 사이트 전체에서 이 aws 클러스터 하나에서만 선언한다.
  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(section === 'aws' ? { languages: hreflangPair(url, `/${EN_CATEGORY}`, { xDefault: true }) } : {}),
    },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function CategoryHubPage({ params }: PageProps) {
  const { category } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const section = sectionOfCategory(category);
  const sectionName = sectionLabel(section);
  const certs = await listCerts(category).catch(() => []);
  if (certs.length === 0) notFound();

  // 레벨별 그룹(추천 순서, 섹션별 티어). 각 그룹 내부는 order 순.
  const groups = groupCertsByLevel(certs, section).map((g) => ({ level: g.level, items: g.certs }));

  // 추천 순서를 그대로 담은 ItemList — "자격증 순서" 검색 의도에 맞춘 구조화 데이터.
  const ordered: CertMeta[] = groups.flatMap((g) => g.items);
  const itemListLd = buildItemListLd(
    lang === 'en' ? `${sectionName} certifications by recommended order` : `${sectionName} 자격증 추천 순서`,
    ordered.map((c) => ({ code: c.code, name: c.name, url: `${SITE_URL}/${category}/${c.slug}` })),
  );
  // 계층 신호(BreadcrumbList, Step4 4-3). /en 은 이 동적 라우트가 아니라 정적 라우트
  // (src/app/en/page.tsx)가 우선 매칭해 실제로 서빙하므로(주석 참고) 여기선 ko(섹션 허브)만
  // 선언한다 — en 분기는 실제로 도달하지 않는다.
  const breadcrumbLd = lang === 'ko'
    ? buildBreadcrumbLd([
        { name: '홈', url: '/' },
        { name: `${sectionName} 자격증`, url: `/${category}` },
      ])
    : null;

  // 레벨 힌트(섹션별 티어 설명). 미정의 레벨은 힌트 없이 라벨만 렌더된다.
  const levelHint: Record<string, string> = lang === 'en'
    ? {
        foundational: 'Start here — cloud basics, no prerequisites.',
        associate: 'Core job-ready certs. SAA-C03 is the most in-demand.',
        professional: 'Advanced, 2+ years experience recommended.',
        specialty: 'Deep-dive into a specific domain.',
      }
    : section === 'linux'
    ? {
        'grade-2': '입문·실무 기초 — 리눅스마스터 2급부터 시작하세요.',
        'grade-1': '심화·전문가 — 실무 경험과 함께 준비하는 상위 등급.',
      }
    : {
        foundational: '여기서 시작 — 사전지식 없이 클라우드 기초.',
        associate: '취업 핵심 자격증. SAA-C03가 수요 1위.',
        professional: '심화 단계 — 실무 2년+ 권장.',
        specialty: '특정 분야를 깊게 파는 전문 자격증.',
      };

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-6">
      <JsonLd data={itemListLd} />
      {breadcrumbLd && <JsonLd data={breadcrumbLd} />}
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">
          {lang === 'en' ? `${sectionName} Certifications` : `${sectionName} 자격증`} · {certs.length} tracks
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {lang === 'en' ? (
            <>{sectionName} certification <span className="text-accent">types & order</span></>
          ) : (
            <>{sectionName} 자격증 <span className="text-accent">종류와 추천 순서</span></>
          )}
        </h1>
        <p className="text-fg-muted leading-relaxed">
          {section === 'aws'
            ? 'AWS 자격증은 기초(Cloud Practitioner) → 어소시에이트(SAA·DVA·SOA) → 프로페셔널(SAP·DOP) → 전문분야 순서로 준비하는 것이 일반적입니다. 목표를 고르고 무료 Week 1부터 시작하세요.'
            : `${sectionName} 자격증을 레벨별로 정리했습니다. 목표를 고르고 무료 Week 1부터 시작하세요.`}
        </p>
      </header>

      {groups.map(({ level, items }) => (
        <section key={level} className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{certLevelLabel(level, section)}</h2>
            <p className="text-sm text-fg-muted">{levelHint[level]}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((c) => (
              <Link
                key={c.slug}
                href={`/${category}/${c.slug}`}
                className="group flex flex-col gap-1 rounded-lg border border-border bg-bg-elevated px-4 py-3 transition hover:border-border-strong"
              >
                <span className="font-mono text-[11px] text-fg-faint">{c.code}</span>
                <span className="text-sm font-medium leading-snug">{c.name}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-fg-muted transition group-hover:text-accent">
                  {lang === 'en' ? `${c.weeks} weeks · ${c.dayCount} days` : `${c.weeks}주 · 총 ${c.dayCount}일`}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-fg-faint">
        {lang === 'en' ? (
          <>Week 1 of every track is free. <Link href="/pricing" className="underline underline-offset-4 hover:text-fg">See pricing</Link> for the full course.</>
        ) : (
          <>모든 트랙 Week 1은 무료입니다. 전체 과정은 <Link href="/pricing" className="underline underline-offset-4 hover:text-fg">요금제</Link>에서 확인하세요.</>
        )}
      </p>
      <p className="sr-only">{SITE_NAME}</p>
    </div>
  );
}
