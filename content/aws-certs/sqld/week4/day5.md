# Day 5 - 표준 조인 (ANSI)

## 📌 핵심 정리

- ANSI 표기는 조인 조건을 **FROM 절의 `ON`** 에 쓰고, WHERE 에는 행을 거르는 조건만 남긴다.
- **NATURAL JOIN** 은 이름이 같은 열 **전부**로, **USING** 은 지정한 열로 EQUI 조인한다. 두 경우 모두 그 열에 **접두사를 붙이면 오류**다(ORA-25155, ORA-25154).
- **CROSS JOIN** 은 카테시안 곱이다. ON 을 붙일 수 없다.
- `LEFT`·`RIGHT`·`FULL OUTER JOIN` 은 이름의 방향 쪽 테이블을 모두 남긴다. FULL 은 Oracle `(+)`로는 쓸 수 없다.
- 외부 조인에서 안쪽 테이블 조건을 **ON 에 두면 짝짓기 조건**, **WHERE 에 두면 결과 필터**다. 결과 행 수가 달라진다.

## INNER JOIN ... ON

어제의 EQUI 조인을 ANSI 표기로 옮기면 쉼표 대신 `JOIN`을, WHERE 대신 `ON`을 쓴다.

```sql
SELECT E.ENAME, D.DNAME
FROM EMP E INNER JOIN DEPT D ON E.DEPTNO = D.DEPTNO
WHERE E.DEPTNO = 10
ORDER BY E.ENAME;
```

```text
ENAME      DNAME
---------- --------------
CLARK      ACCOUNTING
KING       ACCOUNTING
MILLER     ACCOUNTING
```

- `INNER`는 생략할 수 있다. `JOIN`만 쓰면 INNER JOIN 이다.
- 조인 조건(ON)과 일반 조건(WHERE)이 다른 절로 나뉘어, 조건을 빠뜨렸는지 보기 쉽다.
- ON 에는 `=`가 아닌 조건도 쓸 수 있다. Non-EQUI 조인도 ANSI 로 표현된다.

`JOIN`만 쓰고 조인 조건을 주지 않으면 문법 오류다. 카테시안 곱이 필요하면 CROSS JOIN 을 쓴다.

```sql
SELECT COUNT(*) FROM EMP JOIN DEPT;
```

```text
SELECT COUNT(*) FROM EMP JOIN DEPT
                                 *
ERROR at line 1:
ORA-02000: missing ON or USING keyword
```

## NATURAL JOIN

NATURAL JOIN 은 두 테이블에서 **이름이 같은 열을 모두 찾아** 그 열들의 값이 같은 행끼리 잇는다. 조건을 따로 쓰지 않는다.

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP NATURAL JOIN DEPT WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME          DEPTNO DNAME
---------- ---------- --------------
CLARK              10 ACCOUNTING
KING               10 ACCOUNTING
MILLER             10 ACCOUNTING
```

- EMP 와 DEPT 에 공통으로 있는 열은 DEPTNO 하나라 `E.DEPTNO = D.DEPTNO`와 같은 조인이 된다.
- 공통 열 DEPTNO 는 결과에서 **하나로 합쳐진다**. 그래서 접두사 없이 `DEPTNO`라고 써도 ORA-00918 이 나지 않는다.

`SELECT *`로 보면 합쳐진 모습이 드러난다.

```sql
SELECT * FROM DEPT NATURAL JOIN EMP WHERE EMPNO = 7839;
```

```text
    DEPTNO DNAME          LOC                EMPNO ENAME      JOB              MGR HIREDATE          SAL       COMM
---------- -------------- ------------- ---------- ---------- --------- ---------- ---------- ---------- ----------
        10 ACCOUNTING     NEW YORK            7839 KING       PRESIDENT            1981-11-17       5000
