# Day 4 - NULL 함수와 CASE·DECODE

## 📌 핵심 정리

- `NVL(a, b)` 는 a 가 NULL 이면 b, `NVL2(a, b, c)` 는 a 가 NULL 이 **아니면 b, NULL 이면 c** 다.
- `NULLIF(a, b)` 는 두 값이 같으면 NULL, 다르면 a 다. `COALESCE` 는 NULL 이 아닌 **첫 번째** 인자를 돌려준다.
- CASE 는 위에서부터 검사해 **처음 참인 WHEN** 하나만 쓴다. ELSE 를 빼면 해당 없는 행은 NULL 이다.
- `CASE 컬럼 WHEN NULL` 은 NULL 을 못 잡는다. `DECODE` 는 NULL 끼리를 같다고 본다.
- Oracle 은 빈 문자열 `''` 을 NULL 로 다룬다.

## NULL 을 다루는 함수

어제까지 NULL 이 산술을 NULL 로 만든다는 것을 봤다. 오늘의 함수들은 NULL 을 다른 값으로 바꾸거나, 반대로 값을 NULL 로 만든다.

| 함수 | 결과 | 예 → 결과 |
|------|------|------|
| `NVL(a, b)` | a 가 NULL 이면 b, 아니면 a | `NVL(NULL, 0)` → 0 |
| `NVL2(a, b, c)` | a 가 NULL 이 아니면 b, NULL 이면 c | `NVL2(300, 'Y', 'N')` → Y |
| `NULLIF(a, b)` | a = b 면 NULL, 아니면 a | `NULLIF(10, 10)` → NULL |
| `COALESCE(a, b, c, …)` | 처음으로 NULL 이 아닌 값 | `COALESCE(NULL, NULL, 3)` → 3 |
| `ISNULL(a, b)` | SQL Server 의 NVL | Oracle 에는 없다 |

### NVL — NULL 을 기본값으로

```sql
SELECT ENAME, COMM, NVL(COMM, 0) C0, SAL + COMM S1, SAL + NVL(COMM, 0) S2 FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME            COMM         C0         S1         S2
---------- ---------- ---------- ---------- ----------
ALLEN             300        300       1900       1900
WARD              500        500       1750       1750
MARTIN           1400       1400       2650       2650
BLAKE                          0                  2850
TURNER              0          0       1500       1500
JAMES                          0                   950
```

- BLAKE 와 JAMES 는 `SAL + COMM` 이 NULL 이지만 `SAL + NVL(COMM, 0)` 은 급여가 그대로 나온다.
- NULL 이 아닌 값(TURNER 의 0 포함)은 바뀌지 않는다.

두 인자의 타입은 맞아야 한다. 숫자 컬럼 COMM 의 대체값으로 문자를 주면 Oracle 이 `'NONE'` 을 숫자로 바꾸려다 실패한다.

```sql
SELECT ENAME, NVL(COMM, 'NONE') FROM EMP WHERE DEPTNO = 10;
```

```text
SELECT ENAME, NVL(COMM, 'NONE') FROM EMP WHERE DEPTNO = 10
                        *
ERROR at line 1:
ORA-01722: unable to convert string value containing 'N' to a number:
ORA-03302: (ORA-01722 details) invalid string value: NONE
```

- 문자로 보여 주려면 앞쪽을 먼저 문자로 바꾼다: `NVL(TO_CHAR(COMM), 'NONE')`.
- SQL Server 에서는 같은 일을 `ISNULL(COMM, 0)` 으로 한다. Oracle 에서 `ISNULL` 은 ORA-00904(invalid identifier) 오류다.

### NVL2 — 있을 때와 없을 때를 나눠서

```sql
SELECT ENAME, COMM, NVL2(COMM, '수당있음', '수당없음') FLAG, NVL2(COMM, SAL + COMM, SAL) PAY FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME            COMM FLAG                PAY
---------- ---------- ------------ ----------
ALLEN             300 수당있음           1900
WARD              500 수당있음           1750
MARTIN           1400 수당있음           2650
BLAKE                 수당없음           2850
TURNER              0 수당있음           1500
JAMES                 수당없음            950
```

- 두 번째 인자가 **NULL 이 아닐 때**, 세 번째가 NULL 일 때다. 순서를 반대로 기억하기 쉽다.
- TURNER 의 0 은 NULL 이 아니므로 `수당있음` 이다.

