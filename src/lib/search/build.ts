import { createHash } from 'node:crypto';
import { EN_CATEGORY, SECTIONS } from '@/lib/category';
import { getAllDays, listCerts, readDayRaw, type CertMeta } from '@/lib/content';
import { isIndexableDay } from '@/lib/day/indexPolicy';
import { shardKey, type ManifestCert, type SearchManifest, type SearchShard, type ShardDay } from './model';
import { encodeTerms, extractSearchTerms } from './terms';

// 검색 인덱스 빌더(서버 전용). 정적 라우트(/api/search, /api/search/[cert])가 빌드 시 호출한다.
//
// scope 는 'ko'(한국어 전체, aws+linux 섹션) 또는 'en'(영어판). 어떤 day 를 싣는지는 색인 정책
// (isIndexableDay) 한 곳에서 판정한다 — 영어판 week2+ 는 한국어가 섞인 파일이라 목록에도 본문에도 넣지 않는다.
export type SearchScope = 'ko' | typeof EN_CATEGORY;

// href 가 301 되는 레거시(/aws-certs)가 아니라 공개 섹션 URL(/aws, /linux)이 되도록 section 으로 base 를 정한다.
async function scopeCerts(scope: SearchScope): Promise<{ base: string; meta: CertMeta }[]> {
  if (scope === EN_CATEGORY) return (await listCerts(EN_CATEGORY)).map((meta) => ({ base: EN_CATEGORY, meta }));
  const out: { base: string; meta: CertMeta }[] = [];
  for (const section of SECTIONS) {
    for (const meta of await listCerts(section)) out.push({ base: section, meta });
  }
  return out.sort((a, b) => a.meta.order - b.meta.order);
}

interface BuiltShard { shard: SearchShard; hash: string; key: string }

async function buildOne(base: string, meta: CertMeta): Promise<BuiltShard> {
  const refs: { week: number; day: number }[] = [];
  const perDay: string[][] = [];
  for (const d of await getAllDays(base, meta.slug)) {
    if (!isIndexableDay(base, d.week)) continue;
    const raw = await readDayRaw(base, meta.slug, d.week, d.day);
    if (raw === null) continue;
    refs.push({ week: d.week, day: d.day });
    perDay.push(extractSearchTerms(raw));
  }
  const { dict, ids } = encodeTerms(perDay);
  const days: ShardDay[] = refs.map((r, i) => [r.week, r.day, ids[i]]);
  const shard: SearchShard = { v: 2, slug: meta.slug, dict, days };
  // 내용 해시가 URL 에 들어간다 → 콘텐츠가 바뀌면(=배포) URL 이 바뀌므로 영구 캐시해도 낡은 본문이 남지 않는다.
  const hash = createHash('sha1').update(JSON.stringify(shard)).digest('hex').slice(0, 10);
  return { shard, hash, key: shardKey(meta.slug, hash) };
}

// 콘텐츠는 빌드 후 불변이라 프로세스 단위로 메모이즈한다(매니페스트·샤드 라우트가 공유).
const MEMOIZE = process.env.NODE_ENV !== 'development'; // dev 에서만 콘텐츠 편집을 즉시 반영
const builtCache = new Map<SearchScope, Promise<Map<string, BuiltShard>>>();

function buildAll(scope: SearchScope): Promise<Map<string, BuiltShard>> {
  const cached = MEMOIZE ? builtCache.get(scope) : undefined;
  if (cached) return cached;
  const p = (async () => {
    const out = new Map<string, BuiltShard>();
    for (const { base, meta } of await scopeCerts(scope)) out.set(meta.slug, await buildOne(base, meta));
    return out;
  })();
  if (MEMOIZE) builtCache.set(scope, p);
  return p;
}

// 유효한 샤드 키("<slug>.<해시>")의 단일 출처. 라우트의 generateStaticParams·검증이 공유한다.
export async function listShardKeys(scope: SearchScope = 'ko'): Promise<string[]> {
  return [...(await buildAll(scope)).values()].map((b) => b.key);
}

export async function isValidShardKey(key: string, scope: SearchScope = 'ko'): Promise<boolean> {
  return (await listShardKeys(scope)).includes(key);
}

export async function buildSearchManifest(scope: SearchScope = 'ko'): Promise<SearchManifest> {
  const built = await buildAll(scope);
  const certs: ManifestCert[] = [];
  for (const { base, meta } of await scopeCerts(scope)) {
    const days = (await getAllDays(base, meta.slug)).filter((d) => isIndexableDay(base, d.week));
    certs.push({
      slug: meta.slug, code: meta.code, name: meta.name, level: meta.level, base,
      h: built.get(meta.slug)!.hash,
      days: days.map((d) => [d.week, d.day, d.title]),
    });
  }
  return { v: 2, certs };
}

// key 는 "<slug>.<해시>" 전체여야 한다. 해시가 낡았거나 목록에 없으면 null → 라우트가 404.
export async function buildSearchShard(key: string, scope: SearchScope = 'ko'): Promise<SearchShard | null> {
  for (const b of (await buildAll(scope)).values()) if (b.key === key) return b.shard;
  return null;
}
