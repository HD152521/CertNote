# Day 1 - 함정 정리 1 (NULL 과 COUNT)

## 📌 핵심 정리

- NULL 이 낀 산술은 NULL 이고, NULL 과의 비교(`=`, `<>`)는 참도 거짓도 아닌 UNKNOWN 이다. NULL 은 `IS NULL` 로만 찾는다.
- Oracle 에서 `||` 는 NULL 을 빈 문자열처럼 건너뛰고, `''` 는 NULL 로 저장·비교된다.
- `COUNT(*)` 는 행을 세고 `COUNT(열)` 은 NULL 아닌 값을 센다. SUM·AVG 도 NULL 을 빼고 계산하므로 `AVG(COMM)` 과 `AVG(NVL(COMM, 0))` 은 다르다.
- 대상 행이 0개면 COUNT 는 0, SUM·MAX·AVG 는 NULL 이다. GROUP BY 가 붙으면 아예 0행이다.
- `NOT IN` 목록이나 서브쿼리에 NULL 이 하나라도 있으면 0행이다. `NOT EXISTS` 는 NULL 의 영향을 받지 않는다.

## NULL 은 값이 아니라 "모름"이다

W2 Day 5 에서 NULL 을 "아직 모르는 값, 해당 없는 값"으로 정의했다. SQL 은 이 정의를 끝까지 따른다. 모르는 값에 무엇을 더해도 모르는 값이고, 모르는 값이 300 과 같은지 물어도 답은 "모른다"다. 함정은 대부분 이 한 줄에서 나온다.

| 연산 | NULL 이 끼면 | 피하는 방법 |
|------|-----------|---------|
| 산술 `SAL + COMM` | NULL | `SAL + NVL(COMM, 0)` |
| 비교 `COMM = NULL`, `COMM <> 0` | UNKNOWN (WHERE 에서 버려진다) | `COMM IS NULL`, `COMM IS NOT NULL` |
| 연결 `ENAME \|\| COMM` (Oracle) | NULL 을 건너뛴다 | 따로 할 것 없음 |
| 집계 `SUM(COMM)`, `COUNT(COMM)` | NULL 행을 빼고 계산 | 분모를 바꾸려면 `NVL` 을 안에 쓴다 |

## 산술과 비교

30번 부서 사원의 급여와 수당을 더한다.

```sql
SELECT ENAME, SAL, COMM, SAL + COMM AS TOTAL, SAL + NVL(COMM, 0) AS TOTAL2 FROM EMP WHERE DEPTNO = 30 ORDER BY ENAME;
```

```text
ENAME             SAL       COMM      TOTAL     TOTAL2
---------- ---------- ---------- ---------- ----------
ALLEN            1600        300       1900       1900
BLAKE            2850                             2850
JAMES             950                              950
MARTIN           1250       1400       2650       2650
TURNER           1500          0       1500       1500
WARD             1250        500       1750       1750
```

- BLAKE·JAMES 는 COMM 이 NULL 이라 TOTAL 도 NULL 이다. 급여 2850 이 있어도 결과는 빈칸이다.
- TURNER 의 COMM 은 0 이다. 0 은 값이므로 `1500 + 0 = 1500` 이 정상으로 나온다. NULL 과 0 을 같은 것으로 보면 틀린다.

비교 쪽은 오류 없이 행만 사라진다.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE COMM = NULL) AS EQ_NULL, (SELECT COUNT(*) FROM EMP WHERE COMM IS NULL) AS IS_NULL, (SELECT COUNT(*) FROM EMP WHERE COMM <> 0) AS NE_ZERO FROM DUAL;
```

```text
   EQ_NULL    IS_NULL    NE_ZERO
---------- ---------- ----------
         0         10          3
