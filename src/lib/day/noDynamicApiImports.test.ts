import { describe, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// day 렌더 계층 결합도 가드(docs/SEO-indexing-fix-plan.md Step5 A-3).
//
// src/components/day/**와 src/lib/day/**는 무료 week1 정적 라우트(app/[category]/[slug]/week1/[day])와
// 유료 포함 전체 동적 라우트(app/[category]/[slug]/[week]/[day]) 양쪽이 재사용한다. 이 계층에서
// next/headers(cookies()/headers())를 import하면 정적 라우트가 다시 DYNAMIC_SERVER_USAGE 500을
// 낸다 — 소스 문자열을 스캔해 실행(렌더) 없이도 검출한다.
async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(full);
      if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) return [full];
      return [];
    }),
  );
  return nested.flat();
}

const NEXT_HEADERS_IMPORT = /from\s+['"]next\/headers['"]/;

describe('day 렌더 계층 — next/headers import 금지', () => {
  test('src/components/day/** 어떤 파일도 next/headers를 import하지 않는다', async () => {
    const dir = path.join(process.cwd(), 'src', 'components', 'day');
    const files = await collectSourceFiles(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      expect(
        NEXT_HEADERS_IMPORT.test(content),
        `${file}가 next/headers를 import함 — week1 정적 라우트가 DYNAMIC_SERVER_USAGE 500을 낼 수 있다`,
      ).toBe(false);
    }
  });

  test('src/lib/day/** 어떤 파일도 next/headers를 import하지 않는다', async () => {
    const dir = path.join(process.cwd(), 'src', 'lib', 'day');
    const files = await collectSourceFiles(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      expect(
        NEXT_HEADERS_IMPORT.test(content),
        `${file}가 next/headers를 import함 — week1 정적 라우트가 DYNAMIC_SERVER_USAGE 500을 낼 수 있다`,
      ).toBe(false);
    }
  });
});
