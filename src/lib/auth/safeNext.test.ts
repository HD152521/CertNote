import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('keeps internal paths with query and hash', () => {
    expect(safeNext('/aws/saa-c03?x=1#top')).toBe('/aws/saa-c03?x=1#top');
    expect(safeNext('/exam')).toBe('/exam');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'evil.example',
    // 경로 이탈로 정규화 결과가 //host 가 되는 우회
    '/exam/..//evil.example',
    '/exam/../..//evil.example',
    '/exam/%2e%2e/%2e%2e//evil.example',
  ])('rejects %j', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });

  it('falls back when empty and honours a custom fallback', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext('', '/welcome')).toBe('/welcome');
    expect(safeNext('//evil.example', '/welcome')).toBe('/welcome');
  });
});