### NULLIF — 같으면 NULL

```sql
SELECT ENAME, SAL, NULLIF(SAL, 1250) N FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME             SAL          N
---------- ---------- ----------
ALLEN            1600       1600
WARD             1250
MARTIN           1250
BLAKE            2850       2850
TURNER           1500       1500
JAMES             950        950
```

- SAL 이 1250 인 WARD 와 MARTIN 만 NULL 이 됐다. 나머지는 첫 인자 SAL 이 그대로 나온다.
- `NULLIF(a, b)` 는 `CASE WHEN a = b THEN NULL ELSE a END` 와 같다. 0 으로 나누기를 막을 때 `x / NULLIF(y, 0)` 처럼 쓴다.

### COALESCE — 처음으로 값이 있는 것

```sql
SELECT ENAME, COMM, MGR, COALESCE(COMM, MGR, 0) C FROM EMP WHERE DEPTNO IN (10, 30);
```

```text
ENAME            COMM        MGR          C
---------- ---------- ---------- ----------
ALLEN             300       7698        300
WARD              500       7698        500
MARTIN           1400       7698       1400
BLAKE                       7839       7839
CLARK                       7839       7839
KING                                      0
TURNER              0       7698          0
JAMES                       7698       7698
MILLER                      7782       7782
```

- 왼쪽부터 보며 NULL 이 아닌 첫 값을 고른다. ALLEN 은 COMM, BLAKE 는 MGR, 둘 다 NULL 인 KING 은 0 이다.
- 인자가 두 개면 `NVL` 과 같다. 세 개 이상을 받을 수 있다는 점이 다르다. 모든 인자가 NULL 이면 결과도 NULL 이다.

### 집계 함수는 NULL 을 건너뛴다

4주차 내용이지만 NULL 함수와 짝을 이루므로 결과만 먼저 본다.

```sql
SELECT COUNT(COMM) A, COUNT(NVL(COMM, 0)) B, SUM(COMM) C, AVG(COMM) D, AVG(NVL(COMM, 0)) E FROM EMP;
```

```text
         A          B          C          D          E
---------- ---------- ---------- ---------- ----------
         4         14       2200        550 157.142857
```

- `AVG(COMM)` 은 COMM 이 있는 4명으로 나눈 값(2200 / 4)이다. 14명 전체 평균을 원하면 `NVL` 로 0 을 채워야 한다(2200 / 14).

## CASE — 조건에 따라 값 고르기

CASE 는 두 가지 모양이 있다.

| 모양 | 문법 | 비교 방식 |
|------|------|------|
| **simple CASE** | `CASE 식 WHEN 값 THEN 결과 … [ELSE 결과] END` | 식 = 값 (같은지만) |
| **searched CASE** | `CASE WHEN 조건 THEN 결과 … [ELSE 결과] END` | 조건을 자유롭게 (`>`, `BETWEEN`, `IS NULL` …) |

```sql
SELECT ENAME, DEPTNO, CASE DEPTNO WHEN 10 THEN 'ACCOUNTING' WHEN 20 THEN 'RESEARCH' ELSE 'ETC' END DNAME FROM EMP WHERE JOB = 'MANAGER';
```

```text
ENAME          DEPTNO DNAME
---------- ---------- ----------
JONES              20 RESEARCH
BLAKE              30 ETC
CLARK              10 ACCOUNTING
```

범위 조건은 searched CASE 로 쓴다.

```sql
SELECT ENAME, SAL, CASE WHEN SAL >= 3000 THEN 'HIGH' WHEN SAL >= 1500 THEN 'MID' ELSE 'LOW' END GRADE FROM EMP WHERE DEPTNO = 20;
```

```text
ENAME             SAL GRAD
---------- ---------- ----
SMITH             800 LOW
JONES            2975 MID
SCOTT            3000 HIGH
ADAMS            1100 LOW
FORD             3000 HIGH
```

> ⚠️ **WHEN 의 순서가 결과를 바꾼다.** CASE 는 처음 참이 된 WHEN 에서 멈춘다. 아래처럼 넓은 조건(`>= 1500`)을 먼저 쓰면 SAL 3000 도 거기서 걸려 `HIGH` 가 한 명도 안 나온다.

