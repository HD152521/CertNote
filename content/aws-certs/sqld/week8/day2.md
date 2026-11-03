# Day 2 - 함정 정리 2 (실행 순서와 조인)

## 📌 핵심 정리

- SELECT 문은 적힌 순서가 아니라 **FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY** 순서로 처리된다. SELECT 별칭은 그 뒤에 오는 ORDER BY 에서만 쓸 수 있다.
- WHERE 는 묶기 전이라 집계 함수를 쓸 수 없고(ORA-00934), GROUP BY 뒤의 SELECT 에는 묶음 기준 열과 집계만 올 수 있다(ORA-00979).
- ROWNUM 은 WHERE 단계에서 붙고 ORDER BY 는 마지막이다. 정렬한 뒤 Top N 을 자르려면 인라인 뷰로 먼저 정렬한다. `ROWNUM = 2`·`ROWNUM > 1` 은 오류가 아니라 0행이다.
- 테이블 n 개를 이으면 조인 조건은 최소 n−1 개다. 하나라도 빠지면 그만큼 카티션 곱이 생긴다. `(+)` 는 **NULL 로 채워질 쪽**(모자란 쪽)에 붙인다.
- 외부 조인의 안쪽 테이블 조건을 WHERE 에 두면 NULL 행이 떨어져 내부 조인처럼 된다. 단일행 서브쿼리가 두 행 이상을 돌려주면 ORA-01427, BETWEEN 은 양 끝을 포함한다.

## 적힌 순서와 처리 순서

SELECT 문은 SELECT 로 시작하지만, Oracle 이 처리하는 순서는 다르다. 실행 순서 문제는 "이 절에서 저 이름이 보이는가"로 바꿔 생각하면 풀린다.

| 적는 순서 | 처리 순서 | 이 단계에서 하는 일 | 이 단계에서 보이는 것 |
|:-------:|:-------:|------------------|------------------|
| 1 SELECT | 5 | 출력할 식을 계산하고 별칭을 붙인다 | 묶음 기준 열, 집계 결과 |
| 2 FROM | 1 | 테이블을 읽고 조인한다 | 테이블의 모든 열 |
| 3 WHERE | 2 | 행 하나씩 거른다 | 테이블의 열 (집계·별칭 없음) |
| 4 GROUP BY | 3 | 행을 묶는다 | 테이블의 열 |
| 5 HAVING | 4 | 묶음을 거른다 | 묶음 기준 열, 집계 |
| 6 ORDER BY | 6 | 결과를 정렬한다 | SELECT 별칭, 테이블의 열 |

이 표 하나로 아래 네 가지 오류와 동작이 설명된다.

### 별칭은 ORDER BY 에서만

ORDER BY 는 SELECT 다음이라 별칭이 이미 있다.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE DEPTNO = 10 ORDER BY ANNUAL DESC;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
CLARK           29400
MILLER          15600
```

같은 별칭을 WHERE 에 쓰면 아직 만들어지지 않은 이름이다.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

```text
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000
                                                *
ERROR at line 1:
ORA-00904: "ANNUAL": invalid identifier
```

- WHERE 에서는 별칭 대신 식을 그대로 다시 쓴다(`WHERE SAL * 12 > 30000`).
- 시험은 GROUP BY·HAVING 에서도 SELECT 별칭을 쓸 수 없다는 규칙으로 판단한다. 실습장의 Oracle 23ai 는 `GROUP BY 별칭`·`HAVING 별칭`을 허용해 오류 없이 실행된다(W4 Day 2). 23ai 이전 버전에서는 ORA-00904 다.

### WHERE 에는 집계 함수를 쓸 수 없다

WHERE 는 행을 묶기 전 단계다. 부서별 평균은 아직 계산되지 않았다.

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO
                                       *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

집계 조건은 묶은 뒤에 거르는 HAVING 으로 옮긴다.

```sql
SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO HAVING AVG(SAL) > 2000 ORDER BY AVG_SAL DESC;
```

```text
    DEPTNO    AVG_SAL