```

```sql
SELECT * FROM DEPT D JOIN EMP E ON D.DEPTNO = E.DEPTNO WHERE EMPNO = 7839;
```

```text
    DEPTNO DNAME          LOC                EMPNO ENAME      JOB              MGR HIREDATE          SAL       COMM     DEPTNO
---------- -------------- ------------- ---------- ---------- --------- ---------- ---------- ---------- ---------- ----------
        10 ACCOUNTING     NEW YORK            7839 KING       PRESIDENT            1981-11-17       5000                    10
```

- NATURAL JOIN: 공통 열 DEPTNO 가 **맨 앞에 한 번**만 나오고 나머지 열이 이어진다. 10열이다.
- ON 조인: 양쪽 DEPTNO 가 **둘 다** 나온다. 11열이다.

### 공통 열에는 접두사를 붙이지 않는다

합쳐진 DEPTNO 는 어느 한 테이블의 열이 아니다. 테이블 별칭을 붙이면 오류다.

```sql
SELECT E.ENAME, E.DEPTNO FROM EMP E NATURAL JOIN DEPT D;
```

```text
SELECT E.ENAME, E.DEPTNO FROM EMP E NATURAL JOIN DEPT D
                *
ERROR at line 1:
ORA-25155: column used in NATURAL join cannot have qualifier
```

- `E.ENAME`은 공통 열이 아니라 접두사를 붙여도 된다. 문제가 된 것은 `E.DEPTNO`다.

공통 열이 하나도 없으면 NATURAL JOIN 은 조건 없는 조인, 즉 카테시안 곱이 된다.

```sql
SELECT COUNT(*) FROM EMP NATURAL JOIN SALGRADE;
```

```text
  COUNT(*)
----------
        70
```

- EMP 와 SALGRADE 에는 이름이 같은 열이 없다. 14 × 5 = 70 행이다.
- 반대로 의도하지 않은 같은 이름 열(예: 두 테이블 모두에 있는 `NAME`)이 있으면 그 열까지 조건에 들어간다. NATURAL JOIN 은 열 이름에 결과가 좌우된다.

## USING

USING 은 같은 이름 열 중 **조인에 쓸 열을 직접 고른다**. 괄호 안에 열 이름을 쓴다.

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP JOIN DEPT USING (DEPTNO) WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME          DEPTNO DNAME
---------- ---------- --------------
CLARK              10 ACCOUNTING
KING               10 ACCOUNTING
MILLER             10 ACCOUNTING
```

USING 에 쓴 열도 NATURAL JOIN 처럼 하나로 합쳐지므로 접두사를 붙일 수 없다. SELECT 든 WHERE 든 같다.

```sql
SELECT ENAME, DEPTNO FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.DEPTNO = 10;
```

```text
SELECT ENAME, DEPTNO FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.DEPTNO = 10
                                                                 *
ERROR at line 1:
ORA-25154: column part of USING clause cannot have qualifier
```

| 표기 | 조인 열 | 공통 열 접두사 | 공통 열 표시 |
|------|--------|--------------|------------|
| `NATURAL JOIN` | 같은 이름 열 **전부** (자동) | 불가 (ORA-25155) | 한 번 |
| `JOIN ... USING (열)` | 괄호 안에 지정한 열 | 불가 (ORA-25154) | 한 번 |
| `JOIN ... ON 조건` | 조건에 쓴 대로 | **필요** (없으면 ORA-00918) | 양쪽 따로 |

- NATURAL JOIN 과 USING 은 같은 이름 열의 EQUI 조인만 된다. 이름이 다른 열이나 Non-EQUI 조건은 ON 으로만 쓴다.

## CROSS JOIN

CROSS JOIN 은 카테시안 곱을 **일부러** 만들 때 쓴다.

```sql
SELECT COUNT(*) FROM EMP CROSS JOIN DEPT;
```

```text
  COUNT(*)
----------
        56
```

조건을 받지 않는 조인이라 ON 을 붙이면 문법 오류다.