```sql
SELECT ENAME, SAL, CASE WHEN SAL >= 1500 THEN 'MID' WHEN SAL >= 3000 THEN 'HIGH' ELSE 'LOW' END GRADE FROM EMP WHERE DEPTNO = 20;
```

```text
ENAME             SAL GRAD
---------- ---------- ----
SMITH             800 LOW
JONES            2975 MID
SCOTT            3000 MID
ADAMS            1100 LOW
FORD             3000 MID
```

- `ELSE` 를 빼면, 어느 WHEN 에도 해당하지 않는 행은 **NULL** 이다.

```sql
SELECT ENAME, SAL, CASE WHEN SAL > 2000 THEN SAL * 1.1 END RAISE FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME             SAL      RAISE
---------- ---------- ----------
CLARK            2450       2695
KING             5000       5500
MILLER           1300
```

THEN 과 ELSE 의 결과는 타입이 같아야 한다. 첫 결과가 문자면 나머지도 문자여야 한다.

```sql
SELECT CASE 1 WHEN 1 THEN 'A' WHEN 2 THEN 2 END FROM DUAL;
```

```text
SELECT CASE 1 WHEN 1 THEN 'A' WHEN 2 THEN 2 END FROM DUAL
                                          *
ERROR at line 1:
ORA-00932: expression (2) is of data type NUMBER, which is incompatible with expected data type CHAR
```

## DECODE — Oracle 전용 simple CASE

`DECODE(식, 값1, 결과1, 값2, 결과2, …, 기본값)` 은 simple CASE 를 함수 하나로 쓴 것이다.

```sql
SELECT ENAME, DEPTNO, DECODE(DEPTNO, 10, 'ACCOUNTING', 20, 'RESEARCH', 'ETC') DNAME FROM EMP WHERE JOB = 'MANAGER';
```

```text
ENAME          DEPTNO DNAME
---------- ---------- ----------
JONES              20 RESEARCH
BLAKE              30 ETC
CLARK              10 ACCOUNTING
```

- 인자 수가 짝수로 끝나면(마지막에 기본값이 없으면) 해당 없는 행은 NULL 이다. 위에서 `'ETC'` 를 빼면 BLAKE 는 NULL 이 된다.
- 비교는 **같은지(=)** 만 한다. `SAL >= 3000` 같은 범위 조건은 DECODE 로 바로 못 쓰고 searched CASE 를 쓴다.
- DECODE 는 Oracle 함수다. SQL Server 에는 없고 CASE 를 쓴다.

### NULL 비교에서 CASE 와 DECODE 가 갈린다

```sql
SELECT ENAME, COMM, DECODE(COMM, NULL, 'NULL임', '값있음') D, CASE COMM WHEN NULL THEN 'NULL임' ELSE '값있음' END C FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME            COMM D         C
---------- ---------- --------- ---------
ALLEN             300 값있음    값있음
WARD              500 값있음    값있음
MARTIN           1400 값있음    값있음
BLAKE                 NULL임    값있음
TURNER              0 값있음    값있음
JAMES                 NULL임    값있음
```

- simple CASE 는 `COMM = NULL` 로 비교한다. NULL 과의 `=` 는 참이 되지 않으므로 BLAKE·JAMES 도 `값있음` 으로 빠진다.
- `DECODE` 는 NULL 과 NULL 을 같다고 본다. 그래서 NULL 을 제대로 골라낸다.
- CASE 로 NULL 을 잡으려면 searched CASE 로 `CASE WHEN COMM IS NULL THEN …` 이라고 쓴다.

> ⚠️ **Oracle 에서 `''` 는 NULL 이다.** 길이 0 인 문자열을 따로 두지 않는다. 그래서 `'' IS NULL` 은 참이고 `NVL('', 'EMPTY')` 는 `EMPTY` 다. SQL Server 는 `''` 와 NULL 을 다른 값으로 본다.

```sql
SELECT CASE WHEN '' IS NULL THEN 'NULL' ELSE 'NOT NULL' END E, NVL('', 'EMPTY') N FROM DUAL;
```

```text
E        N
-------- -----
NULL     EMPTY
```

| 비교 | Oracle | SQL Server |
|------|------|------|
| `''` 의 정체 | NULL | 길이 0 문자열 |
| NULL 대체 함수 | `NVL`, `COALESCE` | `ISNULL`, `COALESCE` |
| 조건 분기 | `CASE`, `DECODE` | `CASE` |

