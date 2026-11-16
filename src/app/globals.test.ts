import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom 은 globals.css 를 읽지 않는다. 가입 권유 버튼이 `.article a`(본문 글자색·밑줄)에 덮이면 다크 모드에서
// 밝은 글자가 민트 배경 위에 놓여 대비가 1.7:1 로 떨어진다 — 덮어쓰는 규칙이 남아 있고 .article a 뒤에 있는지 소스로 지킨다.
const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');

describe('globals.css .article link override for signup CTA', () => {
  it('keeps the button text colour and removes the underline', () => {
    const rule = css.match(/\.article a\[data-signup-cta\][^{]*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--accent-fg\)/);
    expect(rule![1]).toMatch(/text-decoration:\s*none/);
  });
  it('comes after the generic .article a rule so the override wins', () => {
    expect(css.indexOf('.article a[data-signup-cta]')).toBeGreaterThan(css.indexOf('.article a {'));
  });
});
