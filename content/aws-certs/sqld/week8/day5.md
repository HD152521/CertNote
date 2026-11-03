# Day 5 - 2과목 총정리

## 📌 핵심 정리

- 함수는 행마다 값 하나를 내는 **단일행**(문자·숫자·날짜·변환·NULL)과 여러 행을 하나로 접는 **다중행**(집계)으로 나뉜다. 윈도우 함수는 집계를 하되 행을 줄이지 않는다.
- 다중행 서브쿼리에는 `IN`·`ANY`·`ALL`·`EXISTS` 를 쓴다. `> ANY` 는 최솟값보다 크다, `> ALL` 은 최댓값보다 크다는 뜻이고, 서브쿼리가 비면 `ALL` 은 모든 행이 참이다.
- 그룹 묶음 수는 `ROLLUP` n + 1, `CUBE` 2ⁿ, `GROUPING SETS` 는 적은 개수 그대로다. 결과 행 수는 묶음마다 나오는 그룹 수를 더한 값이다.
- 동점에서 RANK 는 건너뛰고(1, 2, 2, 4), DENSE_RANK 는 건너뛰지 않고(1, 2, 2, 3), ROW_NUMBER 는 다른 번호를 준다. OVER 에 ORDER BY 만 있으면 범위는 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` 다.
- DELETE 는 DML 이라 되돌릴 수 있고, TRUNCATE·DROP 은 DDL 이라 Oracle 에서 바로 확정된다. 제약 조건은 PK·UNIQUE·NOT NULL·CHECK·FK 다섯 가지다.

## 이 노트가 다루는 범위

W3~W7 에서 배운 2과목(SQL 기본 및 활용, 관리 구문)을 헷갈리는 짝 위주로 다시 놓는다. NULL·COUNT 함정은 W8 Day 1, 실행 순서·조인 함정은 W8 Day 2, Oracle 과 SQL Server 차이는 W8 Day 3 에 있어 여기서는 다루지 않는다.

## 함수 — 단일행과 다중행

| 분류 | 대표 함수 | 결과가 갈리는 지점 |
|------|---------|----------------|
| 문자 | `SUBSTR`, `INSTR`, `LENGTH`, `TRIM`·`LTRIM`·`RTRIM`, `LPAD`·`RPAD`, `REPLACE` | 위치는 1부터 센다. SUBSTR 의 시작이 음수면 뒤에서 센다. INSTR 은 못 찾으면 0 |
| 숫자 | `ROUND`, `TRUNC`, `CEIL`, `FLOOR`, `MOD`, `ABS`, `SIGN` | 자릿수가 음수면 정수부에서 자른다. CEIL 은 큰 쪽, FLOOR 는 작은 쪽 정수 |
| 날짜 | `SYSDATE`, `ADD_MONTHS`, `MONTHS_BETWEEN`, `LAST_DAY`, `NEXT_DAY` | 날짜 − 날짜 = 일수, 날짜 + 날짜 = 오류. 말일에 ADD_MONTHS 하면 결과도 말일 |
| 변환 | `TO_CHAR`, `TO_DATE`, `TO_NUMBER` | Oracle 의 명시적 변환 함수는 이 셋이다(표준 `CAST` 도 쓸 수 있다). 암시적 변환은 NLS 설정에 따라 결과가 달라진다 |
| NULL | `NVL`, `NVL2`, `NULLIF`, `COALESCE` | `NVL2(a, b, c)` 는 a 가 NULL 이 아니면 b. `NULLIF(a, b)` 는 같으면 NULL, 다르면 a |
| 조건 | `CASE`, `DECODE` | CASE 는 처음 참인 WHEN 하나만 쓴다. DECODE 는 NULL 끼리를 같다고 본다 |
| 다중행 | `COUNT`, `SUM`, `AVG`, `MAX`, `MIN` | 그룹마다 한 값. `COUNT(*)` 외에는 NULL 을 건너뛴다 |

숫자·문자 함수에서 부호와 자릿수가 섞이는 경우를 한 번에 돌린다.

```sql
SELECT SUBSTR('SQLDEVELOPER', -3, 2) AS SUB, INSTR('SQLDEVELOPER', 'E', 1, 2) AS INS, ROUND(45.678, -1) AS RND, TRUNC(45.678, 1) AS TRC, CEIL(-1.2) AS CL, FLOOR(-1.2) AS FL, MOD(-7, 3) AS MD FROM DUAL;
```

```text
SU        INS        RND        TRC         CL         FL         MD
-- ---------- ---------- ---------- ---------- ---------- ----------
PE          7         50       45.6         -1         -2         -1
```

- `SUBSTR(…, -3, 2)` 는 뒤에서 세 번째 글자 P 에서 두 글자다. `INSTR(…, 'E', 1, 2)` 는 두 번째 E 의 위치 7 이다.
- `ROUND(45.678, -1)` 은 일의 자리에서 반올림해 50, `TRUNC(45.678, 1)` 은 소수 첫째 자리까지 남겨 45.6 이다.
- 음수에서 CEIL 은 0 쪽(−1), FLOOR 는 0 에서 먼 쪽(−2)이다. Oracle 의 MOD 는 결과 부호가 앞 인자를 따라 −1 이다.

## 서브쿼리 — 자리와 연산자

| 자리 | 이름 | 제약 |
|------|------|------|
| SELECT 절 | 스칼라 서브쿼리 | 한 행 한 열만 돌려야 한다 |
| FROM 절 | 인라인 뷰 | ORDER BY 를 쓸 수 있다 |
| WHERE·HAVING 절 | 중첩 서브쿼리 | ORDER BY 를 쓸 수 없다(ORA-00907) |

| 연산자 | 뜻 | 서브쿼리 결과가 비면 |
|--------|----|----------------|
| `=`, `>`, `<` … | 단일행 비교. 여러 행이 오면 ORA-01427 | 비교 대상이 없어 0행 |
| `IN` | 목록 중 하나와 같다 | 0행 |
| `> ANY` | 하나라도 보다 크다 = 최솟값보다 크다 | 0행 |
| `> ALL` | 모두보다 크다 = 최댓값보다 크다 | **모든 행이 참** |
| `EXISTS` | 서브쿼리가 한 행이라도 내면 참 | 거짓 |

30번 부서 급여(950, 1250, 1250, 1500, 1600, 2850)를 기준으로 세 연산자의 결과 행 수를 나란히 센다. 마지막 열은 없는 부서 99 를 기준으로 한 `> ALL` 이다.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE SAL > ANY (SELECT SAL FROM EMP WHERE DEPTNO = 30)) AS GT_ANY, (SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 30)) AS GT_ALL, (SELECT COUNT(*) FROM EMP WHERE SAL IN (SELECT SAL FROM EMP WHERE DEPTNO = 30)) AS IN_CNT, (SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 99)) AS ALL_EMPTY FROM DUAL;
```

