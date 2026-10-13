import { gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import * as shardRoute from '@/app/api/search/[cert]/route';
import * as manifestRoute from '@/app/api/search/route';
import { listShardKeys } from './build';

// 검색 엔드포인트는 정적·캐시 가능해야 하고, 샤드 키는 실제 목록(+현재 내용 해시)으로만 열려야 한다.
const FIRST_OPEN_BUDGET_GZIP = 300 * 1024;
const ctx = (cert: string) => ({ params: Promise.resolve({ cert }) });

describe('검색 라우트 - 정적 + 임의 키 캐시 방지', () => {
  test('두 라우트 모두 force-static 이다', () => {
    expect(manifestRoute.dynamic).toBe('force-static');
    expect(shardRoute.dynamic).toBe('force-static');
  });

  test('샤드 라우트는 dynamicParams=false(목록 밖 키는 렌더 없이 404)', () => {
    expect(shardRoute.dynamicParams).toBe(false);
  });

  test('generateStaticParams 는 실제 샤드 키 전부와 정확히 일치한다', async () => {
    const params = await shardRoute.generateStaticParams();
    expect(params.map((p) => p.cert).sort()).toEqual((await listShardKeys('ko')).sort());
  });

  test('핸들러: 유효 키 200 + 영구 캐시 헤더, 미지 키·해시 없는 slug·낡은 해시는 404', async () => {
    const [key] = await listShardKeys('ko');
    const ok = await shardRoute.GET(new Request('http://x/api/search/k'), ctx(key));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const body = await ok.json();
    expect(body.v).toBe(2);
    expect(`${body.slug}.`).toBe(key.slice(0, key.lastIndexOf('.') + 1));
    for (const bad of ['nope', '../x', '', key.split('.')[0], `${key.split('.')[0]}.0000000000`]) {
      const res = await shardRoute.GET(new Request('http://x/api/search/x'), ctx(bad));
      expect(res.status, bad).toBe(404);
    }
  });
});

describe('매니페스트 응답(첫 오픈 페이로드)', () => {
  test('실제 GET() 응답의 gzip 크기가 예산 이하이고 본문(사전)을 싣지 않는다', async () => {
    const res = await manifestRoute.GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    const gz = gzipSync(text).length;
    expect(gz, `GET() gzip ${gz}B`).toBeLessThanOrEqual(FIRST_OPEN_BUDGET_GZIP);
    const json = JSON.parse(text);
    expect(json.certs.length).toBe(13);
    expect(text).not.toContain('"dict"');
    expect(text).not.toContain('"days":[[1,1,"0');
    for (const c of json.certs) for (const day of c.days) {
      expect(day).toHaveLength(3);
      expect(typeof day[2]).toBe('string');
      expect(day[2].length).toBeLessThan(200); // 제목 길이 - 본문이 끼어들면 걸린다
    }
  });
});
