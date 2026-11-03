# Day 1 - GROUP BY 와 집계 함수

## 📌 핵심 정리

- **`COUNT(*)`는 행 수**, **`COUNT(열)`은 그 열이 NULL 이 아닌 행 수**, `COUNT(DISTINCT 열)`은 NULL 을 뺀 서로 다른 값의 수다.
- 집계 함수는 **NULL 을 빼고 계산**한다. 그래서 `AVG(COMM)`(550)과 `AVG(NVL(COMM,0))`(157.14…)이 다르다.
- 조건에 맞는 행이 하나도 없으면 **`COUNT`는 0, `SUM`·`AVG`·`MAX`·`MIN`은 NULL** 을 돌려준다.
- `GROUP BY` 가 있으면 SELECT 에는 **GROUP BY 열과 집계 함수만** 올 수 있다. 어기면 ORA-00979 다.
- GROUP BY 없이 집계 함수와 일반 열을 섞으면 ORA-00937 이다.

## 여러 행을 한 값으로 — 집계 함수

EMP 의 14행을 "사원이 몇 명인가", "급여 합계는 얼마인가" 같은 값 하나로 줄이는 것이 집계 함수다. 집계 함수는 여러 행을 받아 **한 값**을 돌려준다.

| 함수 | 돌려주는 값 | 받는 자료형 |
|------|------------|-----------|
| `COUNT` | 행 수 | 모든 자료형, `*` |
| `SUM` | 합계 | 숫자 |
| `AVG` | 평균 | 숫자 |
| `MAX` / `MIN` | 최댓값 / 최솟값 | 숫자·문자·날짜 |
| `STDDEV` | 표준편차 | 숫자 |
| `VARIANCE` | 분산 | 숫자 |

```sql
SELECT SUM(SAL), AVG(SAL), MIN(SAL), MAX(SAL) FROM EMP;
```

```text
  SUM(SAL)   AVG(SAL)   MIN(SAL)   MAX(SAL)
---------- ---------- ---------- ----------
     29025 2073.21429        800       5000
```

- 14명의 급여 합이 29025, 평균이 29025 ÷ 14 = 2073.21… 이다.
- WHERE 가 없으니 테이블 전체가 **하나의 그룹**이고, 결과도 **한 행**이다.

`MAX`·`MIN`은 숫자에만 쓰는 함수가 아니다. 문자는 사전 순, 날짜는 시간 순으로 비교한다.

```sql
SELECT MIN(HIREDATE), MAX(HIREDATE), MIN(ENAME), MAX(ENAME) FROM EMP;
```

```text
MIN(HIREDA MAX(HIREDA MIN(ENAME) MAX(ENAME)
---------- ---------- ---------- ----------
1980-12-17 1987-05-23 ADAMS      WARD
```

- 가장 먼저 입사한 날은 1980-12-17(SMITH), 가장 늦은 날은 1987-05-23(ADAMS)이다.
- 이름은 알파벳 순으로 `ADAMS`가 가장 작고 `WARD`가 가장 크다.
- `SUM`·`AVG`에 문자 열을 넣으면 숫자로 바꿀 수 없어 오류가 난다. 문자·날짜에 쓸 수 있는 것은 `COUNT`·`MAX`·`MIN`이다.

표준편차와 분산은 계산 결과가 길어 `ROUND`로 줄여 본다.

```sql
SELECT ROUND(STDDEV(SAL), 2) AS SD, ROUND(VARIANCE(SAL), 2) AS VAR FROM EMP;
```

```text
        SD        VAR
---------- ----------
    1182.5 1398313.87
```

- `VARIANCE`는 분산, `STDDEV`는 그 제곱근이다. 1182.5 × 1182.5 ≈ 1398306 으로 반올림 오차 안에서 맞는다.

## COUNT 의 세 가지 얼굴

같은 `COUNT`라도 괄호 안에 무엇을 넣느냐에 따라 세는 대상이 달라진다.

```sql
SELECT COUNT(*), COUNT(COMM), COUNT(DISTINCT JOB), COUNT(MGR) FROM EMP;
```

```text
  COUNT(*) COUNT(COMM) COUNT(DISTINCTJOB) COUNT(MGR)
---------- ----------- ------------------ ----------
        14           4                  5         13
```

| 식 | 세는 것 | 결과 | 이유 |
|----|--------|-----:|------|
| `COUNT(*)` | 행 그 자체 | 14 | NULL 여부와 상관없이 모든 행 |
| `COUNT(COMM)` | COMM 이 NULL 이 아닌 행 | 4 | ALLEN·WARD·MARTIN·TURNER |
| `COUNT(DISTINCT JOB)` | 서로 다른 JOB 값 | 5 | CLERK·SALESMAN·MANAGER·ANALYST·PRESIDENT |
| `COUNT(MGR)` | MGR 이 NULL 이 아닌 행 | 13 | KING 만 MGR 이 NULL |

