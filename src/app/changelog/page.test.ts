import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import ChangelogPage, { metadata } from './page';

describe('/changelog', () => {
  test('canonical 은 /changelog', () => {
    expect(metadata.alternates?.canonical).toBe('/changelog');
  });

  test('P4 수정 항목과 날짜를 렌더한다', () => {
    const html = renderToStaticMarkup(ChangelogPage());
    expect(html).toContain('2026년 10월 23일');
    expect(html).toContain('리눅스마스터 1급 모의고사 26번 복수정답 수정');
    expect(html).toContain('사실 정정');
  });
});
