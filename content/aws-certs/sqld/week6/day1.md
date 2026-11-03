# Day 1 - 순위 함수

## 📌 핵심 정리

- 윈도우 함수는 `함수() OVER (PARTITION BY … ORDER BY …)` 모양이다. GROUP BY 와 달리 행을 줄이지 않고 행마다 값을 붙인다.
- 동점 처리가 셋을 가른다. **RANK** 는 1, 2, 2, 4 / **DENSE_RANK** 는 1, 2, 2, 3 / **ROW_NUMBER** 는 1, 2, 3, 4 다.
- `PARTITION BY` 를 쓰면 그룹마다 순위를 1부터 다시 매긴다. 생략하면 전체가 한 그룹이다.
- 윈도우 함수는 SELECT 절과 ORDER BY 절에만 쓴다. WHERE·HAVING 에 쓰면 **ORA-30483** 이고, 순위로 거르려면 인라인 뷰로 감싼다.
- 윈도우 함수는 WHERE·GROUP BY·HAVING 이 끝난 행을 대상으로 SELECT 단계에서 계산된다.

## 행을 줄이지 않는 집계

W4 의 GROUP BY 는 부서별 합계를 구하면 부서마다 한 행만 남긴다. 사원 이름과 그 사원의 순위를 같이 보려면 행을 그대로 두고 값만 붙여야 한다. 윈도우 함수가 그 일을 한다.

```text
함수명(인자) OVER (
    [PARTITION BY 열]          -- 어떤 묶음 안에서 계산할지
    [ORDER BY 열 [ASC|DESC]]   -- 묶음 안에서 어떤 순서로 볼지
    [ROWS | RANGE 윈도우 절]    -- 몇 행을 계산 범위로 할지 (Day 2)
)
```

- `OVER` 가 붙어야 윈도우 함수다. `OVER` 가 없는 `RANK` 는 아래 끝 절의 집계형 RANK 로 해석된다.
- 괄호 안 세 부분은 모두 생략할 수 있다. 다만 순위 함수는 `ORDER BY` 가 필수다.
- 윈도우 함수가 다루는 묶음을 **파티션**이라 부른다. GROUP BY 의 그룹과 비슷하지만 행을 합치지 않는다.

## RANK · DENSE_RANK · ROW_NUMBER

