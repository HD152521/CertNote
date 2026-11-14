import { createElement, type ReactElement } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// 각 루트 레이아웃이 RootDocument 에 넘기는 lang 을 가로챈다. RootDocument 자체(next/font 등)는 가져오지 않는다.
vi.mock('@/components/RootDocument', () => ({ RootDocument: () => null }));

import KoRootLayout, { metadata as koMeta } from './(ko)/layout';
import EnRootLayout, { metadata as enMeta } from './(en)/layout';

const langOf = (el: ReactElement) => (el.props as { lang: string }).lang;
const child = createElement('div');

describe('루트 레이아웃 — <html lang> 은 라우트 그룹이 정한다', () => {
  test('(ko) 루트는 lang="ko"', () => {
    expect(langOf(KoRootLayout({ children: child }) as ReactElement)).toBe('ko');
  });

  test('(en) 루트는 lang="en"', () => {
    expect(langOf(EnRootLayout({ children: child }) as ReactElement)).toBe('en');
  });

  test('영어 루트 기본 metadata 에 한글이 없고 og:locale 이 en_US 다', () => {
    expect(JSON.stringify(enMeta)).not.toMatch(/[ㄱ-ㆎ가-힣]/);
    expect(enMeta.openGraph?.locale).toBe('en_US');
    expect(koMeta.openGraph?.locale).toBe('ko_KR');
  });
});

// 정적 생성 회귀 가드: 레이아웃이 요청 정보를 읽으면 하위 전 페이지가 동적 렌더로 떨어진다.
describe('루트 레이아웃은 요청별 동적 API 를 쓰지 않는다', () => {
  const FILES = ['(ko)/layout.tsx', '(en)/layout.tsx', '../components/RootDocument.tsx'];
  test.each(FILES)('%s', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf-8');
    expect(source).not.toMatch(/from\s+['"]next\/headers['"]/);
    expect(source).not.toMatch(/\bcookies\(|\bheaders\(|\bconnection\(/);
    expect(source).not.toMatch(/export\s+const\s+dynamic\s*=/);
  });

  // 두 그룹이 각자 루트라 최상위(src/app)에는 layout 도 page 도 없어야 한다 — 있으면 루트가 셋이 되거나 빌드가 깨진다.
  test('src/app 최상위에 layout.tsx·page.tsx 가 없다', () => {
    expect(existsSync(join(__dirname, 'layout.tsx'))).toBe(false);
    expect(existsSync(join(__dirname, 'page.tsx'))).toBe(false);
  });

  test('/en/** 라우트는 (en) 그룹 한 곳에만 있다 — (ko) 아래에 en 폴더가 없다', () => {
    expect(existsSync(join(__dirname, '(ko)', 'en'))).toBe(false);
    expect(existsSync(join(__dirname, '(en)', 'en', 'page.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, '(en)', 'en', '[slug]', 'page.tsx'))).toBe(true);
  });
});
