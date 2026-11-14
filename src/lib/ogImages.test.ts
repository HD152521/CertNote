import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { enRootMetadata, koRootMetadata } from '@/lib/rootMetadata';
import { DEFAULT_OG_IMAGE, certOgImage, certOgImagePath } from '@/lib/ogImages';
import { dayRouteMetadata } from '@/lib/day/dayRoute';
import { generateMetadata as hubMetadata } from '../app/(ko)/[category]/[slug]/page';

// OG 이미지 URL 은 이미 배포된 옛 경로 그대로여야 한다(day 페이지 ~1,580개가 박아 둠). 라우트 그룹 안의 파일 규칙
// (opengraph-image.tsx)은 경로에 해시 접미사가 붙어 URL 이 바뀌므로 같은 URL 의 라우트 핸들러를 쓴다.
const APP = join(__dirname, '..', 'app');
const LEGACY_PATH = /^\/(?:(?:aws|linux|data|en)\/[a-z0-9-]+\/)?opengraph-image$/;
const HASHED = /opengraph-image-[0-9a-z]+/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('OG 이미지 — 옛 URL 유지', () => {
  test('옛 경로마다 라우트 핸들러가 있다', () => {
    for (const rel of ['(ko)/opengraph-image/route.tsx', '(ko)/[category]/[slug]/opengraph-image/route.tsx', '(en)/en/[slug]/opengraph-image/route.tsx']) {
      expect(existsSync(join(APP, rel)), rel).toBe(true);
    }
  });

  test('파일 규칙 이미지(opengraph-image.tsx·twitter-image.tsx)가 src/app 에 없다 — 해시 접미사 URL 이 생긴다', () => {
    const offenders = walk(APP).filter((f) => /[\/](opengraph|twitter)-image\.(tsx?|jsx?|png|jpg)$/.test(f));
    expect(offenders).toEqual([]);
  });

  test('기본 카드·자격증 카드 경로가 옛 패턴이다', () => {
    expect(DEFAULT_OG_IMAGE.url).toBe('/opengraph-image');
    expect(certOgImagePath('aws', 'saa-c03')).toBe('/aws/saa-c03/opengraph-image');
    expect(certOgImagePath('en', 'sqld')).toBe('/en/sqld/opengraph-image');
    expect(certOgImage('en', 'sqld')).toMatchObject({ width: 1200, height: 630, type: 'image/png', alt: 'CertNote certification study track' });
  });

  test.each([['ko', koRootMetadata], ['en', enRootMetadata]] as const)('%s 루트 metadata 의 og 이미지', (_l, meta) => {
    const urls = (meta.openGraph?.images as { url: string }[]).map((i) => i.url);
    expect(urls).toEqual(['/opengraph-image']);
  });

  test('허브 generateMetadata 의 og 이미지가 옛 경로다(ko·en)', async () => {
    for (const [category, slug] of [['aws', 'saa-c03'], ['en', 'saa-c03']] as const) {
      const meta = await hubMetadata({ params: Promise.resolve({ category, slug }) });
      const url = (meta.openGraph?.images as { url: string }[])[0].url;
      expect(url).toBe(`/${category}/${slug}/opengraph-image`);
      expect(url).toMatch(LEGACY_PATH);
      expect(url).not.toMatch(HASHED);
    }
  });

  test('day generateMetadata 의 og 이미지가 옛 경로다', async () => {
    const meta = await dayRouteMetadata('aws', { slug: 'saa-c03', week: 'week1', day: 'day1' } as never);
    const image = (meta.openGraph?.images as string[])[0];
    expect(image).toBe('/aws/saa-c03/opengraph-image');
  });
});
