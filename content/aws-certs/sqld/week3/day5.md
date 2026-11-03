# Day 5 - WHERE 절

## 📌 핵심 정리

- `BETWEEN a AND b` 는 **a 와 b 를 포함**한다. a 가 b 보다 크면 한 행도 안 나온다.
- `LIKE` 의 `%` 는 0글자 이상, `_` 는 정확히 한 글자다. 이 기호 자체를 찾을 때는 `ESCAPE` 로 표시 문자를 정한다.
- NULL 은 `=` 로 못 찾는다. **`IS NULL` / `IS NOT NULL`** 만 쓴다.
- 논리 연산자 우선순위는 **NOT > AND > OR** 다. 헷갈리면 괄호를 친다.
- `NOT IN (…)` 목록에 NULL 이 하나라도 있으면 결과는 **0행**이다.

## WHERE 는 행을 고른다

`SELECT` 가 열을 고른다면 `WHERE` 는 행을 고른다. 조건이 **참(TRUE)** 인 행만 결과에 남는다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL >= 3000;
```

```text
ENAME             SAL
---------- ----------
SCOTT            3000
KING             5000
FORD             3000
```

| 연산자 | 뜻 |
|------|------|
| `=` | 같다 |
| `>`, `>=`, `<`, `<=` | 크다, 크거나 같다, 작다, 작거나 같다 |
| `<>`, `!=`, `^=` | 같지 않다 (셋 다 같은 뜻) |

- 문자와 날짜 값은 작은따옴표로 감싼다. 문자 값은 **대소문자를 가린다.**
- `'clerk'` 로는 `CLERK` 를 못 찾는다. 결과가 0행이다.

```sql
SELECT COUNT(*) FROM EMP WHERE JOB = 'clerk';
```

```text
  COUNT(*)
----------
         0
```

## 범위와 목록 — BETWEEN, IN

### BETWEEN a AND b

`a <= 값 AND 값 <= b` 와 같다. 양 끝값이 포함된다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL BETWEEN 1250 AND 1600;
```

```text
ENAME             SAL
---------- ----------
ALLEN            1600
WARD             1250
MARTIN           1250
TURNER           1500
MILLER           1300
```

- 1250 인 WARD·MARTIN, 1600 인 ALLEN 이 모두 들어갔다.
- 작은 값을 앞에 써야 한다. `BETWEEN 1600 AND 1250` 은 `SAL >= 1600 AND SAL <= 1250` 이라 참이 될 수 없다.

```sql
SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 1600 AND 1250;
```

```text
  COUNT(*)
----------
         0
```

`NOT BETWEEN` 은 범위 밖, 즉 `값 < a OR 값 > b` 다. `BETWEEN` 은 날짜에도 쓸 수 있다. `HIREDATE BETWEEN DATE '1982-01-01' AND DATE '1987-12-31'` 은 MILLER·SCOTT·ADAMS 세 명을 고른다.

### IN (목록)

`IN` 은 `=` 조건을 `OR` 로 이은 것과 같다. `DEPTNO IN (10, 40)` 은 `DEPTNO = 10 OR DEPTNO = 40` 이다.

```sql
SELECT ENAME, DEPTNO FROM EMP WHERE DEPTNO IN (10, 40);
```

```text
ENAME          DEPTNO
---------- ----------
CLARK              10
KING               10
MILLER             10
```

- 40번 부서에는 사원이 없어 10번 부서 세 명만 나온다. 목록에 없는 값이 섞여도 오류는 아니다.

여러 컬럼을 묶어 짝으로 비교할 수도 있다. (직무, 부서) 짝이 목록 안의 짝과 똑같아야 한다.

```sql
SELECT ENAME, JOB, DEPTNO FROM EMP WHERE (JOB, DEPTNO) IN (('MANAGER', 20), ('CLERK', 30));
```

```text
ENAME      JOB           DEPTNO
---------- --------- ----------
JONES      MANAGER           20
JAMES      CLERK             30
```

