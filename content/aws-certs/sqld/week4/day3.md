# Day 3 - ORDER BY 절과 정렬

## 📌 핵심 정리

- ORDER BY 가 없으면 **행 순서는 보장되지 않는다.** 순서를 묻는 문제의 결과는 ORDER BY 가 정한다.
- 정렬 키는 **열 이름·SELECT 별칭·SELECT 목록의 위치 번호**로 쓸 수 있고, 여러 개를 쓰면 앞 키가 같을 때 다음 키로 가른다.
- Oracle 은 **NULL 을 가장 큰 값**으로 본다. ASC 에서 맨 뒤, DESC 에서 맨 앞이다. SQL Server 는 반대다.
- `NULLS FIRST` / `NULLS LAST`로 NULL 위치를 직접 정할 수 있다(Oracle).
- SELECT 에 없는 열로도 정렬할 수 있다. 단 **DISTINCT 가 있으면 ORA-01791**, GROUP BY 가 있으면 GROUP BY 열이나 집계 함수만 된다.

## 순서는 ORDER BY 만 정한다

테이블의 행에는 정해진 순서가 없다. 같은 SELECT 를 두 번 돌려도 순서가 같으리라는 보장이 없고, 실행 계획이나 저장 위치가 바뀌면 순서도 바뀔 수 있다. 결과의 순서를 정하는 것은 ORDER BY 하나다.

- ORDER BY 는 논리적 실행 순서에서 **맨 마지막**이다. SELECT 까지 끝난 결과를 정렬한다.
- 기본은 오름차순 `ASC`이고, 내림차순은 `DESC`를 붙인다.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL;
```

```text
ENAME             SAL
---------- ----------
SMITH             800
ADAMS            1100
JONES            2975
FORD             3000
SCOTT            3000
```

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC;
```

```text
ENAME             SAL
---------- ----------
SCOTT            3000
FORD             3000
JONES            2975
ADAMS            1100
SMITH             800
```

- 급여가 같은 FORD 와 SCOTT 의 순서가 두 실행에서 뒤바뀌었다. DESC 가 오름차순 결과를 단순히 뒤집은 것이 아니라 새로 정렬한 결과이고, 같은 값끼리의 순서는 정해 두지 않았기 때문이다.
- 값이 같은 행의 순서까지 고정하려면 정렬 키를 하나 더 둔다.

## 정렬 키를 쓰는 세 가지 방법

| 방법 | 예 | 비고 |
|------|-----|------|
| 열 이름(또는 식) | `ORDER BY SAL` | SELECT 에 없어도 된다(아래 제약 참고) |
| SELECT 별칭 | `ORDER BY ANNUAL` | ORDER BY 는 SELECT 뒤라 별칭을 안다 |
| 위치 번호 | `ORDER BY 3` | SELECT 목록의 몇 번째 열인가 |

별칭으로 정렬하는 예다.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE DEPTNO = 10 ORDER BY ANNUAL DESC;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
CLARK           29400
MILLER          15600
```

위치 번호로 정렬하는 예다. 3은 SELECT 목록의 세 번째 열 SAL 이다.

```sql
SELECT ENAME, JOB, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY 3 DESC;
```

```text
ENAME      JOB              SAL
---------- --------- ----------
KING       PRESIDENT       5000
CLARK      MANAGER         2450
MILLER     CLERK           1300
```

- 위치 번호는 **테이블의 열 순서가 아니라 SELECT 목록의 순서**다. EMP 의 세 번째 열은 JOB 이지만 여기서 3은 SAL 이다.
- SELECT 목록보다 큰 번호를 쓰면 오류다.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY 4;
```

```text
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY 4
                                                      *
ERROR at line 1:
ORA-01785: ORDER BY item must be the number of a SELECT-list expression
```

큰따옴표로 만든 별칭은 대소문자를 구분하므로 ORDER BY 에서도 같은 모양으로 써야 한다.

```sql
SELECT ENAME AS "Name", SAL FROM EMP WHERE DEPTNO = 10 ORDER BY "Name";
```

```text
Name              SAL
---------- ----------
CLARK            2450
KING             5000
MILLER           1300
```

## 여러 키로 정렬

키를 쉼표로 나열하면 **첫 키로 정렬하고, 첫 키가 같은 행끼리만 둘째 키로** 정렬한다. ASC·DESC 는 키마다 따로 붙는다.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC, ENAME ASC;
```

```text
ENAME             SAL
---------- ----------
FORD             3000
SCOTT            3000
JONES            2975
ADAMS            1100
SMITH             800
```

- 3000 으로 같은 FORD·SCOTT 이 이름순으로 정해졌다. 처음 예와 달리 이 순서는 매번 같다.
- `DESC`는 바로 앞의 키 SAL 에만 걸린다. ENAME 은 따로 적은 `ASC`(생략해도 같다)를 따른다.

부서 안에서 급여가 높은 순으로 보는 전형적인 2단 정렬이다.

```sql
SELECT ENAME, DEPTNO, SAL
FROM EMP
WHERE JOB IN ('CLERK', 'MANAGER')
ORDER BY DEPTNO, SAL DESC;
```

```text
ENAME          DEPTNO        SAL
---------- ---------- ----------
CLARK              10       2450
MILLER             10       1300
JONES              20       2975
ADAMS              20       1100
SMITH              20        800
BLAKE              30       2850
JAMES              30        950
```

- 부서 번호가 먼저 오름차순으로 묶이고, 부서 안에서만 급여 내림차순이다.
- 키의 순서를 바꿔 `ORDER BY SAL DESC, DEPTNO`로 쓰면 급여 순 하나로 섞인 전혀 다른 결과가 된다.

키가 무의미한 경우도 있다. 첫 키가 모두 다르면 둘째 키는 쓰일 일이 없다.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY ENAME DESC, SAL;
```

