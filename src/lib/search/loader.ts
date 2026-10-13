import { prepareShard } from './searcher';
import { expandManifest, isShard, parseManifest, shardKey, slugOfShardKey, type ManifestCert, type SearchBodyEntry, type SearchShard } from './model';

// 검색 인덱스 클라이언트 로더. 모듈 수준 캐시라 검색창을 닫았다 다시 열어도 받은 샤드를 다시 받지 않는다.
// 실패(네트워크·404·형식 오류)는 캐시하지 않는다 — 다음에 열 때 다시 시도하되, 제목 검색은 영향받지 않는다.
//
// 샤드 URL 은 내용 해시를 포함한다(/api/search/<slug>.<해시>) → 서버가 immutable 로 장기 캐시를 줘도
// 배포로 내용이 바뀌면 URL 이 바뀌어 낡은 본문이 남지 않는다.

export const MANIFEST_URL = '/api/search';
export const shardUrl = (key: string) => `${MANIFEST_URL}/${encodeURIComponent(key)}`;
export const SHARD_CONCURRENCY = 3;

type Fetcher = typeof fetch;

export interface LoadedManifest { entries: SearchBodyEntry[]; certs: ManifestCert[] }

let manifestCache: LoadedManifest | null = null;
let manifestInflight: Promise<LoadedManifest | null> | null = null;
const shardCache = new Map<string, SearchShard>();
const shardInflight = new Map<string, Promise<SearchShard | null>>();

export function resetSearchCache(): void {
  manifestCache = null;
  manifestInflight = null;
  shardCache.clear();
  shardInflight.clear();
  refreshInflight = null;
}

export function loadedShards(): SearchShard[] {
  return [...shardCache.values()];
}

function fetchManifest(fetcher: Fetcher, init?: RequestInit): Promise<LoadedManifest | null> {
  return fetcher(MANIFEST_URL, init)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const manifest = parseManifest(d);
      const entries = manifest ? expandManifest(manifest) : [];
      if (!manifest || entries.length === 0) return null;
      return { entries, certs: manifest.certs };
    })
    .catch(() => null);
}

export function loadManifest(fetcher: Fetcher = fetch): Promise<LoadedManifest | null> {
  if (manifestCache) return Promise.resolve(manifestCache);
  manifestInflight ??= fetchManifest(fetcher)
    .then((m) => { if (m) manifestCache = m; return m; })
    .finally(() => { manifestInflight = null; });
  return manifestInflight;
}

// 캐시된 매니페스트가 낡았을 때(탭을 연 채로 새 배포가 나가 해시가 바뀜) 한 번만 다시 받는다.
// HTTP 캐시를 우회('reload')해서 정말 새 것을 받는다. 동시에 여러 샤드가 404 여도 요청은 하나다.
let refreshInflight: Promise<LoadedManifest | null> | null = null;
function refreshManifest(fetcher: Fetcher): Promise<LoadedManifest | null> {
  refreshInflight ??= fetchManifest(fetcher, { cache: 'reload' })
    .then((m) => { if (m) manifestCache = m; return m; })
    .finally(() => { refreshInflight = null; });
  return refreshInflight;
}

interface ShardFetch { shard: SearchShard | null; notFound: boolean }

async function fetchShard(key: string, fetcher: Fetcher): Promise<ShardFetch> {
  try {
    const r = await fetcher(shardUrl(key));
    if (r.status === 404) return { shard: null, notFound: true };
    const d: unknown = r.ok ? await r.json() : null;
    if (!isShard(d) || d.slug !== slugOfShardKey(key)) return { shard: null, notFound: false };
    shardCache.set(key, d);
    prepareShard(d);
    return { shard: d, notFound: false };
  } catch {
    return { shard: null, notFound: false };
  }
}

// 샤드 하나를 받는다. 404 면(=키의 해시가 낡았다) 매니페스트를 한 번 새로 받아 새 해시로 딱 한 번만 다시 시도한다.
async function fetchShardWithRecovery(key: string, fetcher: Fetcher): Promise<SearchShard | null> {
  const manifestUsed = manifestCache;
  const first = await fetchShard(key, fetcher);
  if (first.shard || !first.notFound) return first.shard;
  // 이미 다른 샤드의 복구가 매니페스트를 갱신했으면 그것을 쓰고, 아니면 새로 받는다.
  const fresh = manifestCache !== manifestUsed && manifestCache ? manifestCache : await refreshManifest(fetcher);
  const slug = slugOfShardKey(key);
  const cert = fresh?.certs.find((c) => c.slug === slug);
  if (!slug || !cert) return null;
  const newKey = shardKey(slug, cert.h);
  if (newKey === key) return null; // 서버도 같은 키를 가리킨다 - 진짜로 없는 것
  return (await fetchShard(newKey, fetcher)).shard; // 재시도는 한 번뿐, 다시 404 여도 더 돌지 않는다
}

// 호출자가 든 키가 낡았어도(이미 다른 샤드의 복구가 매니페스트를 갱신한 뒤에 시작한 요청) 현재 매니페스트의 해시로 바꿔 쓴다.
// 그렇지 않으면 낡은 키마다 404 를 한 번씩 맞고 매니페스트를 또 받게 된다.
function currentKey(key: string): string {
  const slug = slugOfShardKey(key);
  const cert = slug ? manifestCache?.certs.find((c) => c.slug === slug) : undefined;
  return slug && cert ? shardKey(slug, cert.h) : key;
}

export function loadShard(staleKey: string, fetcher: Fetcher = fetch): Promise<SearchShard | null> {
  const key = currentKey(staleKey);
  const cached = shardCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = shardInflight.get(key);
  if (pending) return pending;
  const p = fetchShardWithRecovery(key, fetcher).finally(() => { shardInflight.delete(key); });
  shardInflight.set(key, p);
  return p;
}

// 샤드를 주어진 순서대로 동시 SHARD_CONCURRENCY 개씩 받고, 하나가 도착할 때마다 onShard 를 부른다(점진 반영).
// 이미 받은 샤드는 네트워크를 타지 않는다. 실패한 샤드는 조용히 건너뛴다.
export async function loadShards(
  keys: string[],
  onShard: (shard: SearchShard) => void,
  fetcher: Fetcher = fetch,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const queue = [...new Set(keys)];
  const worker = async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      if (isCancelled()) return;
      const shard = await loadShard(key, fetcher);
      if (shard && !isCancelled()) onShard(shard);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SHARD_CONCURRENCY, queue.length) }, worker));
}
