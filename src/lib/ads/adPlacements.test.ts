import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AD_SLOT_ENV_NAMES, resolveAdPlacement, shouldShowDayAds } from './adPlacements';

const CLIENT = 'ca-pub-0000000000000000';

function stubAds(env: Partial<Record<'CLIENT' | 'SLOT_DAY_TOP' | 'SLOT_DAY_BOTTOM' | 'SLOT_HUB', string>>) {
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', env.CLIENT ?? '');
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP', env.SLOT_DAY_TOP ?? '');
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_DAY_BOTTOM', env.SLOT_DAY_BOTTOM ?? '');
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_HUB', env.SLOT_HUB ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAdPlacement — 위치별 슬롯 ID 와 예약 크기', () => {
  test('게시자 ID 와 슬롯 ID 가 모두 있으면 그 위치의 설정을 돌려준다', () => {
    stubAds({ CLIENT, SLOT_DAY_TOP: '1111111111', SLOT_DAY_BOTTOM: '2222222222', SLOT_HUB: '3333333333' });

    expect(resolveAdPlacement('dayTop')?.slot).toBe('1111111111');
    expect(resolveAdPlacement('dayBottom')?.slot).toBe('2222222222');
    expect(resolveAdPlacement('hub')?.slot).toBe('3333333333');
  });

  test('게시자 ID 가 없으면 슬롯 ID 가 있어도 null', () => {
    stubAds({ SLOT_DAY_TOP: '1111111111', SLOT_DAY_BOTTOM: '2222222222', SLOT_HUB: '3333333333' });

    expect(resolveAdPlacement('dayTop')).toBeNull();
    expect(resolveAdPlacement('dayBottom')).toBeNull();
    expect(resolveAdPlacement('hub')).toBeNull();
  });

  test('특정 슬롯 ID 만 없으면 그 위치만 null', () => {
    stubAds({ CLIENT, SLOT_DAY_TOP: '1111111111', SLOT_HUB: '3333333333' });

    expect(resolveAdPlacement('dayTop')?.slot).toBe('1111111111');
    expect(resolveAdPlacement('dayBottom')).toBeNull();
    expect(resolveAdPlacement('hub')?.slot).toBe('3333333333');
  });

  test.each([['abc'], ['123" onload="x'], ['   ']])('슬롯 ID 형식이 틀리면(%j) null', (raw) => {
    stubAds({ CLIENT, SLOT_DAY_TOP: raw });

    expect(resolveAdPlacement('dayTop')).toBeNull();
  });

  test('모든 위치가 높이를 px 로 못 박는다(늦게 뜬 광고가 본문을 밀지 않게)', () => {
    stubAds({ CLIENT, SLOT_DAY_TOP: '1', SLOT_DAY_BOTTOM: '2', SLOT_HUB: '3' });

    // 가로 배너는 모든 폭에서 100px(320×100·728×90 이 들어간다), 사각형은 280px(300×250·336×280).
    expect(resolveAdPlacement('dayTop')?.height).toBe(100);
    expect(resolveAdPlacement('hub')?.height).toBe(100);
    expect(resolveAdPlacement('dayBottom')?.height).toBe(280);
  });

  test('화면 위쪽 슬롯은 광고가 안 채워져도 자리를 유지하고, 본문 끝 슬롯만 접는다', () => {
    stubAds({ CLIENT, SLOT_DAY_TOP: '1', SLOT_DAY_BOTTOM: '2', SLOT_HUB: '3' });

    expect(resolveAdPlacement('dayTop')?.collapseWhenUnfilled).toBe(false);
    expect(resolveAdPlacement('hub')?.collapseWhenUnfilled).toBe(false);
    expect(resolveAdPlacement('dayBottom')?.collapseWhenUnfilled).toBe(true);
  });

  test('환경변수 이름은 NEXT_PUBLIC_ADSENSE_SLOT_ 접두사를 쓴다', () => {
    expect(AD_SLOT_ENV_NAMES).toEqual({
      dayTop: 'NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP',
      dayBottom: 'NEXT_PUBLIC_ADSENSE_SLOT_DAY_BOTTOM',
      hub: 'NEXT_PUBLIC_ADSENSE_SLOT_HUB',
    });
  });
});

describe('shouldShowDayAds — day 페이지에 광고 슬롯을 둘지', () => {
  test('색인 대상인 한국어 day 는 주차와 무관하게 둔다', () => {
    expect(shouldShowDayAds({ category: 'aws', week: 1, locked: false })).toBe(true);
    expect(shouldShowDayAds({ category: 'aws', week: 2, locked: false })).toBe(true);
    expect(shouldShowDayAds({ category: 'aws', week: 12, locked: false })).toBe(true);
  });

  test('영어판은 색인 대상인 1주차에만 둔다(2주차 이상은 noindex)', () => {
    expect(shouldShowDayAds({ category: 'en', week: 1, locked: false })).toBe(true);
    expect(shouldShowDayAds({ category: 'en', week: 2, locked: false })).toBe(false);
    expect(shouldShowDayAds({ category: 'en', week: 9, locked: false })).toBe(false);
  });

  test('잠긴(미리보기만 보이는) 화면에는 두지 않는다', () => {
    expect(shouldShowDayAds({ category: 'aws', week: 1, locked: true })).toBe(false);
  });
});

// 배치 가드: AdSlot 은 day 본문과 자격증 허브에만 둔다. 홈·후기·인증·not-found 등에 실수로 들어가면
// 여기서 잡힌다(로그인 사용자의 학습 홈은 주소가 `/` 라 AdSlot 의 경로 판정으로는 걸러지지 않는다).
describe('AdSlot 배치 위치', () => {
  async function collectSourceFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(full);
        return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
      }),
    );
    return nested.flat();
  }

  test('AdSlot 을 import 하는 파일은 DayView 와 자격증 허브 둘뿐이다', async () => {
    const srcDir = path.join(process.cwd(), 'src');
    const files = await collectSourceFiles(srcDir);
    const importers: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      if (/from\s+['"]@\/components\/ads\/AdSlot['"]/.test(content)) {
        importers.push(path.relative(srcDir, file).split(path.sep).join('/'));
      }
    }

    expect(importers.sort()).toEqual(['app/[category]/[slug]/page.tsx', 'components/day/DayView.tsx']);
  });
});
