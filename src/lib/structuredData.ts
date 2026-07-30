// 구조화 데이터(JSON-LD) 생성 단일 출처.
//
// 이전엔 Organization/WebSite(layout.tsx) · ItemList([category]/page.tsx) ·
// Course([category]/[slug]/page.tsx) 가 각 페이지 파일에 인라인돼 있었다. 여러 페이지가
// 같은 엔티티(Organization 등)를 참조해야 하는 상황(day 페이지의 Article이 Course·Organization을
// 가리키는 것 등, docs/SEO-indexing-fix-plan.md Step 4)에서 인라인을 유지하면 이름·URL이
// 페이지마다 손으로 복제되어 드리프트(불일치) 위험이 생긴다. 이 모듈로 모아 값을 한 곳에서만
// 관리한다.
import type { Lang } from './category';
import { SITE_NAME, SITE_URL } from './site';

/**
 * JSON-LD 페이로드를 <script> 태그에 안전하게 주입할 수 있는 문자열로 직렬화한다.
 * JSON.stringify는 악성 문자열을 이스케이프하지 않으므로 '<'를 유니코드로 치환해
 * </script> 조기 종료 등 XSS 삽입을 막는다(Next.js 공식 JSON-LD 가이드 권장 사항 —
 * node_modules/next/dist/docs/01-app/02-guides/json-ld.md). src/components/JsonLd.tsx가
 * 렌더에 쓰고, 여기 두는 이유는 React 없이도(순수 함수로) 단위 테스트하기 위해서다.
 */
export function toSafeJsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// ── 그래프 앵커(@id) ──────────────────────────────────────────────────
// 서로 다른 JSON-LD 노드가 같은 엔티티를 가리킬 때 @id 값이 정확히 일치해야 검색엔진이
// 동일 개체로 묶는다(schema.org/JSON-LD의 엔티티 식별자). SITE_URL 기반 프래그먼트로 고정.
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** 자격증 허브(Course)의 @id. day 페이지 Article의 isPartOf가 이 값을 그대로 참조한다. */
export function courseId(category: string, slug: string): string {
  return `${SITE_URL}/${category}/${slug}#course`;
}

/**
 * publisher/author로 재사용하는 Organization 참조 노드.
 * layout.tsx가 선언하는 Organization과 name·url·@id가 항상 같도록 이 함수 하나로 강제한다
 * — 각 페이지에서 손으로 복제하면 오탈자 등으로 드리프트해 검색엔진이 별개 엔티티로 오인할 수 있다.
 */
export function organizationRef(): { '@type': 'Organization'; '@id': string; name: string; url: string } {
  return { '@type': 'Organization', '@id': ORGANIZATION_ID, name: SITE_NAME, url: SITE_URL };
}

// ── Organization + WebSite (layout.tsx 전역, 사이트 대표 구조화 데이터) ──────
export function buildSiteLd(): unknown[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: SITE_NAME,
      url: SITE_URL,
    },
  ];
}

// ── ItemList (카테고리 허브 — "자격증 추천 순서") ────────────────────────
export interface ItemListEntry {
  code: string;
  name: string;
  url: string;
}