---------- ----------
        10       2917
        20       2175
```

### GROUP BY 에 없는 열은 SELECT 에 못 쓴다

부서로 묶으면 부서 하나가 한 행이 된다. 그 한 행에 사원 이름 여러 개 중 무엇을 보일지 정할 수 없다.

```sql
SELECT DEPTNO, ENAME, SUM(SAL) FROM EMP GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, ENAME, SUM(SAL) FROM EMP GROUP BY DEPTNO
               *
ERROR at line 1:
ORA-00979: "ENAME": must appear in the GROUP BY clause or be used in an aggregate function
```

- 교재의 문구는 `not a GROUP BY expression` 이다. 23ai 는 문제가 된 열 이름까지 알려 준다. 번호는 같다.
- 반대 방향은 괜찮다. GROUP BY 에 있는 열을 SELECT 에서 빼는 것은 오류가 아니다.

### HAVING 에 집계 없는 조건

HAVING 에 집계가 아닌 묶음 기준 열 조건을 써도 오류가 아니다.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING DEPTNO > 10 ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          5
        30          6
```

- 결과는 `WHERE DEPTNO > 10` 으로 먼저 거른 뒤 묶은 것과 같다. WHERE 쪽은 묶기 전에 행을 줄이고, HAVING 쪽은 다 묶은 뒤 묶음을 버린다.
- HAVING 에서 집계 밖에 쓸 수 있는 열은 묶음 기준 열뿐이다. `HAVING SAL > 1000` 처럼 묶이지 않은 열을 쓰면 ORA-00979 다.

| 헷갈리는 짝 | WHERE | HAVING |
|-----------|-------|--------|
| 거르는 대상 | 행 | 묶음 |
| 집계 함수 | 쓸 수 없다 (ORA-00934) | 쓸 수 있다 |
| 집계 아닌 조건 | 쓸 수 있다 | 묶음 기준 열이면 쓸 수 있다 |
| GROUP BY 없이 | 쓸 수 있다 | 쓸 수 있다. 전체가 한 묶음이 된다 |

## ROWNUM 은 정렬보다 먼저 붙는다

ROWNUM 은 WHERE 를 통과하는 행에 붙는 번호다. ORDER BY 는 처리 순서의 마지막이니, 같은 SELECT 안에서는 **번호를 붙이고 자른 다음에** 정렬한다.

```sql
SELECT ROWNUM, ENAME, SAL FROM EMP WHERE ROWNUM <= 3 ORDER BY SAL DESC;
```

```text
    ROWNUM ENAME             SAL
---------- ---------- ----------
         2 ALLEN            1600
         3 WARD             1250
         1 SMITH             800
```

- 먼저 읽힌 3행(실습 컨테이너에서는 SMITH·ALLEN·WARD)을 자른 뒤 그 3행만 정렬했다. 급여 상위 3명이 아니다. 어느 3행이 먼저 읽힐지도 보장되지 않는다.
- 번호 순서가 2, 3, 1 로 뒤섞인 것이 "정렬 전에 번호가 붙었다"는 증거다.

정렬을 인라인 뷰 안으로 넣으면 정렬된 결과에 번호가 붙는다.

```sql
SELECT ROWNUM AS RN, ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3;
```

```text
        RN ENAME             SAL
---------- ---------- ----------
         1 KING             5000
         2 FORD             3000
         3 SCOTT            3000
```

`ROWNUM = 2` 는 첫 행이 1번을 받고 떨어지면 다음 행도 다시 1번 후보가 되어 끝내 2번이 생기지 않는다(W6 Day 3).

```sql
SELECT COUNT(*) FROM EMP WHERE ROWNUM = 2;
```

```text
  COUNT(*)
----------
         0
```

- `ROWNUM > 1` 도 같은 이유로 0행이다. 오류가 나지 않는다는 점이 보기에서 갈린다.

## 조인 조건이 모자랄 때

### 카티션 곱과 n−1 개의 조건

조인 조건 없이 FROM 에 테이블을 나열하면 모든 행끼리 짝을 짓는다. EMP 14행 × DEPT 4행이다.