```

- `COMM = NULL` 은 어느 행에서도 참이 아니다. 문법 오류가 나지 않아 틀린 줄 모르고 지나가기 쉽다.
- `COMM <> 0` 이 3 인 이유: 0 이 아닌 값은 300·500·1400 셋이다. NULL 인 10명은 "0 이 아니다"도 UNKNOWN 이라 빠진다.
- 결국 `COMM = 0` 의 1명과 `COMM <> 0` 의 3명을 더해도 14명이 되지 않는다. 나머지 10명은 `IS NULL` 로만 잡힌다.

## 연결 연산과 빈 문자열 (Oracle)

산술과 달리 Oracle 의 `||` 는 NULL 을 만나도 NULL 이 되지 않는다.

```sql
SELECT EMPNO, ENAME || NULL || '!' AS NAME_NULL, LENGTH(ENAME || NULL) AS LEN FROM EMP WHERE EMPNO IN (7499, 7839) ORDER BY EMPNO;
```

```text
     EMPNO NAME_NULL          LEN
---------- ----------- ----------
      7499 ALLEN!               5
      7839 KING!                4
```

- NULL 은 길이 0 짜리 문자열처럼 건너뛰어진다. `ENAME || COMM` 도 KING 처럼 COMM 이 NULL 이면 이름만 남는다.
- SQL Server 의 `+` 연결은 기본 설정에서 NULL 이 끼면 결과가 NULL 이다. DBMS 별 차이는 W8 Day 3 에서 따로 모은다.

Oracle 은 빈 문자열 `''` 을 NULL 과 구분하지 않는다.

```sql
SELECT CASE WHEN '' IS NULL THEN 'NULL' ELSE 'NOT NULL' END AS EMPTY, LENGTH('') AS LEN, NVL('', 'XYZ') AS NV FROM DUAL;
```

```text
EMPTY           LEN NV
-------- ---------- ---
NULL                XYZ
```

- `'' IS NULL` 이 참이고, `LENGTH('')` 는 0 이 아니라 NULL 이다. NVL 도 `''` 을 NULL 로 보고 대체값을 돌려준다.
- 그래서 Oracle 에서 `WHERE 열 = ''` 는 `= NULL` 과 같아 한 행도 고르지 않는다.

## 집계 함수와 NULL

COUNT 는 괄호 안에 무엇을 넣느냐로 세는 대상이 바뀐다.

```sql
SELECT COUNT(*) AS CNT_ALL, COUNT(COMM) AS CNT_COMM, COUNT(MGR) AS CNT_MGR, COUNT(DISTINCT MGR) AS CNT_DMGR, COUNT(DISTINCT DEPTNO) AS CNT_DEPT FROM EMP;
```

```text
   CNT_ALL   CNT_COMM    CNT_MGR   CNT_DMGR   CNT_DEPT
---------- ---------- ---------- ---------- ----------
        14          4         13          6          3
```

| 식 | 세는 것 | EMP 결과 |
|----|-------|--------|
| `COUNT(*)` | 행 수. NULL 여부와 관계없다 | 14 |
| `COUNT(COMM)` | COMM 이 NULL 아닌 행 수. 0 도 센다 | 4 |
| `COUNT(MGR)` | MGR 이 NULL 아닌 행 수. KING 만 빠진다 | 13 |
| `COUNT(DISTINCT MGR)` | NULL 을 뺀 서로 다른 값의 수 | 6 |

- `COUNT(COMM)` 의 4 에는 TURNER 의 0 이 들어 있다. "수당을 받는 사람"이 아니라 "수당 값이 적힌 사람"의 수다.
- `COUNT(DISTINCT …)` 도 NULL 은 값으로 치지 않는다.

SUM·AVG 도 NULL 행을 계산에서 뺀다. AVG 에서는 이것이 분모를 바꾼다.

```sql
SELECT SUM(COMM), AVG(COMM), ROUND(AVG(NVL(COMM, 0)), 2) AS AVG_NVL, ROUND(SUM(COMM) / COUNT(*), 2) AS SUM_CNT FROM EMP;
```

```text
 SUM(COMM)  AVG(COMM)    AVG_NVL    SUM_CNT