```text
ENAME             SAL
---------- ----------
MILLER           1300
KING             5000
CLARK            2450
```

- 이름이 겹치지 않으니 SAL 은 순서에 아무 영향이 없다.

## NULL 은 어디로 가나

Oracle 은 정렬할 때 **NULL 을 어떤 값보다 큰 값**처럼 다룬다. 30번 부서의 COMM 으로 확인한다(BLAKE·JAMES 가 NULL, TURNER 는 0).

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM, ENAME;
```

```text
ENAME            COMM
---------- ----------
TURNER              0
ALLEN             300
WARD              500
MARTIN           1400
BLAKE
JAMES
```

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC, ENAME;
```

```text
ENAME            COMM
---------- ----------
BLAKE
JAMES
MARTIN           1400
WARD              500
ALLEN             300
TURNER              0
```

- ASC: 가장 큰 값이 맨 뒤이므로 NULL 이 **맨 뒤**다.
- DESC: 가장 큰 값이 맨 앞이므로 NULL 이 **맨 앞**이다.
- 0 은 NULL 이 아니다. TURNER 는 오름차순의 맨 앞, 즉 가장 작은 값 자리에 있다.

### NULLS FIRST / NULLS LAST

Oracle 은 NULL 의 위치를 정렬 방향과 따로 정할 수 있다.

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM NULLS FIRST, ENAME;
```

```text
ENAME            COMM
---------- ----------
BLAKE
JAMES
TURNER              0
ALLEN             300
WARD              500
MARTIN           1400
```

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC NULLS LAST, ENAME;
```

```text
ENAME            COMM
---------- ----------
MARTIN           1400
WARD              500
ALLEN             300
TURNER              0
BLAKE
JAMES
```

| 정렬 | Oracle 기본 | 바꾸려면 |
|------|------------|---------|
| `ASC` | NULL 맨 뒤 | `ASC NULLS FIRST` |
| `DESC` | NULL 맨 앞 | `DESC NULLS LAST` |

- `NULLS FIRST`·`NULLS LAST`는 해당 키 바로 뒤에 쓴다. 정렬 방향(ASC·DESC)과 함께 쓸 수 있다.
- NVL 로 NULL 을 값으로 바꿔 정렬해도 위치를 옮길 수 있다. `ORDER BY NVL(COMM, -1) DESC`는 NULL 을 -1 로 보아 맨 뒤로 보낸다.

> ⚠️ **DBMS 차이**: SQL Server 는 NULL 을 **가장 작은 값**으로 본다. 그래서 ASC 에서 NULL 이 맨 앞, DESC 에서 맨 뒤로 Oracle 과 정반대다. 문제에 DBMS 가 명시돼 있으면 그 기준으로 판단한다.

## SELECT 에 없는 열로 정렬하기

일반 SELECT 는 SELECT 목록에 없는 열로도 정렬할 수 있다. ORDER BY 가 SELECT 뒤에 처리되더라도, 원래 행의 열 값은 아직 쓸 수 있기 때문이다.

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 ORDER BY SAL DESC;
```

```text
ENAME
----------
KING
CLARK
MILLER
```

- SAL 은 보이지 않지만 순서는 급여 내림차순(5000 → 2450 → 1300)이다.

### DISTINCT 가 있으면 안 된다

DISTINCT 는 SELECT 목록 기준으로 중복을 합친다. 합쳐진 한 행에는 원래 행이 여러 개 들어 있어 SAL 값을 하나로 정할 수 없다.

```sql
SELECT DISTINCT JOB FROM EMP ORDER BY SAL;
```

```text
SELECT DISTINCT JOB FROM EMP ORDER BY SAL
                                      *
ERROR at line 1:
ORA-01791: not a SELECTed expression
```

- CLERK 한 행 뒤에는 800·1100·950·1300 네 급여가 있다. 어느 값으로 정렬할지 정할 수 없다.
- DISTINCT 와 함께라면 SELECT 목록의 열로만 정렬한다: `SELECT DISTINCT JOB FROM EMP ORDER BY JOB`.

### GROUP BY 가 있으면 그룹 단위로

GROUP BY 쿼리의 ORDER BY 에는 SELECT 와 같은 규칙이 적용된다. GROUP BY 열이나 집계 함수만 쓸 수 있다.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO ORDER BY SAL;
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO ORDER BY SAL
                                                          *
ERROR at line 1:
ORA-00979: "SAL": must appear in the GROUP BY clause or be used in an aggregate function
```

