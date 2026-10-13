import { describe, expect, it } from 'vitest';
import { compileMDX } from 'next-mdx-remote/rsc';
import { renderToStaticMarkup } from 'react-dom/server';
import { mdxOptions } from './mdx';

// 실제 화면과 같은 설정(mdxOptions)으로 마크다운을 HTML 로 만든다.
async function render(source: string): Promise<string> {
  const { content } = await compileMDX({ source, options: mdxOptions });
  return renderToStaticMarkup(content);
}

describe('mdxOptions — 한글 조사가 붙은 굵은 글씨', () => {
  // CommonMark 는 닫는 `**` 앞이 문장부호이고 뒤가 글자면 강조로 보지 않는다.
  // 한국어는 굵은 말 바로 뒤에 조사가 붙으므로 이 규칙에 걸려 별표가 그대로 보였다.
  it.each([
    ['**적합(fit)**이 중요하다', '<strong>적합(fit)</strong>이'],
    ['**"따옴표"**는 인용이다', '<strong>&quot;따옴표&quot;</strong>는'],
    ['**A/B**와 비교한다', '<strong>A/B</strong>와'],
    ['값은 **(선택)**입니다', '<strong>(선택)</strong>입니다'],
    ['이것은 **굵게** 다음 글자', '<strong>굵게</strong> 다음'],
    ['*기울임(italic)*도 된다', '<em>기울임(italic)</em>도'],
  ])('%s', async (source, expected) => {
    const html = await render(source);

    expect(html).toContain(expected);
    expect(html).not.toContain('*');
  });

  it('취소선 규칙은 건드리지 않는다', async () => {
    const plain = await render('~~lowest-price~~ — 사용 비권장');
    const quoted = await render('"~하는 경우에 적합하다", "~를 줄일 수 있다"처럼 쓴다');

    expect(plain).toContain('<del>lowest-price</del>');
    // 짝 플러그인을 넣으면 이 문장의 물결표 둘이 취소선으로 묶인다. 넣지 않은 이유.
    expect(quoted).not.toContain('<del>');
  });

  it('물결표 하나로 쓴 범위 표기는 취소선이 되지 않는다', async () => {
    const range = await render('0.1~3.9가 Low, 4.0~6.9가 Medium이다');

    expect(range).not.toContain('<del>');
    expect(range).toContain('0.1~3.9가 Low, 4.0~6.9가 Medium');
  });

  it('코드 안의 별표는 그대로 둔다', async () => {
    const inline = await render('인라인 `**kwargs(dict)**이` 코드');
    const block = await render('```\n**적합(fit)**이\n```');

    expect(inline).toContain('**kwargs(dict)**이');
    expect(inline).not.toContain('<strong>');
    expect(block).toContain('**적합(fit)**이');
    expect(block).not.toContain('<strong>');
  });

  it('표·링크·목록 렌더는 그대로다', async () => {
    const html = await render(
      ['| 용어 | 뜻 |', '| --- | --- |', '| **적합(fit)**이 | [문서](https://example.com) |', '', '- [x] 완료'].join('\n'),
    );

    expect(html).toContain('<table>');
    expect(html).toContain('<strong>적합(fit)</strong>이');
    expect(html).toContain('<a href="https://example.com">문서</a>');
    expect(html).toContain('type="checkbox"');
  });
});
