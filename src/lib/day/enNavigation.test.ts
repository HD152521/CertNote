import { describe, expect, test } from 'vitest';
import sitemap from '@/app/sitemap';
import { EN_CATEGORY } from '@/lib/category';
import { getAllDays, getDay, getPresentableDays, listCerts } from '@/lib/content';
import { buildNavTrees } from '@/lib/navTrees';
import { SITE_URL } from '@/lib/site';
import { buildDayMetadata } from './metadata';
import { buildDayStructuredData } from './structuredData';
import { enPresentableWeek, isEnPresentableDay } from './presentable';

// 영어 내비게이션·메타데이터·사이트맵이 전부 같은 "보여줄 수 있는가" 판정을 쓰는지 검증한다.
// 한도는 파일에서 도출되므로 특정 자격증의 주차 수를 하드코딩하지 않고 한도에 상대적으로 단언한다.
const TIMEOUT = 60_000;

describe('getPresentableDays', () => {
  test('영어는 한도 이하의 day 만 돌려주고 한도 밖 day 는 getAllDays 에는 있다(존재와 노출은 별개)', { timeout: TIMEOUT }, async () => {
    for (const cert of await listCerts(EN_CATEGORY)) {
      const limit = enPresentableWeek(cert.slug);
      const shown = await getPresentableDays(EN_CATEGORY, cert.slug);
      expect(shown.length, cert.slug).toBeGreaterThan(0);
      for (const d of shown) expect(d.week, d.href).toBeLessThanOrEqual(limit);
      const all = await getAllDays(EN_CATEGORY, cert.slug);
      expect(shown.length).toBe(all.filter((d) => d.week <= limit).length);
    }
    expect((await getAllDays(EN_CATEGORY, 'saa-c03')).length).toBeGreaterThan((await getPresentableDays(EN_CATEGORY, 'saa-c03')).length);
  });

  test('한국어는 getAllDays 와 완전히 같다(한국어 내비게이션 불변)', { timeout: TIMEOUT }, async () => {
    for (const section of ['aws', 'linux'] as const) {
      for (const cert of await listCerts(section)) {
        expect(await getPresentableDays(section, cert.slug)).toEqual(await getAllDays(section, cert.slug));
      }
    }
  });
});

