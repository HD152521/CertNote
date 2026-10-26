import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import manifest from '@/app/manifest';
import { BRAND_NAVY, BRAND_TEAL, MARK_CHECK_PATH, MARK_RING_PATH, markSvg } from './brand';

const root = process.cwd();

describe('markSvg', () => {
  test('기본은 둥근 남색 타일 위에 C 고리와 청록 체크', () => {
    const svg = markSvg();
    expect(svg).toContain(`rx="16" fill="${BRAND_NAVY}"`);
    expect(svg).toContain(MARK_RING_PATH);
    expect(svg).toContain(`stroke="${BRAND_TEAL}"`);
    expect(svg).toContain(MARK_CHECK_PATH);
  });

  test('fullBleedScale 이면 모서리 없이 전체를 칠한다(마스커블·Apple 용)', () => {
    const svg = markSvg({ fullBleedScale: 1 });
    expect(svg).toContain('<rect width="64" height="64"');
    expect(svg).not.toContain('rx=');
  });
});

describe('생성된 아이콘 파일 (scripts/gen-icons.mjs)', () => {
  test('app/icon.svg 가 로고 정의와 같다(정의를 바꾸고 다시 만들지 않으면 실패)', () => {
    const file = readFileSync(path.join(root, 'src', 'app', 'icon.svg'), 'utf8').replace(/\r\n/g, '\n').trim();
    expect(file).toBe(markSvg());
  });

  test('매니페스트가 가리키는 PNG 가 선언된 크기로 존재한다', async () => {
    for (const icon of manifest().icons ?? []) {
      const meta = await sharp(path.join(root, 'public', icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
    }
  });

  test('Apple 아이콘은 180px', async () => {
    const meta = await sharp(path.join(root, 'src', 'app', 'apple-icon.png')).metadata();
    expect([meta.width, meta.height]).toEqual([180, 180]);
  });
});
