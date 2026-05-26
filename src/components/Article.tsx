import { MDXRemote } from 'next-mdx-remote/rsc';
import { mdxOptions } from '@/lib/mdx';
import { parseQuiz } from '@/lib/parseQuiz';
import { QuizSection } from './QuizSection';

interface ArticleProps { source: string; }

export function Article({ source }: ArticleProps) {
  const { before, questions, after } = parseQuiz(source);
  if (questions.length === 0) {
    return (<div className="article"><MDXRemote source={source} options={mdxOptions} /></div>);
  }
  return (
    <div className="article">
      <MDXRemote source={before} options={mdxOptions} />
      <QuizSection questions={questions} />
      {after.trim() && <MDXRemote source={after} options={mdxOptions} />}
    </div>
  );
}
