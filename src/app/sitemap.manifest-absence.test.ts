import { describe, expect, test, vi } from 'vitest';

// docs/SEO-indexing-fix-plan.md Step6 후속 회귀 테스트 — 안전장치 전용.
//
// 매니페스트가 없거나(로컬 최초 클론, 손상, 조회 실패) 특정 경로가 매니페스트에 없으면
// lastModified를 절대 추측하지 않고 필드 자체를 생략해야 한다. getDayMtime/getCertMetaMtime
// (src/lib/content.ts)와 getSourceFileMtime(src/lib/fileMtime.ts)가 모두 공유하는
// src/lib/contentManifest.ts의 getManifestMtime을 이 파일 전체에서 항상 undefined를
// 반환하도록 목킹해, 사이트맵이 실제로 이 값을 신뢰하는지 통합 검증한다.
// 별도 파일로 둔 이유: vi.mock은 파일 단위로 호이스팅되어 sitemap.test.ts의 정상 경로
// (실제 매니페스트 사용) 테스트와 격리해야 한다.
vi.mock('@/lib/contentManifest', () => ({
  getManifestMtime: vi.fn().mockResolvedValue(undefined),
}));

describe('sitemap — 매니페스트 부재 시 안전장치', () => {
  test('모든 엔트리에 lastModified 필드 자체가 없다(값이 undefined가 아니라 키가 아예 없어야 함)', async () => {
    const { default: sitemap } = await import('./sitemap');

    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect('lastModified' in entry).toBe(false);
    }
  });
});
