# Day 1 - PIVOT 절과 UNPIVOT 절

## 📌 핵심 정리

- `PIVOT (집계 FOR 열 IN (값 AS 별칭, …))` 은 한 열의 값들을 열 머리로 세운다. IN 목록의 값 하나가 결과 열 하나다.
- PIVOT 은 집계에도 FOR 에도 쓰이지 않은 **나머지 열 전부로 묶는다**. 그래서 인라인 뷰로 필요한 열만 넘긴다.
- 집계에 별칭을 주면 결과 열 이름은 `값별칭_집계별칭` 이다. 집계가 둘 이상이면 별칭이 사실상 필요하다.
- `UNPIVOT (값열 FOR 이름열 IN (열, …))` 은 반대로 열들을 행으로 내린다. 기본은 NULL 행을 버리고, `INCLUDE NULLS` 를 주면 남긴다.
- PIVOT 없이도 `SUM(CASE WHEN … THEN … END)` 나 `SUM(DECODE(…))` 에 GROUP BY 를 붙이면 같은 표가 나온다.

## 세로로 긴 결과를 가로로 펴기

"직무별·부서별 급여 합계"를 GROUP BY 로 구하면 (직무, 부서) 조합마다 한 행이 나온다. 9행을 위아래로 훑어야 한다. 부서를 열로 세우면 직무 5행짜리 표가 되어 한눈에 비교된다.

```text
GROUP BY JOB, DEPTNO            PIVOT 결과
JOB       DEPTNO  SUM           JOB        10     20     30
CLERK         10  1300   ──▶    CLERK    1300   1900    950
CLERK         20  1900          MANAGER  2450   2975   2850
CLERK         30   950          …
…
```

- 행의 값(10, 20, 30)이 열의 이름이 되는 변환을 PIVOT 이라 부른다. 반대 방향이 UNPIVOT 이다.
- Oracle 은 11g 부터 PIVOT·UNPIVOT 절을 지원한다. SQL Server 에도 PIVOT 이 있지만 IN 목록을 대괄호 열 이름으로 쓰는 등 문법이 다르다.

## PIVOT 기본 문법

```text
SELECT *
FROM (넘길 열만 고른 인라인 뷰)
PIVOT (
  집계함수(값 열) [AS 집계별칭]
  FOR 펼칠 열 IN (값1 [AS 별칭1], 값2 [AS 별칭2], …)
)
[ORDER BY …];
```

| 부분 | 하는 일 |
|------|-------|
| 집계함수 | 칸 하나에 들어갈 값을 계산한다. SUM·COUNT·MAX·AVG 등 |
| FOR 열 | 값을 열 머리로 세울 열 |
| IN (…) | 결과에 만들 열의 목록. 목록에 없는 값은 결과에서 빠진다 |
| 나머지 열 | 암묵적으로 GROUP BY 된다. 결과의 행을 정한다 |

직무별·부서별 급여 합계다.

```sql
SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10, 20, 30)) ORDER BY JOB;
```

```text
JOB               10         20         30
--------- ---------- ---------- ----------
ANALYST                    6000
CLERK           1300       1900        950
MANAGER         2450       2975       2850
PRESIDENT       5000
SALESMAN                              5600
```

- 인라인 뷰에 JOB·DEPTNO·SAL 세 열이 있다. SAL 은 집계에, DEPTNO 는 FOR 에 쓰였으니 남은 JOB 이 행을 정한다.
- 해당 조합에 사원이 없는 칸은 NULL 이다. SUM 은 대상 행이 없으면 NULL 을 돌려준다.
- 별칭이 없으면 열 이름이 `10`, `20`, `30` 이 된다. 숫자로 시작하는 이름이라 바깥에서 참조하려면 `"10"` 처럼 큰따옴표를 써야 한다.

## IN 목록의 별칭

`값 AS 별칭` 으로 열 이름을 정하면 바깥 쿼리에서 다루기 쉽다.

```sql
SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30)) WHERE D30 IS NOT NULL ORDER BY JOB;
```

```text
JOB              D10        D20        D30
--------- ---------- ---------- ----------
CLERK           1300       1900        950
MANAGER         2450       2975       2850
SALESMAN                              5600
```