- TURNER 의 COMM 은 **0** 이다. 0 은 NULL 이 아니므로 `COUNT(COMM)`에 들어간다.
- `COUNT(*)`만 NULL 을 센다. 행이 있느냐만 보기 때문이다.

`DISTINCT`를 붙여도 NULL 은 여전히 빠진다.

```sql
SELECT COUNT(DISTINCT MGR) AS M1, COUNT(MGR) AS M2 FROM EMP;
```

```text
        M1         M2
---------- ----------
         6         13
```

- MGR 값은 7902·7698·7839·7566·7782·7788 여섯 가지다. KING 의 NULL 은 종류로도 세지 않는다.
- `COUNT(DISTINCT 열)`은 "중복 제거 후 개수"이고, 그 전에 NULL 부터 걸러진다.

## 집계 함수는 NULL 을 건너뛴다

`COUNT(*)`를 뺀 모든 집계 함수는 **NULL 인 행을 아예 없는 것처럼** 다룬다. 이 성질이 평균에서 결과를 바꾼다.

```sql
SELECT AVG(COMM), AVG(NVL(COMM, 0)), SUM(COMM), COUNT(COMM) FROM EMP;
```

```text
 AVG(COMM) AVG(NVL(COMM,0))  SUM(COMM) COUNT(COMM)
---------- ---------------- ---------- -----------
       550       157.142857       2200           4
```

| 식 | 분자 | 분모 | 결과 |
|----|-----:|-----:|-----:|
| `AVG(COMM)` | 2200 | **4** (NULL 아닌 행) | 550 |
| `AVG(NVL(COMM,0))` | 2200 | **14** (NULL 을 0 으로 바꾼 뒤 전부) | 157.14… |

- 문제에서 "커미션이 없는 사원은 0 으로 보고 평균을 구한다"라고 하면 `NVL`로 먼저 바꿔야 한다.
- `SUM(COMM)`은 NVL 을 씌우든 말든 2200 이다. NULL 을 건너뛰는 것과 0 을 더하는 것은 합계에서 같은 결과를 낸다.

NULL 은 행 단위 연산에서는 결과를 NULL 로 만든다. 집계 전에 더하느냐, 집계 후에 더하느냐에 따라 값이 달라진다.

```sql
SELECT SUM(SAL + COMM), SUM(SAL) + SUM(COMM) FROM EMP;
```

```text
SUM(SAL+COMM) SUM(SAL)+SUM(COMM)
------------- ------------------
         7800              31225
```

- `SUM(SAL + COMM)`: 행마다 `SAL + COMM`을 먼저 계산한다. COMM 이 NULL 인 10명은 NULL 이 되어 합계에서 빠지고, COMM 이 있는 4명만 남는다(1900 + 1750 + 2650 + 1500 = 7800).
- `SUM(SAL) + SUM(COMM)`: 각자 NULL 을 건너뛴 합계 29025 와 2200 을 더한다.

> ⚠️ **함정**: "집계 함수는 NULL 을 무시한다"는 집계 함수 **안으로 들어온 값**에 대한 말이다. 집계 함수에 넣기 전에 `SAL + COMM`처럼 행 단위로 계산하면, 그 단계에서 이미 NULL 이 생긴다.

## 아무 행도 없을 때

WHERE 조건에 맞는 행이 하나도 없으면 결과가 어떻게 될까. DEPT 40(OPERATIONS)에는 사원이 없다.

```sql
SELECT COUNT(*) AS CNT, SUM(SAL) AS TOTAL FROM EMP WHERE DEPTNO = 40;
```

```text
       CNT      TOTAL
---------- ----------
         0
```

- 결과는 **한 행**이 나온다. GROUP BY 가 없는 집계는 대상이 비어도 "전체"라는 그룹 하나를 만든다.
- `COUNT`는 **0**, `SUM`은 **NULL**(빈칸)이다. 더할 값이 없으니 합계를 정할 수 없다.
- `AVG`·`MAX`·`MIN`도 같은 이유로 NULL 이다.

| 함수 | 빈 집합의 결과 |
|------|-------------|
| `COUNT(*)`, `COUNT(열)` | 0 |
| `SUM`, `AVG`, `MAX`, `MIN` | NULL |

