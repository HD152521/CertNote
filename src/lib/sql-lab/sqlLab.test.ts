import { describe, expect, test } from 'vitest';
import { runSql, runStatement } from './run';
import { SQL_TASK_SETS, judge, runForTask, type SqlTaskItem } from './tasks';
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

  test('실습장이 흉내 내지 않는 기능은 가짜 ORA 오류 대신 안내를 낸다', () => {
    for (const sql of [
      'GRANT SELECT ON EMP TO SCOTT',
      'SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT XML (COUNT(*) FOR DEPTNO IN (ANY))',
      "CREATE VIEW V_T AS SELECT * FROM DEPT; INSERT INTO V_T VALUES (50, 'IT', 'SEOUL')",
    ]) {
      const rs = runSql(sql);
      expect(rs[rs.length - 1].kind, sql).toBe('note');
    }
  });

  test('DML·TCL: 한 번 실행 안에서 세션이 이어지고, 실행마다 처음 데이터로 돌아온다', () => {
    const rs = runSql("INSERT INTO DEPT VALUES (50, 'IT', 'SEOUL'); SAVEPOINT A; DELETE FROM DEPT WHERE DEPTNO = 40; ROLLBACK TO A; SELECT COUNT(*) FROM DEPT; ROLLBACK; SELECT COUNT(*) FROM DEPT");
    expect(rs.map((r) => (r.kind === 'rows' ? r.rows[0][0] : r.kind === 'message' ? r.message : r.kind))).toEqual(['1 row created.', 'Savepoint created.', '1 row deleted.', 'Rollback complete.', 5, 'Rollback complete.', 4]);
    const again = runStatement('SELECT COUNT(*) FROM DEPT');
    expect(again.kind === 'rows' && again.rows[0][0]).toBe(4);
    const fk = runStatement('DELETE FROM DEPT WHERE DEPTNO = 10');
    expect(fk.kind === 'error' && fk.code).toBe('ORA-02292');
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
    // CUBE 인자가 많으면 묶음이 2ⁿ 개 — 실행하지 않고 안내한다.
    expect(runStatement('SELECT COUNT(*) FROM EMP GROUP BY CUBE(EMPNO, ENAME, JOB, MGR, HIREDATE, SAL, COMM, DEPTNO, 1, 2, 3, 4)').kind).toBe('note');
    expect(runStatement('SELECT COUNT(*) FROM EMP GROUP BY ROLLUP(JOB, MGR), ROLLUP(SAL, COMM), ROLLUP(DEPTNO, EMPNO), ROLLUP(ENAME, HIREDATE)').kind).toBe('note');
    // 큰 조인 위의 CUBE: 묶음 수 × 행 수 상한
    expect(runStatement('SELECT COUNT(*) FROM EMP A, EMP B, EMP C, DEPT D, DEPT E GROUP BY CUBE(A.JOB, B.JOB, C.JOB, D.LOC, E.LOC, A.DEPTNO)').kind).toBe('note');
    // 큰 조인 위의 상관 서브쿼리: 문장 전체 작업량 상한
    expect(runStatement('SELECT COUNT(*) FROM EMP A, EMP B, EMP C, EMP D WHERE A.SAL > (SELECT AVG(X.SAL) FROM EMP X, EMP Y WHERE X.DEPTNO = D.DEPTNO)').kind).toBe('note');
    // 무거운 문자열 계산: 시간 상한(3초)에서 멈춘다
    const slow = Date.now();
    expect(runStatement("SELECT COUNT(*) FROM EMP A, EMP B, EMP C WHERE EXISTS (SELECT 1 FROM EMP X, EMP Y WHERE LPAD(X.ENAME || Y.ENAME, 2000, 'ab') LIKE '%a%b%a%b%z%' || A.ENAME)").kind).toBe('note');
    expect(Date.now() - slow).toBeLessThan(6000);
    // 큰 조인 위의 윈도우 함수는 누적 합으로 빨리 끝나고, 거대한 계층은 3초 상한에서 멈춘다
    const w0 = Date.now();
    expect(runStatement('SELECT COUNT(*) FROM (SELECT SUM(A.SAL) OVER () X FROM EMP A, EMP B, EMP C, EMP D)').kind).toBe('rows');
    expect(Date.now() - w0).toBeLessThan(3000);
    expect(runStatement('SELECT COUNT(*) FROM EMP A, EMP B, EMP C START WITH A.MGR IS NULL CONNECT BY PRIOR A.EMPNO = A.MGR').kind).toBe('note');
    // MAX 처럼 누적 합을 못 쓰는 프레임, RANGE n 프레임도 3초 안에 끝나거나 멈춘다
    for (const sql of [
      'SELECT COUNT(*) FROM (SELECT MAX(A.SAL) OVER (ORDER BY A.SAL, B.SAL, C.SAL, D.SAL) X FROM EMP A, EMP B, EMP C, EMP D)',
      'SELECT COUNT(*) FROM (SELECT SUM(A.SAL) OVER (ORDER BY A.SAL RANGE BETWEEN 100 PRECEDING AND 100 FOLLOWING) X FROM EMP A, EMP B, EMP C, EMP D)',
    ]) {
      const s0 = Date.now();
      runStatement(sql);
      expect(Date.now() - s0, sql).toBeLessThan(3600);
    }
    // 아주 깊은 계층은 전용 안내
    const deep = runStatement('SELECT COUNT(*) FROM DUAL CONNECT BY LEVEL <= 5000');
    expect(deep.kind === 'note' && deep.message).toMatch(/깊어서/);
    // 반복 안의 반복 정규식은 실행하지 않고 안내, PK 가 있는 테이블에 큰 INSERT … SELECT 도 3초 안에
    expect(runStatement("SELECT REGEXP_COUNT(RPAD('A', 28, 'A') || 'B', '(A+)+C') FROM DUAL").kind).toBe('note');
    const pk0 = Date.now();
    const big = runSql('CREATE TABLE T_BIG (A NUMBER PRIMARY KEY); INSERT INTO T_BIG SELECT ROWNUM FROM EMP A, EMP B, EMP C, EMP D');
    expect(big[1].kind === 'message' && big[1].message).toBe('38416 rows created.');
    expect(Date.now() - pk0).toBeLessThan(3500);
    // 재귀 WITH 는 아직 안내만
    expect(runStatement('WITH R (N) AS (SELECT 1 FROM DUAL UNION ALL SELECT N + 1 FROM R WHERE N < 5) SELECT * FROM R').kind).toBe('note');
    expect(Date.now() - t0).toBeLessThan(25000);
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
      for (const it of set.items) expect(runForTask(it, it.answer).verdict, `${set.id}/${it.id}`).toEqual({ ok: true });
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
    const notIn = verdict('sql-subquery-rollup', 'not-manager', 'SELECT ENAME FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP) ORDER BY ENAME');
    expect(notIn).toMatchObject({ ok: false, reason: expect.stringMatching(/0행/) });
    const unionAll = verdict('sql-subquery-rollup', 'union-jobs', 'SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 30 ORDER BY JOB');
    expect(unionAll.ok).toBe(false);
  });

  test('S4 단골 실수는 오답, 같은 결과의 다른 쓰기는 정답', () => {
    expect(verdict('sql-window-hierarchy', 'dense-rank', 'SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) FROM EMP ORDER BY 3, ENAME').ok).toBe(false);
    expect(verdict('sql-window-hierarchy', 'top3-sal', 'SELECT ENAME, SAL FROM EMP WHERE ROWNUM <= 3 ORDER BY SAL DESC, ENAME').ok).toBe(false);
    expect(verdict('sql-window-hierarchy', 'top3-sal', 'SELECT * FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3')).toEqual({ ok: true });
    expect(verdict('sql-window-hierarchy', 'org-chart', 'SELECT LEVEL, ENAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR MGR = EMPNO ORDER SIBLINGS BY ENAME').ok).toBe(false);
    expect(verdict('sql-window-hierarchy', 'org-chart', 'SELECT LEVEL, ENAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER BY ENAME').ok).toBe(false);
    expect(verdict('sql-window-hierarchy', 'dept-top', 'SELECT DEPTNO, ENAME, SAL FROM EMP WHERE ROW_NUMBER() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC) = 1')).toMatchObject({ ok: false, reason: expect.stringMatching(/ORA-30483/) });
    expect(verdict('sql-window-hierarchy', 'running-total', 'SELECT ENAME, HIREDATE, SAL, SUM(SAL) OVER (ORDER BY HIREDATE, ENAME ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM EMP WHERE DEPTNO = 30 ORDER BY 2, 1')).toEqual({ ok: true });
  });

  test('S5 데이터 변경 과제는 바뀐 상태로 채점한다', () => {
    const task = (id: string) => SQL_TASK_SETS.find((x) => x.id === 'sql-pivot-dml')!.items.find((i) => i.id === id)!;
    const v = (id: string, sql: string) => runForTask(task(id), sql).verdict;
    expect(v('insert-dept', "INSERT INTO DEPT (DEPTNO, DNAME, LOC) VALUES (50, 'IT', 'SEOUL')")).toEqual({ ok: true });
    expect(v('update-raise', 'UPDATE EMP SET SAL = SAL * 1.1')?.ok).toBe(false);
    expect(v('delete-dept', 'DELETE FROM DEPT WHERE DEPTNO = 20')).toMatchObject({ ok: false, reason: expect.stringMatching(/ORA-02292/) });
    expect(v('savepoint', "INSERT INTO DEPT VALUES (50, 'IT', 'SEOUL'); SAVEPOINT A; INSERT INTO DEPT VALUES (60, 'HR', 'BUSAN'); ROLLBACK")?.ok).toBe(false);
    expect(v('create-table', "CREATE TABLE T_MEMBER (ID NUMBER(4) PRIMARY KEY, NAME VARCHAR2(10) NOT NULL, GRADE CHAR(1) DEFAULT 'B' CHECK (GRADE IN ('A','B','C'))); INSERT INTO T_MEMBER VALUES (1, 'KIM', 'B'); INSERT INTO T_MEMBER (ID, NAME, GRADE) VALUES (2, 'LEE', 'A')")).toEqual({ ok: true });
  });

  test('S3 도 같은 결과면 다른 쓰기를 정답으로 본다', () => {
    expect(verdict('sql-subquery-rollup', 'rollup-dept', 'SELECT DEPTNO, SUM(SAL) FROM EMP GROUP BY GROUPING SETS(DEPTNO, ()) ORDER BY 1')).toEqual({ ok: true });
    expect(verdict('sql-subquery-rollup', 'dept-max', 'SELECT DEPTNO, ENAME, SAL FROM EMP E WHERE SAL = (SELECT MAX(SAL) FROM EMP X WHERE X.DEPTNO = E.DEPTNO) ORDER BY 1, 2')).toEqual({ ok: true });
    expect(verdict('sql-subquery-rollup', 'not-manager', 'SELECT ENAME FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP WHERE MGR IS NOT NULL) ORDER BY 1')).toEqual({ ok: true });
  });
});
