import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseQuiz } from './parseQuiz';
import { quizSqlPlan } from './quizSqlLink';
import { runStatement } from './sql-lab/run';

const ROOT = path.join(process.cwd(), 'content/aws-certs/sqld');
const questions = readdirSync(ROOT)
  .filter((w) => /^week\d+$/.test(w))
  .flatMap((w) =>
    readdirSync(path.join(ROOT, w))
      .filter((f) => /^day\d+\.md$/.test(f))
      .flatMap((f) => parseQuiz(readFileSync(path.join(ROOT, w, f), 'utf8')).questions.map((q) => ({ where: `${w}/${f}#${q.number}`, q }))),
  );

describe('SQLD 퀴즈 → SQL 실습장', () => {
  test('SQLD 가 아닌 문항에는 붙지 않는다', () => {
    expect(quizSqlPlan({ slug: 'linux-master-2', prompt: '`SELECT 1 FROM DUAL`', choices: [] })).toBeNull();
  });

  test('지문의 인라인 코드와 보기의 SELECT 문을 모은다', () => {
    const plan = quizSqlPlan({
      slug: 'sqld',
      prompt: '`SELECT COUNT(*) FROM EMP WHERE COMM = NULL;` 의 결과는? `NULL` 은 비교할 수 없다.',
      choices: [{ label: 'A', text: 'SELECT ENAME FROM EMP' }, { label: 'B', text: '0' }],
    });
    expect(plan?.statements).toEqual(['SELECT COUNT(*) FROM EMP WHERE COMM = NULL', 'SELECT ENAME FROM EMP']);
  });

  test('SQLD 문항의 상당수에 실행 버튼이 붙고, 뽑은 문장은 모두 실습장이 처리한다', () => {
    const planned = questions.map(({ where, q }) => ({ where, plan: quizSqlPlan({ slug: 'sqld', prompt: q.text, choices: q.choices }) })).filter((x) => x.plan);
    expect(planned.length).toBeGreaterThanOrEqual(30);
    for (const { where, plan } of planned) {
      for (const sql of plan!.statements) {
        const r = runStatement(sql);
        // ORA 오류는 문항이 묻는 내용일 수 있다. 실습장이 못 다루는 문장(note)만 막는다.
        expect(r.kind, `${where}: ${sql}`).not.toBe('note');
      }
    }
  });
});
