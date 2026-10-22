import { describe, expect, test } from 'vitest';
import type { CertMeta, DayRef } from './content';
import { buildCertTree, linkDayHref, navDayHref } from './navTree';

const meta: CertMeta = {
  slug: 'saa-c03',
  code: 'SAA-C03',
  level: 'associate',
  section: 'aws',
  name: 'Solutions Architect Associate',
  weeks: 2,
  accent: '#fff',
  order: 2,
  dayCount: 3,
  sourceRepo: 'repo',
  syncedAt: '2026-01-01',
};

function day(week: number, d: number, title: string): DayRef {
  return { category: 'aws', slug: 'saa-c03', week, day: d, title, href: `/aws/saa-c03/week${week}/day${d}` };
}

describe('buildCertTree — 사이드바 전송용 축약 트리', () => {
  test('day 를 주차별로 묶고 [day, title] 만 남긴다', () => {
    const tree = buildCertTree(meta, [day(1, 1, 'Day 1 - A'), day(1, 2, 'Day 2 - B'), day(2, 1, 'Day 1 - C')]);

    expect(tree.weeks).toEqual([
      [1, [[1, 'Day 1 - A'], [2, 'Day 2 - B']]],
      [2, [[1, 'Day 1 - C']]],
    ]);
  });

  test('비어 있는 day 번호(파일 없음)는 건너뛴 그대로 유지한다', () => {
    const tree = buildCertTree(meta, [day(1, 1, 'a'), day(1, 3, 'c')]);

    expect(tree.weeks).toEqual([[1, [[1, 'a'], [3, 'c']]]]);
  });

  test('사이드바가 쓰는 메타 필드만 싣는다', () => {
    const tree = buildCertTree(meta, []);

    expect(tree.meta).toEqual({
      slug: 'saa-c03',
      code: 'SAA-C03',
      level: 'associate',
      section: 'aws',
      name: 'Solutions Architect Associate',
    });
    expect(tree.weeks).toEqual([]);
  });

  test('입력 배열을 변경하지 않는다', () => {
    const days = Object.freeze([day(1, 1, 'a')]) as readonly DayRef[];

    expect(() => buildCertTree(meta, days)).not.toThrow();
  });
});

describe('navDayHref — DayRef.href 와 같은 URL 을 복원한다', () => {
  test.each([
    ['aws', 'saa-c03', 1, 1],
    ['linux', 'linux-master-1', 11, 5],
    ['en', 'clf-c02', 2, 3],
  ])('/%s/%s/week%i/day%i', (base, slug, week, d) => {
    expect(navDayHref(base, slug, week, d)).toBe(`/${base}/${slug}/week${week}/day${d}`);
  });

  test('축약 트리에서 복원한 href 가 원본 DayRef.href 와 전부 일치한다', () => {
    const days = [day(1, 1, 'a'), day(1, 2, 'b'), day(2, 4, 'c')];
    const tree = buildCertTree(meta, days);

    const restored = tree.weeks.flatMap(([w, ds]) => ds.map(([d]) => navDayHref('aws', tree.meta.slug, w, d)));

    expect(restored).toEqual(days.map((d) => d.href));
  });
});

describe('linkDayHref — 화면에 거는 day 링크', () => {
  test('색인 대상 day 는 자기 주소 그대로', () => {
    expect(linkDayHref('aws', 'saa-c03', 3, 2)).toBe('/aws/saa-c03/week3/day2');
    expect(linkDayHref('linux', 'linux-master-1', 11, 5)).toBe('/linux/linux-master-1/week11/day5');
    expect(linkDayHref('en', 'saa-c03', 1, 4)).toBe('/en/saa-c03/week1/day4');
  });

  test('번역이 덜 된 영어판 주차(noindex)는 한국어 원문으로 보낸다', () => {
    expect(linkDayHref('en', 'saa-c03', 2, 1)).toBe('/aws/saa-c03/week2/day1');
    expect(linkDayHref('en', 'dop-c02', 16, 5)).toBe('/aws/dop-c02/week16/day5');
  });
});
