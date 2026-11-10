# Day 4 - 그룹 함수 ROLLUP·CUBE

## 📌 핵심 정리

- `GROUP BY ROLLUP(A, B)`는 (A, B) 그룹에 **A 별 소계**와 **총계** 행을 더한다. 인자 n 개면 그룹 묶음은 **n + 1** 개다.
- ROLLUP 은 인자 순서가 계층이다. `ROLLUP(A, B)`와 `ROLLUP(B, A)`는 소계 기준이 달라 결과가 다르다.
- `CUBE(A, B)`는 가능한 **모든 조합**의 소계를 만든다. 인자 n 개면 묶음은 **2ⁿ** 개이고, 인자 순서는 결과 행 집합에 영향이 없다.
- 소계·총계 행에서 묶이지 않은 열은 **NULL** 로 표시된다. 원래 NULL 인 값과 구분하려면 Day 5 의 GROUPING 을 쓴다.
- ROLLUP·CUBE 결과의 행 순서는 보장되지 않는다. 화면 순서가 필요하면 ORDER BY 를 쓴다.

## 소계 행이 필요한 장면

어제는 UNION ALL 로 상세 행 아래에 합계 행을 직접 붙였다. 부서별 소계와 전체 총계가 다 필요하면 SELECT 를 여러 번 써서 이어야 한다. ROLLUP 은 그 작업을 GROUP BY 한 줄로 끝낸다.

```sql
SELECT DEPTNO, SUM(SAL) FROM EMP GROUP BY ROLLUP(DEPTNO) ORDER BY DEPTNO;
```

```text
    DEPTNO   SUM(SAL)
---------- ----------
        10       8750
        20      10875
        30       9400
                29025
```

- 위 세 행은 `GROUP BY DEPTNO`와 같은 부서별 합계다.
- 마지막 행은 부서를 묶지 않은 전체 합계, 즉 **총계**다. 묶지 않은 DEPTNO 자리는 NULL(빈칸)이다.
- ORDER BY 의 오름차순은 NULL 을 맨 뒤에 둔다. 그래서 총계 행이 마지막에 온다.

## ROLLUP(A, B) — 오른쪽부터 하나씩 접는다

열이 둘이면 소계가 한 단계 더 생긴다. 부서·직무별 합계에 부서 소계와 총계를 붙인다.

```sql
SELECT DEPTNO, JOB, COUNT(*) AS CNT, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB              CNT    SUM_SAL
---------- --------- ---------- ----------
        10 CLERK              1       1300
        10 MANAGER            1       2450
        10 PRESIDENT          1       5000
        10                    3       8750
        20 ANALYST            2       6000
        20 CLERK              2       1900
        20 MANAGER            1       2975
        20                    5      10875
        30 CLERK              1        950
        30 MANAGER            1       2850
        30 SALESMAN           4       5600
        30                    6       9400
                             14      29025
```

`ROLLUP(DEPTNO, JOB)`이 만드는 그룹 묶음은 셋이다.

| 묶음 | 뜻 | 행 수 | 결과에서 NULL 인 열 |
|------|----|-----:|-----------------|
| (DEPTNO, JOB) | 부서·직무별 | 9 | 없음 |
| (DEPTNO) | 부서 소계 | 3 | JOB |
| () | 총계 | 1 | DEPTNO, JOB |

- 오른쪽 인자부터 하나씩 빼며 묶는다. (A, B) → (A) → () 다.
- 합계 13행이다. 9 + 3 + 1 이다.
- `JOB` 하나만으로 묶은 직무 소계 (JOB) 는 **만들지 않는다**. ROLLUP 은 왼쪽 열을 상위 계층으로 보고 그 계층의 소계만 낸다.

### 묶음 수 계산

| 식 | 만드는 묶음 | 묶음 수 |
|----|----------|------:|
| `ROLLUP(A)` | (A), () | 2 |
| `ROLLUP(A, B)` | (A, B), (A), () | 3 |
| `ROLLUP(A, B, C)` | (A, B, C), (A, B), (A), () | 4 |
| `ROLLUP` 인자 n 개 | 오른쪽부터 하나씩 뺀 n + 1 개 | n + 1 |

