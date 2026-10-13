import { describe, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PAYWALL_ENABLED } from './policy';

// 페이월 스위치 ↔ day 라우트 렌더 방식 결합 가드(docs/P3-open-access-followup-plan.md Step 4).
//
// [week]/[day] 라우트는 PAYWALL_ENABLED=false 를 전제로 쿠키를 읽지 않고 정적 캐시된다. 페이월을 켜면
// 이 라우트가 권한을 읽어야 하므로 `force-dynamic` 이어야 한다. 그대로 두면 (1) 잠금 해제된 캐시
// 페이지가 모두에게 나가거나 (2) cookies() 호출이 DYNAMIC_SERVER_USAGE 500 을 낸다.
const ROUTES = ['aws', 'linux', 'en'].map((c) => path.join(process.cwd(), 'src', 'app', c, '[slug]', '[week]', '[day]', 'page.tsx'));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function isRouteForcedDynamic(source: string): boolean {
  return /\bdynamic\s*=\s*['"]force-dynamic['"]/.test(stripComments(source));
}

describe('PAYWALL_ENABLED ↔ [week]/[day] 라우트 렌더 방식', () => {
  test('페이월이 켜져 있으면 라우트는 force-dynamic 이어야 한다(정적 캐시와 양립 불가)', async () => {
    const forcedDynamic = (await Promise.all(ROUTES.map((r) => fs.readFile(r, 'utf8')))).every(isRouteForcedDynamic);
    expect(
      !PAYWALL_ENABLED || forcedDynamic,
      'PAYWALL_ENABLED=true 인데 src/app/{aws,linux,en}/[slug]/[week]/[day]/page.tsx 가 정적 캐시 라우트다. ' +
        "페이월을 켜려면 이 라우트에 `export const dynamic = 'force-dynamic'` 을 되돌리고 권한을 읽는 경로를 " +
        '추가해야 한다(그대로면 잠금 해제된 페이지가 캐시로 서빙되거나 DYNAMIC_SERVER_USAGE 500).',
    ).toBe(true);
  });

  test('감지기 자체 검증: 주석 속 force-dynamic 은 무시하고 실제 선언만 잡는다', () => {
    expect(isRouteForcedDynamic("export const dynamic = 'force-dynamic';")).toBe(true);
    expect(isRouteForcedDynamic('export const dynamic = "force-dynamic";')).toBe(true);
    expect(isRouteForcedDynamic("// export const dynamic = 'force-dynamic';\nexport const dynamicParams = true;")).toBe(false);
    expect(isRouteForcedDynamic('export async function generateStaticParams() { return []; }')).toBe(false);
  });

  test('현재 상태: 페이월 꺼짐 + 정적 캐시 라우트(빈 generateStaticParams)', async () => {
    expect(PAYWALL_ENABLED).toBe(false);
    for (const r of ROUTES) {
      const source = stripComments(await fs.readFile(r, 'utf8'));
      expect(source).toMatch(/export async function generateStaticParams\(\)\s*{\s*return \[\];?\s*}/);
    }
  });
});
