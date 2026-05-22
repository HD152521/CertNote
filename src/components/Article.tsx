import { MDXRemote } from 'next-mdx-remote/rsc';
import { mdxOptions } from '@/lib/mdx';

interface ArticleProps { source: string; }

export function Article({ source }: ArticleProps) {
  return (
    <div className="article">
      <MDXRemote source={source} options={mdxOptions} />
    </div>
  );
}