---------- ---------- ---------- ----------
      2200        550     157.14     157.14
```

- `AVG(COMM)` 은 `2200 / 4` 다. 분모가 `COUNT(COMM)` 이다.
- `AVG(NVL(COMM, 0))` 은 NULL 을 0 으로 바꾼 14행의 평균이라 `2200 / 14` 다. `SUM(COMM) / COUNT(*)` 와 같은 값이다.
- "전체 사원 기준 평균 수당"을 물으면 아래 두 식이고, "수당 값이 있는 사원 기준"이면 `AVG(COMM)` 이다.

NULL 이 집계 안쪽 산술에 들어가면 행 단위로 먼저 사라진다.

```sql
SELECT SUM(SAL + COMM) AS SUM_PLUS, SUM(SAL) + SUM(COMM) AS PLUS_SUM FROM EMP;
```

```text
  SUM_PLUS   PLUS_SUM
---------- ----------
      7800      31225
```

- `SUM(SAL + COMM)` 은 행마다 `SAL + COMM` 을 먼저 구한다. COMM 이 NULL 인 10명은 그 합이 NULL 이라 빠지고 4명분만 남는다.
- `SUM(SAL) + SUM(COMM)` 은 열마다 NULL 을 빼고 합친 뒤 더하므로 14명의 급여가 모두 들어간다.

## 대상 행이 0개인 집계

40번 부서에는 사원이 없다.

```sql
SELECT COUNT(*), COUNT(COMM), SUM(SAL), MAX(SAL), NVL(SUM(SAL), 0) AS NVL_SUM FROM EMP WHERE DEPTNO = 40;
```

```text
  COUNT(*) COUNT(COMM)   SUM(SAL)   MAX(SAL)    NVL_SUM
---------- ----------- ---------- ---------- ----------
         0           0                                0
```

- GROUP BY 없는 집계는 대상 행이 없어도 결과 1행을 만든다. COUNT 는 0, SUM·MAX 는 NULL 이다.
- 0 이 필요하면 `NVL(SUM(SAL), 0)` 처럼 집계 바깥을 감싼다. `SUM(NVL(SAL, 0))` 은 더할 행이 없으니 여전히 NULL 이다.
- 같은 조건에 `GROUP BY DEPTNO` 를 붙이면 만들 그룹이 없어 결과가 0행이다. COUNT 0 인 행이 나오지 않는다.

> ⚠️ **함정**: "40번 부서의 사원 수"를 `SELECT DEPTNO, COUNT(*) FROM EMP WHERE DEPTNO = 40 GROUP BY DEPTNO` 로 구하면 0 이 아니라 0행이다. 사원 없는 부서까지 0 으로 보려면 DEPT 기준 외부 조인 뒤 `COUNT(E.EMPNO)` 처럼 NULL 이 되는 열을 센다.

## NOT IN 과 NOT EXISTS

`IN` 은 OR, `NOT IN` 은 AND 로 풀린다(W5 Day 1). 목록에 NULL 이 있을 때 둘의 결과가 갈린다.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (10, NULL)) AS IN_CNT, (SELECT COUNT(*) FROM EMP WHERE DEPTNO NOT IN (10, NULL)) AS NOT_IN_CNT FROM DUAL;
```

```text
    IN_CNT NOT_IN_CNT
---------- ----------
         3          0
```

- `DEPTNO IN (10, NULL)` 은 `DEPTNO = 10 OR DEPTNO = NULL` 이다. 앞쪽이 참인 10번 부서 3명은 남는다.
- `DEPTNO NOT IN (10, NULL)` 은 `DEPTNO <> 10 AND DEPTNO <> NULL` 이다. 뒤쪽이 늘 UNKNOWN 이라 AND 전체가 참이 될 수 없다.

서브쿼리가 NULL 을 돌려줄 때도 같다. "급여가 누구의 수당 액수와도 같지 않은 사원"을 두 가지로 구한다.