## 패턴 검색 — LIKE

| 기호 | 뜻 | 예 | 걸리는 이름 |
|------|------|------|------|
| `%` | 0글자 이상 아무 문자열 | `'J%'` | J 로 시작 |
| `_` | 정확히 한 글자 | `'_A%'` | 두 번째 글자가 A |
| 조합 | | `'%S'` | S 로 끝남 |
| 조합 | | `'____'` | 정확히 네 글자 |

```sql
SELECT ENAME FROM EMP WHERE ENAME LIKE '_A%';
```

```text
ENAME
----------
WARD
MARTIN
JAMES
```

- `LIKE` 도 대소문자를 가린다. `LIKE 'k%'` 는 KING 을 찾지 못한다.
- 와일드카드 없이 `LIKE 'KING'` 이라고 쓰면 `= 'KING'` 과 같다.

### ESCAPE — %, _ 자체를 찾을 때

`_` 를 글자 그대로 찾고 싶어도 `LIKE '%_%'` 는 "한 글자 이상인 모든 문자열"이라는 뜻이 된다. `ESCAPE` 로 표시 문자를 정하고, 그 문자 바로 뒤의 `_`·`%` 를 일반 글자로 읽게 한다.

```sql
SELECT 'OK' R FROM DUAL WHERE 'SALES_2026' LIKE '%\_%' ESCAPE '\';
```

```text
R
--
OK
```

```sql
SELECT COUNT(*) FROM DUAL WHERE 'SALES2026' LIKE '%\_%' ESCAPE '\';
```

```text
  COUNT(*)
----------
         0
```

- 밑줄이 없는 `SALES2026` 은 걸리지 않는다. ESCAPE 없이 `'%_%'` 로 썼다면 걸렸을 값이다.
- 표시 문자는 아무 글자나 정할 수 있다. `'50%' LIKE '%#%' ESCAPE '#'` 는 `%` 로 끝나는 문자열을 찾는다.

## NULL 은 IS NULL 로만 찾는다

NULL 과 무엇을 비교하든 결과는 참도 거짓도 아닌 **UNKNOWN** 이다. WHERE 는 참인 행만 남기므로 UNKNOWN 인 행은 빠진다.

> ⚠️ **`COMM = NULL` 은 오류가 아니라 0행이다.** 문법은 맞아서 실행은 되지만, 어떤 행도 참이 되지 않는다. NULL 을 찾을 때는 반드시 `IS NULL`, 아닌 것은 `IS NOT NULL` 을 쓴다.

```sql
SELECT COUNT(*) FROM EMP WHERE COMM = NULL;
```

```text
  COUNT(*)
----------
         0
```

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM IS NOT NULL;
```

```text
ENAME            COMM
---------- ----------
ALLEN             300
WARD              500
MARTIN           1400
TURNER              0
```

같은 이유로 부정 조건에서도 NULL 행은 빠진다. `COMM <> 300` 에 COMM 이 NULL 인 10명은 들어가지 않는다.

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM <> 300;
```

```text
ENAME            COMM
---------- ----------
WARD              500
MARTIN           1400
TURNER              0
```

## 논리 연산자와 우선순위

| 연산자 | 참이 되는 때 | 우선순위 |
|------|------|------|
| `NOT` | 조건이 거짓일 때 | 1 (가장 먼저) |
| `AND` | 두 조건이 모두 참일 때 | 2 |
| `OR` | 하나라도 참일 때 | 3 |

괄호가 없으면 `AND` 가 `OR` 보다 먼저 묶인다.

```sql
SELECT ENAME, JOB, SAL FROM EMP WHERE JOB = 'SALESMAN' OR JOB = 'MANAGER' AND SAL > 2900;
```

```text
ENAME      JOB              SAL
---------- --------- ----------
ALLEN      SALESMAN        1600
WARD       SALESMAN        1250
JONES      MANAGER         2975
MARTIN     SALESMAN        1250
TURNER     SALESMAN        1500
```

