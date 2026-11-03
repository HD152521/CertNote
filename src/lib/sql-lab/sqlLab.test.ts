import { describe, expect, test } from 'vitest';
import { runSql, runStatement } from './run';
import { SQL_TASK_SETS, judge, type SqlTaskItem } from './tasks';
import { display, formatNumberSqlplus } from './values';

const item = (setId: string, id: string): SqlTaskItem => {
  const it = SQL_TASK_SETS.find((s) => s.id === setId)?.items.find((i) => i.id === id);
  if (!it) throw new Error(`no task ${setId}/${id}`);
  return it;
};
const verdict = (setId: string, id: string, sql: string) => judge(item(setId, id), runStatement(sql));

describe('SQL 실습장 엔진', () => {
  test('여러 문장을 ; 로 나눠 각각 실행한다(따옴표 안의 ; 는 그대로)', () => {
    const rs = runSql("SELECT 1 FROM DUAL; SELECT 'a;b' FROM DUAL;");
    expect(rs).toHaveLength(2);
    expect(rs[1].kind === 'rows' && rs[1].rows[0][0]).toBe('a;b');
  });

  test('SQL*Plus 숫자 표시 폭(10자)을 따른다', () => {
    expect(formatNumberSqlplus(2916.6666666666665)).toBe('2916.66667');
    expect(formatNumberSqlplus(0.5)).toBe('.5');
    expect(formatNumberSqlplus(12345678901)).toBe('1.2346E+10');
  });

  test('실습장 2·3단계 기능은 가짜 ORA 오류 대신 안내를 낸다', () => {
    for (const sql of [
      'SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) FROM EMP',
      'SELECT LEVEL, ENAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR',
      "UPDATE EMP SET SAL = 0",
      'SELECT DEPTNO, SUM(SAL) FROM EMP GROUP BY ROLLUP(DEPTNO)',
    ]) {
      expect(runStatement(sql).kind, sql).toBe('note');
    }
  });

  test('시험 기준과 23ai 가 다른 곳은 시험 기준 오류에 설명을 붙인다', () => {
    const fromless = runStatement('SELECT 1 + 2');
    expect(fromless.kind === 'error' && fromless.code).toBe('ORA-00923');
    expect(fromless.kind === 'error' && fromless.hint).toMatch(/FROM DUAL/);
    const having = runStatement('SELECT DEPTNO, COUNT(*) CNT FROM EMP GROUP BY DEPTNO HAVING CNT > 3');
    expect(having.kind === 'error' && having.code).toBe('ORA-00904');
    expect(having.kind === 'error' && having.hint).toMatch(/HAVING/);
    const where = runStatement('SELECT SAL * 12 연봉 FROM EMP WHERE 연봉 > 1');
    expect(where.kind === 'error' && where.hint).not.toMatch(/23ai/);
  });

  test('이상한 입력에도 예외를 던지지 않는다', () => {
    for (const sql of ['', ';;;', "SELECT '", 'SELECT * FROM', 'SELECT ((((', 'SELECT 1 FROM DUAL WHERE', '한글만', 'SELECT * FROM EMP WHERE SAL > (SELECT']) {
      expect(() => runSql(sql)).not.toThrow();
    }
  });

  test('큰 결과·긴 문자열·다중 % LIKE 로 탭이 멈추지 않는다', () => {
    const t0 = Date.now();
    expect(runStatement('SELECT COUNT(*) FROM EMP A, EMP B, EMP C, EMP D, EMP E, EMP F').kind).toBe('note');
    expect(runStatement("SELECT LPAD('a', 999999999) FROM DUAL").kind).toBe('note');
    const like = runStatement(`SELECT COUNT(*) FROM DUAL WHERE '${'a'.repeat(5000)}' LIKE '${'%a'.repeat(40)}%b'`);
    expect(like.kind === 'rows' && like.rows[0][0]).toBe(0);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  test('행이 없거나 AND 가 단락돼도 잘못된 이름·함수는 Oracle 처럼 오류다', () => {
    const sub = runStatement('SELECT * FROM EMP WHERE 1 = 0 AND DEPTNO IN (SELECT FOO FROM DEPT)');
    expect(sub.kind === 'error' && sub.code).toBe('ORA-00904');
    const fn = runStatement('SELECT LEN(ENAME) FROM EMP WHERE 1 = 0');
    expect(fn.kind === 'error' && fn.code).toBe('ORA-00904');
    // 상관 서브쿼리는 바깥 열을 참조해도 미리 검사에서 오류가 나지 않는다.
    expect(runStatement('SELECT DNAME FROM DEPT D WHERE EXISTS (SELECT 1 FROM EMP E WHERE E.DEPTNO = D.DEPTNO) ORDER BY 1').kind).toBe('rows');
  });

  test('값 안의 | 때문에 서로 다른 행이 같은 행으로 합쳐지지 않는다', () => {
    const r = runStatement("SELECT 'a|sb', 'c' FROM DUAL UNION SELECT 'a', 'b|sc' FROM DUAL");
    expect(r.kind === 'rows' && r.rows.length).toBe(2);
  });

  test('굽은 따옴표는 ORA-00911 과 설명을 낸다', () => {
    const r = runStatement('SELECT ENAME FROM EMP WHERE JOB = ‘CLERK’');
    expect(r.kind === 'error' && r.code).toBe('ORA-00911');
    expect(r.kind === 'error' && r.hint).toMatch(/따옴표/);
  });

  test('NULL 은 화면에서 빈 칸이다(SQL*Plus 와 같다)', () => {
    const r = runStatement('SELECT COMM FROM EMP WHERE EMPNO = 7369');
    expect(r.kind === 'rows' && display(r.rows[0][0])).toBe('');
  });
});

describe('SQL 실습장 과제 채점', () => {
  test('모든 모범 답안은 자기 자신에게 정답이다', () => {
    for (const set of SQL_TASK_SETS) {
      for (const it of set.items) expect(judge(it, runStatement(it.answer)), `${set.id}/${it.id}`).toEqual({ ok: true });
    }
  });

  test('같은 결과를 내는 다른 쿼리도 정답이다', () => {
    expect(verdict('sql-select-basics', 'annual', 'SELECT ENAME, SAL*12 + COALESCE(COMM, 0) FROM EMP ORDER BY EMPNO')).toEqual({ ok: true });
    expect(verdict('sql-select-basics', 'like-name', "SELECT ENAME FROM EMP WHERE SUBSTR(ENAME, 2, 1) = 'A' ORDER BY 1")).toEqual({ ok: true });
    expect(verdict('sql-select-basics', 'distinct-job', 'SELECT JOB FROM EMP GROUP BY JOB ORDER BY JOB')).toEqual({ ok: true });
    expect(verdict('sql-select-basics', 'hire-year', "SELECT ENAME, HIREDATE FROM EMP WHERE HIREDATE BETWEEN DATE '1981-01-01' AND DATE '1981-12-31' ORDER BY HIREDATE, ENAME")).toEqual({ ok: true });
    expect(verdict('sql-group-join', 'equi-join', "SELECT E.ENAME, D.DNAME FROM EMP E, DEPT D WHERE E.DEPTNO = D.DEPTNO AND D.LOC = 'DALLAS' ORDER BY 1")).toEqual({ ok: true });
    expect(verdict('sql-group-join', 'outer-join', 'SELECT D.DNAME, COUNT(E.EMPNO) FROM EMP E, DEPT D WHERE E.DEPTNO(+) = D.DEPTNO GROUP BY D.DNAME ORDER BY 1')).toEqual({ ok: true });
  });

  test('단골 실수는 오답이고 이유를 알려 준다', () => {
    const nullArith = verdict('sql-select-basics', 'annual', 'SELECT ENAME, SAL * 12 + COMM FROM EMP ORDER BY EMPNO');
    expect(nullArith).toMatchObject({ ok: false, reason: expect.stringMatching(/값이 다른/) });
    const eqNull = verdict('sql-select-basics', 'null-comm', 'SELECT ENAME FROM EMP WHERE COMM = NULL AND DEPTNO = 30 ORDER BY ENAME');
    expect(eqNull).toMatchObject({ ok: false, reason: expect.stringMatching(/행 수/) });
    const countStar = verdict('sql-group-join', 'outer-join', 'SELECT D.DNAME, COUNT(*) FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO GROUP BY D.DNAME ORDER BY D.DNAME');
    expect(countStar.ok).toBe(false);
    const innerSelf = verdict('sql-group-join', 'self-join', 'SELECT E.ENAME, M.ENAME FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO ORDER BY E.ENAME');
    expect(innerSelf).toMatchObject({ ok: false, reason: expect.stringMatching(/13행/) });
    const unordered = verdict('sql-select-basics', 'distinct-job', 'SELECT DISTINCT JOB FROM EMP ORDER BY JOB DESC');
    expect(unordered).toMatchObject({ ok: false, reason: expect.stringMatching(/순서/) });
    const caseOrder = verdict('sql-select-basics', 'case-grade', "SELECT ENAME, SAL, CASE WHEN SAL >= 1500 THEN '중' WHEN SAL >= 3000 THEN '상' ELSE '하' END FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC, ENAME");
    expect(caseOrder.ok).toBe(false);
    const where = verdict('sql-group-join', 'having', 'SELECT DEPTNO, COUNT(*) FROM EMP WHERE COUNT(*) >= 4 GROUP BY DEPTNO');
    expect(where).toMatchObject({ ok: false, reason: expect.stringMatching(/ORA-00934/) });
  });
});
