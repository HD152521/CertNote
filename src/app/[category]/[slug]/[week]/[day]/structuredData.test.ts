import { describe, expect, test } from 'vitest';
import { getDay } from '@/lib/content';
import { courseId, organizationRef } from '@/lib/structuredData';
import { SITE_URL } from '@/lib/site';
// buildDayStructuredData는 src/lib/day/structuredData.ts로 이동했다(Step5 A-0 — [week]/[day]와
// week1/[day] 양쪽 라우트가 공유하는 단일 출처).
import { buildDayStructuredData } from '@/lib/day/structuredData';

// day 페이지 구조화 데이터(Article/LearningResource + BreadcrumbList) 회귀 테스트
// (docs/SEO-indexing-fix-plan.md Step 4).
//
// 감사 배경: 사이트맵 색인 대상 142개의 대부분인 무료 day 페이지에 JSON-LD가 0개였다.
// 이 테스트는 실제 콘텐츠 파일(getDay)을 그대로 사용해 "무료 day엔 반드시 있어야 하고,
// 유료 day엔 절대 있으면 안 된다"는 두 방향의 회귀를 모두 잡는다.

describe('buildDayStructuredData — 무료 주차(week1)', () => {
  test('Article(LearningResource) + BreadcrumbList가 모두 생성된다(JSON-LD 누락 회귀 방지)', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { articleLd, breadcrumbLd } = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    expect(articleLd).not.toBeNull();
    expect(breadcrumbLd).not.toBeNull();
  });

  test('BreadcrumbList 계층이 URL 세그먼트(홈 > AWS 자격증 > SAA-C03 > Week 1 Day 1)와 정확히 일치한다', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { breadcrumbLd } = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    expect((breadcrumbLd as Record<string, unknown>).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'AWS 자격증', item: `${SITE_URL}/aws-certs` },
      { '@type': 'ListItem', position: 3, name: 'SAA-C03', item: `${SITE_URL}/aws-certs/saa-c03` },
      { '@type': 'ListItem', position: 4, name: 'Week 1 Day 1', item: `${SITE_URL}/aws-certs/saa-c03/week1/day1` },
    ]);
  });

  test('en 무료 day는 en 트리 URL로 3단 BreadcrumbList를 만든다(/en이 루트 겸 카테고리 허브)', async () => {
    const content = await getDay('en', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { breadcrumbLd } = await buildDayStructuredData('en', 'saa-c03', 1, 1, 'en', content);

    expect((breadcrumbLd as Record<string, unknown>).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/en` },
      { '@type': 'ListItem', position: 2, name: 'SAA-C03', item: `${SITE_URL}/en/saa-c03` },
      { '@type': 'ListItem', position: 3, name: 'Week 1 Day 1', item: `${SITE_URL}/en/saa-c03/week1/day1` },
    ]);
  });

  test('Article의 isPartOf가 자격증 허브 Course를 @id로 정확히 참조한다(그래프 연결 Step4 4-4)', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { articleLd } = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    const isPartOf = (articleLd as Record<string, unknown>).isPartOf as Record<string, unknown>;
    expect(isPartOf['@id']).toBe(courseId('aws-certs', 'saa-c03'));
  });

  test('author/publisher가 layout.tsx의 Organization과 이름·URL이 정확히 일치한다', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { articleLd } = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    expect((articleLd as Record<string, unknown>).author).toEqual(organizationRef());
    expect((articleLd as Record<string, unknown>).publisher).toEqual(organizationRef());
  });

  test('headline이 실제 title·code 조합과 같고 description은 excerptOf 결과다(빈 문자열이 아님)', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { articleLd } = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    expect(articleLd).toMatchObject({ headline: `${content.title} — ${content.certMeta.code}` });
    expect(typeof (articleLd as Record<string, unknown>).description).toBe('string');
    expect(((articleLd as Record<string, unknown>).description as string).length).toBeGreaterThan(0);
  });

  test('dateModified는 실제 day 마크다운 파일 mtime의 ISO 문자열이다(getDayMtime과 동일 소스)', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const { articleLd } = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    expect(typeof (articleLd as Record<string, unknown>).dateModified).toBe('string');
    // ISO 8601 형식인지만 확인(정확한 시각은 파일시스템에 의존하므로 형식만 검증).
    expect(() => new Date((articleLd as Record<string, unknown>).dateModified as string).toISOString()).not.toThrow();
  });

  test('JSON.stringify 후 JSON.parse해도 파싱 오류 없이 원본과 동일하다', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 1, 1);
    if (!content) throw new Error('fixture content missing');
    const result = await buildDayStructuredData('aws-certs', 'saa-c03', 1, 1, 'ko', content);

    expect(JSON.parse(JSON.stringify(result.articleLd))).toEqual(result.articleLd);
    expect(JSON.parse(JSON.stringify(result.breadcrumbLd))).toEqual(result.breadcrumbLd);
  });
});

describe('buildDayStructuredData — 유료 주차(week2+, 회귀 방지)', () => {
  test('Article도 BreadcrumbList도 생성하지 않는다(noindex 페이지에 신규 JSON-LD를 넣지 않는다 — Step4 4-2)', async () => {
    const content = await getDay('aws-certs', 'saa-c03', 2, 1);
    if (!content) throw new Error('fixture content missing');
    const result = await buildDayStructuredData('aws-certs', 'saa-c03', 2, 1, 'ko', content);

    expect(result.articleLd).toBeNull();
    expect(result.breadcrumbLd).toBeNull();
  });

  test('en 유료 주차도 동일하게 둘 다 null이다', async () => {
    const content = await getDay('en', 'saa-c03', 2, 1);
    if (!content) throw new Error('fixture content missing');
    const result = await buildDayStructuredData('en', 'saa-c03', 2, 1, 'en', content);

    expect(result.articleLd).toBeNull();
    expect(result.breadcrumbLd).toBeNull();
  });
});