급여 내림차순으로 세 함수를 나란히 놓는다. 급여 3000 은 FORD·SCOTT 둘, 1250 은 MARTIN·WARD 둘이다.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK, DENSE_RANK() OVER (ORDER BY SAL DESC) AS DRNK, ROW_NUMBER() OVER (ORDER BY SAL DESC, ENAME) AS RN FROM EMP ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL        RNK       DRNK         RN
---------- ---------- ---------- ---------- ----------
KING             5000          1          1          1
FORD             3000          2          2          2
SCOTT            3000          2          2          3
JONES            2975          4          3          4
BLAKE            2850          5          4          5
CLARK            2450          6          5          6
ALLEN            1600          7          6          7
TURNER           1500          8          7          8
MILLER           1300          9          8          9
MARTIN           1250         10          9         10
WARD             1250         10          9         11
ADAMS            1100         12         10         12
JAMES             950         13         11         13
SMITH             800         14         12         14
```

| 함수 | 동점 처리 | 동점 다음 순위 | 마지막 값 (14명) |
|------|---------|-------------|---------------|
| RANK | 같은 순위 | 동점 수만큼 건너뛴다 (2, 2 → **4**) | 14 |
| DENSE_RANK | 같은 순위 | 건너뛰지 않는다 (2, 2 → **3**) | 12 (서로 다른 급여 수) |
| ROW_NUMBER | 서로 다른 번호 | 늘 1씩 증가 | 14 |

- 위 표의 RANK 마지막 값이 14 인 것은 EMP 를 급여 내림차순으로 세웠을 때 맨 뒤(SMITH, 800)에 동점이 없기 때문이다. 맨 뒤 값이 동점이면 마지막 순위는 행 수보다 작다. 20번 부서를 급여 오름차순으로 세우면 FORD·SCOTT 이 3000 으로 함께 4위이고 행은 5개다.
- DENSE_RANK 의 마지막 값은 **서로 다른 값의 개수**다. EMP 의 급여 종류는 12가지다.
- 올림픽 메달 순위가 RANK 다. 공동 2위가 둘이면 다음 선수는 4위다.

### ROW_NUMBER 와 동점

ROW_NUMBER 는 동점이어도 번호를 하나씩 따로 준다. 그런데 FORD 와 SCOTT 중 누가 2번인지는 `ORDER BY SAL DESC` 만으로 정해지지 않는다.

```sql
SELECT ENAME, SAL, ROW_NUMBER() OVER (ORDER BY SAL DESC) AS RN FROM EMP WHERE SAL >= 2900 ORDER BY RN;
```

```text
ENAME             SAL         RN
---------- ---------- ----------
KING             5000          1
FORD             3000          2
SCOTT            3000          3
JONES            2975          4
```

- 실습 컨테이너에서는 FORD 가 2번이었다. 이 순서는 Oracle 이 보장하지 않는다. 실행 계획이 바뀌면 SCOTT 이 2번이 될 수 있고, 이 사이트의 실습장에서는 실제로 SCOTT 이 2번으로 나온다.
- 번호를 고정하려면 `ORDER BY SAL DESC, ENAME` 처럼 동점을 가를 두 번째 키를 준다. 위 세 함수 비교의 RN 열이 그렇게 만들었다.

> ⚠️ **함정**: 윈도우 안의 `ORDER BY` 는 순위를 매기는 순서일 뿐이다. 결과 화면의 행 순서는 문장 끝의 `ORDER BY` 가 정한다. 문장 끝 ORDER BY 를 빼면 순위 순으로 나온다는 보장이 없다.

## 정렬 방향과 NULL

순위 함수도 ORDER BY 의 NULL 규칙을 그대로 따른다. Oracle 은 NULL 을 가장 큰 값으로 본다. 그래서 내림차순이면 NULL 이 맨 앞, 즉 1위가 된다.

```sql
SELECT ENAME, SAL, COMM, RANK() OVER (ORDER BY COMM DESC) AS RNK FROM EMP WHERE DEPTNO = 30 ORDER BY RNK, ENAME;
```

```text
ENAME             SAL       COMM        RNK
---------- ---------- ---------- ----------
BLAKE            2850                     1
JAMES             950                     1
MARTIN           1250       1400          3
WARD             1250        500          4
ALLEN            1600        300          5
TURNER           1500          0          6
```

- 커미션이 없는 BLAKE·JAMES 가 공동 1위다. NULL 끼리는 동점으로 처리됐다.
- 커미션이 있는 사람만 순위를 매기려면 `ORDER BY COMM DESC NULLS LAST` 로 NULL 을 뒤로 보내거나, WHERE 에서 `COMM IS NOT NULL` 로 거른다.

## PARTITION BY — 그룹 안의 순위

`PARTITION BY DEPTNO` 를 넣으면 부서가 바뀔 때마다 순위가 1부터 다시 시작한다.

```sql
SELECT DEPTNO, ENAME, SAL, RANK() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC) AS RNK FROM EMP ORDER BY DEPTNO, RNK, ENAME;
```

```text
    DEPTNO ENAME             SAL        RNK
---------- ---------- ---------- ----------
        10 KING             5000          1
        10 CLARK            2450          2
        10 MILLER           1300          3
        20 FORD             3000          1
        20 SCOTT            3000          1
        20 JONES            2975          3
        20 ADAMS            1100          4
        20 SMITH             800          5
        30 BLAKE            2850          1
        30 ALLEN            1600          2
        30 TURNER           1500          3
        30 MARTIN           1250          4
        30 WARD             1250          4
        30 JAMES             950          6