```sql
SELECT COUNT(*) FROM EMP CROSS JOIN DEPT ON EMP.DEPTNO = DEPT.DEPTNO;
```

```text
SELECT COUNT(*) FROM EMP CROSS JOIN DEPT ON EMP.DEPTNO = DEPT.DEPTNO
                                         *
ERROR at line 1:
ORA-03048: SQL reserved word 'ON' is not syntactically valid following '...(*) FROM EMP CROSS JOIN DEPT '
```

- CROSS JOIN 뒤 WHERE 에 조건을 쓰는 것은 가능하다. 그러면 결과는 EQUI 조인과 같아진다.

## OUTER JOIN — LEFT·RIGHT·FULL

방향은 `JOIN` 키워드를 기준으로 왼쪽 테이블·오른쪽 테이블을 가리킨다. 그 방향 쪽의 행이 짝이 없어도 모두 남는다.

```sql
SELECT D.DEPTNO, D.DNAME, E.ENAME
FROM DEPT D LEFT OUTER JOIN EMP E ON D.DEPTNO = E.DEPTNO
WHERE D.DEPTNO IN (10, 40)
ORDER BY D.DEPTNO, E.ENAME;
```

```text
    DEPTNO DNAME          ENAME
---------- -------------- ----------
        10 ACCOUNTING     CLARK
        10 ACCOUNTING     KING
        10 ACCOUNTING     MILLER
        40 OPERATIONS
```

- 왼쪽(DEPT)의 40번이 짝 없이 남았다. 어제의 `E.DEPTNO(+) = D.DEPTNO`와 같은 결과다.
- `OUTER`는 생략할 수 있다. `LEFT JOIN`도 같은 뜻이다.

| ANSI | Oracle `(+)` | 모두 남는 쪽 | EMP·DEPT 결과 행 수 |
|------|-------------|------------|-----:|
| `DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO` | `E.DEPTNO(+) = D.DEPTNO` | DEPT | 15 |
| `EMP E RIGHT JOIN DEPT D ON E.DEPTNO = D.DEPTNO` | `E.DEPTNO(+) = D.DEPTNO` | DEPT | 15 |
| `EMP E FULL JOIN DEPT D ON E.DEPTNO = D.DEPTNO` | 표현할 수 없다 | 양쪽 | 15 |

```sql
SELECT COUNT(*) FROM EMP E RIGHT OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

```sql
SELECT COUNT(*) FROM EMP E FULL OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

- LEFT 와 RIGHT 는 테이블 순서를 바꾸면 서로 같다. `A LEFT JOIN B`는 `B RIGHT JOIN A`다.
- FULL 은 "양쪽 짝 있는 행 + 왼쪽만 있는 행 + 오른쪽만 있는 행"이다. 이 데이터에서는 부서 없는 사원이 없어, DEPT 40 하나만 더해진 15행이다.

짝이 없는 행만 골라내는 데도 외부 조인을 쓴다. NULL 로 채워진 쪽의 키가 NULL 인 행이 짝 없는 행이다.

```sql
SELECT D.DNAME FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO WHERE E.EMPNO IS NULL;
```

```text
DNAME
--------------
OPERATIONS
```

ANSI 조인과 `(+)`는 한 쿼리에서 섞을 수 없다.

```sql
SELECT COUNT(*) FROM EMP E JOIN DEPT D ON E.DEPTNO = D.DEPTNO WHERE E.DEPTNO(+) = D.DEPTNO;
```

```text
SELECT COUNT(*) FROM EMP E JOIN DEPT D ON E.DEPTNO = D.DEPTNO WHERE E.DEPTNO(+) = D.DEPTNO
                                                                    *
ERROR at line 1:
ORA-25156: old style outer join (+) cannot be used with ANSI joins
```

## ON 에 둘까, WHERE 에 둘까

INNER JOIN 에서는 조건을 ON 에 두든 WHERE 에 두든 결과가 같다. 외부 조인에서는 다르다. 부서별로 급여 3000 이상인 사원을 붙이되 모든 부서를 보이고 싶은 상황이다.

