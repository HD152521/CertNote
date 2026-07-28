import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { SITE_URL } from '@/lib/site';
import sitemap from './sitemap';

// docs/SEO-indexing-fix-plan.md Step6 회귀 테스트.
describe('sitemap', () => {
  test('/privacy가 사이트맵에 포함된다(누락 회귀 방지)', async () => {
    const entries = await sitemap();
    const privacy = entries.find((e) => e.url.endsWith('/privacy'));
    expect(privacy).toBeDefined();
  });

  test('robots.txt로 차단된 라우트는 사이트맵에 없다', async () => {
    const entries = await sitemap();
    const blocked = ['/admin', '/account', '/dashboard', '/review', '/notebook', '/exam', '/login', '/signup', '/forgot', '/reset', '/verify', '/welcome'];
    for (const path of blocked) {
      expect(entries.some((e) => e.url.endsWith(path))).toBe(false);
    }
  });

  test('Week2+(유료) day 페이지는 사이트맵에서 제외된다', async () => {
    const entries = await sitemap();
    const paidDay = entries.find((e) => /\/week[2-9]\/day/.test(e.url) || /\/week1[0-9]\/day/.test(e.url));
    expect(paidDay).toBeUndefined();
  });

  test('무료 주차 상한(FREE_WEEK) 밖의 URL이 없다 — 정책 상수와 항상 일치', async () => {
    const entries = await sitemap();
    for (const e of entries) {
      const m = e.url.match(/\/week(\d+)\/day\d+$/);
      if (m) expect(Number(m[1])).toBeLessThanOrEqual(FREE_WEEK);
    }
  });

  // 핵심 수용 기준: 같은 커밋을 두 번 빌드하면 lastmod가 같아야 한다. 여기선 같은 프로세스 내에서
  // sitemap()을 두 번 호출해 결정성을 검증한다(파일이 그대로면 mtime도 그대로 → lastModified 동일).
  test('같은 콘텐츠에 대해 두 번 호출해도 모든 lastModified가 동일하다(결정성)', async () => {
    const first = await sitemap();
    const second = await sitemap();

    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i].lastModified;
      const b = second[i].lastModified;
      expect(second[i].url).toBe(first[i].url);
      expect(a ? new Date(a).getTime() : undefined).toBe(b ? new Date(b).getTime() : undefined);
    }
  });

  test('모든 lastModified가 new Date() 대신 고정된(과거) 값이다 — 매 호출마다 "지금"으로 갱신되지 않는다', async () => {
    const before = Date.now();
    const entries = await sitemap();
    for (const e of entries) {
      const lm = e.lastModified;
      expect(lm).toBeDefined();
      // new Date()였다면 항상 "지금" 근처였을 것 — 매니페스트의 git 커밋 시각(과거)이어야 한다.
      expect(new Date(lm as string | Date).getTime()).toBeLessThanOrEqual(before);
    }
  });

  // docs/SEO-indexing-fix-plan.md Step6 후속 회귀 테스트: 매니페스트 값이 사이트맵에 그대로
  // 반영되는지(가공 없이 그대로) 검증한다. 매니페스트 부재 시 생략 검증은 별도 파일
  // sitemap.manifest-absence.test.ts에서 한다(vi.mock 파일 단위 호이스팅 격리 때문).
  test('day 페이지의 lastModified가 매니페스트의 해당 파일 ISO 시각과 정확히 일치한다', async () => {
    const manifestRaw = await fs.readFile(path.join(process.cwd(), 'src', 'data', 'content-manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw) as { files: Record<string, string> };
    const expectedIso = manifest.files['content/aws-certs/saa-c03/week1/day1.md'];
    expect(expectedIso).toBeDefined();

    const entries = await sitemap();
    const day1 = entries.find((e) => e.url.endsWith('/aws-certs/saa-c03/week1/day1'));

    expect(day1).toBeDefined();
    expect(new Date(day1?.lastModified as string | Date).getTime()).toBe(new Date(expectedIso).getTime());
  });

  test('홈의 lastModified가 매니페스트의 src/app/page.tsx ISO 시각과 정확히 일치한다(자격증 meta.json보다 최신인 경우)', async () => {
    const manifestRaw = await fs.readFile(path.join(process.cwd(), 'src', 'data', 'content-manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw) as { files: Record<string, string> };
    const pageIso = manifest.files['src/app/page.tsx'];
    expect(pageIso).toBeDefined();

    const entries = await sitemap();
    const home = entries.find((e) => e.url === SITE_URL);

    expect(home).toBeDefined();
    // page.tsx 자체가 가장 최근에 바뀌었다면(이번 SEO 수정처럼) 홈의 lastModified가 그 시각 이상이어야 한다.
    expect(new Date(home?.lastModified as string | Date).getTime()).toBeGreaterThanOrEqual(new Date(pageIso).getTime());
  });
});
