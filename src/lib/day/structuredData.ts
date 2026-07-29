import { EN_CATEGORY, sectionLabel, sectionOfCategory } from '@/lib/category';
import type { Lang } from '@/lib/category';
import { getDayMtime } from '@/lib/content';
import type { DayContent } from '@/lib/content';
import { excerptOf } from '@/lib/site';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { buildDayArticleLd, buildBreadcrumbLd } from '@/lib/structuredData';

export interface DayStructuredData {
  articleLd: Record<string, unknown> | null;
  breadcrumbLd: Record<string, unknown> | null;
}

// 무료 day 페이지 전용 구조화 데이터(Step4 4-1/4-3) 생성 단일 출처(Step5 A-0 — page.tsx에서
// src/lib/day/structuredData.ts로 이동). generateMetadata와 같은 이유로 렌더 로직(DayView)에서
// 분리된 별도 함수로 둔다 — 회귀 테스트가 페이지 전체를 렌더하지 않고도(= MDX/쿠키 의존 없이)
// 이 함수를 직접 호출해 결과를 검증할 수 있다.
//
// 유료 day(week > FREE_WEEK)는 noindex 대상이라 구조화 데이터를 붙이는 게 신호 낭비이고,
// 페이월 본문을 무료로 선언하면 스팸 위험이다([category]/[slug]/page.tsx의 Course 판단을
// 승계 — Step4 4-2). BreadcrumbList도 순수 내비게이션 신호이긴 하지만, "유료 day엔 신규
// JSON-LD를 넣지 않는다"는 정책을 예외 없이 지키는 편이 안전해 같은 조건으로 묶는다.
export async function buildDayStructuredData(
  category: string,
  slug: string,
  w: number,
  d: number,
  lang: Lang,
  content: DayContent,
): Promise<DayStructuredData> {
  if (w > FREE_WEEK) return { articleLd: null, breadcrumbLd: null };

  // sitemap.ts가 lastModified에 쓰는 것과 같은 소스(day 마크다운 파일 mtime).
  // stat 실패 등으로 얻지 못하면 dateModified 자체를 생략한다(추측한 날짜를 내보내지 않음).
  const mtime = await getDayMtime(category, slug, w, d);
  const articleLd = buildDayArticleLd({
    href: content.href,
    // generateMetadata의 title과 동일한 조합 — 페이지에 보이는 제목과 headline을 맞춘다.
    headline: `${content.title} — ${content.certMeta.code}`,
    // generateMetadata가 이미 excerptOf(content.body)로 만드는 것과 같은 유틸을 재사용한다
    // (별도 요약 로직을 새로 만들지 않음 — Step4 4-1 요구사항).
    description: excerptOf(content.body),
    lang,
    dateModified: mtime,
    category,
    slug,
    courseName: `${content.certMeta.code} ${content.certMeta.name}`,
    imageUrl: `/${category}/${slug}/opengraph-image`,
  });
  const breadcrumbLd = buildBreadcrumbLd(
    lang === 'en'
      ? [
          { name: 'Home', url: `/${EN_CATEGORY}` },
          { name: content.certMeta.code, url: `/${category}/${slug}` },
          { name: `Week ${w} Day ${d}`, url: content.href },
        ]
      : [
          { name: '홈', url: '/' },
          // 섹션 허브(/aws·/linux). category가 섹션 세그먼트이므로 그대로 URL로 쓰고 라벨만 도출.
          { name: `${sectionLabel(sectionOfCategory(category))} 자격증`, url: `/${category}` },
          { name: content.certMeta.code, url: `/${category}/${slug}` },
          { name: `Week ${w} Day ${d}`, url: content.href },
        ],
  );
  return { articleLd, breadcrumbLd };
}
