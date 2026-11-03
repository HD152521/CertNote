// SQLD 퀴즈 → SQL 실습장 연결(가벼운 모듈). 문항 지문·보기에 든 SELECT 문을 뽑아
// 해설 아래에서 바로 실행해 볼 수 있게 한다. 엔진(sql-lab)은 import 하지 않는다 — 모든 day 페이지에 실린다.
import type { QuizShellInput } from './quizShellLink';

export interface QuizSqlPlan {
  statements: string[];
}

const MAX_STATEMENTS = 4;
const SQL_SLUGS = new Set(['sqld']);
const isSelect = (s: string) => /^\s*SELECT\b/i.test(s) && /\bFROM\b/i.test(s);
const clean = (s: string) => s.trim().replace(/;\s*$/, '').trim();

/** 지문의 `인라인 코드`·```코드 블록``` 과 보기 문장에서 SELECT 문을 모은다. */
export function quizSqlPlan(q: Pick<QuizShellInput, 'slug' | 'prompt' | 'choices'>): QuizSqlPlan | null {
  if (!q.slug || !SQL_SLUGS.has(q.slug)) return null;
  const found: string[] = [];
  const add = (s: string) => {
    const c = clean(s);
    if (isSelect(c) && !found.includes(c)) found.push(c);
  };
  for (const m of q.prompt.matchAll(/```(?:sql)?\n?([\s\S]*?)```/g)) m[1].split(/;\s*(?:\n|$)/).forEach(add);
  for (const m of q.prompt.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`]+)`/g)) add(m[1]);
  for (const c of q.choices) add(c.text.replace(/^`|`$/g, ''));
  return found.length ? { statements: found.slice(0, MAX_STATEMENTS) } : null;
}