```sql
SELECT COUNT(*) FROM EMP WHERE SAL NOT IN (SELECT COMM FROM EMP);
```

```text
  COUNT(*)
----------
         0
```

```sql
SELECT COUNT(*) FROM EMP E WHERE NOT EXISTS (SELECT 1 FROM EMP C WHERE C.COMM = E.SAL);
```

```text
  COUNT(*)
----------
        14
```

- 수당 값은 300·500·1400·0 이고 이와 같은 급여는 없다. 정답은 14명인데 NOT IN 은 0 을 냈다. 서브쿼리 결과 14행 중 10행이 NULL 이기 때문이다.
- NOT EXISTS 는 "조건을 만족하는 행이 하나도 없는가"만 본다. `C.COMM = E.SAL` 이 UNKNOWN 인 행은 "만족하는 행"이 아닐 뿐이라 결과를 망치지 않는다.
- NOT IN 을 살리려면 서브쿼리에 `WHERE COMM IS NOT NULL` 을 넣는다. 그러면 14가 나온다.

| 구문 | 서브쿼리에 NULL 이 있을 때 |
|------|-------------------|
| `IN (서브쿼리)` | 일치하는 값이 있으면 참. NULL 은 무시되는 셈이다 |
| `NOT IN (서브쿼리)` | 0행 (오류 없음) |
| `NOT EXISTS (서브쿼리)` | NULL 영향 없음 |

## NVL·NVL2·NULLIF·COALESCE

W3 Day 4 의 NULL 함수 넷을 같은 행에 나란히 놓는다.

```sql
SELECT EMPNO, ENAME, COMM, MGR, NVL(COMM, 0) AS NV, NVL2(COMM, 'Y', 'N') AS NV2, NULLIF(COMM, 0) AS NIF, COALESCE(COMM, MGR, 0) AS COAL FROM EMP WHERE EMPNO IN (7369, 7499, 7839, 7844) ORDER BY EMPNO;
```

```text
     EMPNO ENAME            COMM        MGR         NV N        NIF       COAL
---------- ---------- ---------- ---------- ---------- - ---------- ----------
      7369 SMITH                       7902          0 N                  7902
      7499 ALLEN             300       7698        300 Y        300        300
      7839 KING                                      0 N                     0
      7844 TURNER              0       7698          0 Y                     0
```

| 함수 | 돌려주는 값 | 헷갈리는 지점 |
|------|---------|-----------|
| `NVL(a, b)` | a 가 NULL 이면 b, 아니면 a | 인자는 둘뿐이다 |
| `NVL2(a, b, c)` | a 가 NULL 이 **아니면** b, NULL 이면 c | b·c 순서를 뒤집기 쉽다. TURNER 의 0 은 Y 다 |
| `NULLIF(a, b)` | a 와 b 가 같으면 NULL, 다르면 a | NULL 을 없애는 함수가 아니라 만드는 함수다 |
| `COALESCE(a, b, …)` | 왼쪽부터 처음 만난 NULL 아닌 값 | SMITH 는 COMM 이 NULL 이라 MGR 7902 가 나온다 |

- NV2 열 머리가 `N` 한 글자로 잘린 것은 SQL*Plus 가 값의 폭(1자)에 맞춘 탓이다.
- TURNER 줄에서 NULLIF 는 0 을 NULL 로 바꾸고, NVL 은 그대로 0 을 둔다. 두 함수는 방향이 반대다.

## NULL 의 정렬 위치

Oracle 은 NULL 을 가장 큰 값처럼 정렬한다(W4 Day 3). 10번 부서의 MGR 로 본다.

```sql
SELECT ENAME, MGR FROM EMP WHERE DEPTNO = 10 ORDER BY MGR DESC;
```

```text
ENAME             MGR
---------- ----------
KING
CLARK            7839
MILLER           7782
```

```sql
SELECT ENAME, MGR FROM EMP WHERE DEPTNO = 10 ORDER BY MGR DESC NULLS LAST;
```

