import { DEFAULT_CATEGORY, EN_CATEGORY, SUPPORTED_CATEGORIES, isSupportedCategory, langOfCategory, sectionLabel, sectionOfCategory } from '@/lib/category';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hreflangPair } from '@/lib/i18n';
import { ArrowRight } from 'lucide-react';
import { getAllDays, getCertMeta, listCerts, certLevelLabel, certHref } from '@/lib/content';
import { isHighlightLevel } from '@/lib/levels';
import { getExamInfo } from '@/lib/examInfo';
import { getMockExamQuestionCount } from '@/lib/exam/examBankCount';
import { buildTrackContents } from '@/lib/certTrack';
import BulletList from '@/components/ui/BulletList';
import ExamInfoCard from '@/components/ExamInfoCard';
import { cn } from '@/lib/cn';
import { JsonLd } from '@/components/JsonLd';
import { buildCourseLd, buildBreadcrumbLd, buildFaqPageLd } from '@/lib/structuredData';

interface PageProps { params: Promise<{ category: string; slug: string }>; }

// ko(aws-certs)뿐 아니라 en도 포함해야 한다 — /en/<slug> 허브도 이 라우트가 서빙한다
// (src/app/en/page.tsx는 /en 자체만 처리하는 별도 정적 라우트). 빠뜨리면 아래 dynamicParams=false와
// 만나 /en/<slug> 전체가 즉시 404가 난다(실측으로 확인한 회귀 — 최초 구현 시 en을 빠뜨렸었음).
export async function generateStaticParams() {
  const out: { category: string; slug: string }[] = [];
  for (const category of SUPPORTED_CATEGORIES) {
    const certs = await listCerts(category).catch(() => []);
    for (const c of certs) out.push({ category, slug: c.slug });
  }
  return out;
}

// dynamicParams=false 근거(docs/SEO-indexing-fix-plan.md Step7-A-1, /foo/bar류 소프트 404 수정).
// 자격증 slug는 코드 상수가 아니라 content/<category>/index.json(scripts/sync-content.mjs로
// 동기화)에서 온다 — 그러나 이 index.json은 git에 커밋되어(RECIPE.md 콘텐츠 배포 절차: sync →
// build 검증 → git commit → git push → Vercel 자동 재빌드) "이 빌드가 서빙하는 content/"와
// "이 generateStaticParams가 읽은 content/"가 항상 동일한 스냅샷이다. getCertMeta()도 같은
// listCerts()/index.json을 쓰므로, 어떤 slug가 이 목록에 없다면 그 slug는 이 배포에 애초에
// 존재하지 않는 콘텐츠다(같은 빌드 안에서 "목록엔 없는데 실제로 있는" 경우가 구조적으로 불가능).
// day 콘텐츠(week1/[day]의 dynamicParams=true, 배포 없이도 즉시 노출되어야 하는 케이스)와 달리
// 여긴 그런 별도 갱신 경로가 없다 — 신규 자격증 추가는 scripts/sync-content.mjs의 CERTS 배열
// 자체를 고쳐야 하는 코드 변경이라 항상 재배포를 동반한다(src/lib/category.ts의 SUPPORTED_CATEGORIES
// 와 동일한 논리, [category]/page.tsx dynamicParams 주석 참고). false로 잠그면 /foo/bar 같은
// 목록 밖 [category]/[slug] 조합이 Next 라우팅 단계에서 즉시 진짜 404가 나간다(런타임 notFound()는
// root loading.tsx 스트리밍 때문에 200으로 나가 이 경로로는 못 고친다 — Step6과 동일 메커니즘).
export const dynamicParams = false;

