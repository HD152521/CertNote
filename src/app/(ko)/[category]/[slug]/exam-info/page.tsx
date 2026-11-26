import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_CATEGORY, EN_CATEGORY, SUPPORTED_CATEGORIES, isSupportedCategory, langOfCategory, sectionLabel, sectionOfCategory } from '@/lib/category';
import { hreflangPair } from '@/lib/i18n';
import { getCertMeta, listCerts } from '@/lib/content';
import { getExamInfo, isUpcomingActive, kstToday, localizeExamInfo } from '@/lib/examInfo';
import ExamInfoCard from '@/components/ExamInfoCard';
import ExamRevisionSection from '@/components/ExamRevisionSection';
import UpcomingExamNotice from '@/components/UpcomingExamNotice';
import { JsonLd } from '@/components/JsonLd';
import { buildBreadcrumbLd, buildFaqPageLd } from '@/lib/structuredData';
import { withDefaultOgImage } from '@/lib/ogImages';

interface PageProps { params: Promise<{ category: string; slug: string }>; }

// 자격증 허브(../page.tsx)에서 시험정보(도메인 비중·FAQ·버전 비교)만 떼어낸 페이지. 허브는
// "간단히 보고 Week로 넘어가기"가 목적이라 이 콘텐츠가 Week 목록을 밀어내고 있었다(유저 피드백,
// 2026-11-26). 여기는 "CLF-C02 시험정보" 같은 검색 의도를 받는 전용 랜딩 — FAQPage/도메인 비중은
// 실제 화면에 보이는 콘텐츠와 1:1이어야 구조화데이터가 유효하므로 그 콘텐츠와 함께 옮겼다.
//
// examInfo 가 없는 자격증(getExamInfo(slug) === null)은 생성하지 않는다 — 빈 페이지를 만들 이유가
// 없고, 허브도 그런 자격증에는 이 페이지로 가는 링크를 안 띄운다(아래 ../page.tsx 참고).
export async function generateStaticParams() {
  const out: { category: string; slug: string }[] = [];
  for (const category of SUPPORTED_CATEGORIES.filter((c) => c !== EN_CATEGORY)) {
    const certs = await listCerts(category).catch(() => []);
    for (const c of certs) if (getExamInfo(c.slug)) out.push({ category, slug: c.slug });
  }
  return out;
}

// 근거는 ../page.tsx 의 dynamicParams 주석과 동일 — 목록 밖 조합은 라우팅 단계에서 즉시 진짜 404.
export const dynamicParams = false;

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
  const examInfoKo = getExamInfo(slug);
  if (!examInfoKo) return {};
  const title =
    lang === 'en'
      ? `${meta.code} Exam Info — Format, Duration, Passing Score`
      : `${meta.code} 시험 정보 — 문항수·시험시간·합격기준·도메인 비중`;
  const description =
    lang === 'en'
      ? `${meta.code} exam format: question count, duration, passing score, domain weights, and FAQ.`
      : `${meta.code} 시험 문항 수·시험 시간·합격 기준·도메인별 비중과 자주 묻는 질문을 정리했습니다.`;
  const url = `/${category}/${slug}/exam-info`;
  // examInfo 는 slug 기준(카테고리 무관)이라 반대 언어 쪽도 이미 examInfoKo 가 있다는 뜻 — 거기 허브
  // 자체가 있는지만 더 보면 된다(hub page.tsx 의 otherExists 와 같은 판정).
  const otherCategory = lang === 'en' ? DEFAULT_CATEGORY : EN_CATEGORY;
  const otherExists = await getCertMeta(otherCategory, slug).then(() => true).catch(() => false);
  const languages = otherExists
    ? hreflangPair(
        lang === 'en' ? `/${DEFAULT_CATEGORY}/${slug}/exam-info` : url,
        lang === 'en' ? url : `/${EN_CATEGORY}/${slug}/exam-info`,
      )
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: withDefaultOgImage({ title, description, url, type: 'website' }),
  };
}

export default async function ExamInfoPage({ params }: PageProps) {
  const { category, slug } = await params;
  if (!isSupportedCategory(category)) notFound();
  const lang = langOfCategory(category);
  const section = sectionOfCategory(category);
  let meta;
  try { meta = await getCertMeta(category, slug); } catch { notFound(); }
  const examInfoKo = getExamInfo(slug);
  if (!examInfoKo) notFound();
  const examInfo = localizeExamInfo(examInfoKo, slug, lang);
  const upcoming = lang === 'ko' && examInfo.upcoming && isUpcomingActive(examInfo.upcoming, kstToday()) ? examInfo.upcoming : null;

  const breadcrumbLd = buildBreadcrumbLd(
    lang === 'en'
      ? [
          { name: 'Home', url: `/${EN_CATEGORY}` },
          { name: meta.code, url: `/${category}/${slug}` },
          { name: 'Exam info', url: `/${category}/${slug}/exam-info` },
        ]
      : [
          { name: '홈', url: '/' },
          { name: `${sectionLabel(section)} 자격증`, url: `/${category}` },
          { name: meta.code, url: `/${category}/${slug}` },
          { name: '시험정보', url: `/${category}/${slug}/exam-info` },
        ],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <JsonLd data={breadcrumbLd} />
      {examInfo.faq && examInfo.faq.length > 0 && <JsonLd data={buildFaqPageLd(examInfo.faq)} />}
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <Link href={`/${category}/${slug}`} className="hover:text-fg">← {meta.code}</Link>
          <span className="text-fg-faint">/</span>
          <span>{lang === 'en' ? 'Exam info' : '시험정보'}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {lang === 'en' ? `${meta.code} exam info` : `${meta.code} 시험 정보`}
        </h1>
      </header>
      {upcoming && <UpcomingExamNotice code={meta.code} upcoming={upcoming} />}
      <ExamInfoCard info={examInfo} lang={lang} section={section} />
      {/* 이전 시험 버전과의 차이. 문구가 한국어라 영어판에는 싣지 않는다(src/components/ExamRevisionSection.tsx). */}
      {lang === 'ko' && examInfo.revision && (
        <ExamRevisionSection code={meta.code} revision={examInfo.revision} domains={examInfo.domains} />
      )}
    </div>
  );
}