- 묶음 수와 결과 행 수는 다르다. 행 수는 각 묶음에 실제로 있는 값의 조합 수를 더한 것이다.

## 인자 순서를 바꾸면 결과가 다르다

`ROLLUP(JOB, DEPTNO)`는 직무가 상위 계층이다. 소계 기준이 부서에서 직무로 바뀐다.

```sql
SELECT JOB, DEPTNO, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(JOB, DEPTNO) ORDER BY JOB, DEPTNO;
```

```text
JOB           DEPTNO    SUM_SAL
--------- ---------- ----------
ANALYST           20       6000
ANALYST                    6000
CLERK             10       1300
CLERK             20       1900
CLERK             30        950
CLERK                      4150
MANAGER           10       2450
MANAGER           20       2975
MANAGER           30       2850
MANAGER                    8275
PRESIDENT         10       5000
PRESIDENT                  5000
SALESMAN          30       5600
SALESMAN                   5600
                          29025
```

| 식 | 묶음 | 행 수 |
|----|------|-----:|
| `ROLLUP(DEPTNO, JOB)` | (DEPTNO, JOB) 9 + (DEPTNO) 3 + () 1 | 13 |
| `ROLLUP(JOB, DEPTNO)` | (JOB, DEPTNO) 9 + (JOB) 5 + () 1 | 15 |

- 상세 9행과 총계 1행은 같다. 중간 소계가 부서 3개에서 직무 5개로 바뀌어 행 수가 달라진다.
- SELECT 절의 열 순서는 결과에 영향이 없다. 소계 기준을 정하는 것은 **ROLLUP 괄호 안의 순서**다.

> ⚠️ **함정**: 일반 `GROUP BY DEPTNO, JOB`은 열 순서를 바꿔도 같은 그룹이 나온다(W4 Day 1). `ROLLUP(DEPTNO, JOB)`과 `ROLLUP(JOB, DEPTNO)`는 소계 묶음이 달라 결과가 다르다.

## CUBE — 모든 조합

