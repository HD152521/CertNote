import { describe, expect, test } from 'vitest';
import { SITE_NAME, SITE_URL } from './site';
import {
  ORGANIZATION_ID,
  WEBSITE_ID,
  buildBreadcrumbLd,
  buildCourseLd,
  buildDayArticleLd,
  buildItemListLd,
  buildSiteLd,
  courseId,
  organizationRef,
  toSafeJsonLdString,
} from './structuredData';

// 구조화 데이터(JSON-LD) 생성 단일 출처에 대한 단위 테스트(docs/SEO-indexing-fix-plan.md Step 4).

describe('toSafeJsonLdString', () => {
  test('악성 </script> 조기 종료 문자열을 이스케이프한다', () => {
    const raw = toSafeJsonLdString({ name: '</script><script>alert(1)</script>' });
    // '<'만 유니코드로 치환한다(Next.js 공식 가이드 권장 방식) — '>'는 그대로 두어도
    // '<script'로 시작하는 열림 태그가 만들어지지 않으므로 조기 종료 위험이 사라진다.
    expect(raw).not.toContain('</script>');
    expect(raw).not.toContain('<script>');
    expect(raw).toContain('\\u003c/script>');
    expect(raw).toContain('\\u003cscript>');
  });

  test('이스케이프 후에도 JSON.parse로 원본 값을 복원할 수 있다(라운드트립)', () => {
    const data = { a: 1, b: '<b>x</b>', c: [1, 2, 3] };
    const parsed = JSON.parse(toSafeJsonLdString(data));
    expect(parsed).toEqual(data);
  });

  test("'<'가 없는 데이터는 일반 JSON.stringify와 바이트가 동일하다(기존 3곳 이관 시 회귀 없음의 근거)", () => {
    const data = { '@type': 'Organization', name: 'Cert Notes' };
    expect(toSafeJsonLdString(data)).toBe(JSON.stringify(data));
  });
});

describe('buildSiteLd — Organization + WebSite(layout.tsx 전역)', () => {
  test('Organization과 WebSite 두 노드를 이 순서로 반환하고 @id를 부여한다', () => {
    const [org, site] = buildSiteLd() as Record<string, unknown>[];
    expect(org).toMatchObject({ '@type': 'Organization', '@id': ORGANIZATION_ID, name: SITE_NAME, url: SITE_URL });
    expect(site).toMatchObject({ '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE_NAME, url: SITE_URL });
  });
});

describe('organizationRef — publisher/author로 재사용하는 Organization 참조', () => {
  test('buildSiteLd의 Organization 노드와 name·url·@id가 정확히 일치한다(엔티티 드리프트 방지)', () => {
    const [org] = buildSiteLd() as Record<string, unknown>[];
    const ref = organizationRef();
    expect(ref.name).toBe(org.name);
    expect(ref.url).toBe(org.url);
    expect(ref['@id']).toBe(org['@id']);
  });
});

describe('courseId', () => {
  test('category/slug#course 형태의 안정적인 @id를 만든다', () => {
    expect(courseId('aws-certs', 'saa-c03')).toBe(`${SITE_URL}/aws-certs/saa-c03#course`);
  });
});

describe('buildItemListLd — 카테고리 허브(추천 순서)', () => {
  test('빈 목록이면 itemListElement도 빈 배열이다(경계값)', () => {
    const ld = buildItemListLd('empty', []);
    expect(ld.itemListElement).toEqual([]);
  });

  test('position이 1부터 순서대로 매겨지고 name은 code+name 조합이다', () => {
    const ld = buildItemListLd('추천 순서', [
      { code: 'CLF-C02', name: 'Cloud Practitioner', url: `${SITE_URL}/aws-certs/clf-c02` },
      { code: 'SAA-C03', name: 'Solutions Architect', url: `${SITE_URL}/aws-certs/saa-c03` },
    ]) as { itemListElement: Record<string, unknown>[] };
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'CLF-C02 Cloud Practitioner', url: `${SITE_URL}/aws-certs/clf-c02` },
      { '@type': 'ListItem', position: 2, name: 'SAA-C03 Solutions Architect', url: `${SITE_URL}/aws-certs/saa-c03` },
    ]);
  });
});

