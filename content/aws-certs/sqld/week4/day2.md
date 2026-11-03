# Day 2 - HAVING 과 실행 순서

## 📌 핵심 정리

- **WHERE 는 행을, HAVING 은 그룹을** 거른다. 집계 함수 조건은 HAVING 에만 쓸 수 있다.
- WHERE 에 집계 함수를 쓰면 **ORA-00934**(group function is not allowed here)다.
- 논리적 처리 순서는 **FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY** 다.
- SELECT 가 WHERE 보다 늦게 처리되므로 **WHERE 에서는 SELECT 별칭을 못 쓴다**(ORA-00904). ORDER BY 에서는 쓸 수 있다.
- HAVING 은 GROUP BY 없이도 쓸 수 있다. 그때는 테이블 전체가 그룹 하나다.

## 그룹을 거르는 HAVING

"평균 급여가 2000 을 넘는 부서"를 구하려고 WHERE 에 조건을 넣으면 실행조차 되지 않는다.

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO
                                       *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

- WHERE 가 처리되는 시점에는 아직 그룹이 없다. 부서 평균은 GROUP BY 가 끝나야 계산된다.
- 그룹이 만들어진 뒤의 조건은 HAVING 에 쓴다.

```sql
SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL
FROM EMP
GROUP BY DEPTNO
HAVING AVG(SAL) > 2000
ORDER BY DEPTNO;
```

```text
    DEPTNO    AVG_SAL
---------- ----------
        10       2917
        20       2175
```

- 30번 부서는 평균이 1566.67 이라 HAVING 에서 떨어졌다.
- HAVING 조건의 집계 함수는 SELECT 에 없어도 된다. `HAVING MIN(SAL) > 1000`처럼 SELECT 와 다른 집계를 써도 된다.

```sql
SELECT DEPTNO, MAX(SAL) FROM EMP GROUP BY DEPTNO HAVING MIN(SAL) > 1000 ORDER BY DEPTNO;
```

```text
    DEPTNO   MAX(SAL)
---------- ----------
        10       5000
```

- 20번(SMITH 800)과 30번(JAMES 950)은 최저 급여가 1000 이하라 빠졌다.

## WHERE 와 HAVING 을 함께

두 절은 거르는 대상과 시점이 다르다.

| 구분 | WHERE | HAVING |
|------|-------|--------|
| 거르는 대상 | **행** | **그룹** |
| 처리 시점 | GROUP BY **전** | GROUP BY **후** |
| 집계 함수 | 쓸 수 없다 (ORA-00934) | 쓸 수 있다 |
| 쓸 수 있는 일반 열 | 테이블의 모든 열 | GROUP BY 열 |

같은 쿼리에 둘을 함께 쓰면 WHERE 가 먼저 행을 줄이고, 남은 행으로 그룹을 만든 뒤 HAVING 이 그룹을 거른다. 단계마다 결과를 보면 차이가 분명하다.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING COUNT(*) >= 5 ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          5
        30          6
```

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP WHERE SAL >= 1500 GROUP BY DEPTNO ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        10          2
        20          3
        30          3
```

```sql
SELECT DEPTNO, COUNT(*) AS CNT
FROM EMP
WHERE SAL >= 1500
GROUP BY DEPTNO
HAVING COUNT(*) >= 3
ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          3
        30          3
```

- WHERE `SAL >= 1500`: 14명 중 8명이 남는다(KING·CLARK / JONES·SCOTT·FORD / ALLEN·BLAKE·TURNER).
- GROUP BY: 남은 8명으로 10번 2명, 20번 3명, 30번 3명의 그룹을 만든다.
- HAVING `COUNT(*) >= 3`: 2명인 10번이 빠진다.
- HAVING 의 `COUNT(*)`는 원래 부서 인원이 아니라 **WHERE 를 통과한 행 수**다. 30번은 원래 6명이지만 여기서는 3이다.

### 같은 조건을 어느 쪽에 둘까

