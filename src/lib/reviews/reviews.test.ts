import { describe, expect, test } from 'vitest';
import { maskName } from './reviewsRepository';
import { buildCourseReviewLd } from '../structuredData';
import { SITE_URL } from '../site';

describe('maskName — 작성자 이름 마스킹(PII 보호)', () => {
  test('첫 글자만 남기고 이후는 별표', () => {
    expect(maskName('홍길동')).toBe('홍**');
    expect(maskName('김철수')).toBe('김**');
    expect(maskName('Lee')).toBe('L**');
  });
  test('한 글자는 별표 하나', () => {
    expect(maskName('A')).toBe('A*');
  });
  test('긴 이름도 별표는 최대 3개', () => {
    expect(maskName('Alexander')).toBe('A***');
  });
  test('없거나 공백이면 익명', () => {
    expect(maskName(null)).toBe('익명');
    expect(maskName('')).toBe('익명');
    expect(maskName('   ')).toBe('익명');
  });
});

describe('buildCourseReviewLd — 후기 구조화 데이터', () => {
  const base = {
    section: 'aws',
    slug: 'saa-c03',
    code: 'SAA-C03',
    name: 'Solutions Architect Associate',
    count: 2,
    average: 4.5,
    reviews: [
      { rating: 5, authorName: '홍**', title: '한번에 합격', body: '좋았어요', datePublished: '2026-07-30' },
      { rating: 4, authorName: '김**', title: null, body: '도움이 됐습니다', datePublished: '2026-07-29' },
    ],
  };

  test('Course + AggregateRating + Review 를 매핑한다', () => {
    const ld = buildCourseReviewLd(base) as {
      '@type': string;
      '@id': string;
      aggregateRating: { ratingValue: number; reviewCount: number; bestRating: number };
      review: { reviewRating: { ratingValue: number }; author: { name: string }; reviewBody: string; name?: string }[];
    };
    expect(ld['@type']).toBe('Course');
    expect(ld['@id']).toBe(`${SITE_URL}/aws/saa-c03#course`);
    expect(ld.aggregateRating.ratingValue).toBe(4.5);
    expect(ld.aggregateRating.reviewCount).toBe(2);
    expect(ld.aggregateRating.bestRating).toBe(5);
    expect(ld.review).toHaveLength(2);
    expect(ld.review[0].reviewRating.ratingValue).toBe(5);
    expect(ld.review[0].author.name).toBe('홍**');
    expect(ld.review[0].reviewBody).toBe('좋았어요');
    expect(ld.review[0].name).toBe('한번에 합격');
  });

  test('제목이 없는 후기는 name 필드를 넣지 않는다', () => {
    const ld = buildCourseReviewLd(base) as { review: { name?: string }[] };
    expect(ld.review[1].name).toBeUndefined();
  });

  test('@id가 cert 허브 Course와 동일해 같은 엔티티로 묶인다', () => {
    const ld = buildCourseReviewLd({ ...base, section: 'linux', slug: 'linux-master-1' }) as { '@id': string };
    expect(ld['@id']).toBe(`${SITE_URL}/linux/linux-master-1#course`);
  });
});