- 실제로는 `JOB = 'SALESMAN' OR (JOB = 'MANAGER' AND SAL > 2900)` 으로 읽힌다. 그래서 급여가 낮은 SALESMAN 네 명이 모두 나왔다.

"SALESMAN 이나 MANAGER 중 급여가 2900 초과"를 원했다면 괄호로 OR 을 먼저 묶는다.

```sql
SELECT ENAME, JOB, SAL FROM EMP WHERE (JOB = 'SALESMAN' OR JOB = 'MANAGER') AND SAL > 2900;
```

```text
ENAME      JOB              SAL
---------- --------- ----------
JONES      MANAGER         2975
```

| NULL 이 끼면 | 결과 |
|------|------|
| `TRUE AND UNKNOWN` | UNKNOWN |
| `FALSE AND UNKNOWN` | FALSE |
| `TRUE OR UNKNOWN` | TRUE |
| `FALSE OR UNKNOWN` | UNKNOWN |
| `NOT UNKNOWN` | UNKNOWN |

## 부정 연산자와 NOT IN 의 함정

| 긍정 | 부정 |
|------|------|
| `=` | `<>`, `!=`, `^=`, `NOT 컬럼 =` |
| `BETWEEN a AND b` | `NOT BETWEEN a AND b` |
| `IN (…)` | `NOT IN (…)` |
| `LIKE` | `NOT LIKE` |
| `IS NULL` | `IS NOT NULL` |

`NOT IN (a, b)` 은 `컬럼 <> a AND 컬럼 <> b` 다. 목록에 NULL 이 있으면 `컬럼 <> NULL` 이 UNKNOWN 이 되고, AND 로 이었으므로 전체가 참이 될 수 없다.

```sql
SELECT COUNT(*) FROM EMP WHERE MGR NOT IN (7698, 7839, NULL);
```

```text
  COUNT(*)
----------
         0
```

반대로 `IN` 은 OR 로 이어지므로 NULL 이 섞여도 나머지 값으로 정상 검색된다.

```sql
SELECT ENAME, MGR FROM EMP WHERE MGR IN (7566, NULL);
```

```text
ENAME             MGR
---------- ----------
SCOTT            7566
FORD             7566
```

이 함정은 서브쿼리에서 더 눈에 안 띈다. KING 의 MGR 이 NULL 이라, "아무의 관리자도 아닌 사원"을 찾는 아래 SQL 은 0 을 돌려준다.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP);
```

```text
  COUNT(*)
----------
         0
```

서브쿼리 결과에서 NULL 을 빼면 기대한 8명이 나온다. 서브쿼리는 5주차에 다시 본다.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP WHERE MGR IS NOT NULL);
```

```text
  COUNT(*)
----------
         8
```

- 상위 N개 행만 고르는 `ROWNUM` 도 WHERE 절에 쓰지만, 동작이 독특해 6주차 Top N 쿼리에서 다룬다.

다음 주에는 행을 묶어 집계하는 GROUP BY 와 집계 함수로 넘어간다.

## 📖 용어

- **WHERE 절** : 조건이 참인 행만 결과에 남기는 절.
- **BETWEEN** : 두 값 사이의 범위 조건. 양 끝값을 포함한다.
- **IN** : 목록 중 하나와 같은지 보는 조건. `=` 를 OR 로 이은 것과 같다.
- **와일드카드** : LIKE 에서 아무 글자를 뜻하는 기호. `%` 는 0글자 이상, `_` 는 한 글자다.
- **ESCAPE** : LIKE 에서 `%`·`_` 를 일반 글자로 읽게 하는 표시 문자를 정하는 구문.
- **UNKNOWN** : NULL 과 비교했을 때 나오는 세 번째 논리값. WHERE 에서는 거짓처럼 걸러진다.
- **연산자 우선순위** : 괄호가 없을 때 먼저 계산되는 순서. NOT, AND, OR 순이다.