GROUP BY 열에 대한 조건은 WHERE 와 HAVING 중 어디에 둬도 결과가 같다.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP WHERE DEPTNO <> 20 GROUP BY DEPTNO ORDER BY DEPTNO;
```

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING DEPTNO <> 20 ORDER BY DEPTNO;
```

```text
    DEPTNO   COUNT(*)
---------- ----------
        10          3
        30          6
```

- 두 쿼리의 결과는 같다. 다만 WHERE 는 20번 행 5개를 그룹 만들기 전에 버리고, HAVING 은 그룹을 다 만든 뒤 버린다.
- 처리할 행을 일찍 줄이는 WHERE 쪽이 일반적으로 효율이 좋다.

GROUP BY 에 없는 일반 열은 HAVING 에 쓸 수 없다. HAVING 은 그룹을 보는 절이라 그룹 안의 개별 행 값을 고를 수 없다.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING ENAME = 'KING';
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING ENAME = 'KING'
                                                        *
ERROR at line 1:
ORA-00979: "ENAME": must appear in the GROUP BY clause or be used in an aggregate function
```

- 개별 행 조건은 WHERE 로 옮긴다: `WHERE ENAME = 'KING'`.

### HAVING 과 NULL

HAVING 에서도 집계 함수는 NULL 을 건너뛴다. 커미션 합계가 NULL 인 부서를 찾으면 커미션이 하나도 없는 부서가 나온다.

```sql
SELECT DEPTNO FROM EMP GROUP BY DEPTNO HAVING SUM(COMM) IS NULL ORDER BY DEPTNO;
```

```text
    DEPTNO
----------
        10
        20
```

- 10·20번은 COMM 이 전부 NULL 이라 `SUM(COMM)`도 NULL 이다. 30번은 합계가 2200 이다.

## GROUP BY 없는 HAVING

HAVING 은 GROUP BY 없이도 쓸 수 있다. 이때는 테이블 전체(WHERE 를 통과한 행 전체)가 그룹 하나다.

```sql
SELECT COUNT(*) FROM EMP HAVING COUNT(*) > 10;
```

```text
  COUNT(*)
----------
        14
```

```sql
SELECT COUNT(*) FROM EMP HAVING COUNT(*) > 20;
```

```text
no rows selected
```

- 첫 쿼리는 그룹 하나(14행)가 조건을 통과해 한 행이 나온다.
- 두 번째는 그 하나뿐인 그룹이 떨어져 **0행**이다. "COUNT 결과 0 한 행"이 아니라 행 자체가 없다.

## 논리적 실행 순서

SQL 은 적힌 순서(SELECT 가 맨 앞)대로 처리되지 않는다. Oracle 이 내부적으로 실행 계획을 바꾸더라도, 결과는 아래 순서로 처리한 것과 같아야 한다.

```text
  ⑤ SELECT    DEPTNO, COUNT(*) AS CNT     ← 보여 줄 열을 고르고 별칭을 붙인다
  ① FROM      EMP                         ← 대상 테이블
  ② WHERE     SAL >= 1500                 ← 행을 거른다
  ③ GROUP BY  DEPTNO                      ← 그룹을 만든다
  ④ HAVING    COUNT(*) >= 3               ← 그룹을 거른다
  ⑥ ORDER BY  CNT DESC                    ← 정렬한다
```

| 순서 | 절 | 이 단계에서 보이는 것 |
|:---:|------|------|
| 1 | FROM | 테이블의 모든 열 |
| 2 | WHERE | 테이블의 모든 열 (집계 결과는 아직 없음) |
| 3 | GROUP BY | 그룹 |
| 4 | HAVING | GROUP BY 열, 집계 결과 |
| 5 | SELECT | 계산식, **별칭이 여기서 생긴다** |
| 6 | ORDER BY | SELECT 의 별칭·위치 번호까지 |

이 표 하나로 오늘 본 오류 대부분이 설명된다.

- WHERE(2)는 GROUP BY(3)보다 먼저라 집계 함수를 쓸 수 없다 → ORA-00934.
- HAVING(4)은 GROUP BY 뒤라 집계 함수를 쓸 수 있다.
- ORDER BY(6)는 SELECT(5) 뒤라 별칭을 쓸 수 있다.

### WHERE 에서 별칭을 못 쓰는 이유

별칭은 SELECT 단계에서 생긴다. 그보다 먼저 처리되는 WHERE 는 그 이름을 모른다.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

```text
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000
                                                *