export function buildItemListLd(name: string, items: ItemListEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${c.code} ${c.name}`,
      url: c.url,
    })),
  };
}

// ── Course (자격증 허브) ───────────────────────────────────────────────
export interface CourseLdInput {
  category: string;
  slug: string;
  code: string;
  name: string;
  weeks: number;
  dayCount: number;
  lang: Lang;
}

export function buildCourseLd(input: CourseLdInput): Record<string, unknown> {
  const { category, slug, code, name, weeks, dayCount, lang } = input;
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    // day 페이지 Article의 isPartOf가 이 값으로 이 Course를 가리킨다(Step4 4-4 그래프 연결).
    '@id': courseId(category, slug),
    name: `${code} ${name}`,
    description: `${weeks}주(총 ${dayCount}일) ${code} 자격증 한국어 학습 커리큘럼`,
    provider: organizationRef(),
    inLanguage: lang,
    // 전체 강좌는 유료(Week2+ 페이월)이고 Week1만 무료다. "전부 무료"로 선언하면
    // 페이월과 불일치 → 구조화 데이터 스팸(수동 조치 사유). hasPart로 무료 파트를 정직하게 명시한다.
    isAccessibleForFree: false,
    hasPart: {
      '@type': 'CreativeWork',
      name: lang === 'en' ? 'Week 1 (free preview)' : 'Week 1 (무료 미리보기)',
      isAccessibleForFree: true,
    },
    url: `${SITE_URL}/${category}/${slug}`,
  };
}

// ── BreadcrumbList (카테고리 허브 · 자격증 허브 · 무료 day 페이지 공용) ────────
export interface BreadcrumbItem {
  /** 화면에 보이는 라벨(언어별로 호출부에서 결정) */
  name: string;
  /** 사이트 루트 기준 상대 경로(예: '/', '/aws-certs') */
  url: string;
}

export function buildBreadcrumbLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

// ── Course + AggregateRating/Review (자격증 후기 페이지, Phase2) ────────────
// 주의(스팸/수동조치 방지): count≥1일 때만 호출하고, 화면에 실제로 렌더되는 후기와 1:1 동일
// 소스에서만 생성한다(빈 AggregateRating·미노출 리뷰는 금지). itemReviewed는 cert 허브 Course와
// 같은 @id(courseId)로 묶어 별개 엔티티로 오인되지 않게 한다.
export interface ReviewLdEntry {
  rating: number;
  authorName: string;
  title: string | null;
  body: string;
  datePublished: string; // 'YYYY-MM-DD'
}

export function buildCourseReviewLd(input: {
  section: string;
  slug: string;
  code: string;
  name: string;
  count: number;
  average: number;
  reviews: ReviewLdEntry[];
}): Record<string, unknown> {
  const { section, slug, code, name, count, average, reviews } = input;
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    '@id': courseId(section, slug),
    name: `${code} ${name}`,
    provider: organizationRef(),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: average,
      reviewCount: count,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.map((r) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      author: { '@type': 'Person', name: r.authorName },
      ...(r.title ? { name: r.title } : {}),
      reviewBody: r.body,
      datePublished: r.datePublished,
    })),
  };
}

// ── FAQPage (자격증 시험정보 FAQ, Phase2) ─────────────────────────────────
// 주의(스팸 방지): 화면에 실제로 렌더되는 <details> 텍스트와 1:1 동일 소스(info.faq)에서만
// 생성하고, faq.length>0일 때만 호출한다(빈 FAQPage = 구조화데이터 스팸 → 수동조치 사유).
export interface FaqEntry {
  q: string;
  a: string;
}

export function buildFaqPageLd(faq: FaqEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ── LearningResource/Article (무료 day 페이지 전용, Step4 4-1) ─────────────
export interface DayArticleLdInput {
  /** 사이트 루트 기준 상대 경로(예: /aws-certs/saa-c03/week1/day1) */
  href: string;
  headline: string;
  description: string;
  lang: Lang;
  /** getDayMtime 결과. 파일 stat 실패 등으로 없으면 dateModified를 아예 생략한다(날짜 추측 금지). */
  dateModified?: Date;
  category: string;
  slug: string;
  courseName: string;
  /** 카드 이미지(파일 기반 OG 이미지)의 사이트 루트 기준 상대 경로 */
  imageUrl: string;
}

export function buildDayArticleLd(input: DayArticleLdInput): Record<string, unknown> {
  const { href, headline, description, lang, dateModified, category, slug, courseName, imageUrl } = input;
  const url = `${SITE_URL}${href}`;
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    // LearningResource: 이 콘텐츠가 실제로 상위 Course의 한 차시(강의 노트)라는 교육 특화
    // 성격을 명시한다(schema.org 교육 어휘의 Course.hasPart ↔ LearningResource.isPartOf 관계와
    // 정확히 대응). Article: 더 널리 인식되는 범용 타입으로 headline/author 등 기본 속성
    // 파싱 호환성을 넓힌다. schema.org는 배열 @type으로 복수 타입 동시 선언을 명시적으로
    // 허용하므로 두 타입을 함께 선언해 정확성과 호환성을 모두 취한다.
    '@type': ['LearningResource', 'Article'],
    '@id': `${url}#article`,
    headline,
    description,
    inLanguage: lang,
    // 이 함수는 무료 주차(week <= FREE_WEEK) day에서만 호출된다 — 정직한 선언.
    isAccessibleForFree: true,
    learningResourceType: lang === 'en' ? 'Study notes' : '학습 노트',
    isPartOf: {
      '@type': 'Course',
      '@id': courseId(category, slug),
      name: courseName,
      url: `${SITE_URL}/${category}/${slug}`,
    },
    author: organizationRef(),
    publisher: organizationRef(),
    image: `${SITE_URL}${imageUrl}`,
    url,
  };
  if (dateModified) {
    ld.dateModified = dateModified.toISOString();
  }
  return ld;
}