내일은 WHERE 절로 행을 골라내는 비교·논리 연산자와, NULL 이 낀 조건의 함정을 다룬다.

## 📖 용어

- **NVL** : 첫 인자가 NULL 이면 두 번째 인자로 바꿔 주는 Oracle 함수.
- **NVL2** : NULL 여부에 따라 두 값 중 하나를 고르는 함수. NULL 이 아니면 두 번째, NULL 이면 세 번째.
- **NULLIF** : 두 값이 같으면 NULL 을, 다르면 첫 값을 돌려주는 함수.
- **COALESCE** : 인자 중 NULL 이 아닌 첫 값을 돌려주는 표준 함수.
- **simple CASE** : 하나의 식을 여러 값과 같은지 비교하는 CASE 형식.
- **searched CASE** : WHEN 마다 조건식을 자유롭게 쓰는 CASE 형식.
- **DECODE** : simple CASE 와 같은 일을 하는 Oracle 전용 함수. NULL 끼리를 같다고 본다.

## 📝 연습 문제

**문제 1.** EMP 테이블에서 BLAKE 의 SAL 은 2850, COMM 은 NULL 이다. 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT NVL2(COMM, SAL + COMM, SAL) FROM EMP WHERE ENAME = 'BLAKE';
```

A) 2850  
B) NULL  
C) 0  
D) 오류가 발생한다  

**정답: A**  
해설: `NVL2(a, b, c)` 는 a 가 NULL 이 아니면 b, NULL 이면 c 를 돌려준다. BLAKE 의 COMM 은 NULL 이므로 세 번째 인자 SAL 인 2850 이 나온다. 두 번째 인자 `SAL + COMM` 은 쓰이지 않으므로 NULL 이 되지 않는다.

---

**문제 2.** 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT COALESCE(NULL, NULLIF(5, 5), 7, 9) FROM DUAL;
```

A) NULL  
B) 5  
C) 7  
D) 9  

**정답: C**  
해설: `NULLIF(5, 5)` 는 두 값이 같으므로 NULL 이다. 따라서 `COALESCE(NULL, NULL, 7, 9)` 가 되고, NULL 이 아닌 첫 인자인 7 이 결과다. `COALESCE` 는 첫 번째로 만난 값에서 멈추므로 9 까지 가지 않는다.

---

**문제 3.** SAL 이 3000 인 사원에 대해 다음 CASE 식의 결과로 알맞은 것은?

```sql
SELECT CASE WHEN SAL >= 1500 THEN 'MID' WHEN SAL >= 3000 THEN 'HIGH' ELSE 'LOW' END FROM EMP WHERE ENAME = 'SCOTT';
```

A) HIGH  
B) MID  
C) LOW  
D) NULL  

**정답: B**  
해설: CASE 는 위에서부터 검사해 처음 참이 된 WHEN 의 결과를 쓰고 멈춘다. 3000 은 첫 조건 `SAL >= 1500` 에서 이미 참이므로 `MID` 다. 두 번째 WHEN 까지 가지 않기 때문에 `HIGH` 가 되려면 조건 순서를 바꿔야 한다.

---

**문제 4.** Oracle 에서 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT NVL('', 'EMPTY') FROM DUAL;
```

A) 빈 문자열('')  
B) NULL  
C) 오류가 발생한다  
D) EMPTY  

**정답: D**  
해설: Oracle 은 길이 0 인 문자열 `''` 을 NULL 로 취급한다. 따라서 `NVL` 의 첫 인자가 NULL 이 되어 두 번째 인자 `'EMPTY'` 가 나온다. SQL Server 처럼 `''` 를 NULL 과 다른 값으로 보는 DBMS 와 결과가 다르다.

---

**문제 5.** DEPTNO 가 30 인 행에 대해 다음 식의 결과로 알맞은 것은?

```sql
SELECT DECODE(DEPTNO, 10, 'A', 20, 'B') FROM EMP WHERE ENAME = 'BLAKE';
```

A) 30  
B) B  
C) NULL  
D) 오류가 발생한다  

**정답: C**  
해설: `DECODE` 는 식이 어느 값과도 같지 않으면 마지막 기본값을 돌려준다. 기본값을 생략했으므로 결과는 NULL 이다. 식의 값(30)을 그대로 돌려주지 않으며, 기본값이 없어도 오류는 나지 않는다.