ERROR at line 1:
ORA-00904: "ANNUAL": invalid identifier
```

- ORA-00904 는 "그런 열은 없다"는 오류다. Oracle 은 ANNUAL 을 EMP 의 열 이름으로 찾다가 못 찾았다.
- WHERE 에는 식을 그대로 다시 쓴다. ORDER BY 에서는 별칭이 통한다.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL
FROM EMP
WHERE SAL * 12 > 30000
ORDER BY ANNUAL DESC, ENAME;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
FORD            36000
SCOTT           36000
JONES           35700
BLAKE           34200
```

- FORD 와 SCOTT 은 연봉이 같아 두 번째 키 ENAME 으로 순서를 정했다. 두 번째 키가 없으면 둘의 순서는 보장되지 않는다.

> ⚠️ **실습 환경 주의**: 교재는 실행 순서를 근거로 GROUP BY·HAVING 에서도 SELECT 별칭을 못 쓴다고 설명한다. 이 노트의 실습 컨테이너(Oracle Database 23ai 계열)는 `GROUP BY 별칭`과 `HAVING 별칭`을 허용하는 새 기능이 있어 오류 없이 실행된다. 시험은 별칭을 WHERE·GROUP BY·HAVING 에서 쓸 수 없다는 전통 규칙으로 판단하는 편이 안전하다.

실습 컨테이너에서 실제로 돌려 본 결과다.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING CNT > 3 ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          5
        30          6
```

- 같은 23ai 에서도 WHERE 의 별칭은 여전히 ORA-00904 다. WHERE 가 SELECT 보다 먼저라는 원리는 그대로다.
- GROUP BY 위치 번호(`GROUP BY 1`)는 기본 설정에서 허용되지 않는다. 컨테이너에서는 ORA-03162 가 났다.

## 한 쿼리에 모두 담기

직무별 급여 합계를 구하되, PRESIDENT 는 빼고, 합계가 5000 을 넘는 직무만, 합계가 큰 순서로 보여 준다.

```sql
SELECT JOB, SUM(SAL) AS TOTAL
FROM EMP
WHERE JOB <> 'PRESIDENT'
GROUP BY JOB
HAVING SUM(SAL) > 5000
ORDER BY TOTAL DESC;
```

```text
JOB            TOTAL
--------- ----------
MANAGER         8275
ANALYST         6000
SALESMAN        5600
```

| 단계 | 하는 일 | 남는 것 |
|------|--------|--------|
| WHERE | KING 제외 | 13행 |
| GROUP BY | 직무로 묶기 | CLERK·SALESMAN·MANAGER·ANALYST 4그룹 |
| HAVING | 합계 5000 초과 | CLERK(4150) 탈락, 3그룹 |
| SELECT | JOB, 합계에 별칭 TOTAL | |
| ORDER BY | TOTAL 내림차순 | 8275 → 6000 → 5600 |

- `PRESIDENT` 조건은 개별 행 조건이라 WHERE 에, 합계 조건은 그룹 조건이라 HAVING 에 둔다.
- ORDER BY 만 별칭 TOTAL 을 쓴다. HAVING 에는 `SUM(SAL)`을 다시 썼다.

> 내일은 결과의 순서를 정하는 ORDER BY 와 NULL 의 정렬 위치를 다룬다.

## 📖 용어

- **HAVING** : GROUP BY 로 만든 그룹을 조건으로 거르는 절. 집계 함수를 조건에 쓸 수 있다.
- **ORA-00934** : 집계 함수를 쓸 수 없는 자리(WHERE 등)에 썼을 때의 오류.
- **ORA-00904** : 존재하지 않는 열 이름을 썼을 때의 오류. WHERE 에 SELECT 별칭을 쓰면 이 오류가 난다.
- **논리적 실행 순서** : 결과를 정하는 절 처리 순서. FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.
- **별칭(alias)** : SELECT 에서 열이나 식에 붙인 새 이름. SELECT 단계에서 생기므로 ORDER BY 에서만 확실히 쓸 수 있다.
- **행 조건과 그룹 조건** : 개별 행의 값을 보는 조건은 WHERE, 그룹의 집계 값을 보는 조건은 HAVING 에 둔다.

## 📝 연습 문제

**문제 1.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO;
```