describe('buildCourseLd — 자격증 허브', () => {
  const base = { category: 'aws-certs', slug: 'saa-c03', code: 'SAA-C03', name: 'Solutions Architect', weeks: 12, dayCount: 60 };

  test('@id가 courseId와 일치하고 provider는 organizationRef와 동일하다(그래프 연결 Step4 4-4)', () => {
    const ld = buildCourseLd({ ...base, lang: 'ko' }) as Record<string, unknown>;
    expect(ld['@id']).toBe(courseId('aws-certs', 'saa-c03'));
    expect(ld.provider).toEqual(organizationRef());
  });

  test('페이월 페이지에서도 hasPart로 무료 파트(Week1)만 정직하게 선언한다(전체를 무료로 선언하지 않음)', () => {
    const ld = buildCourseLd({ ...base, lang: 'ko' }) as Record<string, unknown>;
    expect(ld.isAccessibleForFree).toBe(false);
    expect(ld.hasPart).toMatchObject({ isAccessibleForFree: true });
  });

  test('en일 때 hasPart.name이 영어 문구다', () => {
    const ld = buildCourseLd({ ...base, lang: 'en' }) as Record<string, unknown>;
    expect((ld.hasPart as Record<string, unknown>).name).toBe('Week 1 (free preview)');
  });
});

describe('buildBreadcrumbLd', () => {
  test('빈 배열이면 itemListElement도 빈 배열이다(경계값)', () => {
    expect(buildBreadcrumbLd([])).toMatchObject({ '@type': 'BreadcrumbList', itemListElement: [] });
  });

  test('item URL이 SITE_URL과 결합된 절대 URL이고 position이 1부터 순서대로 매겨진다', () => {
    const ld = buildBreadcrumbLd([
      { name: '홈', url: '/' },
      { name: 'AWS 자격증', url: '/aws-certs' },
    ]) as { itemListElement: Record<string, unknown>[] };
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'AWS 자격증', item: `${SITE_URL}/aws-certs` },
    ]);
  });
});

describe('buildDayArticleLd — 무료 day 페이지(Step4 4-1)', () => {
  const base = {
    href: '/aws-certs/saa-c03/week1/day1',
    headline: 'Day 1 — SAA-C03',
    description: '요약문',
    lang: 'ko' as const,
    category: 'aws-certs',
    slug: 'saa-c03',
    courseName: 'SAA-C03 Solutions Architect',
    imageUrl: '/aws-certs/saa-c03/opengraph-image',
  };

  test('LearningResource와 Article을 함께 선언한다(복수 @type)', () => {
    const ld = buildDayArticleLd(base) as Record<string, unknown>;
    expect(ld['@type']).toEqual(['LearningResource', 'Article']);
  });

  test('isAccessibleForFree가 true다(무료 주차 전용 호출이므로 정직한 선언)', () => {
    const ld = buildDayArticleLd(base) as Record<string, unknown>;
    expect(ld.isAccessibleForFree).toBe(true);
  });

  test('isPartOf.@id가 상위 Course의 courseId와 정확히 일치한다(그래프 연결)', () => {
    const ld = buildDayArticleLd(base) as Record<string, unknown>;
    expect((ld.isPartOf as Record<string, unknown>)['@id']).toBe(courseId('aws-certs', 'saa-c03'));
  });

  test('author·publisher가 organizationRef()와 동일하다(Organization과 이름·URL 불일치 방지)', () => {
    const ld = buildDayArticleLd(base) as Record<string, unknown>;
    expect(ld.author).toEqual(organizationRef());
    expect(ld.publisher).toEqual(organizationRef());
  });

  test('dateModified를 주면 ISO 문자열로 포함한다', () => {
    const mtime = new Date('2026-01-15T00:00:00.000Z');
    const ld = buildDayArticleLd({ ...base, dateModified: mtime }) as Record<string, unknown>;
    expect(ld.dateModified).toBe(mtime.toISOString());
  });

  test('dateModified가 없으면(getDayMtime 실패) 키 자체를 생략한다 — 날짜를 추측해 채우지 않는다', () => {
    const ld = buildDayArticleLd(base) as Record<string, unknown>;
    expect('dateModified' in ld).toBe(false);
    expect('datePublished' in ld).toBe(false);
  });

  test('생성된 페이로드는 JSON.stringify 후 다시 JSON.parse해도 원본과 동일하다(파싱 오류 없음)', () => {
    const mtime = new Date('2026-01-15T00:00:00.000Z');
    const ld = buildDayArticleLd({ ...base, dateModified: mtime });
    expect(JSON.parse(JSON.stringify(ld))).toEqual(ld);
  });
});