```sql
SELECT D.DNAME, E.ENAME, E.SAL
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND E.SAL >= 3000
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME             SAL
-------------- ---------- ----------
ACCOUNTING     KING             5000
OPERATIONS
RESEARCH       FORD             3000
RESEARCH       SCOTT            3000
SALES
```

```sql
SELECT D.DNAME, E.ENAME, E.SAL
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO
WHERE E.SAL >= 3000
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME             SAL
-------------- ---------- ----------
ACCOUNTING     KING             5000
RESEARCH       FORD             3000
RESEARCH       SCOTT            3000
```

| 조건 위치 | 언제 적용되나 | 결과 |
|----------|------------|------|
| ON | **짝지을 때**. 조건에 맞는 사원만 짝으로 인정한다 | 짝이 없는 SALES·OPERATIONS 도 NULL 로 남는다 (5행) |
| WHERE | **외부 조인이 끝난 뒤** 결과 행을 거른다 | NULL 행은 `NULL >= 3000`이 참이 아니라 떨어진다 (3행) |

- WHERE 에 안쪽 테이블(EMP) 조건을 두면 NULL 로 채운 행이 사라져 사실상 INNER JOIN 이 된다. 어제 본 `E.SAL > 2900`에 `(+)`를 빠뜨린 경우와 같은 현상이다.

> ⚠️ **함정**: 반대로 **남기는 쪽(DEPT) 조건을 ON 에 두면 행이 줄지 않는다.** `ON D.DEPTNO = E.DEPTNO AND D.DEPTNO = 10`은 "10번 부서만 사원과 짝지어라"는 뜻이다. 나머지 부서도 모두 결과에 남고 사원 열만 NULL 이 된다. 남기는 쪽의 행을 거르려면 WHERE 에 쓴다.

```sql
SELECT D.DNAME, E.ENAME
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND D.DEPTNO = 10
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     CLARK
ACCOUNTING     KING
ACCOUNTING     MILLER
OPERATIONS
RESEARCH
SALES
```

```sql
SELECT D.DNAME, E.ENAME
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO
WHERE D.DEPTNO = 10
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     CLARK
ACCOUNTING     KING
ACCOUNTING     MILLER
```

- ON 버전은 6행, WHERE 버전은 3행이다. RESEARCH·SALES 는 사원이 있는데도 ON 버전에서 사원 열이 비었다. 10번이 아니라 짝을 인정받지 못했기 때문이다.

외부 조인 결과를 GROUP BY 하면 사원이 없는 부서의 인원 0 까지 구할 수 있다.

```sql
SELECT D.DNAME, COUNT(E.EMPNO) AS CNT
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO
GROUP BY D.DNAME
ORDER BY D.DNAME;
```

```text
DNAME                 CNT
-------------- ----------
ACCOUNTING              3
OPERATIONS              0
RESEARCH                5
SALES                   6
```

- Day 1 에서 EMP 만으로 GROUP BY 했을 때는 40번이 나오지 않았다. DEPT 를 기준으로 외부 조인하면 OPERATIONS 0 이 보인다.

> 다음 주에는 쿼리 안에 쿼리를 넣는 서브쿼리를 다룬다.

## 📖 용어

- **ANSI 조인** : 조인 조건을 FROM 절의 `JOIN ... ON`으로 쓰는 표준 표기.
- **INNER JOIN** : 조건에 맞는 짝이 있는 행만 남기는 조인. `INNER`는 생략할 수 있다.
- **NATURAL JOIN** : 이름이 같은 열 전부로 자동 EQUI 조인한다. 공통 열이 없으면 카테시안 곱이다.
- **USING** : 같은 이름 열 중 조인에 쓸 열을 골라 EQUI 조인한다. 그 열에는 접두사를 못 붙인다.
- **CROSS JOIN** : 조건 없이 모든 행끼리 짝짓는 조인. 결과는 카테시안 곱이다.
- **LEFT / RIGHT OUTER JOIN** : 왼쪽 / 오른쪽 테이블의 행을 짝이 없어도 모두 남기는 조인.
- **FULL OUTER JOIN** : 양쪽 테이블의 행을 모두 남기는 조인. Oracle `(+)`로는 쓸 수 없다.
- **ORA-25155 / ORA-25154** : NATURAL JOIN 공통 열 / USING 열에 접두사를 붙였을 때의 오류.

