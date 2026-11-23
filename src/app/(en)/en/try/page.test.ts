import { describe, expect, test } from 'vitest';
import { metadata } from './page';
import { metadata as koMetadata } from '../../../(ko)/try/page';
import sitemap from '@/app/sitemap';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('/en/try 메타데이터', () => {
  test('noindex·follow, canonical 자기 자신, hreflang 없음', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/en/try');
    expect(metadata.alternates?.languages).toBeUndefined();
  });

  test('제목·설명에 한글이 없다', () => {
    expect(HANGUL.test(`${metadata.title} ${metadata.description}`)).toBe(false);
  });

  test('한국어 /try 도 noindex 를 유지한다', () => {
    expect(koMetadata.robots).toEqual({ index: false, follow: true });
  });

  test('사이트맵에 /try, /en/try 가 없다', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => /\/(en\/)?try(\?|$)/.test(u))).toBe(false);
  }, 30_000);
});
