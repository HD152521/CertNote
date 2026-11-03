# Day 3 - Top N 쿼리

## 📌 핵심 정리

- ROWNUM 은 WHERE 조건을 **통과한 행**에 1부터 차례로 붙는 번호다. 정렬(ORDER BY)보다 먼저 붙는다.
- `ROWNUM = 2`, `ROWNUM > 1` 은 0행이다. 첫 행이 1번을 받아야 다음 행이 2번을 받는데, 첫 행이 조건에서 떨어지기 때문이다.
- `WHERE ROWNUM <= 3 ORDER BY SAL DESC` 는 아무 3행을 먼저 자르고 정렬한다. 상위 3명을 원하면 정렬한 인라인 뷰 바깥에서 ROWNUM 을 건다.
- 12c 부터는 `ORDER BY … FETCH FIRST n ROWS ONLY` 를 쓴다. `OFFSET` 으로 건너뛰고, `WITH TIES` 로 마지막 동점까지 포함한다.
- SQL Server 는 `SELECT TOP(n)` 을 쓴다. `TOP(n) WITH TIES` 는 ORDER BY 가 있어야 한다.

## 상위 n 행만 필요할 때

"급여 상위 3명"은 순위 함수로도 구할 수 있지만, 모든 행에 순위를 매긴 뒤 거르는 방식이다. Oracle 에는 행 수 자체를 잘라 내는 장치가 두 가지 있다. 오래된 방식인 **ROWNUM** 과 12c 에 들어온 **FETCH FIRST** 다.

## ROWNUM 은 언제 붙는가

ROWNUM 은 테이블에 저장된 열이 아니다. 쿼리가 행을 하나 내보낼 때마다 Oracle 이 붙이는 일련번호다.

```sql
SELECT ROWNUM, ENAME, SAL FROM EMP WHERE ROWNUM <= 3;
```

```text
    ROWNUM ENAME             SAL
---------- ---------- ----------
         1 SMITH             800
         2 ALLEN            1600
         3 WARD             1250
```

- 정렬이 없으므로 어느 3행이 나올지는 보장되지 않는다. 실습 컨테이너에서는 입력한 순서대로 SMITH 부터 나왔다.
- 번호는 WHERE 를 통과하는 순간 붙는다. 처리 순서는 다음과 같다.

```text
행 하나를 읽는다
  → ROWNUM 이 아닌 WHERE 조건 검사 → 통과하면 다음 번호(ROWNUM)를 붙인다
  → ROWNUM 조건 검사 → 통과하면 결과로 내보내고 번호를 1 늘린다
  → (모든 행이 끝나면) ORDER BY 로 정렬
```

- 다른 조건과 같이 쓰면 그 조건을 통과한 행끼리 번호를 받는다. `WHERE DEPTNO = 30 AND ROWNUM <= 3` 은 30번 사원 중 3명이다.
- 번호는 결과로 나간 행에만 쓰인다. 떨어진 행은 번호를 가져가지 않는다.

## ROWNUM = 2 가 0행인 이유

`ROWNUM = 1` 은 한 행을 돌려준다. 그런데 `ROWNUM = 2` 는 아무 행도 없다.

```sql
SELECT COUNT(*) AS CNT FROM EMP WHERE ROWNUM = 2;
```

```text
       CNT
----------
         0
```

1. 첫 행에 후보 번호 1 이 붙는다. `1 = 2` 는 거짓이라 떨어진다.
2. 첫 행이 떨어졌으니 번호는 늘지 않는다. 두 번째 행도 후보 번호 1 을 받고 떨어진다.
3. 14행 모두 1 을 받고 떨어진다. 2번은 끝내 나오지 않는다.

같은 이유로 1을 포함하지 않는 조건은 모두 0행이다.

```sql
SELECT COUNT(*) AS CNT FROM EMP WHERE ROWNUM > 1;
```

```text
       CNT
----------
         0
```

| 조건 | 결과 행 수 (14행 테이블) | 이유 |
|------|---------------------|-----|
| `ROWNUM = 1` | 1 | 첫 행이 1번으로 통과 |
| `ROWNUM <= 3`, `ROWNUM < 4` | 3 | 1, 2, 3 이 차례로 통과 |
| `ROWNUM >= 1` | 14 | 모든 행이 통과 |
| `ROWNUM = 2` | 0 | 1번이 통과하지 못해 2번이 없다 |
| `ROWNUM > 1` | 0 | 위와 같다 |
| `ROWNUM BETWEEN 4 AND 6` | 0 | 위와 같다 |

