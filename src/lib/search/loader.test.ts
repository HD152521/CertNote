import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadManifest, loadShard, loadShards, resetSearchCache, SHARD_CONCURRENCY, shardUrl } from './loader';
import type { SearchShard } from './model';

const shard = (key: string): SearchShard => ({ v: 2, slug: key.slice(0, key.lastIndexOf('.')), dict: 'a b', days: [[2, 1, '0,1']] });
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
const slugOf = (u: RequestInfo | URL) => String(u).split('/').pop()!;
const asFetch = (f: unknown) => f as typeof fetch;

afterEach(() => resetSearchCache());

describe('샤드 로더', () => {
  test('받은 샤드는 다시 받지 않는다', async () => {
    const fetcher = vi.fn(async (u: RequestInfo | URL) => ok(shard(slugOf(u))));
    await loadShard('saa-c03.abc1234567', asFetch(fetcher));
    await loadShard('saa-c03.abc1234567', asFetch(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(shardUrl('saa-c03.abc1234567'));
  });

  test('동시에 같은 샤드를 요청해도 네트워크는 한 번이다', async () => {
    const fetcher = vi.fn(async () => ok(shard('saa-c03.abc1234567')));
    await Promise.all([loadShard('saa-c03.abc1234567', asFetch(fetcher)), loadShard('saa-c03.abc1234567', asFetch(fetcher))]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['네트워크 오류', async () => { throw new Error('offline'); }],
    ['404', async () => new Response('nf', { status: 404 })],
    ['JSON 아님', async () => new Response('<html>', { status: 200 })],
    ['형식 불일치', async () => ok({ v: 2, slug: 'other', dict: '', days: [] })],
  ])('%s 는 null 이고 캐시하지 않아 다음에 다시 시도한다', async (_n, bad) => {
    expect(await loadShard('saa-c03.abc1234567', asFetch(bad))).toBeNull();
    const good = vi.fn(async () => ok(shard('saa-c03.abc1234567')));
    expect(await loadShard('saa-c03.abc1234567', asFetch(good))).toEqual(shard('saa-c03.abc1234567'));
    expect(good).toHaveBeenCalledTimes(1);
  });

  test('loadShards: 일부 실패해도 나머지는 도착하는 대로 전달하고 예외를 던지지 않는다', async () => {
    const fetcher = async (u: RequestInfo | URL) => (slugOf(u).startsWith('bad.') ? new Response('x', { status: 500 }) : ok(shard(slugOf(u))));
    const got: string[] = [];
    await loadShards(['a.1', 'bad.1', 'b.1'], (s) => got.push(s.slug), asFetch(fetcher));
    expect(got.sort()).toEqual(['a', 'b']);
  });

  test('loadShards: 동시 요청 수는 SHARD_CONCURRENCY 를 넘지 않는다', async () => {
    let running = 0;
    let peak = 0;
    const fetcher = async (u: RequestInfo | URL) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return ok(shard(slugOf(u)));
    };
    await loadShards(Array.from({ length: 10 }, (_, i) => `c${i}.h`), () => {}, asFetch(fetcher));
    expect(peak).toBeLessThanOrEqual(SHARD_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  test('loadShards: 이미 받은 샤드는 다시 받지 않는다', async () => {
    const fetcher = vi.fn(async (u: RequestInfo | URL) => ok(shard(slugOf(u))));
    await loadShards(['a.1', 'b.1'], () => {}, asFetch(fetcher));
    await loadShards(['a.1', 'b.1', 'c.1'], () => {}, asFetch(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test('loadShards: 취소되면 샤드를 받지 않는다', async () => {
    const fetcher = vi.fn(async (u: RequestInfo | URL) => ok(shard(slugOf(u))));
    await loadShards(['a.1', 'b.1'], () => {}, asFetch(fetcher), () => true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('매니페스트 로더', () => {
  const manifest = { v: 2, certs: [{ slug: 's', code: 'S', name: 'S', level: 'associate', base: 'aws', h: 'abc', days: [[1, 1, 'T']] }] };

  test('성공하면 엔트리로 펼치고 캐시한다', async () => {
    const fetcher = vi.fn(async () => ok(manifest));
    const a = await loadManifest(asFetch(fetcher));
    await loadManifest(asFetch(fetcher));
    expect(a?.entries[0].href).toBe('/aws/s/week1/day1');
    expect(a?.certs[0].h).toBe('abc');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('실패하면 null 이고 캐시하지 않는다', async () => {
    expect(await loadManifest(asFetch(async () => new Response('x', { status: 500 })))).toBeNull();
    expect(await loadManifest(asFetch(async () => ok(manifest)))).not.toBeNull();
  });
});

describe('낡은 매니페스트 복구 - 샤드 404', () => {
  const certsWith = (h: string) => ({ v: 2, certs: [{ slug: 'saa-c03', code: 'S', name: 'S', level: 'associate', base: 'aws', h, days: [[1, 1, 'T']] }] });
  const jsonRes = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });

  // 서버 시뮬레이션: 현재 배포의 해시는 'new', 탭이 들고 있는 매니페스트는 'old'.
  function server(currentHash: string) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      calls.push({ url, init });
      if (url === '/api/search') return jsonRes(certsWith(currentHash));
      const key = url.split('/').pop()!;
      return key === `saa-c03.${currentHash}` ? jsonRes(shard(key)) : new Response('nf', { status: 404 });
    };
    return { calls, fetcher: asFetch(fetcher) };
  }

  test('낡은 해시가 404 면 매니페스트를 캐시 우회로 한 번 다시 받고 새 해시로 재시도해 성공한다', async () => {
    await loadManifest(asFetch(async () => jsonRes(certsWith('old'))));
    const { calls, fetcher } = server('new');
    const result = await loadShard('saa-c03.old', fetcher);
    expect(result?.slug).toBe('saa-c03');
    expect(calls.map((c) => c.url)).toEqual(['/api/search/saa-c03.old', '/api/search', '/api/search/saa-c03.new']);
    expect(calls[1].init?.cache).toBe('reload');
    // 갱신된 매니페스트가 캐시돼 이후 열기는 새 해시를 쓴다.
    const reopened = await loadManifest(fetcher);
    expect(reopened?.certs[0].h).toBe('new');
    expect(calls).toHaveLength(3);
  });

  test('새 해시도 404 면 더 돌지 않고 null 이다(무한 루프 없음)', async () => {
    await loadManifest(asFetch(async () => jsonRes(certsWith('old'))));
    const calls: string[] = [];
    const fetcher = async (u: RequestInfo | URL) => {
      calls.push(String(u));
      return String(u) === '/api/search' ? jsonRes(certsWith('newer')) : new Response('nf', { status: 404 });
    };
    expect(await loadShard('saa-c03.old', asFetch(fetcher))).toBeNull();
    expect(calls).toEqual(['/api/search/saa-c03.old', '/api/search', '/api/search/saa-c03.newer']);
  });

  test('서버가 같은 해시를 가리키면(진짜로 없음) 재시도하지 않는다', async () => {
    await loadManifest(asFetch(async () => jsonRes(certsWith('same'))));
    const calls: string[] = [];
    const fetcher = async (u: RequestInfo | URL) => {
      calls.push(String(u));
      return String(u) === '/api/search' ? jsonRes(certsWith('same')) : new Response('nf', { status: 404 });
    };
    expect(await loadShard('saa-c03.same', asFetch(fetcher))).toBeNull();
    expect(calls).toEqual(['/api/search/saa-c03.same', '/api/search']);
  });

  test('여러 샤드가 동시에 404 여도 매니페스트 재요청은 한 번이다', async () => {
    const manifest = { v: 2, certs: ['a', 'b', 'c'].map((slug) => ({ slug, code: slug, name: slug, level: 'x', base: 'aws', h: 'old', days: [[1, 1, 'T']] })) };
    await loadManifest(asFetch(async () => jsonRes(manifest)));
    let manifestFetches = 0;
    const fetcher = async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url === '/api/search') { manifestFetches++; return jsonRes({ ...manifest, certs: manifest.certs.map((c) => ({ ...c, h: 'new' })) }); }
      const key = url.split('/').pop()!;
      return key.endsWith('.new') ? jsonRes(shard(key)) : new Response('nf', { status: 404 });
    };
    const got: string[] = [];
    await loadShards(['a.old', 'b.old', 'c.old'], (s) => got.push(s.slug), asFetch(fetcher));
    expect(got.sort()).toEqual(['a', 'b', 'c']);
    expect(manifestFetches).toBe(1);
  });

  test('복구로 매니페스트가 갱신된 뒤 낡은 키로 시작한 요청은 404 를 맞지 않고 새 해시를 바로 쓴다', async () => {
    const two = (h: string) => ({ v: 2, certs: ['a', 'b'].map((slug) => ({ slug, code: slug, name: slug, level: 'x', base: 'aws', h, days: [[1, 1, 'T']] })) });
    await loadManifest(asFetch(async () => jsonRes(two('old'))));
    let manifestFetches = 0;
    const urls: string[] = [];
    const fetcher = async (u: RequestInfo | URL) => {
      const url = String(u);
      urls.push(url);
      if (url === '/api/search') { manifestFetches++; return jsonRes(two('new')); }
      const key = url.split('/').pop()!;
      return key.endsWith('.new') ? jsonRes(shard(key)) : new Response('nf', { status: 404 });
    };
    await loadShard('a.old', asFetch(fetcher)); // 복구 발생
    urls.length = 0;
    expect((await loadShard('b.old', asFetch(fetcher)))?.slug).toBe('b');
    expect(urls).toEqual(['/api/search/b.new']);
    expect(manifestFetches).toBe(1);
  });

  test('네트워크 오류·500 은 복구 경로를 타지 않는다(매니페스트를 다시 받지 않는다)', async () => {
    await loadManifest(asFetch(async () => jsonRes(certsWith('old'))));
    const fetcher = vi.fn(async () => new Response('x', { status: 500 }));
    expect(await loadShard('saa-c03.old', asFetch(fetcher))).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
