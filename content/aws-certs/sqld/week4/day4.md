# Day 4 - 조인 (EQUI·Non-EQUI·(+))

## 📌 핵심 정리

- **EQUI 조인**은 `=` 로, **Non-EQUI 조인**은 `BETWEEN`·`>` 같은 `=` 아닌 연산자로 두 테이블의 행을 짝짓는다.
- 조인 조건이 빠지면 **카테시안 곱**이다. EMP 14행 × DEPT 4행 = **56행**.
- 테이블 N 개를 빠짐없이 이으려면 조인 조건이 **최소 N-1 개** 필요하다.
- Oracle 외부 조인 `(+)`는 **값이 모자라 NULL 로 채워질 쪽**에 붙인다. `E.DEPTNO(+) = D.DEPTNO`는 DEPT 의 모든 행을 남긴다.
- 두 테이블에 같은 이름의 열이 있는데 접두사 없이 쓰면 **ORA-00918**(column ambiguously specified)이다.

## 두 테이블을 잇는다는 것

EMP 에는 부서 번호(DEPTNO)만 있고 부서 이름은 DEPT 에 있다. "사원 이름과 부서 이름"을 함께 보려면 두 테이블의 행을 DEPTNO 가 같은 것끼리 짝지어야 한다. 이것이 조인이다.

```text
EMP                                DEPT
ENAME   DEPTNO                     DEPTNO  DNAME
CLARK   10   ───────────────────▶  10      ACCOUNTING
KING    10   ───────────────────▶  10      ACCOUNTING
SMITH   20   ───────────────────▶  20      RESEARCH
...                                30      SALES
                                   40      OPERATIONS   ← 짝이 없다
```

Oracle 의 전통 표기는 FROM 에 테이블을 쉼표로 나열하고, 짝짓는 조건을 WHERE 에 쓴다.

## EQUI 조인

```sql
SELECT E.ENAME, E.DEPTNO, D.DNAME
FROM EMP E, DEPT D
WHERE E.DEPTNO = D.DEPTNO
  AND E.DEPTNO = 10
ORDER BY E.ENAME;
```

```text
ENAME          DEPTNO DNAME
---------- ---------- --------------
CLARK              10 ACCOUNTING
KING               10 ACCOUNTING
MILLER             10 ACCOUNTING
```

- `E`, `D`는 **테이블 별칭**이다. FROM 에서 테이블 이름 뒤에 한 칸 띄우고 쓴다(`AS`는 쓰지 않는다).
- WHERE 에 조인 조건(`E.DEPTNO = D.DEPTNO`)과 일반 조건(`E.DEPTNO = 10`)이 `AND`로 함께 있다.

조인 결과 전체의 행 수를 세어 본다.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        14
```

- 사원 14명이 모두 짝을 찾아 14행이다. 짝이 없는 DEPT 40 은 결과에 나오지 않는다. EQUI 조인은 **양쪽에 모두 짝이 있는 행만** 남긴다.

### 열 이름이 겹칠 때 — ORA-00918

DEPTNO 는 EMP 와 DEPT 양쪽에 있다. 어느 테이블 것인지 밝히지 않으면 Oracle 이 고를 수 없다.

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP, DEPT WHERE EMP.DEPTNO = DEPT.DEPTNO;
```

```text
SELECT ENAME, DEPTNO, DNAME FROM EMP, DEPT WHERE EMP.DEPTNO = DEPT.DEPTNO
              *
ERROR at line 1:
ORA-00918: DEPTNO: column ambiguously specified - appears in DEPT and EMP
```

- ENAME 과 DNAME 은 한 테이블에만 있어 접두사 없이도 된다.
- 한쪽에만 있는 열이라도 접두사를 붙이면 읽기 쉽고, 나중에 같은 이름 열이 생겨도 깨지지 않는다.

### 별칭을 정했으면 별칭으로

FROM 에서 별칭을 주면 그 쿼리 안에서 원래 테이블 이름은 접두사로 쓸 수 없다.

```sql
SELECT EMP.ENAME FROM EMP E WHERE E.EMPNO = 7839;
```