CUBE 는 인자로 만들 수 있는 모든 조합의 소계를 낸다. 부서 소계와 직무 소계가 함께 나온다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY CUBE(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB          SUM_SAL
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        10                 8750
        20 ANALYST         6000
        20 CLERK           1900
        20 MANAGER         2975
        20                10875
        30 CLERK            950
        30 MANAGER         2850
        30 SALESMAN        5600
        30                 9400
           ANALYST         6000
           CLERK           4150
           MANAGER         8275
           PRESIDENT       5000
           SALESMAN        5600
                          29025
```

| 묶음 | 뜻 | 행 수 |
|------|----|-----:|
| (DEPTNO, JOB) | 부서·직무별 | 9 |
| (DEPTNO) | 부서 소계 | 3 |
| (JOB) | 직무 소계 | 5 |
| () | 총계 | 1 |

- 합계 18행이다. ROLLUP(DEPTNO, JOB)의 13행에 직무 소계 5행이 더해졌다.
- `CUBE(JOB, DEPTNO)`로 순서를 바꿔도 만드는 묶음이 같아 행 집합이 같다. 화면 순서만 ORDER BY 에 따라 달라진다.

| 식 | 묶음 수 | 예 (인자 3개) |
|----|-------|------------|
| `ROLLUP` | n + 1 | 4 |
| `CUBE` | 2ⁿ | 8 |

- CUBE 는 인자가 하나 늘 때마다 묶음이 두 배가 된다. 필요 없는 소계까지 계산하므로 ROLLUP 보다 비용이 크다.
- 인자가 하나면 둘은 같다. `CUBE(DEPTNO)`와 `ROLLUP(DEPTNO)`는 모두 (DEPTNO), () 를 만든다.

## 부분 ROLLUP 과 괄호 묶음

ROLLUP 밖에 둔 열은 모든 묶음에 늘 들어간다. `GROUP BY DEPTNO, ROLLUP(JOB)`은 (DEPTNO, JOB)와 (DEPTNO) 두 묶음이고, 총계가 없다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY DEPTNO, ROLLUP(JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        10                 8750
        20 ANALYST         6000
        20 CLERK           1900
        20 MANAGER         2975
        20                10875
        30 CLERK            950
        30 MANAGER         2850
        30 SALESMAN        5600
        30                 9400
```

- `ROLLUP(DEPTNO, JOB)`의 13행에서 마지막 총계만 빠진 12행이다.

ROLLUP 안에서 열을 괄호로 묶으면 그 열들을 **한 단위**로 다룬다. 중간에 쪼개지 않는다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY ROLLUP((DEPTNO, JOB)) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        20 ANALYST         6000
        20 CLERK           1900
        20 MANAGER         2975
        30 CLERK            950
        30 MANAGER         2850
        30 SALESMAN        5600
                          29025
```

- 인자가 (DEPTNO, JOB) 한 단위라 묶음은 (DEPTNO, JOB)와 () 둘뿐이다. 부서 소계가 없다.

| 식 | 묶음 | 행 수 |
|----|------|-----:|
| `GROUP BY DEPTNO, JOB` | (DEPTNO, JOB) | 9 |
| `GROUP BY DEPTNO, ROLLUP(JOB)` | (DEPTNO, JOB), (DEPTNO) | 12 |
| `GROUP BY ROLLUP((DEPTNO, JOB))` | (DEPTNO, JOB), () | 10 |
| `GROUP BY ROLLUP(DEPTNO, JOB)` | (DEPTNO, JOB), (DEPTNO), () | 13 |
| `GROUP BY CUBE(DEPTNO, JOB)` | 위 넷 + (JOB) | 18 |

## WHERE 는 먼저, 소계는 남은 행으로

WHERE 는 그룹을 만들기 전에 행을 거른다. ROLLUP 의 소계·총계도 남은 행으로만 계산한다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP WHERE DEPTNO = 10 GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        10                 8750
                           8750
```

- 10번만 남았으므로 부서 소계와 총계가 같은 8750 이다. 총계는 테이블 전체(29025)가 아니라 **WHERE 를 통과한 행**의 합이다.

## 결과 순서는 보장되지 않는다

이 노트의 ROLLUP·CUBE 예제는 모두 ORDER BY 를 붙였다. ORDER BY 를 빼면 실습 컨테이너에서는 상세 행이 뒤섞여 나온 뒤 소계·총계가 이어졌다. 이 순서는 실행 계획에 따라 달라질 수 있는 결과이고, Oracle 이 보장하는 순서가 아니다.

- 교재에서 ROLLUP 결과가 "상세 → 소계 → 총계"처럼 계층 순으로 보이는 것은 정렬을 하는 실행 방식에서 나온 모습이다.
- 계층 순서를 확실히 보이려면 `ORDER BY DEPTNO, JOB`처럼 쓴다. 오름차순에서 NULL 이 뒤로 가므로 소계가 상세 행 아래에 온다.
- 원래 NULL 값이 있는 열은 이 방식으로 소계와 구분되지 않는다. 다음 날의 GROUPING 함수가 그 문제를 푼다.

> 내일은 원하는 묶음만 고르는 GROUPING SETS 와, 소계 행을 구별하는 GROUPING 함수를 다룬다.

## 📖 용어

- **소계** : 상위 열 값마다 하위 열을 접어 다시 집계한 행. `ROLLUP(DEPTNO, JOB)`의 부서별 합계 행이다.
- **총계** : 어떤 열로도 묶지 않은 전체 집계 행. 그룹 묶음 `()`에 해당한다.
- **ROLLUP** : 인자를 오른쪽부터 하나씩 빼며 소계와 총계를 만든다. 인자 순서가 계층이다.
- **CUBE** : 인자로 만들 수 있는 모든 조합의 소계를 만든다. 묶음 수는 2ⁿ 이다.
- **그룹 묶음(grouping set)** : 한 번의 집계에 쓰는 GROUP BY 열 조합. `(DEPTNO, JOB)`, `(DEPTNO)`, `()` 등.
- **부분 ROLLUP** : `GROUP BY A, ROLLUP(B)`처럼 일부 열만 ROLLUP 에 넣어 총계 없이 소계만 만드는 형태.
- **괄호 묶음(composite column)** : `ROLLUP((A, B))`처럼 여러 열을 한 단위로 다루게 묶은 것.

## 📝 연습 문제

**문제 1.** `GROUP BY ROLLUP(A, B, C)` 가 만드는 그룹 묶음의 수는?

A) 3  
B) 8  
C) 6  
D) 4  