- 4~6번째 행을 받으려면 ROWNUM 을 안쪽에서 **열로 굳힌 뒤** 바깥에서 비교한다. 아래 페이징 예제가 그 방법이다.

> ⚠️ **함정**: ROWNUM 조건은 `=` 1, `<`, `<=` 만 기대대로 동작한다. `ROWNUM = 2`, `ROWNUM > n`, `ROWNUM BETWEEN 2 AND …` 는 오류가 아니라 0행이다. 보기의 "오류가 난다"는 오답이다.

## ORDER BY 와 같이 쓰면 — 정렬 전에 잘린다

상위 3명을 구하려고 ROWNUM 과 ORDER BY 를 한 SELECT 에 쓰면 원하는 결과가 나오지 않는다.

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

- WHERE 에서 아무 3행(SMITH·ALLEN·WARD)이 먼저 잘렸다. ORDER BY 는 그 3행만 정렬했다.
- ROWNUM 이 2, 3, 1 로 뒤섞인 것이 증거다. 번호는 정렬 전에 붙었다.
- 어떤 3행이 잘리는지도 보장되지 않는다. 결과가 KING 을 포함한다는 보장이 없다.

해법은 정렬을 인라인 뷰 안으로 넣는 것이다. 안쪽 결과가 이미 정렬된 상태로 바깥에 넘어오고, 바깥 WHERE 가 그 순서대로 번호를 붙인다.

```sql
SELECT ROWNUM, ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3;
```

```text
    ROWNUM ENAME             SAL
---------- ---------- ----------
         1 KING             5000
         2 FORD             3000
         3 SCOTT            3000
```

- 안쪽 `ORDER BY SAL DESC, ENAME` 에서 ENAME 은 동점 FORD·SCOTT 의 순서를 고정한다. 빼면 3번이 둘 중 누구일지 정해지지 않는다.
- 인라인 뷰 안 ORDER BY 는 W5 Day 1 에서 본 대로 허용된다. WHERE 절 서브쿼리 안에는 쓸 수 없다.

### 페이징 — n 번째부터 m 번째까지

4~6위를 뽑으려면 인라인 뷰를 한 겹 더 쓴다. 가운데 단계에서 ROWNUM 에 별칭(RN)을 줘 보통 열로 만든다.

```sql
SELECT ENAME, SAL FROM (SELECT ROWNUM AS RN, ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 6) WHERE RN >= 4;
```

```text
ENAME             SAL
---------- ----------
JONES            2975
BLAKE            2850
CLARK            2450
```

| 단계 | 하는 일 |
|------|-------|
| 가장 안쪽 | 급여 내림차순 정렬 |
| 가운데 | 정렬된 순서로 ROWNUM 을 붙이고 6번까지 남긴다. RN 열로 굳힌다 |
| 바깥 | RN 이 4 이상인 행만 남긴다. RN 은 이제 평범한 숫자 열이다 |

## FETCH FIRST — 12c 이후의 표준 문법

Oracle 12c 부터는 ANSI 표준의 행 제한 절을 쓸 수 있다. ORDER BY 뒤에 붙고, 정렬이 끝난 결과를 자른다.

```text
ORDER BY 정렬 열
[OFFSET 건너뛸 행 수 ROWS]
FETCH { FIRST | NEXT } n { ROW | ROWS } { ONLY | WITH TIES }
```

- `FIRST`·`NEXT`, `ROW`·`ROWS` 는 같은 뜻이다. 읽기 좋은 쪽을 고른다.
- ORDER BY 다음에 처리되므로 ROWNUM 과 달리 정렬된 결과의 앞 n 행이 나온다.

```sql
SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME FETCH FIRST 3 ROWS ONLY;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
```

### OFFSET — 앞 n 행 건너뛰기

페이징이 인라인 뷰 두 겹에서 한 줄로 줄어든다.

```sql
SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY;
```

```text
ENAME             SAL
---------- ----------
JONES            2975
BLAKE            2850
CLARK            2450
```

- 앞 3행(KING·FORD·SCOTT)을 건너뛰고 다음 3행을 가져온다. 위 ROWNUM 페이징과 같은 결과다.
- FETCH 없이 `OFFSET 12 ROWS` 만 쓰면 13번째부터 끝까지다. EMP 에서는 JAMES·SMITH 두 행이다.

### WITH TIES — 마지막 동점까지

`FETCH FIRST 2 ROWS WITH TIES` 는 2번째 행과 정렬 값이 같은 행을 모두 더 가져온다. 바깥 ORDER BY 는 화면 순서를 고정하려고 붙였다.

```sql
SELECT * FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC FETCH FIRST 2 ROWS WITH TIES) ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
```