```text
    GT_ANY     GT_ALL     IN_CNT  ALL_EMPTY
---------- ---------- ---------- ----------
        12          4          6         14
```

- `> ANY` 는 950 보다 큰 12명이다. 950 인 JAMES 와 800 인 SMITH 만 빠진다.
- `> ALL` 은 2850 보다 큰 KING·FORD·SCOTT·JONES 4명이다.
- 비교할 값이 하나도 없으면 `> ALL` 은 "모두보다 크다" 를 어길 값이 없어 14명 전부 참이다.
- 바깥 열을 안에서 쓰면 상관 서브쿼리, 안 쓰면 비상관 서브쿼리다. 상관 서브쿼리는 바깥 행마다 다시 계산된다(W5 Day 2).

## 집합 연산자 — 위아래로 잇는 규칙

| 연산자 | 결과 | 중복 |
|--------|------|------|
| `UNION` | 합집합 | 제거 |
| `UNION ALL` | 이어 붙이기 | 남김 |
| `INTERSECT` | 교집합 | 제거 |
| `MINUS` | 앞에서 뒤를 뺀 차집합 | 제거 |

- 위아래 SELECT 의 열 개수(ORA-01789)와 자료형 계열(ORA-01790)이 맞아야 한다.
- 결과 열 이름은 첫 SELECT 가 정한다. ORDER BY 는 맨 끝에 한 번만 쓴다.
- 연산자끼리 우선순위가 같아 위에서 아래로 계산한다.

10번 부서 직무(CLERK, MANAGER, PRESIDENT)와 20번 부서 직무(CLERK 2, ANALYST 2, MANAGER 1)로 네 연산자의 행 수를 비교한다.

```sql
SELECT (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS U, (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS UA, (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 INTERSECT SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS I, (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS M FROM DUAL;
```

```text
         U         UA          I          M
---------- ---------- ---------- ----------
         4          8          2          1
```

