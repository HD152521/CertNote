import type { NextConfig } from 'next';
import { describe, expect, test } from 'vitest';
import nextConfig from '../../next.config';
import { classifyPath } from './proxyRouting';
import { EN_EDITION_NON_AWS } from './enEdition';
import sitemap from '@/app/sitemap';
import { SITE_URL } from './site';

// docs/growth/next-work-plan-2026-11-14.md Step 1 — 영어 URL 에는 카테고리가 없어 /en/aws 등은 존재하지 않는다.
const CATEGORY_PATHS = ['/en/aws', '/en/linux', '/en/data'] as const;

async function loadRedirects(): Promise<Array<{ source: string; destination: string; permanent?: boolean; has?: unknown }>> {
  return (await (nextConfig as NextConfig).redirects?.()) ?? [];
}

describe('/en/<카테고리> 리다이렉트', () => {
  test.each(CATEGORY_PATHS)('%s 는 /en 으로 308 영구 이동한다', async (path) => {
    const rule = (await loadRedirects()).find((r) => r.source === path);
    expect(rule).toMatchObject({ destination: '/en', permanent: true });
    expect(rule && 'has' in rule ? rule.has : undefined).toBeUndefined();
  });

  test('/en 하위의 다른 경로에는 리다이렉트 규칙이 없다', async () => {
    const enSources = (await loadRedirects()).map((r) => r.source).filter((s) => s === '/en' || s.startsWith('/en/'));
    expect(enSources.sort()).toEqual([...CATEGORY_PATHS].sort());
  });

  test('프록시 분류는 그대로다(/en/saa-c03/... 은 content, /en/about 은 pass)', () => {
    expect(classifyPath('/en/saa-c03/week1/day1')).toBe('content');
    expect(classifyPath('/en/sqld')).toBe('content');
    expect(classifyPath('/en/about')).toBe('pass');
    expect(classifyPath('/en/lab')).toBe('pass');
  });

  test('aws·linux·data 는 영어 자격증 슬러그가 아니다', () => {
    for (const slug of ['aws', 'linux', 'data']) expect(EN_EDITION_NON_AWS[slug]).toBeUndefined();
  });

  test('사이트맵에 포함되지 않는다', { timeout: 30000 }, async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of CATEGORY_PATHS) expect(urls).not.toContain(`${SITE_URL}${path}`);
  });
});