```sql
SELECT COUNT(*) FROM EMP, DEPT;
```

```text
  COUNT(*)
----------
        56
```

세 테이블을 이으면서 조건을 하나만 쓰면, 조건이 없는 테이블과는 여전히 곱이 생긴다. SALGRADE 는 5행이다.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        70
```

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO AND E.SAL BETWEEN S.LOSAL AND S.HISAL;
```

```text
  COUNT(*)
----------
        14
```

| 테이블 수 | 필요한 조인 조건 (최소) | 조건이 하나 빠지면 |
|--------:|-------------------:|----------------|
| 2 | 1 | 14 × 4 = 56행 |
| 3 | 2 | (EMP⋈DEPT 14행) × SALGRADE 5행 = 70행 |
| n | n−1 | 빠진 연결마다 곱이 생긴다 |

- 두 번째 조건은 `=` 가 아니라 BETWEEN 이다. n−1 은 조건의 개수이고, 등호일 필요는 없다(Non-EQUI 조인).

### (+) 는 모자란 쪽에

`(+)` 는 짝이 없을 때 **NULL 행을 만들어 채워 줄 쪽**에 붙인다. 모든 부서를 남기고 싶다면 DEPT 는 그대로, EMP 쪽 열에 `(+)` 를 붙인다.

| 남기고 싶은 쪽 | 쓰는 식 | ANSI 로 바꾸면 |
|------------|--------|-------------|
| 모든 부서 | `D.DEPTNO = E.DEPTNO(+)` | `DEPT D LEFT JOIN EMP E` |
| 모든 사원 | `E.DEPTNO = D.DEPTNO(+)` | `EMP E LEFT JOIN DEPT D` |

- "남길 쪽에 붙인다"로 외우면 반대가 된다. 기호가 붙은 쪽이 부족해서 보충되는 쪽이다.

### 외부 조인 뒤의 WHERE

부서마다 CLERK 사원을 붙이되, CLERK 가 없는 부서도 보이고 싶다. `(+)` 표기에서는 EMP 쪽 조건마다 `(+)` 를 붙여야 외부 조인이 유지된다.

```sql
SELECT D.DNAME, E.ENAME FROM DEPT D, EMP E WHERE D.DEPTNO = E.DEPTNO(+) AND E.JOB(+) = 'CLERK' ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     MILLER
OPERATIONS
RESEARCH       ADAMS
RESEARCH       SMITH
SALES          JAMES
```

`E.JOB` 에서 `(+)` 하나를 빠뜨리면 OPERATIONS 가 사라진다.

```sql
SELECT D.DNAME, E.ENAME FROM DEPT D, EMP E WHERE D.DEPTNO = E.DEPTNO(+) AND E.JOB = 'CLERK' ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     MILLER
RESEARCH       ADAMS
RESEARCH       SMITH
SALES          JAMES
```

- OPERATIONS 행은 외부 조인으로 E.JOB 이 NULL 로 채워졌다. 이어서 `NULL = 'CLERK'` 를 검사하니 참이 아니라 떨어진다. 결과는 내부 조인과 같다.
- ANSI 표기에서는 같은 차이가 ON 과 WHERE 사이에서 생긴다. `LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND E.JOB = 'CLERK'` 은 위의 5행, `ON D.DEPTNO = E.DEPTNO WHERE E.JOB = 'CLERK'` 은 4행이다. 실습 컨테이너에서 각각 위 두 결과와 같은 행이 나왔다.

| 안쪽 테이블(EMP) 조건의 위치 | 적용 시점 | 짝 없는 부서 |
|------------------------|--------|-----------|
| `(+)` 를 붙인 WHERE 조건, 또는 ON | 짝을 지을 때 | NULL 로 남는다 |
| `(+)` 없는 WHERE 조건 | 외부 조인이 끝난 뒤 | 떨어진다 (내부 조인과 같아진다) |

