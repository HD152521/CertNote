import type { ComponentPropsWithoutRef } from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { mdxOptions } from '@/lib/mdx';
import { parseQuiz } from '@/lib/parseQuiz';
import { QuizSection } from './QuizSection';

interface ArticleProps {
  source: string;
  slug: string;
  week: number;
  day: number;
  lang?: 'ko' | 'en';
}

// 넓은 표가 페이지 전체를 가로로 늘리지 않도록, 표만 스크롤되는 박스로 감싼다.
const mdxComponents = {
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};

export function Article({ source, slug, week, day, lang = 'ko' }: ArticleProps) {
  const { before, questions, after } = parseQuiz(source);
  if (questions.length === 0) {
    return (<div className="article"><MDXRemote source={source} options={mdxOptions} components={mdxComponents} /></div>);
  }
  return (
    <div className="article">
      <MDXRemote source={before} options={mdxOptions} components={mdxComponents} />
      <QuizSection questions={questions} slug={slug} week={week} day={day} lang={lang} />
      {after.trim() && <MDXRemote source={after} options={mdxOptions} components={mdxComponents} />}
    </div>
  );
}
