import { describe, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// day 렌더 계층 결합도 가드(docs/SEO-indexing-fix-plan.md Step5 A-3).
//
// src/components/day/**와 src/lib/day/**는 week1 정적 라우트(app/{aws,linux,en}/[slug]/week1/[day])와
// 2주차 이상 라우트(app/{aws,linux,en}/[slug]/[week]/[day]) 양쪽이 재사용한다. 캐시 전환
// (docs/P3-step1-day-cache-design.md) 뒤로는 두 라우트 모두 정적이라, 이 계층에서
// next/headers(cookies()/headers())를 import하면 모든 day 페이지가 DYNAMIC_SERVER_USAGE 500을
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

  test('day 라우트 파일 6개도 next/headers·인증 모듈을 import하지 않는다', async () => {
    const forbidden = [NEXT_HEADERS_IMPORT, /from\s+['"]@\/lib\/auth\/currentUser['"]/];
    for (const category of ['aws', 'linux', 'en']) {
      for (const sub of [['[week]', '[day]'], ['week1', '[day]']]) {
        const file = path.join(process.cwd(), 'src', 'app', category, '[slug]', ...sub, 'page.tsx');
        const content = await fs.readFile(file, 'utf8');
        for (const re of forbidden) {
          expect(re.test(content), `${file} 가 요청별 동적 API 를 import함 — 정적 캐시 라우트가 500 을 낸다`).toBe(false);
        }
      }
    }
  });
});
