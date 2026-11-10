# Day 5 - GROUPING SETS 와 GROUPING 함수

## 📌 핵심 정리

- `GROUPING SETS (묶음1, 묶음2, …)`는 적은 묶음만 집계해 합친다. 계층도 모든 조합도 아니고, **고른 것만** 나온다.
- 묶음 안에 열이 여럿이면 괄호로 감싼다. `(DEPTNO, JOB)`은 한 묶음, `()`는 총계 묶음이다.
- `GROUPING(열)`은 그 행에서 열이 **집계로 접혀 NULL 이 되었으면 1**, 실제 값으로 묶였으면 **0** 이다. 원래 NULL 과 소계 NULL 을 가른다.
- CASE·DECODE 와 GROUPING 을 함께 써서 소계 행에 '소계'·'총계' 라벨을 붙인다.
- ROLLUP 과 CUBE 는 GROUPING SETS 로 모두 바꿔 쓸 수 있다. `ROLLUP(A, B)` = `GROUPING SETS ((A, B), A, ())`다.

## GROUPING SETS — 필요한 묶음만

어제의 CUBE(DEPTNO, JOB)는 상세 9행까지 18행을 냈다. 부서 소계와 직무 소계만 보고 싶다면 상세와 총계는 군더더기다. GROUPING SETS 는 묶음을 직접 나열한다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS (DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB          SUM_SAL
---------- --------- ----------
        10                 8750
        20                10875
        30                 9400
           ANALYST         6000
           CLERK           4150
           MANAGER         8275
           PRESIDENT       5000
           SALESMAN        5600
```

- (DEPTNO) 묶음 3행과 (JOB) 묶음 5행을 합친 8행이다.
- `GROUP BY DEPTNO`의 결과와 `GROUP BY JOB`의 결과를 UNION ALL 로 이은 것과 같다. 각 묶음에서 쓰지 않은 열은 NULL 이다.
- `GROUPING SETS (DEPTNO, JOB)`은 (DEPTNO, JOB) 조합별 집계가 **아니다**. 괄호 안 쉼표는 묶음을 나누는 구분자다.

### 괄호 묶음과 () 총계

한 묶음에 열이 둘 이상이면 괄호로 감싼다. 빈 괄호 `()`는 아무 열로도 묶지 않은 총계다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), DEPTNO, ()) ORDER BY DEPTNO, JOB;
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
                          29025
```

- 묶음은 (DEPTNO, JOB), (DEPTNO), () 셋이다. 어제의 `ROLLUP(DEPTNO, JOB)`과 같은 13행이다.

| 표기 | 묶음 | 행 수 |
|------|------|-----:|
| `GROUPING SETS (DEPTNO, JOB)` | (DEPTNO), (JOB) | 8 |
| `GROUPING SETS ((DEPTNO, JOB))` | (DEPTNO, JOB) | 9 |
| `GROUPING SETS ((DEPTNO, JOB), ())` | (DEPTNO, JOB), () | 10 |
| `GROUPING SETS (DEPTNO, JOB, ())` | (DEPTNO), (JOB), () | 9 |
| `GROUPING SETS ((DEPTNO, JOB), DEPTNO, ())` | (DEPTNO, JOB), (DEPTNO), () | 13 |

- 묶음을 하나만 적은 `GROUPING SETS ((DEPTNO, JOB))`은 일반 `GROUP BY DEPTNO, JOB`과 같다.
- 행 수는 각 묶음의 행 수를 더하면 된다. (DEPTNO) 3, (JOB) 5, (DEPTNO, JOB) 9, () 1 이다.

묶음끼리 같은 열을 쓸 필요도 없다. 10번 부서를 직무별로 한 번, 관리자별로 한 번 집계한다.

```sql
SELECT DEPTNO, JOB, MGR, SUM(SAL) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), (DEPTNO, MGR)) HAVING DEPTNO = 10 ORDER BY DEPTNO, JOB, MGR;
```

```text
    DEPTNO JOB              MGR   SUM(SAL)
---------- --------- ---------- ----------
        10 CLERK                      1300
        10 MANAGER                    2450
        10 PRESIDENT                  5000
        10                 7782       1300
        10                 7839       2450
        10                            5000
```

- 위 세 행은 (DEPTNO, JOB) 묶음, 아래 세 행은 (DEPTNO, MGR) 묶음이다.
- 마지막 행의 MGR 빈칸은 KING 의 실제 MGR 값 NULL 이다. 소계 행이 아닌데도 빈칸이다. 화면만으로는 구분할 수 없다.

### SELECT 에는 묶음에 쓴 열만

GROUPING SETS 도 GROUP BY 규칙을 그대로 따른다. 어느 묶음에도 없는 열을 SELECT 하면 ORA-00979 다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS (DEPTNO, ());
```

```text
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS (DEPTNO, ())
               *
ERROR at line 1:
ORA-00979: "JOB": must appear in the GROUP BY clause or be used in an aggregate function
```

## GROUPING 함수 — 이 NULL 은 소계인가

소계 행의 NULL 과 원래 데이터의 NULL 이 섞이면 화면만으로는 둘을 가를 수 없다. 10번 부서를 `ROLLUP(JOB, MGR)`로 집계하면 PRESIDENT 가 두 줄 나온다.

```sql
SELECT JOB, MGR, SUM(SAL) AS SUM_SAL, GROUPING(MGR) AS G_M FROM EMP WHERE DEPTNO = 10 GROUP BY ROLLUP(JOB, MGR) ORDER BY JOB, G_M, MGR;
```

```text
JOB              MGR    SUM_SAL        G_M
--------- ---------- ---------- ----------
CLERK           7782       1300          0
CLERK                      1300          1
MANAGER         7839       2450          0
MANAGER                    2450          1
PRESIDENT                  5000          0
PRESIDENT                  5000          1
                           8750          1
```

- PRESIDENT 의 첫 줄은 G_M 이 **0** 이다. MGR 값으로 묶인 상세 행이고, 그 값이 KING 의 MGR 인 NULL 이다.
- 둘째 줄은 G_M 이 **1** 이다. MGR 을 접은 직무 소계라 NULL 이 표시됐다.
- `MGR IS NULL`로는 두 줄을 가를 수 없다. 둘 다 MGR 이 NULL 이기 때문이다.

| GROUPING(열) | 뜻 | 그 열에 보이는 값 |
|------------|----|---------------|
| 0 | 그 열의 실제 값으로 묶은 행 | 데이터 값(원래 NULL 이면 NULL) |
| 1 | 그 열을 접어 집계한 소계·총계 행 | NULL |

ROLLUP(DEPTNO, JOB) 결과에 두 열의 GROUPING 을 함께 보면 행의 종류가 드러난다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL, GROUPING(DEPTNO) AS G_D, GROUPING(JOB) AS G_J FROM EMP GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB          SUM_SAL        G_D        G_J
---------- --------- ---------- ---------- ----------
        10 CLERK           1300          0          0
        10 MANAGER         2450          0          0
        10 PRESIDENT       5000          0          0
        10                 8750          0          1
        20 ANALYST         6000          0          0
        20 CLERK           1900          0          0
        20 MANAGER         2975          0          0
        20                10875          0          1
        30 CLERK            950          0          0
        30 MANAGER         2850          0          0
        30 SALESMAN        5600          0          0
        30                 9400          0          1
                          29025          1          1
```

| G_D | G_J | 행의 종류 |
|----:|----:|---------|
| 0 | 0 | 부서·직무별 상세 |
| 0 | 1 | 부서 소계 |
| 1 | 1 | 총계 |

- ROLLUP(DEPTNO, JOB)에는 (1, 0) 조합이 없다. 직무 소계를 만들지 않기 때문이다. CUBE 라면 (1, 0)인 직무 소계 행이 생긴다.
- GROUPING 은 GROUP BY 가 있는 쿼리에서만 쓴다. 없으면 ORA-30481 이다. 일반 GROUP BY 에서는 모든 행이 0 이다.

## 소계·총계 라벨 붙이기

GROUPING 값으로 CASE 를 분기하면 빈칸 대신 글자를 넣을 수 있다.

```sql
SELECT CASE GROUPING(DEPTNO) WHEN 1 THEN '총계' ELSE TO_CHAR(DEPTNO) END AS DEPT_L, CASE WHEN GROUPING(DEPTNO) = 1 THEN ' ' WHEN GROUPING(JOB) = 1 THEN '소계' ELSE JOB END AS JOB_L, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY GROUPING(DEPTNO), DEPTNO, GROUPING(JOB), JOB;
```

```text
DEPT_L                                   JOB_L        SUM_SAL
---------------------------------------- --------- ----------
10                                       CLERK           1300
10                                       MANAGER         2450
10                                       PRESIDENT       5000
10                                       소계            8750
20                                       ANALYST         6000
20                                       CLERK           1900
20                                       MANAGER         2975
20                                       소계           10875
30                                       CLERK            950
30                                       MANAGER         2850
30                                       SALESMAN        5600
30                                       소계            9400
총계                                                    29025
```

- DEPTNO 는 숫자라 문자 라벨과 한 열에 담으려고 `TO_CHAR`로 바꿨다. CASE 의 THEN 값들은 자료형이 맞아야 한다.
- ORDER BY 에도 GROUPING 을 써서 상세 → 소계 → 총계 순서를 고정했다. NULL 의 정렬 위치에 기대지 않는다.

DECODE 로도 같은 일을 한다. CUBE 결과에 '전체' 라벨을 붙인다.

```sql
SELECT DECODE(GROUPING(DEPTNO), 1, '전체', DEPTNO) AS DEPT_L, DECODE(GROUPING(JOB), 1, '전체', JOB) AS JOB_L, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY CUBE(DEPTNO, JOB) ORDER BY GROUPING(DEPTNO), DEPTNO, GROUPING(JOB), JOB;
```

```text
DEPT_L                                   JOB_L        SUM_SAL
---------------------------------------- --------- ----------
10                                       CLERK           1300
10                                       MANAGER         2450
10                                       PRESIDENT       5000
10                                       전체            8750
20                                       ANALYST         6000
20                                       CLERK           1900
20                                       MANAGER         2975
20                                       전체           10875
30                                       CLERK            950
30                                       MANAGER         2850
30                                       SALESMAN        5600
30                                       전체            9400
전체                                     ANALYST         6000
전체                                     CLERK           4150
전체                                     MANAGER         8275
전체                                     PRESIDENT       5000
전체                                     SALESMAN        5600
전체                                     전체           29025
```

- `DECODE(GROUPING(DEPTNO), 1, '전체', DEPTNO)`는 첫 결과값이 문자라 DEPTNO 숫자를 문자로 바꿔 돌려준다.
- 두 열이 모두 '전체'인 마지막 행이 총계, 한쪽만 '전체'인 행이 소계다.

> ⚠️ **함정**: 라벨 열의 별칭을 원래 열 이름과 같게 두면 ORDER BY 가 그 이름을 별칭으로 읽는다. `AS JOB`으로 짓고 `ORDER BY GROUPING(JOB)`을 쓰면 GROUPING 안의 JOB 이 집계식이 든 별칭을 가리켜 ORA-00934 가 난다(이 노트의 실습 환경인 Oracle 23ai 기준). 라벨 별칭은 다른 이름으로 짓는다.

```sql
SELECT DECODE(GROUPING(JOB), 1, '합계', JOB) AS JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(JOB) ORDER BY GROUPING(JOB), JOB;
```

```text
SELECT DECODE(GROUPING(JOB), 1, '합계', JOB) AS JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(JOB) ORDER BY GROUPING(JOB), JOB
                                                                                                                         *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

GROUPING 은 HAVING 에도 쓸 수 있다. 소계 행만 남기거나 빼는 데 쓴다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), DEPTNO, ()) HAVING GROUPING(JOB) = 1 ORDER BY DEPTNO;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10                 8750
        20                10875
        30                 9400
                          29025
```

## ROLLUP·CUBE 를 GROUPING SETS 로 바꿔 쓰기

ROLLUP 과 CUBE 는 자주 쓰는 묶음 목록에 붙인 줄임말이다. 모두 GROUPING SETS 로 펼칠 수 있다.

| 원래 표기 | 같은 GROUPING SETS |
|---------|-----------------|
| `GROUP BY A, B` | `GROUPING SETS ((A, B))` |
| `ROLLUP(A)` | `GROUPING SETS (A, ())` |
| `ROLLUP(A, B)` | `GROUPING SETS ((A, B), A, ())` |
| `ROLLUP(A, B, C)` | `GROUPING SETS ((A, B, C), (A, B), A, ())` |
| `CUBE(A, B)` | `GROUPING SETS ((A, B), A, B, ())` |
| `A, ROLLUP(B)` | `GROUPING SETS ((A, B), A)` |
| `ROLLUP((A, B))` | `GROUPING SETS ((A, B), ())` |

CUBE(DEPTNO, JOB)를 펼친 문장이다. 결과는 어제의 CUBE 18행과 같다.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), (DEPTNO), (JOB), ()) ORDER BY DEPTNO, JOB;
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
           ANALYST         6000
           CLERK           4150
           MANAGER         8275
           PRESIDENT       5000
           SALESMAN        5600
                          29025
