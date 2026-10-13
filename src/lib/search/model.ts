
// 검색 인덱스의 형식과 순위 규칙. 클라이언트(SearchDialog)와 서버(빌더·테스트)가 함께 쓰므로
// fs 등 Node 전용 모듈을 import 하지 않는다.
//
// 인덱스는 둘로 나뉜다.
//  1) 매니페스트(/api/search): 모든 day 의 제목만. 검색창 첫 오픈 시 받는다(작게 유지).
//  2) 샤드(/api/search/<slug>.<해시>): 자격증 하나의 본문 "전체"의 단어 집합. 검색어를 입력하기 시작하면 받는다.

export interface SearchEntry {
  category: string; // 공개 URL 세그먼트(aws | linux | en)
  certSlug: string;
  certCode: string;
  certName: string;
  certLevel: string;
  week: number;
  day: number;
  title: string;
  href: string;
}

// 검색 결과 한 줄. 본문은 엔트리에 싣지 않고 샤드(SearchShard)에서 따로 찾는다.
export type SearchBodyEntry = SearchEntry;

// [week, day, title]
export type ManifestDay = [number, number, string];

export interface ManifestCert {
  slug: string;
  code: string;
  name: string;
  level: string;
  base: string; // href 의 첫 세그먼트
  h: string; // 샤드 내용 해시. 샤드 URL 에 들어가 영구 캐시를 배포 후에도 안전하게 한다.
  days: ManifestDay[];
}

export interface SearchManifest {
  v: 2;
  certs: ManifestCert[];
}

// [week, day, 사전 인덱스 델타(36진수, 쉼표 구분)] — terms.ts 의 encodeTerms 참고.
export type ShardDay = [number, number, string];

export interface SearchShard {
  v: 2;
  slug: string;
  dict: string; // 정렬된 고유 단어(공백 구분)
  days: ShardDay[];
}

export function dayHref(base: string, slug: string, week: number, day: number): string {
  return `/${base}/${slug}/week${week}/day${day}`;
}

export function shardKey(slug: string, hash: string): string {
  return `${slug}.${hash}`;
}

// 키에서 slug 를 되돌린다(마지막 '.' 앞). 형식이 틀리면 null.
export function slugOfShardKey(key: string): string | null {
  const i = key.lastIndexOf('.');
  return i > 0 ? key.slice(0, i) : null;
}

function isManifest(x: unknown): x is SearchManifest {
  return typeof x === 'object' && x !== null && (x as SearchManifest).v === 2 && Array.isArray((x as SearchManifest).certs);
}

export function isShard(x: unknown): x is SearchShard {
  return typeof x === 'object' && x !== null && (x as SearchShard).v === 2
    && typeof (x as SearchShard).slug === 'string' && typeof (x as SearchShard).dict === 'string' && Array.isArray((x as SearchShard).days);
}

export function parseManifest(m: unknown): SearchManifest | null {
  return isManifest(m) ? m : null;
}

// 네트워크에서 받은 값은 신뢰하지 않는다 — 형식이 틀리면 빈 목록.
export function expandManifest(m: unknown): SearchBodyEntry[] {
  if (!isManifest(m)) return [];
  const out: SearchBodyEntry[] = [];
  for (const c of m.certs) {
    for (const [week, day, title] of c.days) {
      out.push({
        category: c.base, certSlug: c.slug, certCode: c.code, certName: c.name, certLevel: c.level,
        week, day, title, href: dayHref(c.base, c.slug, week, day),
      });
    }
  }
  return out;
}

// 지금 보고 있는 자격증(/aws/<slug>/..., /en/<slug>/...). 모르는 slug 면 null.
export function currentCertSlug(pathname: string, knownSlugs: readonly string[]): string | null {
  const slug = pathname.split('/').filter(Boolean)[1];
  return slug !== undefined && knownSlugs.includes(slug) ? slug : null;
}

// 샤드 받는 순서: 지금 보는 자격증을 맨 앞으로, 나머지는 매니페스트 순서.
export function orderShardKeys(certs: readonly ManifestCert[], currentSlug: string | null): string[] {
  const keys = certs.map((c) => ({ slug: c.slug, key: shardKey(c.slug, c.h) }));
  return [...keys.filter((k) => k.slug === currentSlug), ...keys.filter((k) => k.slug !== currentSlug)].map((k) => k.key);
}