```text
SELECT EMP.ENAME FROM EMP E WHERE E.EMPNO = 7839
       *
ERROR at line 1:
ORA-00904: "EMP"."ENAME": invalid identifier
```

- 별칭 `E`가 EMP 를 대신하므로 `EMP.ENAME`이라는 열은 없는 것으로 본다.

## 카테시안 곱 — 조건을 빠뜨리면

조인 조건 없이 테이블만 나열하면 한쪽의 모든 행이 다른 쪽의 모든 행과 짝지어진다.

```sql
SELECT COUNT(*) FROM EMP, DEPT;
```

```text
  COUNT(*)
----------
        56
```

```sql
SELECT COUNT(*) FROM EMP, SALGRADE;
```

```text
  COUNT(*)
----------
        70
```

- EMP 14 × DEPT 4 = 56, EMP 14 × SALGRADE 5 = 70 이다.
- 의도하지 않은 카테시안 곱은 행 수를 크게 부풀린다. 결과가 이상하게 많으면 조인 조건부터 센다.

테이블이 셋인데 조건이 하나뿐이어도 남은 테이블과는 곱이 생긴다.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        70
```

- EMP-DEPT 는 이어져 14행이 되지만, SALGRADE 와는 조건이 없어 14 × 5 = 70 이다.
- 테이블 N 개를 모두 이으려면 조인 조건이 **N-1 개 이상** 필요하다.

## Non-EQUI 조인

조인 조건이 반드시 `=` 일 필요는 없다. SALGRADE 는 급여 구간(LOSAL ~ HISAL)마다 등급을 매긴 표다.

```text
GRADE  LOSAL  HISAL
    1    700   1200
    2   1201   1400
    3   1401   2000
    4   2001   3000
    5   3001   9999
```

사원의 급여가 어느 구간에 드는지로 짝지으면 등급을 붙일 수 있다.

```sql
SELECT E.ENAME, E.SAL, S.GRADE
FROM EMP E, SALGRADE S
WHERE E.SAL BETWEEN S.LOSAL AND S.HISAL
  AND E.DEPTNO = 30
ORDER BY S.GRADE, E.ENAME;
```

```text
ENAME             SAL      GRADE
---------- ---------- ----------
JAMES             950          1
MARTIN           1250          2
WARD             1250          2
ALLEN            1600          3
TURNER           1500          3
BLAKE            2850          4
```

- EMP 와 SALGRADE 에는 같은 값을 가진 열이 없다. `BETWEEN`으로 범위에 드는 행을 짝지었다.
- 구간이 서로 겹치지 않아 사원마다 정확히 한 등급과 짝지어진다.

등급별 인원을 세면 Non-EQUI 조인과 GROUP BY 를 함께 쓰게 된다.

```sql
SELECT S.GRADE, COUNT(*)
FROM EMP E, SALGRADE S
WHERE E.SAL BETWEEN S.LOSAL AND S.HISAL
GROUP BY S.GRADE
ORDER BY S.GRADE;
```

```text
     GRADE   COUNT(*)
---------- ----------
         1          3
         2          3
         3          2
         4          5
         5          1
```

- 합계는 3 + 3 + 2 + 5 + 1 = 14 로 사원 수와 같다.

`<>`나 `>`도 조인 조건이 될 수 있다. 이런 조건은 한 행이 여러 행과 짝지어져 결과가 커지기 쉽다.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO <> D.DEPTNO;
```

```text
  COUNT(*)
----------
        42
```

- 사원마다 자기 부서가 아닌 3개 부서와 짝지어져 14 × 3 = 42 다.

## 세 테이블 조인

조건을 하나씩 늘리면 테이블을 계속 이을 수 있다. 관리자(MANAGER)의 이름, 부서 이름, 급여 등급을 한 번에 본다.

```sql
SELECT E.ENAME, D.DNAME, S.GRADE
FROM EMP E, DEPT D, SALGRADE S
WHERE E.DEPTNO = D.DEPTNO
  AND E.SAL BETWEEN S.LOSAL AND S.HISAL
  AND E.JOB = 'MANAGER'
ORDER BY E.ENAME;
```

