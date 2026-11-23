import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { SkeletonCard, SkeletonLine } from './Skeleton';

const SRC = resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p: string) => p.slice(SRC.length + 1).split(String.fromCharCode(92)).join('/');

describe('Skeleton 조각', () => {
  test('aria-hidden 이고 motion-safe 펄스만 쓴다', () => {
    for (const el of [createElement(SkeletonLine), createElement(SkeletonCard)]) {
      const html = renderToStaticMarkup(el);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('motion-safe:animate-pulse');
    }
  });

  test('className 으로 크기를 덮어쓴다', () => {
    expect(renderToStaticMarkup(createElement(SkeletonLine, { className: 'h-9' }))).toContain('h-9');
  });
});

describe('animate-pulse', () => {
  test('src 전체에서 motion-safe: 접두 없이 쓰이지 않는다(prefers-reduced-motion 준수)', () => {
    const offenders = walk(SRC)
      .filter((p) => /\.(tsx?|css)$/.test(p) && !p.endsWith('skeleton.test.ts'))
      .filter((p) => /(?<!motion-safe:)animate-pulse/.test(readFileSync(p, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe('loading.tsx 위치', () => {
  // 루트 loading 스트리밍이 하위 notFound()/day 렌더 상태코드를 정한다(proxyRouting.ts). 콘텐츠·허브·day 경로
  // 아래에 새 loading.tsx 를 두지 않는다 — 이미 있는 루트 loading 이 덮는다.
  const ALLOWED = [
    'app/(ko)/loading.tsx',
    'app/(en)/loading.tsx',
    'app/(ko)/exam/loading.tsx',
    'app/(ko)/review/loading.tsx',
    'app/(ko)/notebook/loading.tsx',
    'app/(ko)/dashboard/loading.tsx',
  ];

  test('허용 목록 밖에 loading.tsx 가 없다', () => {
    const found = walk(join(SRC, 'app')).map(rel).filter((p) => p.endsWith('/loading.tsx')).sort();
    expect(found).toEqual([...ALLOWED].sort());
  });

  test.each(ALLOWED.filter((p) => p.startsWith('app/(ko)/')))('%s 는 default 컴포넌트를 렌더한다', async (p) => {
    const mod = await import(/* @vite-ignore */ join(SRC, p.replace(/\.tsx$/, '')));
    const html = renderToStaticMarkup(createElement(mod.default));
    expect(html).toContain('aria-hidden');
    expect(html).toContain('motion-safe:animate-pulse');
    expect(html).not.toMatch(/Loading|불러오는/);
  });

  test('(en) 루트는 (ko) 루트를 re-export 한다', () => {
    expect(readFileSync(join(SRC, 'app/(en)/loading.tsx'), 'utf8')).toContain("from '../(ko)/loading'");
  });
});
