import { afterEach, describe, expect, test, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PAYWALL_ENABLED } from '@/lib/entitlement/policy';

// [week]/[day] 캐시 계약 가드(docs/P3-step1-day-cache-design.md 2-3).
//
// 이 라우트는 빈 generateStaticParams 로 "첫 요청 때 정적 생성 → 배포까지 캐시" 된다. 그 상태에서
// 쿠키·권한을 읽으면 빌드는 통과하고 운영에서 매 요청 DYNAMIC_SERVER_USAGE 500 이 난다(같은 문서
// 3장 실측). 페이월 스위치와 라우트 구조가 어긋나지 않는지 소스 문자열과 스위치 값을 함께 본다
// (src/lib/day/noDynamicApiImports.test.ts 와 같은 소스 스캔 방식).
const DESIGN_DOC = 'docs/P3-step1-day-cache-design.md';
const HINT = `${DESIGN_DOC} 3장(페이월을 다시 켤 때)의 되돌림 절차를 따를 것`;

// page.tsx 를 처음 import 할 때 MDX·하이라이터 변환까지 따라와 기본 5초를 넘긴다.
const PAGE_IMPORT_TIMEOUT_MS = 60_000;

const PAGE_PATH = path.join(process.cwd(), 'src', 'app', '[category]', '[slug]', '[week]', '[day]', 'page.tsx');

const STATIC_PARAMS_EXPORT = /export\s+(?:async\s+)?function\s+generateStaticParams\b|export\s+const\s+generateStaticParams\b/;
const FORCE_DYNAMIC = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/;
const FORCE_STATIC = /export\s+const\s+dynamic\s*=\s*['"]force-static['"]/;
const FORBIDDEN_IMPORTS = ['next/headers', '@/lib/auth/currentUser', '@/lib/entitlement/factory'];

// 주석 속 설명 문구가 검사에 걸리지 않게 줄 주석을 걷어낸 소스.
async function readPageSource(): Promise<string> {
  const raw = await fs.readFile(PAGE_PATH, 'utf8');
  return raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function importsModule(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`from\\s+['"]${escaped}['"]|import\\s*\\(\\s*['"]${escaped}['"]`).test(source);
}

afterEach(() => {
  vi.doUnmock('@/lib/entitlement/policy');
  vi.resetModules();
});

describe.runIf(!PAYWALL_ENABLED)('[week]/[day] 캐시 계약 — 페이월 꺼짐(정적 캐시 라우트)', () => {
  test('generateStaticParams 를 export 한다', async () => {
    const source = await readPageSource();
    expect(STATIC_PARAMS_EXPORT.test(source), `generateStaticParams 가 없으면 매 요청 렌더로 돌아간다 — ${DESIGN_DOC} 2-1`).toBe(true);
  });

  test('generateStaticParams 는 빈 배열을 돌려준다(빌드 때 한 장도 만들지 않는다)', async () => {
    const page: Record<string, unknown> = await import('./page');
    const generateStaticParams = page.generateStaticParams as (() => Promise<unknown[]>) | undefined;
    expect(typeof generateStaticParams, `generateStaticParams export 없음 — ${DESIGN_DOC} 2-1`).toBe('function');
    await expect(generateStaticParams!()).resolves.toEqual([]);
  }, PAGE_IMPORT_TIMEOUT_MS);

  test('dynamic 을 force-dynamic·force-static 으로 선언하지 않는다', async () => {
    const source = await readPageSource();
    expect(FORCE_DYNAMIC.test(source), `force-dynamic 이면 캐시되지 않는다 — ${DESIGN_DOC} 2-1`).toBe(false);
    expect(
      FORCE_STATIC.test(source),
      `force-static 이면 cookies() 가 예외 없이 빈 값을 돌려줘 페이월 복귀 때 구독자가 조용히 잠긴다 — ${DESIGN_DOC} 2-1`,
    ).toBe(false);
  });

  test.each(FORBIDDEN_IMPORTS)('%s 를 import 하지 않는다', async (specifier) => {
    const source = await readPageSource();
    expect(
      importsModule(source, specifier),
      `정적 캐시 라우트가 ${specifier} 를 import 함 — 운영에서 매 요청 DYNAMIC_SERVER_USAGE 500. ${HINT}`,
    ).toBe(false);
  });
});

describe.runIf(PAYWALL_ENABLED)('[week]/[day] 캐시 계약 — 페이월 켜짐(동적 라우트)', () => {
  test('force-dynamic 을 선언하고 generateStaticParams 를 export 하지 않는다', async () => {
    const source = await readPageSource();
    expect(FORCE_DYNAMIC.test(source), `PAYWALL_ENABLED=true 인데 force-dynamic 선언이 없다. ${HINT}`).toBe(true);
    expect(
      STATIC_PARAMS_EXPORT.test(source),
      `PAYWALL_ENABLED=true 인데 generateStaticParams 가 남아 있다(정적 캐시 라우트). ${HINT}`,
    ).toBe(false);
  });
});

describe('[week]/[day] 캐시 계약 — 스위치만 켠 경우의 빌드 가드', () => {
  test('PAYWALL_ENABLED=true 에서 generateStaticParams 가 남아 있으면 호출이 reject 된다', async () => {
    vi.resetModules();
    vi.doMock('@/lib/entitlement/policy', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/entitlement/policy')>()),
      PAYWALL_ENABLED: true,
    }));
    const page: Record<string, unknown> = await import('./page');
    const generateStaticParams = page.generateStaticParams as (() => Promise<unknown[]>) | undefined;
    if (generateStaticParams === undefined) return; // 되돌림 절차대로 함수를 지웠다면 가드도 함께 사라진다.
    await expect(
      generateStaticParams(),
      `스위치만 켜면 빌드가 실패해야 한다(배포 차단) — ${HINT}`,
    ).rejects.toThrow(DESIGN_DOC);
  }, PAGE_IMPORT_TIMEOUT_MS);
});
