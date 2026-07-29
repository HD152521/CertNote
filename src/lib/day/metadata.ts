import type { Metadata } from 'next';
import { EN_CATEGORY } from '@/lib/category';
import { getDay } from '@/lib/content';
import { hreflangPair } from '@/lib/i18n';
import { excerptOf } from '@/lib/site';
import { FREE_WEEK } from '@/lib/entitlement/policy';

// day 페이지 generateMetadata 본문의 단일 출처(docs/SEO-indexing-fix-plan.md Step5 A-0).
// [category]/[slug]/[week]/[day](전체 동적 라우트, 유료 포함)와 [category]/[slug]/week1/[day]
// (무료 전용 정적 라우트) 양쪽의 generateMetadata가 이 함수에 위임한다.
//
// 호출부 책임: isSupportedCategory 검증과 week/day 세그먼트 파싱은 각 라우트의 generateMetadata가
// 먼저 끝내고, 유효한 category/숫자 w·d만 이 함수에 넘긴다(유효하지 않으면 호출부가 {}를 반환).
export async function buildDayMetadata(category: string, slug: string, w: number, d: number): Promise<Metadata> {
  // Week 2 이상은 Google 검색 인덱싱 차단(프리미엄 콘텐츠).
  // 그래도 canonical은 반드시 자기 자신을 가리켜야 한다 — 지정하지 않으면 루트 레이아웃의
  // canonical('/')과 languages(ko/en/x-default 전부 '/')를 그대로 상속해서, "noindex인데
  // canonical은 홈"이라는 충돌 신호가 나간다(홈으로 noindex가 전파될 위험). hreflang도 상호
  // 참조가 아니라 홈 하나만 가리키게 되므로 languages는 명시적으로 undefined로 덮어써서
  // 상속을 끊는다.
  if (w > FREE_WEEK) {
    const selfHref = `/${category}/${slug}/week${w}/day${d}`;
    return {
      robots: 'noindex, nofollow',
      alternates: { canonical: selfHref, languages: undefined },
    };
  }

  const content = await getDay(category, slug, w, d).catch(() => null);
  if (!content) return {};
  // 주제어(content.title)를 앞세운다. "Week N"은 검색량이 없어 title 자리를 낭비하므로 제외.
  const title = `${content.title} — ${content.certMeta.code}`;
  const description = excerptOf(content.body);
  // 한/영 상호 hreflang: 반대 언어 버전이 실제로 존재할 때만 연결(무료 Week1만 영어판이 있다).
  // en 페이지의 ko 짝은 섹션 URL(/aws/...)이어야 한다 — DEFAULT_CATEGORY('aws-certs')를 쓰면
  // 301되는 구 URL을 hreflang으로 가리켜 클러스터가 무효화된다. content.certMeta.section으로 도출.
  const koSection = content.certMeta.section ?? 'aws';
  const otherCategory = category === EN_CATEGORY ? koSection : EN_CATEGORY;
  const other = w <= FREE_WEEK ? await getDay(otherCategory, slug, w, d).catch(() => null) : null;
  const languages = other
    ? hreflangPair(category === EN_CATEGORY ? other.href : content.href, category === EN_CATEGORY ? content.href : other.href)
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: content.href, languages },
    // openGraph를 직접 정의하면 상위 세그먼트의 파일 기반 OG 이미지가 덮이므로
    // 자격증 카드 이미지를 명시적으로 지정한다.
    openGraph: {
      title,
      description,
      url: content.href,
      type: 'article',
      images: [`/${category}/${slug}/opengraph-image`],
    },
  };
}