## 📝 연습 문제

**문제 1.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT E.ENAME, E.DEPTNO FROM EMP E NATURAL JOIN DEPT D;
```

A) 14행이 나온다  
B) 56행이 나온다  
C) ORA-00918 오류가 난다  
D) ORA-25155 오류가 난다  

**정답: D**  
해설: NATURAL JOIN 의 공통 열 DEPTNO 는 결과에서 하나로 합쳐져 어느 한 테이블의 열이 아니다. 그래서 `E.DEPTNO`처럼 접두사를 붙이면 ORA-25155(column used in NATURAL join cannot have qualifier)가 난다. 공통 열이 아닌 `E.ENAME`에는 접두사를 붙여도 된다.

---

**문제 2.** DEPT 는 4개 부서이고, CLERK 는 10번 1명, 20번 2명, 30번 1명이며 40번 부서에는 사원이 없다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND E.JOB = 'CLERK';
```

A) 5  
B) 4  
C) 14  
D) 15  

**정답: A**  
해설: `E.JOB = 'CLERK'`가 ON 에 있으므로 짝지을 때만 쓰이는 조건이다. CLERK 와 짝지어진 행이 1 + 2 + 1 = 4개이고, 짝이 없는 40번 부서가 NULL 로 한 행 남아 5행이다. 같은 조건을 WHERE 에 두면 NULL 행이 떨어져 4행이 된다.

---

**문제 3.** EMP 의 모든 사원은 DEPT 에 있는 부서에 속하고, DEPT 40 에는 사원이 없다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP E FULL OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;
```

A) 14  
B) 18  
C) 15  
D) 56  

**정답: C**  
해설: FULL OUTER JOIN 은 짝지어진 행에 양쪽의 짝 없는 행을 더한다. 사원 14명은 모두 짝이 있어 14행, EMP 쪽에만 있는 행은 없고, DEPT 쪽에만 있는 40번이 한 행 더해져 15행이다.

---

**문제 4.** EMP 와 SALGRADE 에는 이름이 같은 열이 하나도 없다. EMP 는 14행, SALGRADE 는 5행이다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP NATURAL JOIN SALGRADE;
```

A) 0  
B) 70  
C) 오류가 난다  
D) 14  

**정답: B**  
해설: NATURAL JOIN 은 이름이 같은 열 전부를 조인 조건으로 삼는다. 공통 열이 없으면 조건이 하나도 없는 조인이 되어 카테시안 곱이 나온다. 14 × 5 = 70 행이며 오류는 나지 않는다.

---

**문제 5.** 다음 중 Oracle 에서 실행하면 오류가 나는 것은?

A) SELECT COUNT(*) FROM EMP CROSS JOIN DEPT;  
B) SELECT COUNT(*) FROM EMP JOIN DEPT USING (DEPTNO);  
C) SELECT COUNT(*) FROM EMP NATURAL JOIN DEPT;  
D) SELECT COUNT(*) FROM EMP JOIN DEPT;  

**정답: D**  
해설: `JOIN`(INNER JOIN)은 ON 이나 USING 으로 조인 조건을 받아야 한다. 조건 없이 쓰면 ORA-02000(missing ON or USING keyword)이 난다. 조건 없는 조인은 CROSS JOIN 으로 써야 하고, NATURAL JOIN 은 조건을 자동으로 찾으므로 ON 이 필요 없다.