```text
ENAME             MGR
---------- ----------
CLARK            7839
MILLER           7782
KING
```

| 정렬 | Oracle 기본 NULL 위치 | 반대로 두려면 |
|------|---------------|---------|
| ASC | 맨 뒤 | `NULLS FIRST` |
| DESC | 맨 앞 | `NULLS LAST` |

- SQL Server 는 반대로 NULL 을 가장 작은 값처럼 다뤄 ASC 에서 맨 앞에 둔다.

## CASE 안의 = NULL

WHERE 에서 하던 실수를 CASE 안에서도 똑같이 한다. DECODE 는 예외다.

```sql
SELECT ENAME, COMM, CASE WHEN COMM = NULL THEN 'NONE' ELSE 'HAS' END AS EQ, CASE COMM WHEN NULL THEN 'NONE' ELSE 'HAS' END AS SMP, CASE WHEN COMM IS NULL THEN 'NONE' ELSE 'HAS' END AS ISN, DECODE(COMM, NULL, 'NONE', 'HAS') AS DEC FROM EMP WHERE DEPTNO = 30 ORDER BY ENAME;
```

```text
ENAME            COMM EQ   SMP  ISN  DEC
---------- ---------- ---- ---- ---- ----
ALLEN             300 HAS  HAS  HAS  HAS
BLAKE                 HAS  HAS  NONE NONE
JAMES                 HAS  HAS  NONE NONE
MARTIN           1400 HAS  HAS  HAS  HAS
TURNER              0 HAS  HAS  HAS  HAS
WARD              500 HAS  HAS  HAS  HAS
```

- EQ 열: `WHEN COMM = NULL` 은 UNKNOWN 이라 WHEN 이 성립하지 않고 모두 ELSE 로 간다.
- SMP 열: 단순 CASE `CASE COMM WHEN NULL` 도 속으로는 `COMM = NULL` 비교라 결과가 같다.
- ISN 열: NULL 을 가르려면 검색 CASE 에 `IS NULL` 을 쓴다.
- DEC 열: DECODE 는 NULL 과 NULL 을 같다고 본다. 같은 뜻으로 보이는 CASE 와 DECODE 가 여기서 갈린다.

> ⚠️ **함정**: ELSE 를 빼고 `CASE WHEN COMM = NULL THEN 1 END` 를 COUNT 하면 오류 없이 0 이다. 같은 자리에 `DECODE(COMM, NULL, 1)` 를 쓰면 NULL 인 행 수가 나온다.

> 내일은 SQL 실행 순서와 조인에서 결과 행 수가 달라지는 함정을 정리한다.

## 📖 용어

- **UNKNOWN** : NULL 과 비교한 결과. 참도 거짓도 아니며 WHERE·HAVING·CASE WHEN 에서는 참이 아닌 것으로 처리된다.
- **IS NULL / IS NOT NULL** : NULL 여부를 판정하는 유일한 비교. `= NULL` 은 이 역할을 하지 못한다.
- **COUNT(\*) / COUNT(열)** : 앞은 행 수, 뒤는 그 열이 NULL 아닌 행 수다.
- **NVL2** : `NVL2(a, b, c)` 로 a 가 NULL 이 아니면 b, NULL 이면 c 를 돌려주는 Oracle 함수.
- **NULLIF** : `NULLIF(a, b)` 로 두 값이 같으면 NULL, 다르면 a 를 돌려주는 함수.
- **COALESCE** : 인자 가운데 왼쪽부터 처음 나오는 NULL 아닌 값을 돌려주는 함수.
- **NULLS FIRST / NULLS LAST** : ORDER BY 에서 NULL 을 맨 앞이나 맨 뒤에 두도록 정하는 Oracle 옵션.

## 📝 연습 문제

**문제 1.** `SELECT AVG(COMM) FROM EMP WHERE DEPTNO = 30;` 의 결과는? (30번 부서 6명의 COMM 은 300, 500, 1400, 0, NULL, NULL 이다)