- UNION ALL 은 3 + 5 = 8행 그대로다. UNION 은 중복을 지워 CLERK·MANAGER·PRESIDENT·ANALYST 4행이다.
- 공통은 CLERK·MANAGER 2행, 10번에만 있는 직무는 PRESIDENT 1행이다.

## ROLLUP·CUBE·GROUPING SETS — 결과 행 수 세기

행 수는 두 단계로 센다. 먼저 묶음 목록을 펼치고, 각 묶음에서 나오는 그룹 수를 더한다.

| 문법 | 펼친 묶음 | 묶음 수 |
|------|---------|--------|
| `ROLLUP(A, B)` | (A, B), (A), () | n + 1 = 3 |
| `CUBE(A, B)` | (A, B), (A), (B), () | 2ⁿ = 4 |
| `GROUPING SETS(A, B)` | (A), (B) | 적은 대로 2 |
| `GROUPING SETS((A, B), ())` | (A, B), () | 2 |

EMP 의 그룹 수는 (DEPTNO, JOB) 조합 9개, DEPTNO 3개, JOB 5개, 총계 1개다.

```sql
SELECT (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY DEPTNO, JOB)) AS BASE, (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY ROLLUP(DEPTNO, JOB))) AS RLP, (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY CUBE(DEPTNO, JOB))) AS CUB, (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY GROUPING SETS(DEPTNO, JOB))) AS GSETS FROM DUAL;
```

```text
      BASE        RLP        CUB      GSETS
---------- ---------- ---------- ----------
         9         13         18          8
```

| 문법 | 계산 | 행 수 |
|------|------|------|
| `GROUP BY DEPTNO, JOB` | 9 | 9 |
| `ROLLUP(DEPTNO, JOB)` | 9 + 3 + 1 | 13 |
| `CUBE(DEPTNO, JOB)` | 9 + 3 + 5 + 1 | 18 |
| `GROUPING SETS(DEPTNO, JOB)` | 3 + 5 | 8 |

- ROLLUP 은 인자 순서가 소계 기준을 바꾼다. `ROLLUP(JOB, DEPTNO)` 이면 소계가 JOB 별 5개라 9 + 5 + 1 = 15행이다. CUBE 는 순서와 관계없이 같은 행 집합이다.
- 소계 행에서 접힌 열은 NULL 로 보인다. 원래 NULL 과 가르려면 `GROUPING(열)` 이 1 인지 본다.

## 윈도우 함수 — 동점과 기본 범위

30번 부서를 급여 오름차순으로 세운다. MARTIN·WARD 가 1250 으로 동점이다. 마지막 열은 OVER 에 ORDER BY 만 준 누적 합이다.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL) AS RNK, DENSE_RANK() OVER (ORDER BY SAL) AS DRNK, ROW_NUMBER() OVER (ORDER BY SAL, ENAME) AS RN, SUM(SAL) OVER (ORDER BY SAL) AS RUN_SUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL        RNK       DRNK         RN    RUN_SUM
---------- ---------- ---------- ---------- ---------- ----------
JAMES             950          1          1          1        950
MARTIN           1250          2          2          2       3450
WARD             1250          2          2          3       3450
TURNER           1500          4          3          4       4950
ALLEN            1600          5          4          5       6550
BLAKE            2850          6          5          6       9400
```

- 동점 뒤 TURNER 의 RANK 는 4, DENSE_RANK 는 3 이다. ROW_NUMBER 는 ENAME 을 두 번째 키로 줘서 MARTIN 이 2, WARD 가 3 으로 고정되었다.
- RUN_SUM 에서 MARTIN 과 WARD 가 둘 다 3450 이다. 기본 범위가 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` 라서 같은 SAL 값인 행을 한꺼번에 더한다. 한 행씩 쌓으려면 `ROWS` 로 바꾼다(W6 Day 2).

| OVER 안 | 계산 범위 |
|---------|---------|
| 비어 있음 `OVER ()` | 전체 행 |
| `PARTITION BY` 만 | 파티션 전체 |
| `ORDER BY` 포함 | 파티션 처음부터 현재 행 값까지 (RANGE) |

- 윈도우 함수는 SELECT·ORDER BY 절에만 쓴다. WHERE 에 쓰면 ORA-30483 이라 순위로 거르려면 인라인 뷰로 감싼다.
- `LAST_VALUE` 가 (정렬값에 동점이 없으면) 현재 행 값을 돌려주는 것도 같은 기본 범위 때문이다. 동점이 있으면 같은 정렬값을 가진 마지막 행의 값이 나온다.