// 자격증 허브 = "SAA-C03 정리" 류 검색의 랜딩 페이지. 자격증별 제목·요약·canonical.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, slug } = await params;
  if (!isSupportedCategory(category)) return {};
  const lang = langOfCategory(category);
  let meta;
  try {
    meta = await getCertMeta(category, slug);
  } catch {
    return {};
  }
  const title =
    lang === 'en'
      ? `${meta.code} ${meta.name} — Study Notes (Week 1 Free)`
      : `${meta.code} ${meta.name} — ${meta.weeks}주 완성 학습 노트`;
  const description =
    lang === 'en'
      ? `Study ${meta.code} with daily in-depth notes and practice questions. Week 1 is free in English.`
      : `${meta.code} 시험을 ${meta.weeks}주(총 ${meta.dayCount}일) 한국어 커리큘럼으로 준비하세요. 매일 읽는 심화 노트 + 연습 문제 + 모의고사·복습. Week 1은 무료.`;
  const url = `/${category}/${slug}`;
  // 반대 언어 허브가 있으면 hreflang 연결(영어판이 없는 자격증은 en 메타가 없어 실패 → 연결 생략).
  const otherCategory = lang === 'en' ? DEFAULT_CATEGORY : EN_CATEGORY;
  const otherExists = await getCertMeta(otherCategory, slug).then(() => true).catch(() => false);
  // ko 짝의 URL은 섹션 세그먼트(/aws/...)여야 한다 — certHref(meta.section 기반)로 도출한다.
  // '/aws-certs/...'(레거시)를 쓰면 301되는 URL을 hreflang이 가리켜 클러스터가 무효화된다.
  const languages = otherExists
    ? hreflangPair(lang === 'en' ? certHref(meta) : url, lang === 'en' ? url : `/${EN_CATEGORY}/${slug}`)
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function CertIndexPage({ params }: PageProps) {
  const { category, slug } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const section = sectionOfCategory(category);
  let meta;
  try { meta = await getCertMeta(category, slug); } catch { notFound(); }
  const days = await getAllDays(category, slug);
  const byWeek = new Map<number, typeof days>();
  for (const d of days) {
    if (!byWeek.has(d.week)) byWeek.set(d.week, []);
    byWeek.get(d.week)!.push(d);
  }
  const firstDay = days[0];
  const examInfo = getExamInfo(slug);
  // 구글이 이 페이지를 "강좌"로 이해하게 하는 구조화 데이터(JSON-LD). 생성 로직은
  // src/lib/structuredData.ts(buildCourseLd)로 단일화(Step4) — day 페이지 Article의 isPartOf가
  // 이 Course를 @id로 참조하므로 값이 한 곳에서만 나와야 한다. isAccessibleForFree 판단 근거는
  // buildCourseLd 내부 주석 참고(페이월 정직 선언 — 스팸 방지).
  const courseLd = buildCourseLd({
    category,
    slug,
    code: meta.code,
    name: meta.name,
    weeks: meta.weeks,
    dayCount: meta.dayCount,
    lang,
  });
  // 계층 신호(BreadcrumbList, Step4 4-3). en은 /en 페이지 자체가 "루트 겸 카테고리 허브"
  // 역할을 겸하므로(app/en/page.tsx 주석 참고) ko보다 한 단계 얕다.
  const breadcrumbLd = buildBreadcrumbLd(
    lang === 'en'
      ? [
          { name: 'Home', url: `/${EN_CATEGORY}` },
          { name: meta.code, url: `/${category}/${slug}` },
        ]
      : [
          { name: '홈', url: '/' },
          { name: `${sectionLabel(section)} 자격증`, url: `/${category}` },
          { name: meta.code, url: `/${category}/${slug}` },
        ],
  );
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <JsonLd data={courseLd} />
      <JsonLd data={breadcrumbLd} />
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <Link href={lang === 'en' ? '/en' : '/'} className="hover:text-fg">← {lang === 'en' ? 'All certifications' : '전체 자격증'}</Link>
          <span className="text-fg-faint">/</span>
          <span>{meta.code}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{meta.name}</h1>
        <p className="text-sm text-fg-muted">
          {lang === 'en' ? `${meta.weeks} week${meta.weeks > 1 ? 's' : ''} · ${meta.dayCount} days · ` : `${meta.weeks}주 · 총 ${meta.dayCount}일 · `}
          <span className={isHighlightLevel(meta.level, section) ? 'text-accent' : ''}>{certLevelLabel(meta.level, section)}</span>
        </p>
        {lang === 'en' && (
          <p className="text-xs text-fg-faint">
            Week 1 is available in English as a free preview. The full course is currently Korean-only —{' '}
            <Link href={certHref(meta)} className="underline underline-offset-4 hover:text-fg">view the Korean track</Link>.
          </p>
        )}
        {firstDay && (
          <Link href={firstDay.href}
            className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-bg-subtle', 'px-3 py-1.5 text-sm font-medium transition hover:border-border-strong')}>
            {lang === 'en' ? 'Start with Week 1' : 'Week 1부터 시작'} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <p>
          <Link href={`/${category}/reviews/${slug}`} className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg">
            {lang === 'en' ? `Read ${meta.code} pass reviews →` : `${meta.code} 합격 후기 보기 →`}
          </Link>
        </p>
      </header>
      {examInfo && examInfo.faq && examInfo.faq.length > 0 && <JsonLd data={buildFaqPageLd(examInfo.faq)} />}
      {examInfo && <ExamInfoCard info={examInfo} lang={lang} section={section} />}

      {/* 트랙 구성 — 자격증마다 값이 달라지는 '사실 명세'다(홍보 문구가 아니다).
          이 페이지 본문에는 '모의고사'·'연습문제'라는 단어가 아예 없었고(메타 description에만
          있었다), 모의고사 화면 /exam 은 robots.ts에서 Disallow라 검색으로 닿을 수 있는 접점이
          한 곳도 없었다. 문구 생성은 buildTrackContents(수치 없으면 줄 생략)에 위임한다.
          en 트랙은 Week 1 프리뷰만 있고 모의고사·복습이 한국어 전용이라 ko에서만 렌더한다. */}
      {lang !== 'en' && (
        <section aria-labelledby="track-contents-heading" className="space-y-3">
          <h2 id="track-contents-heading" className="text-sm font-medium text-fg-muted">
            트랙 구성
          </h2>
          <BulletList
            items={buildTrackContents({
              dayCount: meta.dayCount,
              weeks: meta.weeks,
              mockExamCount: getMockExamQuestionCount(slug),
            })}
            className="rounded-lg border border-border bg-bg-elevated p-4 sm:p-5"
          />
        </section>
      )}

      <section className="space-y-6">
        {[...byWeek.entries()].map(([w, ws]) => (
          <div key={w} className="space-y-2">
            <h2
              className={cn(
                'text-xs uppercase tracking-wider text-fg-faint',
                lang === 'en' && 'font-mono',
              )}
            >
              {lang === 'en' ? `Week ${w}` : `${w}주차`}
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {ws.map((d) => (
                <li key={d.href}>
                  <Link href={d.href} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle transition">
                    <span className="font-mono text-xs text-fg-faint w-10 shrink-0">Day {d.day}</span>
                    <span className="flex-1 text-sm truncate">{d.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
                    <ArrowRight className="h-4 w-4 text-fg-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