```

- 행은 14개 그대로다. GROUP BY DEPTNO 였다면 3행으로 줄었다.
- 20번의 FORD·SCOTT 는 부서 안에서 공동 1위이고, JONES 는 3위다.
- PARTITION BY 에는 열을 여럿 쓸 수 있다. `PARTITION BY DEPTNO, JOB` 이면 부서·직무 조합마다 따로 센다.

DENSE_RANK 로 바꾸면 같은 파티션 안에서 건너뛰지 않는다. 직무별 급여 오름차순이다.

```sql
SELECT JOB, ENAME, SAL, DENSE_RANK() OVER (PARTITION BY JOB ORDER BY SAL) AS DR FROM EMP WHERE JOB IN ('SALESMAN', 'CLERK') ORDER BY JOB, DR, ENAME;
```

```text
JOB       ENAME             SAL         DR
--------- ---------- ---------- ----------
CLERK     SMITH             800          1
CLERK     JAMES             950          2
CLERK     ADAMS            1100          3
CLERK     MILLER           1300          4
SALESMAN  MARTIN           1250          1
SALESMAN  WARD             1250          1
SALESMAN  TURNER           1500          2
SALESMAN  ALLEN            1600          3
```

- SALESMAN 의 MARTIN·WARD 가 공동 1위, TURNER 는 2위다. RANK 였다면 TURNER 는 3위다.

## ORDER BY 가 빠지면

순위 함수는 무엇을 기준으로 줄을 세울지 알아야 한다. `OVER ()` 처럼 비워 두면 오류다.

```sql
SELECT ENAME, SAL, RANK() OVER () AS RNK FROM EMP WHERE DEPTNO = 10;
```

```text
SELECT ENAME, SAL, RANK() OVER () AS RNK FROM EMP WHERE DEPTNO = 10
                   *
ERROR at line 1:
ORA-30485: missing ORDER BY expression in the window specification
```

- ROW_NUMBER 도 Oracle 에서는 같은 ORA-30485 가 난다.
- SUM·AVG 같은 집계형 윈도우 함수는 `OVER ()` 를 받는다. 전체 행을 한 파티션으로 보고 같은 값을 붙인다(Day 2).

## WHERE 에는 쓸 수 없다 — ORA-30483

"급여 상위 3위까지"를 구하려고 WHERE 에 순위 함수를 넣으면 오류가 난다.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3;
```

```text
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3
                                                                         *
ERROR at line 1:
ORA-30483: window  functions are not allowed here
```

HAVING 도 마찬가지다.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING RANK() OVER (ORDER BY COUNT(*) DESC) = 1;
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING RANK() OVER (ORDER BY COUNT(*) DESC) = 1
                                                        *
ERROR at line 1:
ORA-30483: window  functions are not allowed here
```

해법은 W5 Day 2 의 인라인 뷰다. 안쪽에서 순위를 계산해 열로 만들고, 바깥 WHERE 에서 그 열을 거른다.

```sql
SELECT ENAME, SAL, RNK FROM (SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP) WHERE RNK <= 3 ORDER BY RNK, ENAME;
```

```text
ENAME             SAL        RNK
---------- ---------- ----------
KING             5000          1
FORD             3000          2
SCOTT            3000          2
```

- 안쪽 SELECT 가 끝나면 RNK 는 평범한 열이다. 바깥 WHERE 는 그 열을 비교할 뿐이다.
- 같은 SELECT 의 별칭 `RNK` 를 WHERE 에 써도 안 된다. WHERE 가 SELECT 보다 먼저 처리되기 때문이다(ORA-00904).

부서별 상위 2명도 같은 방법이다. 동점이어도 딱 2명씩 받으려면 ROW_NUMBER 를 쓴다.

```sql
SELECT DEPTNO, ENAME, SAL FROM (SELECT DEPTNO, ENAME, SAL, ROW_NUMBER() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC, ENAME) AS RN FROM EMP) WHERE RN <= 2 ORDER BY DEPTNO, RN;
```

```text
    DEPTNO ENAME             SAL
---------- ---------- ----------
        10 KING             5000
        10 CLARK            2450
        20 FORD             3000
        20 SCOTT            3000
        30 BLAKE            2850
        30 ALLEN            1600