> ⚠️ **함정**: 순위 함수 문항에서 "동점 다음 순위" 와 "마지막 순위" 를 따로 묻는다. RANK 의 마지막 값은 맨 뒤에 동점이 없으면 행 수, DENSE_RANK 의 마지막 값은 서로 다른 값의 개수다.

## 계층형 질의 — PRIOR 방향과 용어

| 용어 | 뜻 |
|------|----|
| `START WITH` | 루트(출발) 행 조건 |
| `CONNECT BY PRIOR EMPNO = MGR` | 이미 찾은 행의 EMPNO 를 MGR 로 가진 행으로 내려간다 (순방향) |
| `CONNECT BY PRIOR MGR = EMPNO` | 이미 찾은 행의 MGR 을 EMPNO 로 가진 행으로 올라간다 (역방향) |
| `LEVEL` | 루트가 1 인 깊이 |
| `CONNECT_BY_ISLEAF` | 그 전개에서 자식이 없으면 1 |
| `CONNECT_BY_ROOT 열` | 그 행이 속한 트리의 루트 값 |
| `SYS_CONNECT_BY_PATH(열, '/')` | 루트부터 현재 행까지 이은 경로 |
| `ORDER SIBLINGS BY` | 트리 모양을 유지하고 형제끼리만 정렬 |

SMITH 에서 출발해 위로 올라간다.

```sql
SELECT LEVEL, ENAME, CONNECT_BY_ISLEAF AS LEAF FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO ORDER BY LEVEL;
```

```text
     LEVEL ENAME            LEAF
---------- ---------- ----------
         1 SMITH               0
         2 FORD                0
         3 JONES               0
         4 KING                1
```

- 역방향이라도 LEVEL 은 출발점이 1 이다. 조직의 최상위인 KING 이 여기서는 LEVEL 4 다.
- 잎 노드 판정도 전개 방향을 따른다. 역방향 전개에서 KING 은 더 올라갈 곳이 없어 LEAF 가 1 이다.
- WHERE 조건은 트리를 만든 뒤 그 행만 빼고, CONNECT BY 조건은 그 행 아래 가지까지 잘라 낸다.

## PIVOT·UNPIVOT

- `PIVOT (집계 FOR 열 IN (값 AS 별칭, …))` 은 행 값을 열 머리로 세운다. 집계·FOR 에 쓰지 않은 **나머지 열 전부**가 묶음 기준이라 인라인 뷰로 열을 줄여 넘긴다.
- `UNPIVOT (값열 FOR 이름열 IN (열, …))` 은 반대로 열을 행으로 내린다. NULL 행은 기본으로 버리고, `INCLUDE NULLS` 를 주면 남긴다.

```sql
SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT (COUNT(*) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30)) ORDER BY JOB;
```

```text
JOB              D10        D20        D30
--------- ---------- ---------- ----------
ANALYST            0          2          0
CLERK              1          2          1
MANAGER            1          1          1
PRESIDENT          1          0          0
SALESMAN           0          0          4
```

- 인라인 뷰가 DEPTNO·JOB 만 넘겨서 남은 JOB 하나로 묶여 5행이다. EMP 를 그대로 넘기면 EMPNO 까지 묶음 기준이 되어 14행이다(W7 Day 1).
- COUNT 는 해당 행이 없으면 0, SUM 이었다면 NULL 이다.

## 정규 표현식 — 함수 다섯 개

| 함수 | 돌려주는 것 |
|------|----------|
| `REGEXP_LIKE(문자열, 패턴)` | 조건(WHERE 에 쓴다). 패턴이 어딘가에 있으면 참 |
| `REGEXP_SUBSTR(문자열, 패턴, 시작, n번째)` | 맞은 부분 문자열 |
| `REGEXP_INSTR` | 맞은 위치 (없으면 0) |
| `REGEXP_REPLACE` | 바꾼 문자열. `\1` 로 괄호 묶음을 다시 쓴다 |
| `REGEXP_COUNT` | 맞은 횟수 |

```sql
SELECT REGEXP_SUBSTR('A12-B345-C6', '[0-9]+', 1, 2) AS SUB, REGEXP_COUNT('A12-B345-C6', '[0-9]') AS CNT, REGEXP_INSTR('A12-B345-C6', '-') AS INS, REGEXP_REPLACE('2026-11-04', '(\d+)-(\d+)-(\d+)', '\3/\2/\1') AS REP FROM DUAL;
```

```text
SUB        CNT        INS REP
--- ---------- ---------- ----------
345          6          4 04/11/2026
```