```text
ENAME      DNAME               GRADE
---------- -------------- ----------
BLAKE      SALES                   4
CLARK      ACCOUNTING              4
JONES      RESEARCH                4
```

- 테이블 3개, 조인 조건 2개(EQUI 하나, Non-EQUI 하나)로 N-1 규칙을 채웠다.
- `E.JOB = 'MANAGER'`는 조인 조건이 아니라 행을 거르는 일반 조건이다.

## Oracle 외부 조인 (+)

EQUI 조인은 짝이 없는 DEPT 40 을 버린다. 짝이 없어도 한쪽 테이블의 행을 전부 남기려면 외부 조인을 쓴다. Oracle 표기는 **짝이 없어 NULL 로 채워질 쪽 열에 `(+)`** 를 붙인다.

```sql
SELECT D.DEPTNO, D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND D.DEPTNO IN (10, 40)
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

- `(+)`가 EMP 쪽에 붙었으므로 **DEPT 의 모든 행**이 남는다. 40번은 짝지을 사원이 없어 ENAME 이 NULL 이다.
- 기억하는 방법: `(+)`는 "모자란 쪽에 NULL 행을 더해 준다"는 표시다. 남기고 싶은 테이블의 **반대편**에 붙인다.

| 조건 | 모두 남는 테이블 | 행 수 |
|------|----------------|-----:|
| `E.DEPTNO = D.DEPTNO` | 없음 (짝 있는 행만) | 14 |
| `E.DEPTNO(+) = D.DEPTNO` | DEPT | 15 |
| `E.DEPTNO = D.DEPTNO(+)` | EMP | 14 |

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO(+) = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO = D.DEPTNO(+);
```

```text
  COUNT(*)
----------
        14
```

- EMP 를 남기는 쪽은 14행 그대로다. 부서가 없는 사원이 없어 NULL 로 채울 행이 생기지 않는다.

외부 조인 결과를 부서별로 셀 때는 무엇을 세는지가 중요하다.

```sql
SELECT D.DEPTNO, COUNT(E.EMPNO) AS CNT, COUNT(*) AS ROWS_
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
GROUP BY D.DEPTNO
ORDER BY D.DEPTNO;
```

```text
    DEPTNO        CNT      ROWS_
---------- ---------- ----------
        10          3          3
        20          5          5
        30          6          6
        40          0          1
```

- 40번은 NULL 로 채운 행이 **1개 있다**. `COUNT(*)`는 그 행을 세어 1, `COUNT(E.EMPNO)`는 NULL 을 빼 0 이다. 사원 수는 `COUNT(E.EMPNO)`가 맞다.

### 다른 조건에도 (+)를 붙여야 한다

외부 조인 쪽 테이블에 거는 일반 조건에 `(+)`를 빠뜨리면 외부 조인이 풀린다.

```sql
SELECT D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND E.SAL(+) > 2900
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     KING
OPERATIONS
RESEARCH       FORD
RESEARCH       JONES
RESEARCH       SCOTT
SALES
```

```sql
SELECT D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND E.SAL > 2900
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     KING
RESEARCH       FORD
RESEARCH       JONES
RESEARCH       SCOTT
```

- `E.SAL(+) > 2900`: 급여 조건을 **짝짓는 단계**에 넣는다. 조건에 맞는 사원이 없는 SALES·OPERATIONS 도 NULL 과 함께 남는다.
- `E.SAL > 2900`: 외부 조인으로 만든 NULL 행에 이 조건을 적용하면 `NULL > 2900`은 참이 아니라 떨어진다. 결과는 EQUI 조인과 같아진다.

> ⚠️ **함정**: `(+)`는 한쪽에만 붙일 수 있다. `E.DEPTNO(+) = D.DEPTNO(+)`처럼 양쪽에 붙이면 ORA-01468(a predicate may reference only one outer-joined table) 오류다. 양쪽을 모두 남기는 FULL OUTER JOIN 은 내일 볼 ANSI 표기로만 쓸 수 있다.

> 내일은 같은 조인을 `JOIN ... ON` 같은 ANSI 표준 표기로 쓰고, ON 과 WHERE 의 차이를 본다.