describe('buildNavTrees — 사이드바/모바일 드로어 트리', () => {
  test('영어 트리에는 보여줄 수 없는 day 로 가는 링크가 없다', { timeout: TIMEOUT }, async () => {
    const { enCertTrees } = await buildNavTrees(await listCerts('aws'));
    expect(enCertTrees.length).toBe(11);
    for (const t of enCertTrees) {
      expect(t.days.length).toBeGreaterThan(0);
      for (const d of t.days) {
        expect(d.href).toMatch(/^\/en\//);
        expect(isEnPresentableDay(t.meta.slug, d.week), d.href).toBe(true);
      }
    }
  });

  test('한국어 트리는 전 주차를 유지한다', { timeout: TIMEOUT }, async () => {
    const certs = await listCerts('aws');
    const { certTrees } = await buildNavTrees(certs);
    const saa = certTrees.find((t) => t.meta.slug === 'saa-c03');
    expect(saa?.days.some((d) => d.week >= 2)).toBe(true);
    expect(saa?.days.length).toBe((await getAllDays('aws', 'saa-c03')).length);
  });
});

describe('getDay 이전/다음', () => {
  test('영어 마지막 노출 day 의 "다음"은 한도 밖 day 로 이어지지 않는다', { timeout: TIMEOUT }, async () => {
    for (const cert of await listCerts(EN_CATEGORY)) {
      const limit = enPresentableWeek(cert.slug);
      const shown = await getPresentableDays(EN_CATEGORY, cert.slug);
      const last = shown[shown.length - 1];
      const content = await getDay(EN_CATEGORY, cert.slug, last.week, last.day);
      expect(content?.next, `${cert.slug} 마지막 day 의 next`).toBeNull();
      expect(content?.prev === null || content!.prev.week <= limit).toBe(true);
    }
  });

  test('영어 노출 day 어디서든 prev/next 는 노출 가능한 day 뿐이고 주차 경계는 이어진다', { timeout: TIMEOUT }, async () => {
    for (const cert of await listCerts(EN_CATEGORY)) {
      const shown = await getPresentableDays(EN_CATEGORY, cert.slug);
      for (const [i, ref] of shown.entries()) {
        const c = await getDay(EN_CATEGORY, cert.slug, ref.week, ref.day);
        expect(c?.prev?.href ?? null, `${ref.href} prev`).toBe(shown[i - 1]?.href ?? null);
        expect(c?.next?.href ?? null, `${ref.href} next`).toBe(shown[i + 1]?.href ?? null);
      }
    }
  });

  test('한국어 마지막 week1 day 의 next 는 week2 로 이어진다(한국어 불변)', async () => {
    const all = await getAllDays('aws', 'saa-c03');
    const lastW1 = [...all].filter((d) => d.week === 1).pop()!;
    const c = await getDay('aws', 'saa-c03', 1, lastW1.day);
    expect(c?.next?.week).toBe(2);
  });
});

describe('영어 사이트맵·hreflang·JSON-LD 일관성', () => {
  test('사이트맵의 영어 day 집합 = 노출 가능한 day 집합(정확히 일치)', { timeout: TIMEOUT }, async () => {
    const entries = await sitemap();
    const inMap = new Set(entries.map((e) => e.url).filter((u) => /\/en\/[^/]+\/week\d+\/day\d+$/.test(u)));
    const expected = new Set<string>();
    for (const cert of await listCerts(EN_CATEGORY)) {
      for (const d of await getPresentableDays(EN_CATEGORY, cert.slug)) expected.add(`${SITE_URL}${d.href}`);
    }
    expect(inMap).toEqual(expected);
  });

  test('영어 day(자격증별 경계 양쪽 표본): 노출 가능 <=> 색인 메타(robots 없음, 자기참조 canonical, ko 짝 hreflang)·JSON-LD 있음', { timeout: TIMEOUT }, async () => {
    for (const cert of await listCerts(EN_CATEGORY)) {
      // getDay 가 매번 전체 day 를 다시 읽으므로(테스트 환경은 메모이즈 없음) 경계 양쪽 표본만 본다.
      const all = await getAllDays(EN_CATEGORY, cert.slug);
      const limit = enPresentableWeek(cert.slug);
      const inside = all.filter((d) => d.week <= limit);
      const outside = all.filter((d) => d.week > limit);
      const sample = [inside[0], inside[inside.length - 1], outside[0], outside[outside.length - 1]].filter((d) => d !== undefined);
      for (const ref of sample) {
        const presentable = isEnPresentableDay(cert.slug, ref.week);
        const meta = await buildDayMetadata(EN_CATEGORY, cert.slug, ref.week, ref.day);
        const content = (await getDay(EN_CATEGORY, cert.slug, ref.week, ref.day))!;
        const ld = await buildDayStructuredData(EN_CATEGORY, cert.slug, ref.week, ref.day, 'en', content);
        if (presentable) {
          expect(meta.robots, ref.href).toBeUndefined();
          expect(meta.alternates?.canonical).toBe(ref.href);
          expect(meta.alternates?.languages, ref.href).toMatchObject({ en: ref.href, ko: `/aws/${cert.slug}/week${ref.week}/day${ref.day}` });
          expect(ld.articleLd, ref.href).not.toBeNull();
          expect(ld.breadcrumbLd, ref.href).not.toBeNull();
        } else {
          expect(meta.robots, ref.href).toBe('noindex, nofollow');
          expect(meta.alternates?.languages, ref.href).toBeUndefined();
          expect(ld.articleLd, ref.href).toBeNull();
          expect(ld.breadcrumbLd, ref.href).toBeNull();
        }
      }
    }
  });

  test('한국어 day 의 en 짝 hreflang 은 영어 쪽이 노출 가능할 때만 붙는다', { timeout: TIMEOUT }, async () => {
    for (const slug of ['saa-c03', 'dea-c01']) {
      const limit = enPresentableWeek(slug);
      const inside = await buildDayMetadata('aws', slug, limit, 1);
      expect(inside.alternates?.languages, `${slug} week${limit}`).toMatchObject({ en: `/en/${slug}/week${limit}/day1` });
      const outside = await buildDayMetadata('aws', slug, limit + 1, 1);
      expect(outside.alternates?.languages, `${slug} week${limit + 1}`).toBeUndefined();
    }
  });
});
