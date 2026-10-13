import { describe, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// day 렌더 계층 결합도 가드(docs/SEO-indexing-fix-plan.md Step5 A-3).
//
// src/components/day/**와 src/lib/day/**는 무료 week1 정적 라우트(app/{category}/[slug]/week1/[day])와
// 유료 포함 전체 동적 라우트(app/{category}/[slug]/[week]/[day]) 양쪽이 재사용한다. 이 계층에서
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

// ── day 라우트 파일 + import 그래프 가드(docs/P3-open-access-followup-plan.md Step 4) ─────────────
//
// [week]/[day] 라우트는 요청 시 렌더한 결과를 URL 단위로 영구 캐시한다(page.tsx 상단 주석). 이 라우트의
// page 파일과 거기서 (추이적으로) import 되는 모듈이 요청별 동적 API를 쓰면 캐시가 깨지거나
// (force-dynamic 화) DYNAMIC_SERVER_USAGE 500 이 난다. 주석에 같은 단어가 쓰이므로 주석을 지운 뒤 스캔한다.
const ROUTE_FILES = [
  ...['aws', 'linux', 'en'].flatMap((c) => [
    ['src', 'app', c, '[slug]', '[week]', '[day]', 'page.tsx'],
    ['src', 'app', c, '[slug]', 'week1', '[day]', 'page.tsx'],
  ]),
  ['src', 'lib', 'day', 'dayRoute.tsx'],
  ['src', 'components', 'day', 'DayView.tsx'],
].map((parts) => path.join(process.cwd(), ...parts));

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['next/headers import', /from\s+['"]next\/headers['"]/],
  ['cookies()/headers() 호출', /\b(?:cookies|headers)\s*\(\s*\)/],
  ['getCurrentUser', /\bgetCurrentUser\b/],
  ['noStore/unstable_noStore', /\b(?:unstable_)?noStore\b/],
  ['connection()', /\bconnection\s*\(\s*\)/],
  ['searchParams', /\bsearchParams\b/],
  ["dynamic = 'force-dynamic'", /\bdynamic\s*=\s*['"]force-dynamic['"]/],
  ['revalidate = 0', /\brevalidate\s*=\s*0\b/],
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const IMPORT_SPEC = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

async function resolveLocal(spec: string, fromFile: string): Promise<string | null> {
  const base = spec.startsWith('@/')
    ? path.join(process.cwd(), 'src', spec.slice(2))
    : spec.startsWith('.')
      ? path.resolve(path.dirname(fromFile), spec)
      : null;
  if (!base) return null; // 외부 패키지는 따라가지 않는다.
  for (const cand of [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try {
      await fs.access(cand);
      return cand;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

async function collectImportGraph(entries: string[]): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const code = stripComments(await fs.readFile(file, 'utf8'));
    seen.set(file, code);
    for (const m of code.matchAll(IMPORT_SPEC)) {
      const next = await resolveLocal(m[1], file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe('day 라우트 page 파일과 import 그래프 — 요청별 동적 API 금지', () => {
  test('라우트 파일과 그 추이적 import 어디에도 동적 API 사용·force-dynamic 이 없다', async () => {
    const graph = await collectImportGraph(ROUTE_FILES);
    expect(graph.size).toBeGreaterThan(ROUTE_FILES.length); // 그래프를 실제로 따라갔는지 확인.
    for (const [file, code] of graph) {
      for (const [label, re] of FORBIDDEN) {
        expect(re.test(code), `${path.relative(process.cwd(), file)} 에서 ${label} 발견 — day 라우트 캐시가 깨진다`).toBe(false);
      }
    }
  });

  test('[week]/[day] 라우트 파일이 스캔 대상에 포함돼 있다', async () => {
    const routeFile = ROUTE_FILES[0];
    expect(routeFile).toContain(path.join('src', 'app', 'aws'));
    const graph = await collectImportGraph([routeFile]);
    expect(graph.has(routeFile)).toBe(true);
    expect(graph.has(path.join(process.cwd(), 'src', 'lib', 'day', 'dayRoute.tsx'))).toBe(true);
    expect(graph.has(path.join(process.cwd(), 'src', 'components', 'day', 'DayView.tsx'))).toBe(true);
  });

  test('스캐너 자체 검증: 금지 패턴을 실제로 잡는다(주석은 무시)', () => {
    const bad = stripComments(["import { cookies } from 'next/headers';", 'const c = cookies();'].join('\n'));
    expect(FORBIDDEN.some(([, re]) => re.test(bad))).toBe(true);
    const commentOnly = stripComments(['// cookies() 를 쓰지 않는다', '/* getCurrentUser */', 'const x = 1;'].join('\n'));
    expect(FORBIDDEN.some(([, re]) => re.test(commentOnly))).toBe(false);
  });
});