- 2번째 행의 급여가 3000 이고, 3000 인 행이 하나 더 있어 3행이 나왔다.
- 동점을 정하는 기준은 FETCH 앞의 ORDER BY 다. 안쪽 ORDER BY 에 ENAME 까지 넣으면 동점이 없어져 2행만 나온다.
- `ONLY` 였다면 정확히 2행이다. FORD·SCOTT 중 누가 남을지는 정해지지 않는다.

| 방식 | 처리 시점 | 동점 처리 | Oracle 버전 |
|------|---------|---------|-----------|
| ROWNUM | WHERE 단계(정렬 전) | 행 순서대로 자른다 | 모든 버전 |
| `ROW_NUMBER() OVER` + 인라인 뷰 | SELECT 단계 → 바깥 WHERE | 정확히 n 행 | 8i 이후 |
| `RANK() OVER` + 인라인 뷰 | SELECT 단계 → 바깥 WHERE | 동점 포함 | 8i 이후 |
| `FETCH FIRST n ROWS ONLY` | ORDER BY 다음 | 정확히 n 행 | 12c 이후 |
| `FETCH FIRST n ROWS WITH TIES` | ORDER BY 다음 | 마지막 동점 포함 | 12c 이후 |

## ROW_NUMBER 로 Top N

Day 1 의 방식도 Top N 이다. ROW_NUMBER 로 번호를 열로 만들면 BETWEEN 으로 바로 범위를 고를 수 있다.

```sql
SELECT ENAME, SAL FROM (SELECT ENAME, SAL, ROW_NUMBER() OVER (ORDER BY SAL DESC, ENAME) AS RN FROM EMP) WHERE RN BETWEEN 4 AND 6 ORDER BY RN;
```

```text
ENAME             SAL
---------- ----------
JONES            2975
BLAKE            2850
CLARK            2450
```

- ROWNUM 은 `BETWEEN 4 AND 6` 이 0행이었다. RN 은 인라인 뷰에서 이미 계산된 값이라 그 문제가 없다.
- `PARTITION BY` 를 더하면 "부서별 상위 n 명"이 된다. ROWNUM 과 FETCH FIRST 는 결과 전체에서만 자르므로 그룹별 Top N 은 윈도우 함수가 맡는다.

## SQL Server 의 TOP

SQL Server 는 ROWNUM·FETCH FIRST 대신 SELECT 바로 뒤에 TOP 을 쓴다. 실습장은 Oracle 이라 아래는 문법만 본다.

```text
SELECT TOP(3) ENAME, SAL FROM EMP ORDER BY SAL DESC;              -- 정렬 후 3행
SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP ORDER BY SAL DESC;    -- 2행 + 마지막 동점
SELECT TOP(20) PERCENT ENAME, SAL FROM EMP ORDER BY SAL DESC;     -- 비율
```

- TOP 은 ORDER BY 가 처리된 결과에서 자른다. ROWNUM 처럼 정렬 전에 잘리는 함정이 없다.
- `WITH TIES` 는 ORDER BY 가 반드시 있어야 한다. 없으면 SQL Server 가 오류를 낸다.
- ORDER BY 없이 `TOP(3)` 만 쓰면 오류는 아니지만 어느 3행이 나올지 정해지지 않는다.
- Oracle 에서 `SELECT TOP 3 ENAME FROM EMP` 를 실행하면 TOP 을 열 이름으로 읽어 ORA-00923 이 난다.

| 할 일 | Oracle | SQL Server |
|------|--------|-----------|
| 정렬 후 상위 3행 | 인라인 뷰 + `ROWNUM <= 3` 또는 `FETCH FIRST 3 ROWS ONLY` | `TOP(3)` + ORDER BY |
| 동점 포함 | `FETCH FIRST 3 ROWS WITH TIES` 또는 RANK | `TOP(3) WITH TIES` + ORDER BY |
| 4~6번째 | 이중 인라인 뷰 또는 `OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY` | `OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY` |

> 내일은 관리자-부하 관계를 따라 내려가는 계층형 질의(START WITH·CONNECT BY)를 다룬다.

## 📖 용어