- PIVOT 이 끝난 결과는 D10·D20·D30 열을 가진 표다. WHERE 와 ORDER BY 는 이 표에 적용된다.
- IN 목록은 **상수**여야 한다. `IN (SELECT DEPTNO FROM DEPT)` 처럼 서브쿼리를 쓰면 실습 컨테이너에서 ORA-00936(missing expression)이 났다. 서브쿼리나 `ANY` 는 PIVOT XML 에서만 쓸 수 있다.
- 데이터에 없는 값을 목록에 넣어도 된다. `IN (10, 20, 30, 40)` 이면 40 열이 생기고 모든 칸이 NULL 이다.

문자 값을 펼칠 때는 따옴표로 감싼다. 부서별 직무 인원이다.

```sql
SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT (COUNT(*) FOR JOB IN ('CLERK' AS CLERK, 'MANAGER' AS MGR, 'SALESMAN' AS SALES)) ORDER BY DEPTNO;
```

```text
    DEPTNO      CLERK        MGR      SALES
---------- ---------- ---------- ----------
        10          1          1          0
        20          2          1          0
        30          1          1          4
```

- COUNT 는 대상 행이 없으면 NULL 이 아니라 **0** 이다. SUM 결과의 빈칸과 다르다.
- 별칭 없이 `IN ('CLERK', 'MANAGER')` 로 쓰면 열 이름이 `'CLERK'`, `'MANAGER'` 처럼 따옴표까지 붙어 나왔다.

## 인라인 뷰가 필요한 이유

PIVOT 은 GROUP BY 를 따로 쓰지 않는다. 대신 **집계와 FOR 에 쓰이지 않은 모든 열**을 묶는 기준으로 삼는다. EMP 를 그대로 넘기면 EMPNO·ENAME·HIREDATE 같은 열까지 묶음 기준이 된다.

```sql
SELECT * FROM EMP PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30)) ORDER BY EMPNO FETCH FIRST 4 ROWS ONLY;
```

```text
     EMPNO ENAME      JOB              MGR HIREDATE         COMM        D10        D20        D30
---------- ---------- --------- ---------- ---------- ---------- ---------- ---------- ----------
      7369 SMITH      CLERK           7902 1980-12-17                              800
      7499 ALLEN      SALESMAN        7698 1981-02-20        300                             1600
      7521 WARD       SALESMAN        7698 1981-02-22        500                             1250
      7566 JONES      MANAGER         7839 1981-04-02                             2975
```

- EMPNO 가 행마다 다르니 묶이는 행이 없다. 결과는 14행 그대로이고 합계는 각자의 급여다.
- `SELECT COUNT(*) FROM EMP PIVOT (…)` 도 14 를 돌려줬다. 직무 5행을 기대했다면 틀린 결과다.
- 필요한 열만 넘기면 원하는 단위로 묶인다. DEPTNO 와 SAL 만 넘기면 남는 열이 없어 전체가 한 행이 된다.

```sql
SELECT * FROM (SELECT DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30));
```

```text
       D10        D20        D30
---------- ---------- ----------
      8750      10875       9400
```

| 넘긴 열 | 묶음 기준(나머지 열) | 결과 행 수 |
|-------|-----------------|--------:|
| EMP 전체 | EMPNO, ENAME, JOB, MGR, HIREDATE, COMM | 14 |
| JOB, DEPTNO, SAL | JOB | 5 |
| DEPTNO, SAL | 없음 | 1 |

> ⚠️ **함정**: PIVOT 결과의 행 수는 IN 목록이 아니라 **넘긴 열 가운데 남은 열**이 정한다. "직무별로 나온다"고 보기에 적혀 있어도 FROM 에 테이블 이름만 있으면 EMP 의 모든 열이 묶음 기준이 된다.

## 집계를 여러 개 쓰기

집계 함수를 쉼표로 나열하면 IN 목록의 값마다 집계 수만큼 열이 생긴다. 열 이름은 `값별칭_집계별칭` 이다.

```sql
SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) AS S, COUNT(*) AS C FOR DEPTNO IN (10 AS D10, 20 AS D20)) ORDER BY JOB;
```

```text
JOB            D10_S      D10_C      D20_S      D20_C
--------- ---------- ---------- ---------- ----------
ANALYST                       0       6000          2
CLERK           1300          1       1900          2
MANAGER         2450          1       2975          1
PRESIDENT       5000          1                     0
SALESMAN                      0                     0
```