- `[0-9]+` 의 두 번째 일치는 345 다. `[0-9]` 는 숫자 한 글자라 개수는 6 이다.
- LIKE 는 문자열 전체가 맞아야 하고 REGEXP_LIKE 는 일부만 맞아도 된다. 전체를 맞추려면 `^…$` 로 감싼다.

## 관리 구문 — 넷으로 나누기

| 분류 | 명령어 | Oracle 에서 확정 |
|------|-------|--------------|
| DML | `INSERT`, `UPDATE`, `DELETE`, `MERGE` (`SELECT` 포함) | COMMIT 해야 확정, ROLLBACK 가능 |
| DDL | `CREATE`, `ALTER`, `DROP`, `RENAME`, `TRUNCATE` | 실행 전후 암묵적 COMMIT |
| DCL | `GRANT`, `REVOKE` | 실행 즉시 |
| TCL | `COMMIT`, `ROLLBACK`, `SAVEPOINT` | — |

- SELECT 를 DQL 로 따로 떼는 교재도 있다. 보기에 DQL 이 없으면 DML 로 본다.
- DDL 하나가 실행되면 그 앞의 커밋하지 않은 DML 도 함께 확정된다. `ROLLBACK TO 저장점` 은 그 저장점 뒤만 취소하고, 그 뒤에 만든 저장점은 사라진다.

### DELETE · TRUNCATE · DROP

세 문장을 "무엇이 남는가" 로 비교한다.

| 질문 | DELETE | TRUNCATE | DROP |
|------|--------|----------|------|
| 분류 | DML | DDL | DDL |
| 일부 행만 지울 수 있나 | WHERE 로 가능 | 불가 | 불가 |
| Oracle 에서 ROLLBACK | 가능 | 불가 | 불가 |
| 지운 뒤 테이블 구조 | 남는다 | 남는다 | 없다 (ORA-00942) |
| 저장 공간 | 그대로 | 돌려준다 | 돌려준다 |

### 제약 조건

| 제약 | NULL | 중복 | 테이블당 |
|------|------|------|--------|
| PRIMARY KEY | 불가 | 불가 | 하나 |
| UNIQUE | 여러 개 허용 | 불가 | 여럿 |
| NOT NULL | 불가 | 허용 | 열마다 |
| CHECK | 조건이 NULL 이면 통과 | 허용 | 여럿 |
| FOREIGN KEY | 허용 | 허용 | 여럿 (부모 PK·UNIQUE 값만) |

- FK 옵션이 없으면 자식이 있는 부모 행은 지울 수 없다. `ON DELETE CASCADE` 는 자식도 지우고, `ON DELETE SET NULL` 은 자식 FK 를 NULL 로 바꾼다.
- CTAS(`CREATE TABLE … AS SELECT`)로 복사하면 제약 조건은 NOT NULL 만 따라온다.
- 객체 권한의 `WITH GRANT OPTION` 은 REVOKE 가 연쇄되고, 시스템 권한의 `WITH ADMIN OPTION` 은 연쇄되지 않는다.

## 시험 운영

- 50문항, 90분, 전부 객관식이고 문항당 2점이다.
- 2과목 SQL 기본 및 활용은 40문항 80점이다. 과목별 40% 미만이 과락이라 2과목은 32점(16문항) 미만이면 총점과 관계없이 불합격이다.
- 합격은 총점 60점 이상이면서 두 과목 모두 과락이 없을 때다.

출처: content/aws-certs/sqld/README.md 의 시험 정보 표(데이터자격검정 SQL 자격 소개, dataq.or.kr, 2026-11-03 확인).

## 📖 용어

- **단일행 함수** : 행 하나에 결과 하나를 내는 함수. 문자·숫자·날짜·변환·NULL 함수가 여기에 든다.
- **다중행 서브쿼리** : 여러 행을 돌려주는 서브쿼리. `IN`·`ANY`·`ALL`·`EXISTS` 와 함께 쓴다.
- **그룹 묶음** : ROLLUP·CUBE·GROUPING SETS 를 펼쳤을 때 나오는 GROUP BY 기준 하나하나. `()` 는 총계 묶음이다.
- **기본 윈도우 범위** : OVER 에 ORDER BY 만 있을 때 쓰이는 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. 동점 행을 함께 포함한다.
- **역방향 전개** : `CONNECT BY PRIOR MGR = EMPNO` 처럼 자식에서 부모로 올라가는 계층형 질의.
- **암묵적 COMMIT** : Oracle 에서 DDL 실행 전후로 자동으로 일어나는 확정.