- **Top N 쿼리** : 정렬 기준으로 상위(또는 하위) n 행만 돌려주는 쿼리.
- **ROWNUM** : 결과로 나가는 행에 1부터 붙는 Oracle 의 가상 열. WHERE 를 통과할 때 붙고 정렬보다 먼저다.
- **의사 열(pseudo column)** : 테이블에 저장되지 않았지만 열처럼 쓰는 값. ROWNUM, LEVEL 이 그 예다.
- **행 제한 절** : `OFFSET … FETCH …`. 12c 에 들어온 ANSI 표준 문법으로, ORDER BY 다음에 결과를 자른다.
- **WITH TIES** : 마지막으로 잘린 행과 정렬 값이 같은 행까지 함께 돌려주는 옵션.
- **페이징** : 결과를 일정 행 수씩 나눠 n 번째 묶음만 보여 주는 것. OFFSET 이나 이중 인라인 뷰로 만든다.
- **TOP** : SQL Server 의 행 제한 키워드. `SELECT TOP(n)` 처럼 SELECT 바로 뒤에 쓴다.

## 📝 연습 문제

**문제 1.** EMP 에는 14행이 있다. `SELECT COUNT(*) FROM EMP WHERE ROWNUM = 2;` 의 결과는?

A) 1  
B) 14  
C) 2  
D) 0  

**정답: D**  
해설: 첫 행이 ROWNUM 1 을 받고 `1 = 2` 에서 떨어진다. 행이 통과하지 못하면 번호가 늘지 않아 모든 행이 1 을 받고 떨어진다. 그래서 0 이다. 오류도 아니다. 1 은 `ROWNUM = 1`, 14 는 `ROWNUM >= 1` 의 결과다.

---

**문제 2.** 급여 상위 3명을 정확히 구하는 Oracle SQL 은?

A) `SELECT ENAME, SAL FROM EMP WHERE ROWNUM <= 3 ORDER BY SAL DESC;`  
B) `SELECT ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3;`  
C) `SELECT ENAME, SAL FROM EMP WHERE ROWNUM BETWEEN 1 AND 3 ORDER BY SAL DESC;`  
D) `SELECT ENAME, SAL FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3;`  

**정답: B**  
해설: 인라인 뷰 안에서 먼저 정렬하고 바깥에서 ROWNUM 을 걸어야 정렬된 순서대로 3행이 남는다. A 와 C 는 ROWNUM 이 ORDER BY 보다 먼저 처리되어 아무 3행을 자른 뒤 정렬한다. D 는 WHERE 에 윈도우 함수를 써서 ORA-30483 이 난다.

---

**문제 3.** EMP 의 급여 상위는 KING 5000, FORD 3000, SCOTT 3000, JONES 2975 순이다. `SELECT ENAME FROM EMP ORDER BY SAL DESC FETCH FIRST 2 ROWS WITH TIES;` 의 결과 행 수는?

A) 2  
B) 4  
C) 3  
D) 1  

**정답: C**  
해설: 2번째 행의 급여가 3000 이고, 같은 3000 인 행이 하나 더 있다. WITH TIES 는 그 동점 행까지 포함해 KING·FORD·SCOTT 3행을 돌려준다. 2 는 `ONLY` 를 썼을 때의 행 수다. JONES 는 급여가 2975 로 동점이 아니라 들어가지 않는다.

---

**문제 4.** `SELECT ENAME FROM EMP ORDER BY SAL DESC, ENAME OFFSET 2 ROWS FETCH FIRST 1 ROW ONLY;` 의 결과는? (급여 내림차순, 동점은 이름순이면 KING, FORD, SCOTT, JONES … 이다)

A) SCOTT  
B) FORD  
C) JONES  
D) KING  

**정답: A**  
해설: OFFSET 2 ROWS 가 앞의 KING·FORD 두 행을 건너뛰고, FETCH FIRST 1 ROW 가 다음 한 행인 SCOTT 을 가져온다. FORD 는 2번째 행으로 건너뛴 쪽에 든다. JONES 는 4번째 행이고, KING 은 OFFSET 이 없을 때의 첫 행이다.

---

**문제 5.** SQL Server 에서 급여 상위 2명을 구하되 2위와 급여가 같은 사원도 모두 포함하는 문장은?

A) `SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP;`  
B) `SELECT ENAME, SAL FROM EMP WHERE ROWNUM <= 2 ORDER BY SAL DESC;`  
C) `SELECT TOP(2) ENAME, SAL FROM EMP ORDER BY SAL DESC;`  
D) `SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP ORDER BY SAL DESC;`  

**정답: D**  
해설: SQL Server 의 `TOP(n) WITH TIES` 는 ORDER BY 기준으로 n 번째 행과 같은 값의 행까지 돌려준다. A 는 ORDER BY 가 없어 WITH TIES 를 쓸 수 없다. B 의 ROWNUM 은 Oracle 의 의사 열이고 정렬 전에 자른다. C 는 동점과 관계없이 정확히 2행만 돌려준다.
