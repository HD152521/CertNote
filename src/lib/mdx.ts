import type { MDXRemoteProps } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrettyCode from 'rehype-pretty-code';

// 마크다운을 읽는 규칙. 본문(Article)과 요약 카드(SummaryCard)가 같은 목록을 쓴다.
//
// CommonMark 는 닫는 `**` 바로 앞이 문장부호(괄호·따옴표 등)이고 바로 뒤가 글자면 강조로 보지 않는다.
// 한국어는 굵은 말 뒤에 조사가 바로 붙어서(`**적합(fit)**이`) 이 규칙에 걸려 별표가 화면에 그대로 보였다.
// remark-cjk-friendly 가 한글·한자·가나 옆에서는 이 조건을 풀어 준다.
//
// 취소선용 짝 플러그인(remark-cjk-friendly-gfm-strikethrough)은 일부러 넣지 않았다. 본문에 `~~취소선~~조사`
// 꼴이 없어 얻는 것이 없고, 물결표 하나도 취소선으로 읽는 remark-gfm 기본값과 만나면 `"~하는", "~를"` 같은
// 문장이 새로 취소선으로 바뀐다(전체 콘텐츠를 파싱해 확인).
//
// singleTilde: false — remark-gfm 기본값은 물결표 하나도 취소선으로 읽어 `0.1~3.9가 Low, 4.0~6.9` 같은
// 범위 표기 사이에 줄이 그어졌다(100곳). 취소선은 `~~두 개~~` 로 쓴 것만 인정한다.
export const remarkPlugins: NonNullable<NonNullable<NonNullable<MDXRemoteProps['options']>['mdxOptions']>['remarkPlugins']> = [
  [remarkGfm, { singleTilde: false }],
  remarkCjkFriendly,
];

export const mdxOptions: MDXRemoteProps['options'] = {
  parseFrontmatter: false,
  mdxOptions: {
    // 콘텐츠는 plain markdown (JSX 없음). MDX 기본 모드에서 `<1`, `<2024`,
    // ASCII 다이어그램의 `+--+` 같은 패턴을 JSX로 해석하려다 실패하므로
    // format을 'md'로 고정해서 markdown으로만 처리한다.
    format: 'md',
    remarkPlugins,
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap',
          properties: { className: ['heading-anchor'] },
        },
      ],
      [
        rehypePrettyCode,
        {
          // 단일 테마: 코드블록은 라이트/다크 모두 다크 카드로 통일(globals.css의 .article pre).
          // 단일 테마는 토큰 색을 인라인 style로 직접 내보내 별도 변수 CSS가 필요 없고,
          // 두 테마를 만드는 비용·HTML 크기를 줄인다.
          theme: 'github-dark-dimmed',
          keepBackground: false,
        },
      ],
    ],
  },
};