```

| 조건 | 고를 함수 | 20번 부서 결과 (`<= 2`) |
|------|---------|---------------------|
| 동점은 모두 포함 | RANK 또는 DENSE_RANK | FORD·SCOTT (둘 다 1위) |
| 정확히 n 명 | ROW_NUMBER (+ 동점 가를 키) | FORD·SCOTT (1번·2번) |
| 3위 급여까지 모두 | DENSE_RANK `<= 3` | FORD·SCOTT·JONES·ADAMS |

- 20번은 우연히 결과가 같다. `<= 1` 로 바꾸면 RANK 는 둘, ROW_NUMBER 는 하나를 돌려준다.

## 실행 순서상 위치

W4 Day 2 의 실행 순서에 윈도우 함수를 넣으면 이렇다.

```text
FROM → WHERE → GROUP BY → HAVING → SELECT(윈도우 함수 계산) → ORDER BY
```

- 윈도우 함수는 **WHERE 를 통과한 행**만 본다. 20번 부서만 남기고 순위를 매기면 전체 순위가 아니라 부서 안의 순위가 나온다.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE DEPTNO = 20 ORDER BY RNK, ENAME;
```

```text
ENAME             SAL        RNK
---------- ---------- ----------
FORD             3000          1
SCOTT            3000          1
JONES            2975          3
ADAMS            1100          4
SMITH             800          5
```

- JONES 는 전체에서 4위였지만 여기서는 3위다. KING 이 WHERE 에서 빠졌기 때문이다.
- GROUP BY 뒤에 계산되므로 집계 결과에도 순위를 매길 수 있다. `ORDER BY SUM(SAL)` 처럼 집계 함수를 윈도우 안에 넣는다.

```sql
SELECT DEPTNO, SUM(SAL) AS SUM_SAL, RANK() OVER (ORDER BY SUM(SAL) DESC) AS RNK FROM EMP GROUP BY DEPTNO ORDER BY RNK;
```

```text
    DEPTNO    SUM_SAL        RNK
---------- ---------- ----------
        20      10875          1
        30       9400          2
        10       8750          3
```

- ORDER BY 는 SELECT 다음이라 윈도우 함수를 쓸 수 있다. `ORDER BY RANK() OVER (ORDER BY SAL DESC), ENAME` 은 오류가 나지 않는다.

## OVER 없는 RANK

`RANK(값) WITHIN GROUP (ORDER BY 열)` 은 윈도우 함수가 아니라 집계 함수다. "이 값이 들어온다면 몇 위인가"를 한 행으로 돌려준다.

```sql
SELECT RANK(1500) WITHIN GROUP (ORDER BY SAL DESC) AS RNK FROM EMP;
```

```text
       RNK
----------
         8
```

- 급여 1500 은 TURNER 의 급여와 같아 TURNER 의 순위 8 이 나왔다.
- OVER 가 있으면 행마다 값, WITHIN GROUP 이면 결과 한 행이다. 보기에서 두 모양을 구분한다.

> 내일은 SUM·AVG 를 OVER 와 함께 쓰는 집계 윈도우 함수와, 앞뒤 행을 가져오는 LAG·LEAD 를 다룬다.

## 📖 용어

- **윈도우 함수** : 행을 합치지 않고 행마다 계산 값을 붙이는 함수. `OVER` 절이 붙는다. 분석 함수라고도 부른다.
- **파티션** : `PARTITION BY` 로 나눈 묶음. 윈도우 함수는 파티션마다 따로 계산한다.
- **RANK** : 동점에 같은 순위를 주고, 다음 순위는 동점 수만큼 건너뛴다(1, 2, 2, 4).
- **DENSE_RANK** : 동점에 같은 순위를 주고, 다음 순위를 건너뛰지 않는다(1, 2, 2, 3).
- **ROW_NUMBER** : 동점이어도 1부터 하나씩 다른 번호를 준다. 동점 사이 순서는 두 번째 정렬 키로 정한다.
- **ORA-30483** : WHERE·HAVING·GROUP BY 처럼 윈도우 함수를 쓸 수 없는 자리에 썼을 때의 오류.
- **ORA-30485** : 순위 함수의 OVER 안에 ORDER BY 가 없을 때의 오류.
- **인라인 뷰** : FROM 절의 서브쿼리. 순위를 열로 만든 뒤 바깥에서 거를 때 쓴다.