- 값 2개 × 집계 2개 = 4개 열이다.
- 같은 칸이라도 SUM 은 NULL, COUNT 는 0 으로 다르게 나온다.
- 별칭을 하나만 주면 붙은 쪽만 이름에 들어간다. `SUM(SAL) AS TOT FOR DEPTNO IN (10 AS D10, 20)` 의 열 이름은 `D10_TOT`, `20_TOT` 이었다.
- 집계 둘에 별칭을 모두 빼면 열 이름이 겹친다. 실습 컨테이너에서는 ORA-56907(중복 열 이름) 오류가 났다.

## UNPIVOT — 열을 행으로 내리기

UNPIVOT 은 여러 열에 흩어진 값을 한 열로 모은다. 원래 어느 열에 있었는지는 새 이름 열에 적힌다.

```text
SELECT *
FROM 테이블
UNPIVOT [INCLUDE NULLS | EXCLUDE NULLS] (
  값을 담을 새 열
  FOR 원래 열 이름을 담을 새 열 IN (열1 [AS 값1], 열2 [AS 값2], …)
);
```

30번 부서 사원의 SAL 과 COMM 을 (항목, 값) 행으로 바꾼다.

```sql
SELECT EMPNO, ENAME, ITEM, VAL FROM (SELECT EMPNO, ENAME, SAL, COMM FROM EMP WHERE DEPTNO = 30) UNPIVOT (VAL FOR ITEM IN (SAL, COMM)) ORDER BY EMPNO, ITEM;
```

```text
     EMPNO ENAME      ITEM        VAL
---------- ---------- ---- ----------
      7499 ALLEN      COMM        300
      7499 ALLEN      SAL        1600
      7521 WARD       COMM        500
      7521 WARD       SAL        1250
      7654 MARTIN     COMM       1400
      7654 MARTIN     SAL        1250
      7698 BLAKE      SAL        2850
      7844 TURNER     COMM          0
      7844 TURNER     SAL        1500
      7900 JAMES      SAL         950
```

- 사원 6명 × 2열 = 12행이 될 것 같지만 10행이다. BLAKE 와 JAMES 의 COMM 은 NULL 이라 행이 만들어지지 않았다.
- 기본값은 `EXCLUDE NULLS` 다. TURNER 의 COMM 0 은 NULL 이 아니라 남는다.
- ITEM 열에는 원래 열 이름이 문자로 들어간다. `IN (SAL AS 'SAL', COMM AS 'COMM')` 처럼 AS 로 바꿔 넣을 수도 있다.
- IN 목록의 열은 자료형이 같아야 한다. `IN (SAL, ENAME)` 처럼 숫자와 문자를 섞으면 ORA-01790 이 났다.

### INCLUDE NULLS

```sql
SELECT EMPNO, ENAME, ITEM, VAL FROM (SELECT EMPNO, ENAME, SAL, COMM FROM EMP WHERE DEPTNO = 30) UNPIVOT INCLUDE NULLS (VAL FOR ITEM IN (SAL, COMM)) ORDER BY EMPNO, ITEM;
```

```text
     EMPNO ENAME      ITEM        VAL
---------- ---------- ---- ----------
      7499 ALLEN      COMM        300
      7499 ALLEN      SAL        1600
      7521 WARD       COMM        500
      7521 WARD       SAL        1250
      7654 MARTIN     COMM       1400
      7654 MARTIN     SAL        1250
      7698 BLAKE      COMM
      7698 BLAKE      SAL        2850
      7844 TURNER     COMM          0
      7844 TURNER     SAL        1500
      7900 JAMES      COMM
      7900 JAMES      SAL         950
```

- `INCLUDE NULLS` 는 UNPIVOT 키워드 바로 뒤, 괄호 앞에 쓴다.
- 이번에는 12행이다. BLAKE·JAMES 의 COMM 행이 빈 값으로 남았다.

### PIVOT 결과를 되돌리기

위 PIVOT 결과를 WITH 절에 두고 UNPIVOT 하면 세로 모양으로 돌아온다. `D10 AS 10` 처럼 열 이름 대신 원래 부서 번호를 넣는다.

```sql
WITH P AS (SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30))) SELECT * FROM P UNPIVOT (SAL FOR DEPTNO IN (D10 AS 10, D20 AS 20, D30 AS 30)) ORDER BY JOB, DEPTNO;
```

