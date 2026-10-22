import { describe, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_CATEGORIES } from '@/lib/category';

// 구조 가드(P3 Step 4): 캐시되는 day 라우트는 지원 category 별 "리터럴" 폴더에만 있어야 한다.
//
// 이유: 이 라우트들은 렌더 결과를 URL 단위로 캐시하고, root loading.tsx 의 스트리밍 때문에 페이지 안의
// notFound()가 200 이 되어 그대로 캐시된다. 동적 `[category]` 아래에 두면 /api/x/week2/day1·/_next/foo/bar/baz
// 같은 임의 경로가 매칭돼 캐시 키가 무한해진다. 리터럴 폴더면 지원 category 밖 경로는 라우터가 매칭하지 않아
// 진짜 404 다. `[category]/[slug]/[week]` 또는 `[category]/[slug]/week1` 가 되살아나면 이 테스트가 실패한다.
const APP = path.join(process.cwd(), 'src', 'app');
const exists = (p: string) => fs.access(p).then(() => true, () => false);

describe('day 라우트 구조 — category 는 리터럴 폴더', () => {
  test.each(SUPPORTED_CATEGORIES.map((c) => [c]))('%s 에 [week]/[day] 와 week1/[day] 라우트가 있다', async (c) => {
    expect(await exists(path.join(APP, c, '[slug]', '[week]', '[day]', 'page.tsx'))).toBe(true);
    expect(await exists(path.join(APP, c, '[slug]', 'week1', '[day]', 'page.tsx'))).toBe(true);
  });

  test('동적 [category] 아래에 [week] / week1 day 라우트가 없다(임의 category 가 캐시되는 라우트에 도달하면 안 된다)', async () => {
    for (const dir of [['[category]', '[slug]', '[week]'], ['[category]', '[slug]', 'week1']]) {
      expect(await exists(path.join(APP, ...dir)), `src/app/${dir.join('/')} 가 존재한다 — 구조 가드 위반`).toBe(false);
    }
  });

  test('각 라우트 파일이 자기 category 만 shared 구현에 넘긴다', async () => {
    for (const c of SUPPORTED_CATEGORIES) {
      for (const sub of [['[week]', '[day]'], ['week1', '[day]']]) {
        const src = await fs.readFile(path.join(APP, c, '[slug]', ...sub, 'page.tsx'), 'utf8');
        expect(src).toContain(`('${c}'`);
        const others = SUPPORTED_CATEGORIES.filter((x) => x !== c);
        for (const o of others) expect(src, `${c} 라우트가 ${o} 를 참조`).not.toContain(`('${o}'`);
        expect(src).toMatch(/export const dynamicParams = true;/);
      }
    }
  });

  test('src/app 아래 캐시되는(force-dynamic 아닌) 동적 세그먼트 page 중 첫 세그먼트가 [category] 인 것은 허브·후기뿐이다', async () => {
    const found: string[] = [];
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name === 'page.tsx') found.push(path.relative(APP, full).split(path.sep).join('/'));
      }
    }
    await walk(path.join(APP, '[category]'));
    expect(found.sort()).toEqual([
      '[category]/[slug]/page.tsx', // dynamicParams=false 허브
      '[category]/page.tsx', // dynamicParams=false 허브
      '[category]/reviews/[cert]/page.tsx', // force-dynamic
      '[category]/reviews/page.tsx', // force-dynamic
    ]);
  });
});