같은 조건에 GROUP BY 를 붙이면 결과가 바뀐다.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP WHERE DEPTNO = 40 GROUP BY DEPTNO;
```

```text
no rows selected
```

- GROUP BY 는 **실제로 있는 값마다** 그룹을 만든다. 남은 행이 없으면 만들 그룹도 없어 **0행**이다.
- "결과가 0 한 행인가, 아예 행이 없는가"를 가르는 것은 GROUP BY 의 유무다.

## GROUP BY — 그룹마다 한 행

`GROUP BY 열`은 그 열의 값이 같은 행끼리 묶고, 그룹마다 집계 결과를 한 행씩 낸다.

```sql
SELECT DEPTNO, COUNT(*), SUM(SAL), ROUND(AVG(SAL)) AS AVG_SAL
FROM EMP
GROUP BY DEPTNO
ORDER BY DEPTNO;
```

```text
    DEPTNO   COUNT(*)   SUM(SAL)    AVG_SAL
---------- ---------- ---------- ----------
        10          3       8750       2917
        20          5      10875       2175
        30          6       9400       1567
```

- EMP 의 DEPTNO 값은 10·20·30 세 가지라 결과도 3행이다.
- DEPT 테이블에는 40 이 있지만 **EMP 에 40 인 행이 없으므로** 그룹이 생기지 않는다. 40 을 보이게 하려면 Day 4·5 의 외부 조인이 필요하다.

### 여러 열로 묶기

GROUP BY 에 열을 여러 개 쓰면 **값의 조합**이 같은 행끼리 묶는다.

```sql
SELECT DEPTNO, JOB, COUNT(*) AS CNT, SUM(SAL) AS SUM_SAL
FROM EMP
GROUP BY DEPTNO, JOB
ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB              CNT    SUM_SAL
---------- --------- ---------- ----------
        10 CLERK              1       1300
        10 MANAGER            1       2450
        10 PRESIDENT          1       5000
        20 ANALYST            2       6000
        20 CLERK              2       1900
        20 MANAGER            1       2975
        30 CLERK              1        950
        30 MANAGER            1       2850
        30 SALESMAN           4       5600
```

- (부서, 직무) 조합이 실제로 존재하는 9가지라 9행이다. 부서 3 × 직무 5 = 15 가 아니다.
- 30번 부서의 SALESMAN 4명은 한 그룹이 되어 급여 합 5600 이 나온다.
- 열의 순서(`GROUP BY DEPTNO, JOB`과 `GROUP BY JOB, DEPTNO`)는 묶이는 결과를 바꾸지 않는다. 화면 순서는 ORDER BY 가 정한다.

## SELECT 에 올 수 있는 것 — ORA-00979 와 ORA-00937

GROUP BY 를 하면 한 그룹이 한 행이 된다. 30번 부서 그룹은 사원 6명을 품고 있는데, 거기서 ENAME 을 하나만 보여 줄 방법이 없다. 그래서 규칙이 생긴다.

| GROUP BY 를 쓸 때 SELECT 에 올 수 있는 것 | 예 |
|------|-----|
| GROUP BY 에 쓴 열(또는 식) | `DEPTNO` |
| 집계 함수 | `COUNT(*)`, `MAX(SAL)` |
| 상수 | `'부서'`, `1` |

규칙을 어기면 Oracle 이 오류를 낸다.

```sql
SELECT DEPTNO, ENAME, COUNT(*) FROM EMP GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, ENAME, COUNT(*) FROM EMP GROUP BY DEPTNO
               *
ERROR at line 1:
ORA-00979: "ENAME": must appear in the GROUP BY clause or be used in an aggregate function
```

- 별표(`*`)가 가리키는 ENAME 이 문제다. GROUP BY 에도 없고 집계 함수 안에도 없다.
- 교재에는 ORA-00979 의 문구가 `not a GROUP BY expression`으로 실려 있다. 이 노트의 실습 컨테이너(Oracle Database 23ai 계열)는 위처럼 어느 열이 문제인지까지 알려 준다. 번호는 같다.

GROUP BY 가 아예 없는데 집계 함수와 일반 열을 섞으면 번호가 다른 오류가 난다.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP;
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP
       *
ERROR at line 1:
ORA-00937: not a single-group group function
```

- `COUNT(*)`는 테이블 전체를 한 행으로 줄이려 하고, `DEPTNO`는 14행을 그대로 보이려 한다. 두 요구가 부딪힌다.

| 상황 | 오류 |
|------|------|
| GROUP BY 있음 + SELECT 에 GROUP BY 밖의 일반 열 | ORA-00979 |
| GROUP BY 없음 + 집계 함수와 일반 열을 함께 | ORA-00937 |

### 집계 함수의 중첩

Oracle 은 집계 함수 안에 집계 함수를 한 번 더 쓸 수 있다. 그룹별 결과를 다시 하나로 줄인다.

```sql
SELECT MAX(COUNT(*)) FROM EMP GROUP BY DEPTNO;
```

```text
MAX(COUNT(*))
-------------
            6
```