> ⚠️ **함정**: 외부 조인 문제에서 WHERE 에 **NULL 로 채워질 쪽 테이블의 열** 조건이 `(+)` 없이 있으면, 외부 조인을 썼어도 결과 행 수는 내부 조인과 같다. 보기의 행 수를 셀 때 NULL 행을 먼저 지운다.

### NATURAL JOIN·USING 의 공통 열에는 별칭을 붙이지 않는다

NATURAL JOIN 과 USING 은 공통 열을 하나로 합친다. 합쳐진 열은 어느 테이블의 것도 아니라 `E.` 나 `D.` 를 붙이면 오류다(W4 Day 5).

```sql
SELECT D.DEPTNO, DNAME FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.ENAME = 'KING';
```

```text
SELECT D.DEPTNO, DNAME FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.ENAME = 'KING'
       *
ERROR at line 1:
ORA-25154: column part of USING clause cannot have qualifier
```

```sql
SELECT E.DEPTNO, DNAME FROM EMP E NATURAL JOIN DEPT D WHERE ENAME = 'KING';
```

```text
SELECT E.DEPTNO, DNAME FROM EMP E NATURAL JOIN DEPT D WHERE ENAME = 'KING'
       *
ERROR at line 1:
ORA-25155: column used in NATURAL join cannot have qualifier
```

별칭을 빼면 둘 다 실행된다. 공통 열이 아닌 `E.ENAME` 에는 별칭을 붙여도 된다.

```sql
SELECT DEPTNO, DNAME FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.ENAME = 'KING';
```

```text
    DEPTNO DNAME
---------- --------------
        10 ACCOUNTING
```

| 조인 방식 | 공통 열에 별칭 | 오류 번호 |
|---------|------------|---------|
| `JOIN … ON` | 붙여야 한다 | 빼면 ORA-00918 |
| `JOIN … USING (열)` | 붙이면 안 된다 | ORA-25154 |
| `NATURAL JOIN` | 붙이면 안 된다 | ORA-25155 |

## 서브쿼리와 집합 연산자

### 단일행 연산자에 여러 행

`=`·`>` 같은 단일행 연산자 뒤의 서브쿼리는 한 행 이하를 돌려줘야 한다. ANALYST 두 명은 급여가 둘 다 3000 이지만 행이 둘이다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE JOB = 'ANALYST');
```

```text
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE JOB = 'ANALYST')
                                        *
ERROR at line 1:
ORA-01427: single-row subquery returns more than one row
```

- 값이 같아도 행 수로 판단한다. 실행해 봐야 행 수가 정해지므로 파싱 오류가 아니라 실행 중 오류다.
- 서브쿼리가 0행이면 오류가 아니다. 비교 대상이 NULL 이 되어 결과가 0행이다. `WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 40)` 의 COUNT(*) 는 0 이었다.
- 여러 행을 받으려면 `IN` 을 쓴다. `SAL IN (SELECT SAL FROM EMP WHERE JOB = 'ANALYST')` 는 FORD·SCOTT 두 행이다.

### UNION 과 UNION ALL

10번 부서 직무(3행)와 20번 부서 직무(5행)를 위아래로 붙인다.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
ANALYST
CLERK
CLERK
CLERK
MANAGER
MANAGER
PRESIDENT
```

| 헷갈리는 짝 | UNION | UNION ALL |
|-----------|-------|-----------|
| 중복 | 결과 전체에서 제거 | 그대로 둔다 |
| 행 수 | 3 + 5 보다 적을 수 있다 (여기서 4) | 항상 3 + 5 = 8 |
| 같은 쪽 안의 중복 | 함께 제거된다 | 그대로 둔다 |

- UNION 은 두 결과 사이의 중복만이 아니라 **한쪽 안의 중복**도 없앤다. 20번 부서의 CLERK 2개도 하나가 된다.
- ORDER BY 는 집합 연산 전체 뒤에 한 번만 쓴다. 첫 SELECT 뒤에 넣으면 실습 컨테이너에서 ORA-03048 이 났다. 교재는 ORA-00933 으로 적는다.

## 조건식의 경계