A) 366.67  
B) 550  
C) 733.33  
D) NULL  

**정답: B**  
해설: AVG 는 NULL 을 빼고 계산하므로 값이 있는 4행의 평균 `2200 / 4 = 550` 이다. 0 은 NULL 이 아니라 분모에 들어간다. A 는 NULL 을 0 으로 보고 6명으로 나눈 `AVG(NVL(COMM, 0))` 의 값이다. C 는 0 까지 빼고 3명으로 나눈 값이다. D 는 집계 대상 행이 하나도 없을 때의 결과다.

---

**문제 2.** `SELECT COUNT(*) FROM EMP WHERE DEPTNO NOT IN (20, 30, NULL);` 의 결과는? (부서별 사원 수는 10번 3명, 20번 5명, 30번 6명이다)

A) 3  
B) 11  
C) 14  
D) 0  

**정답: D**  
해설: `NOT IN` 은 `DEPTNO <> 20 AND DEPTNO <> 30 AND DEPTNO <> NULL` 로 풀린다. 마지막 비교가 늘 UNKNOWN 이라 어느 행도 참이 되지 않아 0 이다. 3 은 목록에서 NULL 을 뺐을 때의 결과다. 11 은 목록과 반대로 10번 부서 3명만 뺀 값이고, 14 는 NOT IN 조건이 아무 행도 거르지 않는다고 본 값이다.

---

**문제 3.** TURNER 의 COMM 은 0 이다. `SELECT NVL2(NULLIF(COMM, 0), 'Y', 'N') FROM EMP WHERE ENAME = 'TURNER';` 의 결과는?

A) N  
B) Y  
C) 0  
D) NULL  

**정답: A**  
해설: `NULLIF(0, 0)` 은 두 값이 같아 NULL 이다. `NVL2(NULL, 'Y', 'N')` 은 첫 인자가 NULL 이므로 세 번째 인자 N 을 돌려준다. B 는 0 을 NULL 아닌 값으로 보고 NULLIF 를 건너뛴 답이다. C 는 NULLIF 결과에서 멈춘 답이고, D 는 NVL2 가 NULL 을 그대로 넘긴다고 본 답이다.

---

**문제 4.** 40번 부서에는 사원이 없다. `SELECT COUNT(*), SUM(SAL) FROM EMP WHERE DEPTNO = 40;` 의 결과는?

A) 결과가 0행이다  
B) 0, 0  
C) 0, NULL  
D) NULL, NULL  

**정답: C**  
해설: GROUP BY 없는 집계는 대상 행이 없어도 한 행을 만든다. COUNT 는 0 을, SUM 은 더할 값이 없어 NULL 을 돌려준다. A 는 `GROUP BY DEPTNO` 를 붙였을 때의 결과다. B 는 SUM 도 0 이 된다고 본 답으로, `NVL(SUM(SAL), 0)` 을 써야 나온다. D 는 COUNT 가 NULL 을 돌려주지 않는다는 점을 놓쳤다.

---

**문제 5.** EMP 에서 COMM 이 NULL 인 사원은 10명이다. `SELECT COUNT(CASE WHEN COMM = NULL THEN 1 END), COUNT(DECODE(COMM, NULL, 1)) FROM EMP;` 의 결과는?

A) 0, 10  
B) 10, 10  
C) 0, 0  
D) 10, 0  

**정답: A**  
해설: `COMM = NULL` 은 UNKNOWN 이라 WHEN 이 성립하지 않고, ELSE 가 없어 모든 행이 NULL 이 된다. COUNT 는 NULL 을 세지 않아 0 이다. DECODE 는 NULL 과 NULL 을 같다고 보므로 COMM 이 NULL 인 10행에서 1 을 돌려 10 이다. B 는 CASE 의 `= NULL` 이 동작한다고 본 답이다. C 는 DECODE 도 `=` 비교라고 본 답이고, D 는 두 식의 동작을 서로 바꿔 생각한 답이다.