- 부서별 인원 3·5·6 중 최댓값 6 이 나온다. 중첩 집계는 GROUP BY 가 있어야 하고, SELECT 에 DEPTNO 같은 일반 열을 함께 쓸 수 없다.

> 내일은 그룹을 걸러 내는 HAVING 과, SQL 이 절을 처리하는 순서를 다룬다.

## 📖 용어

- **집계 함수** : 여러 행을 받아 값 하나를 돌려주는 함수. `COUNT`·`SUM`·`AVG`·`MAX`·`MIN`·`STDDEV`·`VARIANCE`.
- **`COUNT(*)`** : NULL 여부를 따지지 않고 행 수를 센다.
- **`COUNT(열)`** : 그 열이 NULL 이 아닌 행만 센다.
- **`COUNT(DISTINCT 열)`** : NULL 을 뺀 뒤 서로 다른 값의 개수를 센다.
- **빈 집합** : 조건에 맞는 행이 하나도 없는 상태. 이때 `COUNT`는 0, 나머지 집계는 NULL 이다.
- **그룹** : GROUP BY 열의 값(또는 값의 조합)이 같은 행의 묶음. 결과에서 한 행이 된다.
- **ORA-00979** : GROUP BY 에도 없고 집계 함수 안에도 없는 열을 SELECT 에 썼을 때의 오류.
- **ORA-00937** : GROUP BY 없이 집계 함수와 일반 열을 함께 SELECT 했을 때의 오류.

## 📝 연습 문제

**문제 1.** EMP 테이블은 14행이고, COMM 열은 4행만 값이 있다(그중 하나는 0). 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT COUNT(*), COUNT(COMM) FROM EMP;
```

A) 14, 14  
B) 14, 4  
C) 4, 4  
D) 14, 3  

**정답: B**  
해설: `COUNT(*)`는 NULL 과 상관없이 행 수 14를 센다. `COUNT(COMM)`은 COMM 이 NULL 이 아닌 행만 센다. TURNER 의 COMM 은 0 이며 0 은 NULL 이 아니므로 세는 대상에 들어가 4가 된다.

---

**문제 2.** EMP 의 COMM 값은 300, 500, 1400, 0 네 개이고 나머지 10행은 NULL 이다(합계 2200). 다음 SQL 의 결과는?

```sql
SELECT AVG(COMM) FROM EMP;
```

A) 157.142857  
B) 0  
C) 2200  
D) 550  

**정답: D**  
해설: 집계 함수는 NULL 을 건너뛴다. `AVG(COMM)`은 NULL 이 아닌 4행의 평균이라 2200 ÷ 4 = 550 이다. 157.142857 은 NULL 을 0 으로 바꾼 `AVG(NVL(COMM, 0))`의 결과로, 분모가 14가 된다.

---

**문제 3.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY DEPTNO;
```

A) ORA-00979 오류가 난다  
B) 부서별로 3행이 나온다  
C) 부서·직무 조합별로 9행이 나온다  
D) ORA-00937 오류가 난다  

**정답: A**  
해설: GROUP BY 가 있으면 SELECT 에는 GROUP BY 열과 집계 함수만 올 수 있다. JOB 은 GROUP BY 에도 없고 집계 함수 안에도 없으므로 ORA-00979 가 난다. ORA-00937 은 GROUP BY 자체가 없을 때 집계 함수와 일반 열을 섞으면 나는 오류다.

---

**문제 4.** DEPTNO 가 40 인 사원은 EMP 에 없다. 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT COUNT(*), SUM(SAL) FROM EMP WHERE DEPTNO = 40;
```

A) 결과 행이 없다  
B) 0, 0 한 행  
C) 0, NULL 한 행  
D) NULL, NULL 한 행  

**정답: C**  
해설: GROUP BY 가 없는 집계는 대상 행이 없어도 결과를 한 행 돌려준다. 이때 `COUNT`는 0, `SUM`은 더할 값이 없어 NULL 이다. 같은 조건에 `GROUP BY DEPTNO`를 붙이면 만들 그룹이 없어 결과가 0행이 된다.

---

**문제 5.** 다음 SQL 의 결과 행 수는? (EMP 의 부서는 10·20·30, 직무는 5종이다)

```sql
SELECT DEPTNO, JOB, COUNT(*) FROM EMP GROUP BY DEPTNO, JOB;
```

A) 3  
B) 9  
C) 5  
D) 15  

**정답: B**  
해설: 여러 열로 GROUP BY 하면 값의 조합이 실제로 존재하는 것마다 한 행이 생긴다. EMP 에 있는 (부서, 직무) 조합은 10번 3가지, 20번 3가지, 30번 3가지로 모두 9가지다. 가능한 모든 조합(3 × 5 = 15)을 만드는 것이 아니다.