**정답: D**  
해설: ROLLUP 은 오른쪽 인자부터 하나씩 빼며 (A, B, C), (A, B), (A), () 를 만든다. 인자가 n 개면 n + 1 개라 4개다. 8 은 모든 조합을 만드는 CUBE(A, B, C)의 묶음 수(2³)다.

---

**문제 2.** EMP 에서 (부서, 직무) 조합은 9가지, 부서는 3개, 직무는 5종이다. 다음 SQL 의 결과 행 수는?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY ROLLUP(JOB, DEPTNO);
```

A) 13  
B) 15  
C) 18  
D) 9  

**정답: B**  
해설: `ROLLUP(JOB, DEPTNO)`는 (JOB, DEPTNO), (JOB), () 묶음을 만든다. 9 + 5 + 1 = 15 행이다. SELECT 절의 열 순서가 아니라 ROLLUP 안의 순서가 소계 기준을 정한다. 13 은 `ROLLUP(DEPTNO, JOB)`, 18 은 CUBE 의 결과다.

---

**문제 3.** 같은 EMP 에서 다음 SQL 의 결과 행 수는?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY CUBE(DEPTNO, JOB);
```

A) 13  
B) 15  
C) 18  
D) 14  

**정답: C**  
해설: CUBE 는 (DEPTNO, JOB), (DEPTNO), (JOB), () 네 묶음을 모두 만든다. 9 + 3 + 5 + 1 = 18 행이다. 13 과 15 는 각각 부서 소계나 직무 소계 한쪽만 만드는 ROLLUP 의 결과다.

---

**문제 4.** `SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY ROLLUP(DEPTNO, JOB);` 의 결과에서 DEPTNO 가 10 이고 JOB 이 NULL 인 행의 의미는? (EMP 의 JOB 에는 NULL 이 없다)

A) 10번 부서의 급여 소계  
B) 10번 부서에서 직무가 없는 사원의 급여 합  
C) 전체 급여 총계  
D) 직무별 급여 소계  

**정답: A**  
해설: `ROLLUP(DEPTNO, JOB)`의 (DEPTNO) 묶음은 부서별 소계이고, 묶지 않은 JOB 자리는 NULL 로 표시된다. JOB 에 원래 NULL 이 없으므로 직무 없는 사원의 행이 아니다. 총계 행은 DEPTNO 도 NULL 이다. 직무 소계 (JOB) 는 ROLLUP(DEPTNO, JOB)이 만들지 않는다.

---

**문제 5.** EMP 의 (부서, 직무) 조합은 9가지, 부서는 3개다. 다음 SQL 의 결과 행 수는?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY DEPTNO, ROLLUP(JOB);
```

A) 13  
B) 9  
C) 12  
D) 15  

**정답: C**  
해설: ROLLUP 밖의 DEPTNO 는 모든 묶음에 들어가므로 묶음은 (DEPTNO, JOB)와 (DEPTNO) 둘이다. 9 + 3 = 12 행이고 총계 행은 없다. 13 은 총계까지 만드는 `ROLLUP(DEPTNO, JOB)`의 결과다. 9 는 일반 GROUP BY 의 결과다.