### BETWEEN 은 양 끝을 포함한다

`BETWEEN a AND b` 는 `>= a AND <= b` 다. 1250 인 MARTIN·WARD 와 1600 인 ALLEN 이 모두 들어간다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL BETWEEN 1250 AND 1600 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL
---------- ----------
MARTIN           1250
WARD             1250
MILLER           1300
TURNER           1500
ALLEN            1600
```

- 작은 값을 먼저 써야 한다. `BETWEEN 1600 AND 1250` 은 `>= 1600 AND <= 1250` 이라 오류 없이 0행이다.
- `NOT BETWEEN a AND b` 는 `< a OR > b` 다. 경계값은 결과에서 빠진다.

### LIKE 의 _ 와 ESCAPE

`%` 는 0글자 이상, `_` 는 **정확히 한 글자**다. 두 번째 글자가 A 인 사원이다.

```sql
SELECT ENAME FROM EMP WHERE ENAME LIKE '_A%' ORDER BY ENAME;
```

```text
ENAME
----------
JAMES
MARTIN
WARD
```

`_` 자체를 찾으려면 ESCAPE 로 지정한 문자를 앞에 붙여 와일드카드 뜻을 끈다. 세 값 'A_B', 'AXB', 'AB' 에 두 패턴을 걸어 본다.

```sql
SELECT V FROM (SELECT 'A_B' AS V FROM DUAL UNION ALL SELECT 'AXB' FROM DUAL UNION ALL SELECT 'AB' FROM DUAL) WHERE V LIKE 'A_B' ORDER BY V;
```

```text
V
---
AXB
A_B
```

```sql
SELECT V FROM (SELECT 'A_B' AS V FROM DUAL UNION ALL SELECT 'AXB' FROM DUAL UNION ALL SELECT 'AB' FROM DUAL) WHERE V LIKE 'A\_B' ESCAPE '\' ORDER BY V;
```

```text
V
---
A_B
```

| 패턴 | 'A_B' | 'AXB' | 'AB' | 이유 |
|-----|:----:|:----:|:---:|-----|
| `'A_B'` | O | O | X | `_` 는 아무 한 글자. 'AB' 는 가운데 글자가 없다 |
| `'A\_B' ESCAPE '\'` | O | X | X | `\_` 는 밑줄 문자 그 자체 |
| `'A%B'` | O | O | O | `%` 는 0글자도 된다 |