## 📖 용어

- **조인** : 두 테이블 이상의 행을 조건에 따라 짝지어 한 결과로 만드는 연산.
- **EQUI 조인** : `=` 조건으로 짝짓는 조인. 양쪽에 짝이 있는 행만 남는다.
- **Non-EQUI 조인** : `BETWEEN`·`>`·`<>`처럼 `=`가 아닌 조건으로 짝짓는 조인.
- **카테시안 곱** : 조인 조건 없이 모든 행끼리 짝지은 결과. 행 수는 두 테이블 행 수의 곱이다.
- **테이블 별칭** : FROM 에서 테이블에 붙이는 짧은 이름. 붙이면 그 쿼리에서는 별칭으로만 부른다.
- **외부 조인** : 짝이 없는 행도 버리지 않고 반대편을 NULL 로 채워 남기는 조인.
- **`(+)`** : Oracle 외부 조인 표기. NULL 로 채워질 쪽 열에 붙인다.
- **ORA-00918** : 여러 테이블에 있는 같은 이름의 열을 접두사 없이 썼을 때의 오류.

## 📝 연습 문제

**문제 1.** EMP 는 14행, DEPT 는 4행이다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP, DEPT;
```

A) 56  
B) 14  
C) 18  
D) 4  

**정답: A**  
해설: 조인 조건이 없으므로 EMP 의 모든 행이 DEPT 의 모든 행과 짝지어지는 카테시안 곱이 된다. 행 수는 14 × 4 = 56 이다.

---

**문제 2.** SALGRADE 는 1등급 700~1200, 2등급 1201~1400, 3등급 1401~2000, 4등급 2001~3000, 5등급 3001~9999 다. EMP 에서 급여가 2001~3000 인 사원은 JONES 2975, BLAKE 2850, CLARK 2450, SCOTT 3000, FORD 3000 이다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP E, SALGRADE S WHERE E.SAL BETWEEN S.LOSAL AND S.HISAL AND S.GRADE = 4;
```

A) 3  
B) 1  
C) 5  
D) 2  

**정답: C**  
해설: Non-EQUI 조인으로 사원마다 급여가 속한 구간의 등급과 짝지어진다. BETWEEN 은 양 끝 값을 포함하므로 3000 인 SCOTT·FORD 도 4등급이다. 4등급 사원은 5명이다.

---

**문제 3.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP, DEPT WHERE EMP.DEPTNO = DEPT.DEPTNO;
```

A) 14행이 나온다  
B) ORA-00918 오류가 난다  
C) 56행이 나온다  
D) ORA-00904 오류가 난다  

**정답: B**  
해설: DEPTNO 는 EMP 와 DEPT 양쪽에 있는 열이다. WHERE 에서는 접두사를 붙였지만 SELECT 의 DEPTNO 에는 접두사가 없어 어느 테이블 것인지 정할 수 없다. 이때 ORA-00918(column ambiguously specified)이 난다.

---

**문제 4.** DEPT 에는 10·20·30·40번 부서가 있고, 40번 부서에는 사원이 없다. EMP 의 14명은 모두 10·20·30번 중 한 부서에 속한다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO(+) = D.DEPTNO;
```

A) 14  
B) 56  
C) 4  
D) 15  

**정답: D**  
해설: `(+)`가 EMP 쪽에 붙어 DEPT 의 모든 행이 남는 외부 조인이다. 사원 14명은 각자 부서와 짝지어지고, 짝이 없는 40번 부서가 EMP 쪽을 NULL 로 채운 한 행으로 더해진다. 14 + 1 = 15 행이다.

---

**문제 5.** EMP 14행, DEPT 4행, SALGRADE 5행이다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO;
```

A) 14  
B) 70  
C) 280  
D) 56  

**정답: B**  
해설: EMP 와 DEPT 는 조인 조건으로 이어져 14행이 된다. SALGRADE 에는 조인 조건이 없어 그 14행과 SALGRADE 5행의 카테시안 곱이 생긴다. 14 × 5 = 70 이다. 세 테이블을 모두 이으려면 조인 조건이 2개 이상 필요하다.