## 📝 연습 문제

**문제 1.** `SELECT ENAME, DENSE_RANK() OVER (ORDER BY SAL DESC) AS DR FROM EMP;` 에서 JONES(급여 2975)의 DR 값은? (급여 상위는 KING 5000, FORD·SCOTT 3000, JONES 2975 순이다)

A) 4  
B) 3  
C) 2  
D) 5  

**정답: B**  
해설: DENSE_RANK 는 동점 뒤 순위를 건너뛰지 않는다. KING 1, FORD·SCOTT 2, JONES 3 이다. 4 는 동점 수만큼 건너뛰는 RANK 의 값이다. 2 는 FORD·SCOTT 의 순위이고, 5 는 RANK 기준 BLAKE 의 순위다.

---

**문제 2.** 다음 중 Oracle 에서 오류가 나는 SQL 은?

A) `SELECT ENAME FROM EMP ORDER BY RANK() OVER (ORDER BY SAL DESC), ENAME;`  
B) `SELECT * FROM (SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) RNK FROM EMP) WHERE RNK <= 3;`  
C) `SELECT DEPTNO, RANK() OVER (ORDER BY SUM(SAL) DESC) FROM EMP GROUP BY DEPTNO;`  
D) `SELECT ENAME FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3;`  

**정답: D**  
해설: 윈도우 함수는 WHERE 절에 쓸 수 없어 ORA-30483 이 난다. A 의 ORDER BY 는 SELECT 다음에 처리되어 윈도우 함수를 쓸 수 있다. B 는 인라인 뷰에서 순위를 열로 만든 뒤 바깥 WHERE 에서 거르는 정상 해법이다. C 는 GROUP BY 뒤에 계산되므로 집계 함수를 윈도우 ORDER BY 에 넣을 수 있다.

---

**문제 3.** 급여 내림차순으로 번호를 매길 때, 급여가 같은 FORD 와 SCOTT 에게도 서로 다른 번호를 주는 함수는?

A) ROW_NUMBER  
B) RANK  
C) DENSE_RANK  
D) COUNT  

**정답: A**  
해설: ROW_NUMBER 는 동점이어도 1씩 증가하는 서로 다른 번호를 준다. RANK 와 DENSE_RANK 는 동점에 같은 순위를 준다. COUNT 는 순위 함수가 아니라 행 수를 세는 집계 함수다.

---

**문제 4.** `SELECT ENAME, RANK() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC) AS RNK FROM EMP;` 에서 30번 부서 WARD(1250)의 RNK 는? (30번 급여: BLAKE 2850, ALLEN 1600, TURNER 1500, MARTIN 1250, WARD 1250, JAMES 950)

A) 5  
B) 3  
C) 4  
D) 10  

**정답: C**  
해설: PARTITION BY DEPTNO 로 30번 부서 안에서만 순위를 매긴다. MARTIN 과 WARD 가 1250 으로 공동 4위다. 5 는 동점을 다른 번호로 주는 ROW_NUMBER 에서 나올 수 있는 값이다. 10 은 파티션 없이 전체 14명에서 매긴 순위다.

---

**문제 5.** `SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE DEPTNO = 20;` 에서 JONES 의 RNK 는? (20번: FORD 3000, SCOTT 3000, JONES 2975, ADAMS 1100, SMITH 800. 전체 1위 KING 은 10번이다)

A) 4  
B) 3  
C) 2  
D) 1  

**정답: B**  
해설: 윈도우 함수는 WHERE 를 통과한 20번 부서 5명만 보고 계산한다. FORD·SCOTT 가 공동 1위라 JONES 는 3위다. 4 는 KING 을 포함한 전체 순위다. 2 는 DENSE_RANK 의 값이고, 1 은 FORD·SCOTT 의 순위다.