```text
JOB           DEPTNO        SAL
--------- ---------- ----------
ANALYST           20       6000
CLERK             10       1300
CLERK             20       1900
CLERK             30        950
MANAGER           10       2450
MANAGER           20       2975
MANAGER           30       2850
PRESIDENT         10       5000
SALESMAN          30       5600
```

- 5행 × 3열 = 15칸 가운데 NULL 6칸이 빠져 9행이다. 같은 문장에 INCLUDE NULLS 를 주면 15행이 나왔다.
- 돌아온 9행은 `GROUP BY JOB, DEPTNO` 의 합계와 같다. 그러나 사원 14명의 원래 행으로 돌아가지는 않는다. 집계로 줄어든 정보는 UNPIVOT 으로 되살릴 수 없다.

## PIVOT 없이 같은 표 만들기

PIVOT 절이 없던 시절에는 CASE 나 DECODE 로 열마다 조건을 걸고, 바깥을 집계 함수로 감쌌다. 지금도 다른 DBMS 로 옮기기 쉬운 방법이다.

```sql
SELECT JOB, SUM(CASE WHEN DEPTNO = 10 THEN SAL END) AS D10, SUM(CASE WHEN DEPTNO = 20 THEN SAL END) AS D20, SUM(CASE WHEN DEPTNO = 30 THEN SAL END) AS D30 FROM EMP GROUP BY JOB ORDER BY JOB;
```

```text
JOB              D10        D20        D30
--------- ---------- ---------- ----------
ANALYST                    6000
CLERK           1300       1900        950
MANAGER         2450       2975       2850
PRESIDENT       5000
SALESMAN                              5600
```

- `CASE WHEN DEPTNO = 10 THEN SAL END` 는 10번 부서 행에서만 SAL 이고, 나머지 행에서는 ELSE 가 없어 NULL 이다. SUM 이 NULL 을 건너뛰니 10번 부서 합계만 남는다.
- PIVOT 이 암묵적으로 하던 묶음을 여기서는 `GROUP BY JOB` 으로 직접 적는다. EMP 를 그대로 FROM 에 써도 되는 이유다.
- DECODE 로 쓰면 `SUM(DECODE(DEPTNO, 10, SAL))` 이다. 일치하지 않으면 기본값이 NULL 이라 CASE 와 결과가 같다. DECODE 는 Oracle 전용 함수다.

| 방법 | 묶음 기준 | 열 이름 | 다른 DBMS |
|------|--------|-------|---------|
| PIVOT 절 | 넘긴 열 중 남은 열(암묵적) | IN 목록 값 또는 별칭 | 문법이 DBMS 마다 다르다 |
| `SUM(CASE …)` + GROUP BY | GROUP BY 에 적은 열 | AS 별칭 | 표준 SQL 이라 대부분 그대로 된다 |
| `SUM(DECODE(…))` + GROUP BY | GROUP BY 에 적은 열 | AS 별칭 | Oracle 전용 |

- 반대로 UNPIVOT 없이 열을 행으로 내리려면 열마다 SELECT 를 하나씩 만들어 UNION ALL 로 붙인다.

> 내일은 패턴으로 문자열을 찾고 바꾸는 정규 표현식 함수(REGEXP_LIKE·REGEXP_SUBSTR 등)를 다룬다.

## 📖 용어

- **PIVOT** : 한 열의 값들을 열 머리로 세워 세로로 긴 결과를 가로로 펴는 절.
- **UNPIVOT** : 여러 열에 흩어진 값을 한 열로 모아 행으로 내리는 절. PIVOT 의 반대 방향이다.
- **FOR 열 IN (…)** : PIVOT 에서 펼칠 열과 만들 열 목록, UNPIVOT 에서 행으로 내릴 열 목록을 정하는 부분.
- **암묵적 GROUP BY** : PIVOT 이 집계·FOR 에 쓰이지 않은 나머지 열을 묶음 기준으로 삼는 동작.
- **INCLUDE NULLS** : UNPIVOT 에서 값이 NULL 인 칸도 행으로 남기는 옵션. 기본은 EXCLUDE NULLS 다.
- **크로스탭** : 행과 열 양쪽에 분류 기준을 두고 칸에 집계를 넣은 표. PIVOT 결과가 이 모양이다.
- **DECODE** : `DECODE(식, 값, 결과, …)` 로 값이 같을 때의 결과를 고르는 Oracle 함수. 일치하는 값이 없으면 NULL 이다.