A) 10, 20번 부서가 나온다  
B) ORA-00937 오류가 난다  
C) ORA-00934 오류가 난다  
D) 결과 행이 없다  

**정답: C**  
해설: WHERE 는 GROUP BY 보다 먼저 처리되어 그 시점에는 그룹도 집계 결과도 없다. 그래서 WHERE 에 집계 함수를 쓰면 ORA-00934(group function is not allowed here)가 난다. 그룹 조건은 `HAVING AVG(SAL) > 2000`으로 써야 한다.

---

**문제 2.** 다음 중 SELECT 문의 논리적 실행 순서로 알맞은 것은?

A) FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY  
B) SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY  
C) FROM → GROUP BY → WHERE → HAVING → SELECT → ORDER BY  
D) FROM → WHERE → GROUP BY → SELECT → HAVING → ORDER BY  

**정답: A**  
해설: 대상 테이블(FROM)을 정하고, 행을 거르고(WHERE), 그룹을 만들고(GROUP BY), 그룹을 거른 뒤(HAVING), 보여 줄 열을 고르고(SELECT), 마지막으로 정렬한다(ORDER BY). SELECT 가 ORDER BY 바로 앞이라 별칭은 ORDER BY 에서 쓸 수 있다.

---

**문제 3.** 다음 SQL 의 결과 행 수는? (SAL 이 1500 이상인 사원은 10번 2명, 20번 3명, 30번 3명이다)

```sql
SELECT DEPTNO, COUNT(*) FROM EMP WHERE SAL >= 1500 GROUP BY DEPTNO HAVING COUNT(*) >= 3;
```

A) 0  
B) 1  
C) 3  
D) 2  

**정답: D**  
해설: WHERE 가 먼저 SAL 1500 이상인 8명만 남기고, 이들로 부서별 그룹을 만든다. HAVING 의 `COUNT(*)`는 WHERE 를 통과한 행 수라 10번은 2, 20번과 30번은 3이다. 3 이상인 20번과 30번 두 행이 남는다.

---

**문제 4.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

A) 연봉이 30000 을 넘는 5명이 나온다  
B) ORA-00904 오류가 난다  
C) ORA-00934 오류가 난다  
D) 14명 전원이 나온다  

**정답: B**  
해설: 별칭 ANNUAL 은 SELECT 단계에서 생기는데, WHERE 는 SELECT 보다 먼저 처리된다. WHERE 시점에는 ANNUAL 이라는 열이 없으므로 ORA-00904(invalid identifier)가 난다. WHERE 에는 `SAL * 12 > 30000`처럼 식을 그대로 써야 한다.

---

**문제 5.** EMP 는 14행이다. 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT COUNT(*) FROM EMP HAVING COUNT(*) > 20;
```

A) 결과 행이 없다  
B) 0 한 행  
C) 14 한 행  
D) GROUP BY 가 없어 오류가 난다  

**정답: A**  
해설: HAVING 은 GROUP BY 없이도 쓸 수 있으며, 이때는 테이블 전체가 그룹 하나다. 그 그룹의 `COUNT(*)`는 14라 조건 `> 20`을 통과하지 못하고, 하나뿐인 그룹이 떨어져 결과는 0행이다.