## 📝 연습 문제

**문제 1.** EMP 의 (DEPTNO, JOB) 조합은 9가지다. `SELECT COUNT(*) FROM (SELECT DEPTNO, JOB, COUNT(*) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), ()));` 의 결과는?

A) 13  
B) 10  
C) 9  
D) 18  

**정답: B**  
해설: 펼친 묶음은 (DEPTNO, JOB) 과 총계 () 둘이다. 9개 조합에 총계 1행을 더해 10행이다. 13 은 DEPTNO 별 소계 3행까지 붙는 `ROLLUP(DEPTNO, JOB)` 의 결과다. 9 는 `()` 를 빼먹고 센 값이다. 18 은 JOB 별 소계까지 모두 만드는 `CUBE(DEPTNO, JOB)` 의 결과다.

---

**문제 2.** 20번 부서의 급여는 SCOTT 3000, FORD 3000, JONES 2975, ADAMS 1100, SMITH 800 이다. 다음 SQL 에서 JONES 행의 RNK, DRNK 값은?
`SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) AS RNK, DENSE_RANK() OVER (ORDER BY SAL DESC) AS DRNK FROM EMP WHERE DEPTNO = 20;`

A) 3, 2  
B) 2, 2  
C) 3, 3  
D) 2, 3  

**정답: A**  
해설: 3000 인 두 명이 함께 1위다. RANK 는 동점 수만큼 건너뛰어 다음이 3위이고, DENSE_RANK 는 건너뛰지 않아 2위다. B 는 RANK 도 건너뛰지 않는다고 본 것이다. C 는 DENSE_RANK 도 건너뛴다고 본 것이다. D 는 두 함수의 동작을 서로 바꿔 읽은 것이다.

---

**문제 3.** 99번 부서는 EMP 에 없다. `SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 99);` 의 결과는?

A) 0  
B) ORA-01427 오류  
C) 1  
D) 14  

**정답: D**  
해설: 서브쿼리가 0행이면 `> ALL` 조건은 어길 비교 대상이 없어 모든 행에서 참이다. 그래서 14명 전부 남는다. 0 은 `> ANY` 나 `IN` 처럼 빈 서브쿼리에서 거짓이 되는 연산자의 결과다. ORA-01427 은 단일행 연산자에 여러 행이 올 때의 오류라 ALL 에는 나지 않는다. 1 은 근거가 없는 값이다.

---

**문제 4.** Oracle 에서 DELETE·TRUNCATE·DROP 에 대한 설명으로 옳은 것은?

A) DELETE 는 WHERE 절 없이 쓸 수 없다  
B) TRUNCATE 에 WHERE 절을 붙여 일부 행만 지울 수 있다  
C) TRUNCATE 는 DDL 이라 ROLLBACK 으로 되돌릴 수 없고 테이블 구조는 남는다  
D) DROP 한 뒤에도 테이블 구조가 남아 바로 INSERT 할 수 있다  

**정답: C**  
해설: TRUNCATE 는 DDL 이라 실행하면 암묵적으로 확정되어 ROLLBACK 이 듣지 않는다. 행만 비우고 테이블 정의는 남긴다. A 는 틀렸다. WHERE 없는 DELETE 는 모든 행을 지운다. B 는 틀렸다. TRUNCATE 는 언제나 모든 행을 지운다. D 는 틀렸다. DROP 은 구조까지 없애 이후 접근은 ORA-00942 다.

---

**문제 5.** 다음 SQL 에서 KING 행의 LEVEL 값은? (SMITH 의 관리자는 FORD, FORD 의 관리자는 JONES, JONES 의 관리자는 KING 이고 KING 은 관리자가 없다)
`SELECT LEVEL, ENAME FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO;`

A) 4  
B) 1  
C) 3  
D) KING 은 결과에 없다  

**정답: A**  
해설: `PRIOR MGR = EMPNO` 는 이미 찾은 행의 관리자를 다음 행으로 잇는 역방향 전개다. 출발점 SMITH 가 LEVEL 1 이고 FORD 2, JONES 3, KING 4 다. B 는 조직의 최상위라서 1 이라고 본 것인데, LEVEL 은 START WITH 행부터 센다. C 는 JONES 의 LEVEL 이다. D 는 순방향으로 착각한 것이다. 순방향이라면 SMITH 아래로 내려가 KING 이 나오지 않는다.
