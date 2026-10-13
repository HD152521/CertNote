import { describe, expect, test } from 'vitest';
import { currentCertSlug, expandManifest, orderShardKeys, parseManifest, shardKey, slugOfShardKey, type ManifestCert } from './model';

const cert = (slug: string): ManifestCert => ({ slug, code: slug.toUpperCase(), name: slug, level: 'associate', base: 'aws', h: `h-${slug}`.slice(0, 10), days: [[1, 1, 'T']] });

describe('샤드 키', () => {
  test('slug 와 해시를 왕복한다', () => {
    expect(slugOfShardKey(shardKey('saa-c03', 'abcdef0123'))).toBe('saa-c03');
    expect(slugOfShardKey('nodot')).toBeNull();
    expect(slugOfShardKey('.leading')).toBeNull();
  });
});

describe('받는 순서 - 지금 보는 자격증이 먼저', () => {
  const certs = [cert('clf-c02'), cert('saa-c03'), cert('dva-c02')];

  test('현재 자격증의 키가 맨 앞이고 나머지는 매니페스트 순서다', () => {
    expect(orderShardKeys(certs, 'dva-c02').map((k) => slugOfShardKey(k))).toEqual(['dva-c02', 'clf-c02', 'saa-c03']);
  });

  test('현재 자격증이 없으면 매니페스트 순서 그대로, 키는 하나도 빠지지 않는다', () => {
    const keys = orderShardKeys(certs, null);
    expect(keys.map((k) => slugOfShardKey(k))).toEqual(['clf-c02', 'saa-c03', 'dva-c02']);
    expect(keys).toHaveLength(3);
  });

  test.each([
    ['/aws/saa-c03/week2/day1', 'saa-c03'],
    ['/en/saa-c03/week1/day1', 'saa-c03'],
    ['/linux/saa-c03', 'saa-c03'],
    ['/aws', null],
    ['/', null],
    ['/dashboard', null],
    ['/aws/unknown/week1/day1', null],
  ])('%s -> %s', (path, expected) => {
    expect(currentCertSlug(path, ['saa-c03', 'clf-c02'])).toBe(expected);
  });
});

describe('매니페스트 해석', () => {
  test('형식이 틀린 입력은 거부한다', () => {
    for (const bad of [null, undefined, 3, 'x', {}, { v: 1, certs: [] }, { v: 2 }]) {
      expect(parseManifest(bad)).toBeNull();
      expect(expandManifest(bad)).toEqual([]);
    }
  });

  test('엔트리 href 는 섹션 URL 이다', () => {
    expect(expandManifest({ v: 2, certs: [cert('saa-c03')] })[0].href).toBe('/aws/saa-c03/week1/day1');
  });
});
