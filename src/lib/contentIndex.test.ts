import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// content/aws-certs/index.json 무결성 회귀 테스트.
//
// 배경: scripts/sync-content.mjs 가 이 인덱스를 CERTS 배열로 통째 덮어쓰던 시절이 있었다.
// CERTS 에는 외부 소스에서 동기화하는 5개만 있어서, 이 저장소에서 직접 작성된 7개
// (clf-c02·aif-c01·mla-c01·dea-c01·scs-c03·mls-c01·linux-master-1)가 sync 한 번에 사라졌고
// 살아남은 항목도 section 을 잃었다. listCerts(section) 이 section 으로 필터하고
// [category]/[slug] 는 dynamicParams=false 라, 인덱스에서 빠지면 그 허브는 즉시 진짜 404 다.
// 이 테스트는 "디스크에 있는 트랙이 인덱스에 전부 있는가"를 직접 확인해 그 사고를 막는다.
const CONTENT_ROOT = path.join(process.cwd(), 'content', 'aws-certs');

interface TrackMeta {
  draft?: boolean;
}

interface IndexCert {
  slug: string;
  section?: string;
  level: string;
  order: number;
}

const index = JSON.parse(readFileSync(path.join(CONTENT_ROOT, 'index.json'), 'utf8')) as {
  certs: IndexCert[];
};

// meta.json 을 가진 디렉터리 = 실제로 존재하는 트랙.
const allDirs = readdirSync(CONTENT_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(path.join(CONTENT_ROOT, name, 'meta.json')));

const metaOf = (slug: string): TrackMeta =>
  JSON.parse(readFileSync(path.join(CONTENT_ROOT, slug, 'meta.json'), 'utf8')) as TrackMeta;

// draft 트랙은 뼈대만 있고 index.json 에 일부러 넣지 않은 상태다(공개 전). 공개 대상에서 제외한다.
const drafts = allDirs.filter((slug) => metaOf(slug).draft === true);
const onDisk = allDirs.filter((slug) => !drafts.includes(slug));

describe('content/aws-certs/index.json 무결성', () => {
  test('디스크에 있는 모든 트랙이 인덱스에 있다(sync 덮어쓰기 사고 방지)', () => {
    const indexed = new Set(index.certs.map((c) => c.slug));
    const missing = onDisk.filter((slug) => !indexed.has(slug));
    expect(missing).toEqual([]);
  });

  test('인덱스의 모든 항목이 디스크에 실재한다(유령 항목 방지)', () => {
    const disk = new Set(onDisk);
    expect(index.certs.filter((c) => !disk.has(c.slug)).map((c) => c.slug)).toEqual([]);
  });

  test('모든 항목이 section 을 갖는다 — 없으면 listCerts 필터에서 통째로 누락된다', () => {
    expect(index.certs.filter((c) => !c.section).map((c) => c.slug)).toEqual([]);
  });

  test('draft 트랙은 인덱스에 없어야 한다 — 있으면 빈 허브가 색인된다', () => {
    const indexed = new Set(index.certs.map((c) => c.slug));
    expect(drafts.filter((slug) => indexed.has(slug))).toEqual([]);
  });

  test('linux 섹션 트랙이 최소 1개 존재한다', () => {
    expect(index.certs.filter((c) => c.section === 'linux').length).toBeGreaterThanOrEqual(1);
  });
});