```

- `(DEPTNO)`처럼 열 하나짜리 묶음은 괄호를 써도 되고 빼도 된다.
- 반대로 GROUPING SETS 로만 표현되는 목록도 있다. `GROUPING SETS (DEPTNO, JOB)`처럼 상세와 총계 없이 소계만 원하면 ROLLUP·CUBE 로는 쓸 수 없다.

> 다음 주에는 행을 줄이지 않고 순위와 누적값을 붙이는 윈도우 함수를 다룬다.

## 📖 용어

- **GROUPING SETS** : 집계할 그룹 묶음을 직접 나열하는 GROUP BY 확장. 나열한 묶음의 결과를 합친다.
- **() 빈 묶음** : 아무 열로도 묶지 않은 묶음. 총계 한 행을 만든다.
- **GROUPING(열)** : 그 행에서 열이 집계로 접혔으면 1, 실제 값으로 묶였으면 0 을 돌려주는 함수.
- **소계 라벨** : CASE·DECODE 로 GROUPING 이 1 인 자리에 '소계'·'총계' 같은 글자를 넣는 것.
- **ORA-30481** : GROUP BY 없는 쿼리에서 GROUPING 함수를 썼을 때의 오류.
- **ORA-00934** : 그룹 함수를 쓸 수 없는 자리에 썼을 때의 오류. 별칭이 열 이름을 가릴 때도 난다.

## 📝 연습 문제

**문제 1.** EMP 의 부서는 3개, 직무는 5종, (부서, 직무) 조합은 9가지다. 다음 SQL 의 결과 행 수는?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS (DEPTNO, JOB);
```

