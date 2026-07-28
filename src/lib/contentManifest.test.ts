import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// docs/SEO-indexing-fix-plan.md Step6 후속 회귀 테스트.
//
// fs.readFile을 목킹해 매니페스트 파일 존재/부재/손상 3가지 시나리오를 검증한다. 모듈이
// 내부에 로드 결과를 캐시(manifestLoaded)하므로, 시나리오마다 vi.resetModules()로 캐시를
// 초기화하고 './contentManifest'를 새로 동적 import한다.
vi.mock('node:fs', () => ({
  promises: { readFile: vi.fn() },
}));

describe('getManifestMtime', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('매니페스트에 있는 경로는 해당 ISO 시각을 Date로 반환한다', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        version: 1,
        files: { 'content/aws-certs/saa-c03/week1/day1.md': '2026-07-15T02:41:12.000Z' },
      }),
    );
    const { getManifestMtime } = await import('./contentManifest');

    const result = await getManifestMtime('content/aws-certs/saa-c03/week1/day1.md');

    expect(result?.toISOString()).toBe('2026-07-15T02:41:12.000Z');
  });

  test('매니페스트 파일이 없으면(fs.readFile 실패) undefined를 반환한다 — 가짜 날짜를 내보내지 않는다', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'));
    const { getManifestMtime } = await import('./contentManifest');

    const result = await getManifestMtime('content/aws-certs/saa-c03/week1/day1.md');

    expect(result).toBeUndefined();
  });

  test('매니페스트에 해당 경로가 없으면 undefined를 반환한다', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 1, files: {} }));
    const { getManifestMtime } = await import('./contentManifest');

    const result = await getManifestMtime('content/aws-certs/nope/week1/day1.md');

    expect(result).toBeUndefined();
  });

  test('매니페스트 JSON이 손상되어도 예외를 던지지 않고 undefined를 반환한다', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockResolvedValue('not valid json{{{');
    const { getManifestMtime } = await import('./contentManifest');

    const result = await getManifestMtime('content/aws-certs/saa-c03/week1/day1.md');

    expect(result).toBeUndefined();
  });

  test('Windows 스타일 경로 구분자(\\\\)로 조회해도 매니페스트의 POSIX 키와 매칭된다', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ version: 1, files: { 'src/app/page.tsx': '2026-07-28T07:27:05.000Z' } }),
    );
    const { getManifestMtime } = await import('./contentManifest');

    const result = await getManifestMtime('src\\app\\page.tsx');

    expect(result?.toISOString()).toBe('2026-07-28T07:27:05.000Z');
  });

  test('같은 프로세스 내 여러 호출에서도 fs.readFile은 1회만 호출된다(모듈 캐시)', async () => {
    const { promises: fs } = await import('node:fs');
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 1, files: { a: '2026-01-01T00:00:00.000Z' } }));
    const { getManifestMtime } = await import('./contentManifest');

    await getManifestMtime('a');
    await getManifestMtime('a');

    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });
});