- ESCAPE 문자는 `\` 로 정해져 있지 않다. `ESCAPE '#'` 이면 `'A#_B'` 로 쓴다. ESCAPE 절이 없으면 `\` 도 그냥 한 글자다.

> 내일은 같은 SQL 이 Oracle 과 SQL Server 에서 어떻게 달라지는지(문자열 연결, Top N, 날짜 함수 등)를 짝지어 정리한다.

## 📖 용어

- **논리적 실행 순서** : SELECT 문의 절이 처리되는 순서. FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY 다.
- **ORA-00934** : WHERE 처럼 집계 함수를 쓸 수 없는 곳에 집계 함수를 썼을 때의 오류.
- **ORA-00979** : GROUP BY 에 없는 열을 집계 없이 SELECT·HAVING 에 썼을 때의 오류.
- **카티션 곱** : 조인 조건 없이 두 테이블의 모든 행을 서로 짝지은 결과. 행 수는 두 테이블 행 수의 곱이다.
- **(+)** : Oracle 외부 조인 표기. 짝이 없을 때 NULL 로 채워질 쪽의 열에 붙인다.
- **ORA-01427** : 단일행 연산자 뒤의 서브쿼리가 두 행 이상을 돌려줬을 때의 오류.
- **ESCAPE** : LIKE 패턴에서 `%`·`_` 를 문자 그대로 찾게 할 표시 문자를 정하는 절.

## 📝 연습 문제

**문제 1.** SELECT 문의 논리적 실행 순서로 옳은 것은?

A) FROM → WHERE → HAVING → GROUP BY → SELECT → ORDER BY  
B) FROM → GROUP BY → WHERE → HAVING → SELECT → ORDER BY  
C) FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY  
D) FROM → WHERE → GROUP BY → SELECT → HAVING → ORDER BY  

**정답: C**  
해설: 테이블을 읽고(FROM) 행을 거른 뒤(WHERE) 묶고(GROUP BY) 묶음을 거른 다음(HAVING) 출력할 식을 계산하고(SELECT) 마지막에 정렬한다(ORDER BY). A 는 묶기 전에 묶음을 거르는 순서라 성립하지 않는다. B 는 WHERE 가 GROUP BY 뒤에 있어 WHERE 에 집계를 쓸 수 없는 이유를 설명하지 못한다. D 처럼 SELECT 가 HAVING 보다 먼저라면 HAVING 에서 별칭을 쓸 수 있어야 하지만 시험 기준 규칙은 그렇지 않다.

---

**문제 2.** `SELECT COUNT(*) FROM EMP WHERE ROWNUM = 2;` 의 결과는? (EMP 는 14행이다)

A) 0  
B) 1  
C) 14  
D) 오류가 난다  

**정답: A**  
해설: 첫 행은 1번 후보로 `1 = 2` 를 검사받고 떨어진다. 떨어진 행은 번호를 가져가지 않으니 다음 행도 1번 후보가 되어 다시 떨어진다. 14행 모두 같아 결과는 0 이다. 1 은 `ROWNUM = 1` 일 때의 결과다. 14 는 `ROWNUM >= 1` 처럼 모든 행이 통과할 때다. ROWNUM 비교는 문법상 문제가 없어 오류가 나지 않는다.

---

**문제 3.** `SELECT COUNT(*) FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO WHERE E.JOB = 'CLERK';` 의 결과는? (CLERK 는 10번에 1명, 20번에 2명, 30번에 1명이고 40번 부서에는 사원이 없다)

A) 5  
B) 14  
C) 6  
D) 4  

**정답: D**  
해설: LEFT JOIN 이 끝난 뒤 WHERE 가 적용된다. 사원이 없는 40번 부서 행은 E.JOB 이 NULL 이라 `NULL = 'CLERK'` 가 참이 아니어서 떨어진다. 남는 것은 CLERK 4명이다. 5 는 JOB 조건을 ON 에 두어 40번 부서가 NULL 행으로 남을 때의 결과다. 14 는 JOB 조건 없이 사원 수만 센 값이고, 6 은 30번 부서 인원이다.

---

**문제 4.** `SELECT ENAME FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE JOB = 'ANALYST');` 를 실행한 결과는? (ANALYST 는 FORD·SCOTT 두 명이고 급여는 둘 다 3000 이다)

A) FORD, SCOTT 두 행이 나온다  
B) ORA-01427 오류가 난다  
C) 0행이 나온다  
D) ORA-00934 오류가 난다  

**정답: B**  
해설: `=` 는 단일행 연산자라 서브쿼리가 한 행 이하여야 한다. 급여 값이 같아도 서브쿼리 결과는 두 행이므로 ORA-01427(single-row subquery returns more than one row)이 난다. A 는 `IN` 으로 바꿨을 때의 결과다. C 는 서브쿼리가 0행일 때의 결과다. ORA-00934 는 WHERE 에 집계 함수를 썼을 때의 오류라 여기와 관계가 없다.

---

**문제 5.** `SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 1250 AND 1600;` 의 결과는? (급여가 1250 인 사원 2명, 1300·1500·1600 인 사원이 1명씩 있고 나머지는 이 범위 밖이다)

A) 2  
B) 3  
C) 4  
D) 5  

**정답: D**  
해설: BETWEEN 은 양 끝을 포함해 `SAL >= 1250 AND SAL <= 1600` 과 같다. 1250 두 명, 1300, 1500, 1600 이 모두 들어가 5 다. 2 는 양 끝을 모두 뺀 경우(1300, 1500)다. 3 은 아래 끝 1250 을 뺀 경우이고, 4 는 위 끝 1600 을 뺀 경우다.