A) 8  
B) 9  
C) 13  
D) 18  

**정답: A**  
해설: GROUPING SETS 의 쉼표는 묶음을 나눈다. (DEPTNO) 묶음 3행과 (JOB) 묶음 5행을 합쳐 8행이다. 상세 (DEPTNO, JOB) 9행과 총계는 적지 않았으므로 나오지 않는다. 9 는 `GROUPING SETS ((DEPTNO, JOB))`, 13 은 ROLLUP, 18 은 CUBE 의 결과다.

---

**문제 2.** `SELECT DEPTNO, JOB, SUM(SAL), GROUPING(DEPTNO), GROUPING(JOB) FROM EMP GROUP BY ROLLUP(DEPTNO, JOB);` 의 결과에서 총계 행의 `GROUPING(DEPTNO)`, `GROUPING(JOB)` 값은?

A) 0, 0  
B) 0, 1  
C) 1, 0  
D) 1, 1  

**정답: D**  
해설: 총계 행은 DEPTNO 와 JOB 을 모두 접어 집계한 행이라 두 GROUPING 이 모두 1 이다. (0, 0)은 상세 행, (0, 1)은 부서 소계다. (1, 0)은 직무 소계인데 ROLLUP(DEPTNO, JOB)은 이 묶음을 만들지 않는다.