## 📝 연습 문제

**문제 1.** `SELECT COUNT(*) FROM EMP PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30));` 의 결과는? (EMP 는 14명이고 직무는 5가지다)

A) 5  
B) 14  
C) 3  
D) 1  

**정답: B**  
해설: 인라인 뷰 없이 EMP 를 넘겼으므로 SAL·DEPTNO 를 뺀 EMPNO·ENAME·JOB·MGR·HIREDATE·COMM 이 모두 묶음 기준이 된다. EMPNO 가 행마다 달라 묶이는 행이 없으니 14행이다. 5 는 JOB·DEPTNO·SAL 만 넘겼을 때의 행 수다. 3 은 IN 목록 값의 개수라 행 수와 관계가 없다. 1 은 DEPTNO·SAL 만 넘겼을 때다.

---

**문제 2.** `SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) AS TOT FOR DEPTNO IN (10 AS D10, 20));` 의 결과 열 이름을 순서대로 고르면?

A) JOB, D10, 20  
B) JOB, TOT_D10, TOT_20  
C) JOB, D10_TOT, TOT  
D) JOB, D10_TOT, 20_TOT  

**정답: D**  
해설: 집계에 별칭이 있으면 열 이름은 `IN 값의 별칭(없으면 값)_집계 별칭` 이다. 10 은 D10 별칭이 있어 D10_TOT, 20 은 별칭이 없어 값 그대로 20_TOT 다. A 는 집계 별칭을 무시했다. B 는 값과 집계의 순서를 뒤집었다. C 는 20 쪽에 값을 빼고 집계 별칭만 남겼다.

---

**문제 3.** `WITH P AS (SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30))) SELECT COUNT(*) FROM P UNPIVOT (SAL FOR DEPTNO IN (D10, D20, D30));` 의 결과는? (P 는 5행 × 부서 3열이고, 그중 6칸이 NULL 이다)

A) 9  
B) 15  
C) 5  
D) 6  

**정답: A**  
해설: UNPIVOT 은 기본이 EXCLUDE NULLS 라 NULL 칸은 행으로 만들지 않는다. 15칸에서 NULL 6칸을 빼면 9행이다. 15 는 `UNPIVOT INCLUDE NULLS` 로 NULL 칸까지 남겼을 때다. 5 는 P 의 원래 행 수이고, 6 은 버려진 NULL 칸의 수다.

---

**문제 4.** PIVOT 절 없이 직무별로 10·20·30번 부서의 급여 합계를 열로 펴려고 한다. 알맞은 방법은?

A) SELECT 절에 `CASE WHEN DEPTNO = 10 THEN SAL END` 를 부서마다 쓰고 GROUP BY 는 쓰지 않는다  
B) `DECODE(DEPTNO, 10, SAL)` 를 부서마다 쓰고 ORDER BY JOB 으로 정렬한다  
C) 부서마다 `SUM(CASE WHEN DEPTNO = 10 THEN SAL END)` 처럼 조건식을 집계 함수로 감싸고 GROUP BY JOB 을 붙인다  
D) 부서별 SELECT 를 셋 만들어 UNION ALL 로 붙인다  

**정답: C**  
해설: 조건식으로 부서별 값만 남기고, 집계 함수와 GROUP BY JOB 으로 직무별 한 행에 모아야 PIVOT 과 같은 표가 된다. A 와 B 는 집계와 GROUP BY 가 없어 사원 14행이 그대로 남는다. 정렬만으로는 행이 합쳐지지 않는다. D 의 UNION ALL 은 행을 세로로 붙이므로 UNPIVOT 쪽에 가까운 방법이다.

---

**문제 5.** `SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT (COUNT(*) FOR JOB IN ('SALESMAN' AS S)) ORDER BY DEPTNO;` 에서 10번 부서 행의 S 값은? (10번 부서에는 SALESMAN 이 없다)

A) NULL  
B) 0  
C) 10번 부서 행이 나오지 않는다  
D) 4  

**정답: B**  
해설: COUNT 는 대상 행이 없으면 0 을 돌려준다. 칸이 비는 NULL 은 SUM·MAX 같은 집계에서 나오는 모양이라 A 는 틀리다. 10번 부서 사원이 있으니 묶음 기준 DEPTNO 로 10번 행은 만들어진다. 4 는 30번 부서의 SALESMAN 수다.
