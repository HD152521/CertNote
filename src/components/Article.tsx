import type { ComponentPropsWithoutRef } from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { mdxOptions } from '@/lib/mdx';
import { parseQuiz } from '@/lib/parseQuiz';
import { QuizSection } from './QuizSection';
import { SqlRunBlock } from './sql-lab/SqlRunBlock';

interface ArticleProps {
  source: string;
  slug: string;
  week: number;
  day: number;
  lang?: 'ko' | 'en';
}

// rehypeSqlSource 가 모든 ```sql 블록에 원문(data-sql)을 남긴다. 실행 버튼이 없는 트랙에서는 HTML 에 싣지 않는다.
type FigureProps = ComponentPropsWithoutRef<'figure'> & { 'data-sql'?: string };
const PlainFigure = ({ 'data-sql': _sql, ...props }: FigureProps) => {
  void _sql;
  return <figure {...props} />;
};

// 넓은 표가 페이지 전체를 가로로 늘리지 않도록, 표만 스크롤되는 박스로 감싼다.
const baseComponents = {
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
  figure: PlainFigure,
};

// SQL 실습장(EMP·DEPT 예제 테이블)으로 돌릴 수 있는 트랙. 다른 트랙의 SQL(예: Athena)은 테이블이 달라 버튼을 달지 않는다.
const SQL_RUNNABLE_SLUGS = new Set(['sqld']);
const isRunnableSql = (sql: string) =>
  /^\s*(?:--[^\n]*\n\s*)*(SELECT|WITH|\(|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|RENAME|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(sql);

const BASE_TABLES = new Set(['EMP', 'DEPT', 'SALGRADE', 'DUAL']);
/** 블록이 혼자서 돌 수 있는가: 바꾸거나 읽는 테이블이 예제 테이블이거나 그 블록 안에서 만든 것이어야 한다. */
function isSelfContained(sql: string): boolean {
  const up = sql.toUpperCase();
  const created = new Set([
    ...[...up.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+([A-Z_][A-Z0-9_$#]*)/g)].map((m) => m[1]),
    ...[...up.matchAll(/RENAME\s+[A-Z_][A-Z0-9_$#]*\s+TO\s+([A-Z_][A-Z0-9_$#]*)/g)].map((m) => m[1]),
  ]);
  const used = [...up.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE|USING)\s+([A-Z_][A-Z0-9_$#]*)/g)].map((m) => m[1]);
  return used.every((t) => BASE_TABLES.has(t) || created.has(t) || ['SELECT', 'SET', 'DUAL', 'USER_TABLES', 'USER_CONSTRAINTS', 'USER_TAB_COLUMNS', 'USER_CONS_COLUMNS', 'USER_VIEWS'].includes(t));
}

const sqlComponentsFor = (lang: 'ko' | 'en') => ({
  ...baseComponents,
  figure: ({ 'data-sql': sql, ...props }: FigureProps) =>
    sql && isRunnableSql(sql) && (/^\s*(?:--[^\n]*\n\s*)*(SELECT|WITH|\()/i.test(sql) || isSelfContained(sql)) ? (
      <SqlRunBlock sql={sql} lang={lang}>
        <figure {...props} />
      </SqlRunBlock>
    ) : (
      <figure {...props} />
    ),
});

export function Article({ source, slug, week, day, lang = 'ko' }: ArticleProps) {
  const mdxComponents = SQL_RUNNABLE_SLUGS.has(slug) ? sqlComponentsFor(lang) : baseComponents;
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