---

**문제 3.** 다음 중 `GROUP BY ROLLUP(DEPTNO, JOB)` 과 같은 결과를 내는 것은?

A) `GROUP BY GROUPING SETS (DEPTNO, JOB)`  
B) `GROUP BY GROUPING SETS ((DEPTNO, JOB), DEPTNO, ())`  
C) `GROUP BY GROUPING SETS ((DEPTNO, JOB), JOB, ())`  
D) `GROUP BY CUBE(DEPTNO, JOB)`  

**정답: B**  
해설: ROLLUP(DEPTNO, JOB)은 (DEPTNO, JOB), (DEPTNO), () 세 묶음을 만든다. 이를 그대로 나열한 것이 B 다. A 는 부서 소계와 직무 소계만 만든다. C 는 ROLLUP(JOB, DEPTNO)와 같은 묶음이다. D 는 직무 소계까지 더해 18행이 된다.

---

**문제 4.** 10번 부서를 `GROUP BY ROLLUP(JOB, MGR)` 로 집계하면 PRESIDENT 행이 두 줄 나오고, 두 줄 모두 MGR 이 NULL 이다. KING 의 MGR 은 원래 NULL 이다. 둘 중 직무 소계 행을 골라내는 방법으로 알맞은 것은?

A) `MGR IS NULL` 인 행을 소계로 본다  
B) `NVL(MGR, 0) = 0` 인 행을 소계로 본다  
C) `GROUPING(MGR) = 1` 인 행을 소계로 본다  
D) 두 행은 구분할 방법이 없다  

**정답: C**  
해설: `GROUPING(MGR)`은 MGR 을 접어 집계한 소계 행에서 1, 실제 값으로 묶인 행에서 0 이다. KING 의 상세 행은 실제 값 NULL 로 묶였으므로 0 이고, 직무 소계 행은 1 이다. A 와 B 는 두 행 모두 MGR 이 NULL 이라 둘 다 골라 버린다. GROUPING 함수가 있으므로 구분할 수 있다.

---

**문제 5.** EMP 의 부서는 3개, 직무는 5종이다. 다음 SQL 의 결과 행 수는?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS (DEPTNO, JOB, ());
```

A) 8  
B) 18  
C) 13  
D) 9  

**정답: D**  
해설: 묶음은 (DEPTNO), (JOB), () 셋이다. 3 + 5 + 1 = 9 행이다. 상세 (DEPTNO, JOB) 조합은 적지 않았으므로 나오지 않는다. 8 은 `()`를 뺀 경우이고, 18 은 상세까지 모두 만드는 CUBE 의 결과다.
