import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { INDEXNOW_KEY, buildPayloads, parseSitemap, selectUrls } from './indexnow.mjs';

const HOST = 'cert.juganlab.com';
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://cert.juganlab.com/</loc><lastmod>2026-11-09T00:00:00.000Z</lastmod></url>
<url><loc>https://cert.juganlab.com/data/sqld</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></url>
<url><loc>https://cert.juganlab.com/lab</loc></url>
<url><loc>https://other.example.com/x</loc><lastmod>2026-11-09</lastmod></url>
</urlset>`;

describe('IndexNow', () => {
  test('키 파일이 사이트 루트에 있고 내용이 키와 같다 (소유 확인)', () => {
    const body = readFileSync(join(process.cwd(), 'public', `${INDEXNOW_KEY}.txt`), 'utf8');
    expect(body.trim()).toBe(INDEXNOW_KEY);
  });

  test('사이트맵에서 loc 과 lastmod 를 뽑는다', () => {
    const entries = parseSitemap(XML);
    expect(entries).toHaveLength(4);
    expect(entries[2]).toEqual({ loc: 'https://cert.juganlab.com/lab', lastmod: null });
  });

  test('다른 호스트의 URL 은 뺀다', () => {
    const urls = selectUrls(parseSitemap(XML), { host: HOST });
    expect(urls).toEqual(['https://cert.juganlab.com/', 'https://cert.juganlab.com/data/sqld', 'https://cert.juganlab.com/lab']);
  });

  test('since 를 주면 그 날 이후 바뀐 URL 만 고른다 (lastmod 없는 건 제외)', () => {
    const urls = selectUrls(parseSitemap(XML), { host: HOST, since: '2026-11-01' });
    expect(urls).toEqual(['https://cert.juganlab.com/']);
  });

  test('since 형식이 틀리면 조용히 넘어가지 않고 멈춘다', () => {
    expect(() => selectUrls([], { host: HOST, since: 'yesterday' })).toThrow();
  });

  test('배치 크기로 나누고 keyLocation 을 붙인다', () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://${HOST}/p${i}`);
    const payloads = buildPayloads(urls, { host: HOST, batch: 2 });
    expect(payloads.map((p) => p.urlList.length)).toEqual([2, 2, 1]);
    expect(payloads[0].keyLocation).toBe(`https://${HOST}/${INDEXNOW_KEY}.txt`);
    expect(payloads[0].key).toBe(INDEXNOW_KEY);
  });
});