## 📝 연습 문제

**문제 1.** EMP 테이블의 급여가 아래와 같을 때 다음 SQL 의 결과로 알맞은 것은? (ALLEN 1600, WARD 1250, MARTIN 1250, TURNER 1500, MILLER 1300, ADAMS 1100, 나머지는 1600 초과이거나 1100 미만)

```sql
SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 1250 AND 1600;
```

A) 3  
B) 5  
C) 2  
D) 0  

**정답: B**  
해설: `BETWEEN` 은 양 끝값을 포함한다. 1250 인 WARD·MARTIN, 1600 인 ALLEN, 그 사이의 TURNER·MILLER 까지 5명이다. 끝값을 빼고 세면 2명, ADAMS 1100 은 범위 밖이다.

---

**문제 2.** 다음 SQL 의 결과에 포함되지 **않는** 사원은?

```sql
SELECT ENAME FROM EMP WHERE ENAME LIKE '_A%';
```

A) WARD  
B) MARTIN  
C) JAMES  
D) ADAMS  

**정답: D**  
해설: `_` 는 정확히 한 글자, `%` 는 0글자 이상이므로 `'_A%'` 는 두 번째 글자가 A 인 이름이다. WARD, MARTIN, JAMES 는 두 번째 글자가 A 다. ADAMS 는 첫 글자가 A 이고 두 번째 글자는 D 라서 걸리지 않는다.

---

**문제 3.** 다음 WHERE 절과 같은 의미의 조건은?

```sql
SELECT ENAME FROM EMP WHERE JOB = 'SALESMAN' OR JOB = 'MANAGER' AND SAL > 2900;
```

A) `JOB = 'SALESMAN' OR (JOB = 'MANAGER' AND SAL > 2900)`  
B) `(JOB = 'SALESMAN' OR JOB = 'MANAGER') AND SAL > 2900`  
C) `(JOB = 'SALESMAN' AND SAL > 2900) OR JOB = 'MANAGER'`  
D) `JOB IN ('SALESMAN', 'MANAGER') AND SAL > 2900`  

**정답: A**  
해설: 괄호가 없으면 `AND` 가 `OR` 보다 먼저 묶인다. 따라서 `JOB = 'MANAGER' AND SAL > 2900` 이 먼저 한 덩어리가 되고, 그 결과가 `JOB = 'SALESMAN'` 과 OR 로 이어진다. B 와 D 는 같은 뜻이지만 원래 조건과는 결과가 다르다.

---

**문제 4.** 다음 SQL 의 결과로 알맞은 것은? (EMP 의 MGR 컬럼에는 7566, 7698, 7782, 7788, 7839, 7902 와 NULL 이 들어 있다)

```sql
SELECT COUNT(*) FROM EMP WHERE MGR NOT IN (7698, 7839, NULL);
```

A) 14  
B) 6  
C) 0  
D) 오류가 발생한다  

**정답: C**  
해설: `NOT IN (7698, 7839, NULL)` 은 `MGR <> 7698 AND MGR <> 7839 AND MGR <> NULL` 이다. 마지막 비교가 항상 UNKNOWN 이라 AND 로 이은 전체가 참이 될 수 없어 0 행이 걸린다. 문법 오류는 아니어서 실행은 되고 `COUNT(*)` 는 0 을 돌려준다.

---

**문제 5.** COMM 이 NULL 인 사원을 올바르게 조회하는 조건은?

A) `WHERE COMM IS NULL`  
B) `WHERE COMM = NULL`  
C) `WHERE COMM = ''`  
D) `WHERE COMM IN (NULL)`  

**정답: A**  
해설: NULL 과 `=` 로 비교하면 결과가 UNKNOWN 이라 어떤 행도 걸리지 않는다. B, D 는 모두 `= NULL` 비교이고, Oracle 에서 `''` 는 NULL 이므로 C 도 같은 결과다. NULL 은 `IS NULL` 로만 찾는다.