집계 함수로 감싸면 SELECT 에 없어도 정렬 키가 된다.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO ORDER BY MAX(SAL) DESC;
```

```text
    DEPTNO        CNT
---------- ----------
        10          3
        20          5
        30          6
```

- 부서별 최고 급여 5000·3000·2850 순으로 정렬됐다. MAX(SAL)은 화면에 없다.

| 쿼리 형태 | SELECT 에 없는 열로 정렬 |
|----------|------------------------|
| 일반 SELECT | 가능 |
| `SELECT DISTINCT` | 불가 (ORA-01791) |
| GROUP BY | GROUP BY 열·집계 함수만 가능 (그 밖은 ORA-00979) |

> 내일은 두 테이블을 이어 붙이는 조인을 Oracle 표기로 다룬다.

## 📖 용어

- **ORDER BY** : 결과의 순서를 정하는 절. 논리적 실행 순서의 마지막이다.
- **ASC / DESC** : 오름차순 / 내림차순. 생략하면 ASC 다.
- **위치 번호 정렬** : `ORDER BY 2`처럼 SELECT 목록의 몇 번째 열인지로 정렬 키를 정하는 방법.
- **다중 정렬 키** : 앞 키가 같은 행끼리만 다음 키로 순서를 가르는 정렬.
- **NULLS FIRST / NULLS LAST** : NULL 을 맨 앞 / 맨 뒤에 두라고 지정하는 Oracle 정렬 옵션.
- **ORA-01791** : DISTINCT 쿼리에서 SELECT 목록에 없는 식으로 정렬했을 때의 오류.
- **ORA-01785** : ORDER BY 위치 번호가 SELECT 목록의 열 수를 넘을 때의 오류.

## 📝 연습 문제

**문제 1.** 30번 부서 사원의 COMM 은 0, 300, 500, 1400 과 NULL 2개다. 다음 SQL 을 Oracle 에서 실행했을 때 마지막 행의 COMM 값은?

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM;
```

A) 0  
B) 1400  
C) 300  
D) NULL  

**정답: D**  
해설: Oracle 은 정렬에서 NULL 을 가장 큰 값으로 다룬다. 오름차순에서는 큰 값이 뒤로 가므로 NULL 인 행이 맨 뒤에 온다. 0 은 NULL 이 아니라 가장 작은 값이라 맨 앞에 온다.

---

**문제 2.** 20번 부서의 급여는 SMITH 800, ADAMS 1100, JONES 2975, SCOTT 3000, FORD 3000 이다. 다음 SQL 결과의 두 번째 행 ENAME 은?

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC, ENAME;
```

A) FORD  
B) SCOTT  
C) JONES  
D) ADAMS  

**정답: B**  
해설: 첫 키 SAL 내림차순으로 3000 인 FORD·SCOTT 이 앞에 온다. 둘은 SAL 이 같아 둘째 키 ENAME 오름차순으로 가르므로 FORD, SCOTT 순이다. 두 번째 행은 SCOTT 이다.

---

**문제 3.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT DISTINCT JOB FROM EMP ORDER BY SAL;
```

A) 직무 5개가 급여 오름차순으로 나온다  
B) 직무 5개가 이름순으로 나온다  
C) ORA-01791 오류가 난다  
D) 14행이 나온다  

**정답: C**  
해설: DISTINCT 는 SELECT 목록 기준으로 중복 행을 합친다. 합쳐진 JOB 한 행에는 여러 사원의 SAL 이 섞여 있어 정렬 값을 하나로 정할 수 없다. 그래서 SELECT 목록에 없는 SAL 로 정렬하면 ORA-01791(not a SELECTed expression)이 난다.

---

**문제 4.** 다음 중 `SELECT ENAME, SAL FROM EMP` 뒤에 붙였을 때 오류가 나는 ORDER BY 는?

A) ORDER BY 3  
B) ORDER BY SAL * 12  
C) ORDER BY DEPTNO  
D) ORDER BY NVL(COMM, 0) DESC  

**정답: A**  
해설: 위치 번호는 SELECT 목록의 순서를 가리키므로 열이 2개인 목록에서 3은 없는 위치다. Oracle 은 ORA-01785 를 낸다. DISTINCT 나 GROUP BY 가 없는 일반 SELECT 라 SELECT 에 없는 DEPTNO 나 식으로 정렬하는 것은 가능하다.

---

**문제 5.** 30번 부서 사원의 COMM 은 MARTIN 1400, WARD 500, ALLEN 300, TURNER 0, BLAKE·JAMES 는 NULL 이다. 다음 SQL 결과의 첫 행 ENAME 은?

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC NULLS LAST;
```

A) BLAKE  
B) TURNER  
C) MARTIN  
D) JAMES  

**정답: C**  
해설: Oracle 의 내림차순은 원래 NULL 을 맨 앞에 두지만, `NULLS LAST`가 NULL 을 맨 뒤로 보낸다. 남은 값 중 가장 큰 1400 의 MARTIN 이 첫 행이 된다.
