import type { MDXRemoteProps } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrettyCode from 'rehype-pretty-code';

export const mdxOptions: MDXRemoteProps['options'] = {
  parseFrontmatter: false,
  mdxOptions: {
    // 콘텐츠는 plain markdown (JSX 없음). MDX 기본 모드에서 `<1`, `<2024`,
    // ASCII 다이어그램의 `+--+` 같은 패턴을 JSX로 해석하려다 실패하므로
    // format을 'md'로 고정해서 markdown으로만 처리한다.
    format: 'md',
    remarkPlugins: [remarkGfm],
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
          theme: { dark: 'github-dark-dimmed', light: 'github-light' },
          keepBackground: false,
        },
      ],
    ],
  },
};
