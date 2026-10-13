import { describe, expect, test } from 'vitest';
import { getAllDays, listCerts } from '@/lib/content';
import { EN_INDEXABLE_WEEK } from '@/lib/day/indexPolicy';
import { buildSearchManifest, buildSearchShard, isValidShardKey, listShardKeys } from './build';

async function keyOf(slug: string, scope: 'ko' | 'en' = 'ko'): Promise<string> {
  const key = (await listShardKeys(scope)).find((k) => k.startsWith(`${slug}.`));
  if (!key) throw new Error(`no shard key for ${slug}`);
  return key;
}

describe('검색 매니페스트 - 한국어', () => {
  test('모든 자격증의 모든 주차 day 를 싣는다(week2+ 포함)', async () => {
    const m = await buildSearchManifest('ko');
    const certs = [...(await listCerts('aws')), ...(await listCerts('linux'))];
    expect(m.certs.map((c) => c.slug).sort()).toEqual(certs.map((c) => c.slug).sort());
    for (const c of m.certs) {
      const days = await getAllDays(c.base, c.slug);
      expect(c.days.length).toBe(days.length);
      expect(c.days.some(([w]) => w >= 2)).toBe(true);
    }
  });

  test('링크는 공개 섹션 URL(/aws, /linux)이며 레거시 /aws-certs 가 아니다', async () => {
    const m = await buildSearchManifest('ko');
    for (const c of m.certs) {
      expect(['aws', 'linux']).toContain(c.base);
      const section = (await listCerts(c.base)).find((x) => x.slug === c.slug)?.section;
      expect(section).toBe(c.base);
    }
    expect(m.certs.find((c) => c.slug === 'linux-master-2')?.base).toBe('linux');
    expect(m.certs.find((c) => c.slug === 'saa-c03')?.base).toBe('aws');
  });

  test('매니페스트의 해시는 샤드 키와 일치한다', async () => {
    const m = await buildSearchManifest('ko');
    const keys = await listShardKeys('ko');
    expect(m.certs.map((c) => `${c.slug}.${c.h}`).sort()).toEqual([...keys].sort());
  });
});

describe('검색 샤드 - 한국어', () => {
  test('week2+ day 가 단어 인덱스를 가진다', async () => {
    const shard = await buildSearchShard(await keyOf('saa-c03'), 'ko');
    expect(shard).not.toBeNull();
    const w2 = shard!.days.filter(([w]) => w >= 2);
    expect(w2.length).toBeGreaterThan(0);
    for (const [, , ids] of w2) expect(ids.split(',').length).toBeGreaterThan(50);
    expect(shard!.dict.length).toBeGreaterThan(1000);
  });

  test('샤드는 요청한 자격증의 day 만 담는다', async () => {
    const shard = await buildSearchShard(await keyOf('linux-master-2'), 'ko');
    const days = await getAllDays('linux', 'linux-master-2');
    expect(shard!.slug).toBe('linux-master-2');
    expect(shard!.days.map(([w, d]) => `${w}/${d}`).sort()).toEqual(days.map((d) => `${d.week}/${d.day}`).sort());
  });

  test('내용이 같으면 해시도 같다(빌드가 결정적이다)', async () => {
    expect(await listShardKeys('ko')).toEqual(await listShardKeys('ko'));
  });
});

describe('검색 인덱스 - 영어판은 EN_INDEXABLE_WEEK 까지만', () => {
  test('전제: 영어 콘텐츠에는 EN_INDEXABLE_WEEK 보다 뒤 주차 파일이 실제로 있다', async () => {
    const all = await getAllDays('en', 'saa-c03');
    expect(all.some((d) => d.week > EN_INDEXABLE_WEEK)).toBe(true);
  });

  test('매니페스트 목록에 뒤 주차가 없다', async () => {
    const m = await buildSearchManifest('en');
    expect(m.certs.length).toBeGreaterThan(0);
    for (const c of m.certs) {
      expect(c.base).toBe('en');
      expect(c.days.length).toBeGreaterThan(0);
      for (const [w] of c.days) expect(w).toBeLessThanOrEqual(EN_INDEXABLE_WEEK);
    }
  });

  test('샤드에도 뒤 주차가 없다', async () => {
    const shard = await buildSearchShard(await keyOf('saa-c03', 'en'), 'en');
    expect(shard!.days.length).toBeGreaterThan(0);
    for (const [w] of shard!.days) expect(w).toBeLessThanOrEqual(EN_INDEXABLE_WEEK);
  });

  test('영어 샤드 단어 사전에는 한글(U+AC00-U+D7A3)이 없다', async () => {
    for (const key of await listShardKeys('en')) {
      const shard = await buildSearchShard(key, 'en');
      expect(shard!.dict, key).not.toMatch(/[가-힣]/);
    }
  });
});

describe('샤드 키 검증', () => {
  test('유효 키는 "<slug>.<해시>" 형식이고 중복이 없다', async () => {
    const keys = await listShardKeys('ko');
    expect(keys.length).toBe(13);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+\.[0-9a-f]{10}$/);
    expect(keys.some((k) => k.startsWith('linux-master-2.'))).toBe(true);
  });

  test('목록의 키는 모두 유효하고 샤드가 만들어진다', async () => {
    for (const k of await listShardKeys('ko')) {
      expect(await isValidShardKey(k)).toBe(true);
      expect(await buildSearchShard(k)).not.toBeNull();
    }
  });

  test.each([
    '', 'nope', 'saa-c03', 'saa-c03.', 'saa-c03.0000000000', 'SAA-C03.0000000000', 'saa-c03/', '../content', '..%2f',
    '__proto__', 'constructor', 'saa-c03 ', 'saa-c03\u0000',
  ])('%j 는 무효이고 샤드가 만들어지지 않는다(해시 없는 slug 와 낡은 해시 포함)', async (k) => {
    expect(await isValidShardKey(k)).toBe(false);
    expect(await buildSearchShard(k)).toBeNull();
  });

  test('영어 범위의 키는 한국어 범위에서 무효다', async () => {
    for (const k of await listShardKeys('en')) {
      if (!(await listShardKeys('ko')).includes(k)) expect(await isValidShardKey(k, 'ko')).toBe(false);
    }
  });
});
