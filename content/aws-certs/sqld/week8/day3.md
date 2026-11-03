# Day 3 - Oracle 과 SQL Server 차이

## 📌 핵심 정리

- 문자열 연결은 Oracle `||`, SQL Server `+` 다. Oracle `||` 는 NULL 을 건너뛰고, SQL Server `+` 는 NULL 을 만나면 NULL 이다.
- NULL 대체는 Oracle `NVL`, SQL Server `ISNULL` 이다. `COALESCE`·`NULLIF`·`CASE` 는 두 DB 모두 쓴다. `DECODE`·`NVL2` 는 Oracle 에만 있다.
- Oracle 은 `''` 를 NULL 로 보고, 오름차순 정렬에서 NULL 을 맨 뒤에 둔다. SQL Server 는 `''` 를 NULL 과 구분하고, 오름차순에서 NULL 이 맨 앞이다.
- Top N 은 Oracle `ROWNUM`·`FETCH FIRST`, SQL Server `TOP(n)` 이다. 외부 조인 `(+)`, 계층형 질의 `CONNECT BY`, 차집합 `MINUS` 는 Oracle 표기이고 SQL Server 는 ANSI 조인·재귀 CTE·`EXCEPT` 를 쓴다.
- Oracle 은 DML 뒤에 COMMIT 을 직접 하고 DDL 은 자동 커밋된다. SQL Server 는 기본이 AUTO COMMIT 이고, `BEGIN TRAN` 안에서는 DDL 도 ROLLBACK 된다.

## 보기에 다른 DB 문법이 섞일 때

이 트랙의 노트와 실습장은 Oracle 기준이지만, 시험 지문에는 "SQL Server 에서" 라고 적힌 문항도 있다. 이때 보기에는 두 DB 의 문법이 섞여 나온다. 같은 일을 하는 짝을 알고 있으면 "이 DB 에는 없는 함수" 를 고른 보기를 바로 지울 수 있다.

앞 주차에서 그때그때 한 줄씩 짚은 차이를 여기서 한곳에 모은다. 실습장은 Oracle 이므로 Oracle 쪽은 실행 결과를 붙이고, SQL Server 쪽은 문법만 적는다.

| 구분 | Oracle | SQL Server | 처음 나온 노트 |
|------|--------|-----------|------------|
| 문자열 연결 | `\|\|`, `CONCAT(a, b)` | `+`, `CONCAT(a, b, …)` | W3 Day 1·2 |
| NULL 대체 | `NVL`, `NVL2`, `COALESCE` | `ISNULL`, `COALESCE` | W3 Day 4 |
| 조건 분기 | `DECODE`, `CASE` | `CASE` | W3 Day 4 |
| 부분 문자열·길이 | `SUBSTR`, `LENGTH` | `SUBSTRING`, `LEN` | W3 Day 2 |
| 현재 일시 | `SYSDATE` | `GETDATE()` | W3 Day 3 |
| 형 변환 | `TO_CHAR`, `TO_NUMBER`, `TO_DATE`, `CAST` | `CONVERT`, `CAST` | W3 Day 3 |
| `''` | NULL | 길이 0 문자열 | W3 Day 4 |
| 오름차순의 NULL | 맨 뒤 | 맨 앞 | W4 Day 3 |
| 외부 조인 | `(+)`, ANSI `OUTER JOIN` | ANSI `OUTER JOIN` | W4 Day 4·5 |
| 차집합 | `MINUS` | `EXCEPT` | W5 Day 3 |
| Top N | `ROWNUM`, `FETCH FIRST` | `TOP(n)`, `TOP(n) WITH TIES` | W6 Day 3 |
| 계층 전개 | `START WITH … CONNECT BY` | 재귀 CTE (`WITH`) | W6 Day 4·5 |
| 기본 커밋 방식 | 명시적 COMMIT | AUTO COMMIT | W7 Day 4 |
| 열 정의 변경 | `ALTER TABLE … MODIFY` | `ALTER TABLE … ALTER COLUMN` | W7 Day 5 |
| 이름 변경 | `RENAME`, `ALTER TABLE … RENAME` | `sp_rename` | W7 Day 5 |
| 자동 번호 | `SEQUENCE` | `IDENTITY` | 이 노트 |

## 잇기와 NULL 바꾸기

Oracle 의 `||` 는 문자열 전용 연산자다. NULL 은 빈 문자열처럼 건너뛴다.

```sql
SELECT ENAME || ' / ' || JOB AS EJ, 'A' || NULL || 'B' AS AB FROM EMP WHERE EMPNO = 7839;
```

```text
EJ                     AB
---------------------- --
KING / PRESIDENT       AB
```

SQL Server 는 같은 일을 `+` 로 한다. `+` 는 덧셈과 연결을 함께 맡는다.

```text
SELECT ENAME + ' / ' + JOB FROM EMP WHERE EMPNO = 7839;   -- KING / PRESIDENT
SELECT 'A' + NULL + 'B';                                  -- NULL
SELECT CONCAT('A', NULL, 'B');                            -- AB (CONCAT 은 NULL 을 빈 문자열로 본다)
```

Oracle 에서 `+` 는 산술 연산자뿐이다. 문자열에 쓰면 숫자로 바꾸려다 실패한다.

```sql
SELECT ENAME + JOB FROM EMP WHERE EMPNO = 7839;
```

```text
SELECT ENAME + JOB FROM EMP WHERE EMPNO = 7839
       *
ERROR at line 1:
ORA-01722: unable to convert string value containing 'K' to a number: ENAME
ORA-03302: (ORA-01722 details) invalid string value: KING
```

- 23ai 이전 Oracle 은 같은 오류를 `ORA-01722: invalid number` 한 줄로 보여 준다. 오류 번호는 같다.
- Oracle 의 `CONCAT` 은 시험 기준으로 인자가 둘이다(W3 Day 2). SQL Server 의 `CONCAT` 은 인자를 여럿 받는다.

NULL 을 다른 값으로 바꾸는 함수는 이름이 갈린다. COALESCE 는 표준 함수라 두 DB 에서 같다.

```sql
SELECT EMPNO, ENAME, NVL(COMM, 0) AS NVL_COMM, COALESCE(COMM, MGR, 0) AS COAL FROM EMP WHERE EMPNO IN (7499, 7566, 7839) ORDER BY EMPNO;
```

```text
     EMPNO ENAME        NVL_COMM       COAL
---------- ---------- ---------- ----------
      7499 ALLEN             300        300
      7566 JONES               0       7839
      7839 KING                0          0
```

- JONES 는 COMM 이 NULL 이라 COALESCE 가 다음 인자 MGR(7839)을 골랐다. KING 은 COMM·MGR 이 모두 NULL 이라 마지막 0 이다.
- SQL Server 에서는 `ISNULL(COMM, 0)` 이 `NVL(COMM, 0)` 의 짝이다. Oracle 에 ISNULL 을 쓰면 없는 이름이라 ORA-00904 다.

```sql
SELECT ISNULL(COMM, 0) FROM EMP;
```

```text
SELECT ISNULL(COMM, 0) FROM EMP
       *
ERROR at line 1:
ORA-00904: "ISNULL": invalid identifier
```

## 이름만 다른 함수

하는 일은 같고 이름이나 인자 모양만 다른 함수들이다.

```sql
SELECT SUBSTR('DATABASE', 1, 4) AS SUB, LENGTH('DATABASE') AS LEN, TO_CHAR(DATE '2026-11-04', 'YYYY/MM/DD') AS CH, CAST('123' AS NUMBER) + 1 AS CA FROM DUAL;
```

```text
SUB         LEN CH                 CA
---- ---------- ---------- ----------
DATA          8 2026/11/04        124
```

SQL Server 로 옮기면 이렇다.

```text
SELECT SUBSTRING('DATABASE', 1, 4),                 -- DATA (SQL Server 2022 까지는 길이 인자를 생략할 수 없다)
       LEN('DATABASE'),                             -- 8
       CONVERT(VARCHAR(10), GETDATE(), 111),        -- 오늘 날짜를 yyyy/mm/dd 로
       CAST('123' AS INT) + 1;                      -- 124
```

| 하는 일 | Oracle | SQL Server |
|------|--------|-----------|
| 현재 날짜·시각 | `SYSDATE` | `GETDATE()` |
| 하루 뒤 | `SYSDATE + 1` | `DATEADD(DAY, 1, GETDATE())` |
| 날짜 → 문자 | `TO_CHAR(날짜, '형식')` | `CONVERT(VARCHAR, 날짜, 스타일번호)` |
| 올림 | `CEIL` | `CEILING` |
| 나머지 | `MOD(m, n)` | `m % n` |

- `CAST(값 AS 타입)` 은 표준 문법이라 두 DB 에 모두 있다. 타입 이름만 각 DB 의 것을 쓴다.
- SYSDATE 에는 괄호가 없고 GETDATE 에는 괄호가 있다. `SYSDATE()` 나 `GETDATE` 로 쓴 보기는 둘 다 틀린 형태다.

## '' 와 NULL, 그리고 정렬 위치

Oracle 은 길이 0 인 문자열을 따로 두지 않는다. `''` 를 쓰면 곧 NULL 이다.

```sql
SELECT CASE WHEN '' IS NULL THEN 'NULL' ELSE 'NOT NULL' END AS E, LENGTH('') AS L, NVL('', 'EMPTY') AS N FROM DUAL;
```

```text
E                 L N
-------- ---------- -----
NULL                EMPTY
```

- `LENGTH('')` 도 0 이 아니라 NULL 이다. SQL Server 에서는 `LEN('')` 이 0 이고 `'' IS NULL` 은 거짓이다.

정렬에서 NULL 의 자리도 반대다. Oracle 은 NULL 을 가장 큰 값처럼 다룬다.

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

- 오름차순에서 COMM 이 NULL 인 BLAKE·JAMES 가 맨 뒤에 왔다. 같은 문장을 SQL Server 에서 돌리면 두 사람이 맨 앞에 온다.
- DESC 로 바꾸면 둘 다 뒤집힌다. Oracle 은 NULL 이 맨 앞, SQL Server 는 맨 뒤다.
- Oracle 은 `NULLS FIRST`·`NULLS LAST` 로 위치를 직접 정할 수 있다(W4 Day 3).

> ⚠️ **문항에 적힌 DBMS 를 먼저 본다.** NULL 정렬 위치와 `''` 처리는 두 DB 가 정반대다. "SQL Server 에서" 라고 적혀 있으면 위 결과를 뒤집어 읽는다.

## 상위 N 행 자르기

Oracle 12c 부터는 ORDER BY 뒤에 행 제한 절을 붙인다. `WITH TIES` 를 주면 마지막 행과 값이 같은 행까지 남는다.

```sql
SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC FETCH FIRST 2 ROWS WITH TIES;
```

```text
ENAME             SAL
---------- ----------
KING             5000
SCOTT            3000
FORD             3000
```

- SCOTT 과 FORD 는 SAL 이 같아 둘 사이의 순서는 ORDER BY SAL 만으로 정해지지 않는다. 남는 행이 3행이라는 점만 확정이다.

SQL Server 는 SELECT 바로 뒤에 TOP 을 둔다. 결과는 위와 같은 3행이다.

```text
SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP ORDER BY SAL DESC;
```

- `TOP … WITH TIES` 는 ORDER BY 가 없으면 SQL Server 에서 오류다.
- Oracle 의 ROWNUM 은 정렬 전에 번호가 붙어, 정렬 후 자르려면 인라인 뷰가 필요하다(W6 Day 3). TOP 과 FETCH FIRST 에는 이 함정이 없다.

## 조인·집합·분기

외부 조인을 WHERE 절의 `(+)` 로 쓰는 것은 Oracle 만의 표기다. SQL Server 는 ANSI 조인만 받는다.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO(+) = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

```text
SELECT COUNT(*) FROM EMP E RIGHT OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;   -- SQL Server, 15
```

- ANSI 표기는 Oracle 에서도 그대로 돈다. 두 DB 에 공통으로 쓸 수 있는 쪽은 ANSI 다.

차집합 연산자는 Oracle `MINUS`, SQL Server `EXCEPT` 다.

```sql
SELECT DEPTNO FROM DEPT MINUS SELECT DEPTNO FROM EMP;
```

```text
    DEPTNO
----------
        40
```

- 실습장의 Oracle 23ai 는 `EXCEPT` 도 받는다(W5 Day 3). 시험에서는 Oracle 차집합을 MINUS 로 본다.

값에 따라 결과를 고르는 일은 Oracle 에서 DECODE 와 CASE 둘 다 된다. SQL Server 에는 DECODE 가 없어 CASE 만 쓴다.

```sql
SELECT ENAME, DEPTNO, DECODE(DEPTNO, 10, 'ACCT', 20, 'RSCH', 'ETC') AS DEC, CASE DEPTNO WHEN 10 THEN 'ACCT' WHEN 20 THEN 'RSCH' ELSE 'ETC' END AS CS FROM EMP WHERE EMPNO IN (7369, 7499, 7839) ORDER BY EMPNO;
```

```text
ENAME          DEPTNO DEC  CS
---------- ---------- ---- ----
SMITH              20 RSCH RSCH
ALLEN              30 ETC  ETC
KING               10 ACCT ACCT
```

## 계층형 질의와 재귀 CTE

`START WITH … CONNECT BY PRIOR` 는 Oracle 의 계층형 질의 문법이다. KING 아래 2단계까지 펼친다.

```sql
SELECT LEVEL, ENAME, MGR FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR AND LEVEL <= 2 ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL ENAME             MGR
---------- ---------- ----------
         1 KING
         2 BLAKE            7839
         2 CLARK            7839
         2 JONES            7839
```

SQL Server 에는 CONNECT BY 가 없다. 자기 자신을 참조하는 WITH 절(재귀 CTE)로 같은 트리를 만든다.

```text
WITH ORG (EMPNO, ENAME, MGR, LVL) AS (
  SELECT EMPNO, ENAME, MGR, 1 FROM EMP WHERE MGR IS NULL        -- 시작 행 (START WITH 역할)
  UNION ALL
  SELECT E.EMPNO, E.ENAME, E.MGR, O.LVL + 1
  FROM EMP E JOIN ORG O ON E.MGR = O.EMPNO                      -- 한 단계 아래 (CONNECT BY 역할)
)
SELECT LVL, ENAME, MGR FROM ORG WHERE LVL <= 2;
```

- 앞 SELECT 가 루트, UNION ALL 뒤 SELECT 가 "앞 단계의 부하" 를 찾는다. 더 찾을 행이 없으면 멈춘다.
- LEVEL 같은 의사 열은 없다. 깊이는 LVL 처럼 직접 열을 만들어 센다.
- Oracle 도 11g R2 부터 재귀 WITH 를 지원한다. SQLD 에서 Oracle 의 계층형 질의라고 하면 CONNECT BY 를 가리킨다.

## 트랜잭션과 DDL

W7 Day 4 의 비교를 다시 짚는다. 같은 UPDATE 한 문장이라도 끝난 뒤의 상태가 다르다.

| 상황 | Oracle | SQL Server (기본 설정) |
|------|--------|-------------------|
| UPDATE 한 문장 실행 후 | 트랜잭션이 열려 있다. COMMIT 전까지 미확정 | 문장이 끝나며 바로 확정 |
| 이어서 ROLLBACK | UPDATE 가 취소된다 | 되돌릴 것이 없다 |
| DML 뒤에 CREATE·ALTER·TRUNCATE | 앞의 DML 까지 자동 커밋 | 트랜잭션 안이면 함께 묶인다 |
| 트랜잭션 안의 DDL 을 ROLLBACK | 불가 | 가능 |

```text
BEGIN TRAN;
CREATE TABLE T_TEMP (ID INT);
TRUNCATE TABLE ORDERS;
ROLLBACK TRAN;          -- SQL Server: T_TEMP 는 사라지고 ORDERS 의 행은 돌아온다
```

- Oracle 에서 같은 흐름을 밟으면 CREATE 시점에 커밋이 일어나 ROLLBACK 으로 되돌릴 것이 남지 않는다.
- SQL Server 도 `SET IMPLICIT_TRANSACTIONS ON` 이면 Oracle 처럼 COMMIT 을 직접 해야 한다. 문항이 따로 말하지 않으면 기본값 AUTO COMMIT 으로 본다.

## 데이터 타입과 DDL 문법

| 용도 | Oracle | SQL Server |
|------|--------|-----------|
| 가변 길이 문자 | `VARCHAR2(n)` | `VARCHAR(n)` |
| 고정 길이 문자 | `CHAR(n)` | `CHAR(n)` |
| 정수 | `NUMBER(p)` | `INT` |
| 소수 | `NUMBER(p, s)` | `DECIMAL(p, s)`, `NUMERIC(p, s)` |
| 날짜와 시각 | `DATE` (초까지) | `DATETIME` |

- Oracle 에서 `VARCHAR` 로 선언해도 지금은 VARCHAR2 로 만들어진다. 시험에서 Oracle 가변 길이 문자형의 이름은 VARCHAR2 다.
- Oracle 의 DATE 는 날짜만이 아니라 시·분·초까지 담는다. SQL Server 에서 날짜만 담는 타입은 `DATE`, 시각까지 담는 타입은 `DATETIME` 이다.

열을 고치고 이름을 바꾸는 문장은 두 DB 가 크게 다르다. Oracle 은 `MODIFY` 괄호 안에 여러 열을 한 번에 적을 수 있다.

```sql
CREATE TABLE T8D3_EMP (EMPNO NUMBER(4), ENAME VARCHAR2(10), JOB VARCHAR2(9));
ALTER TABLE T8D3_EMP MODIFY (ENAME VARCHAR2(20), JOB VARCHAR2(20));
ALTER TABLE T8D3_EMP RENAME COLUMN JOB TO JOB_NAME;
RENAME T8D3_EMP TO T8D3_STAFF;
INSERT INTO T8D3_STAFF VALUES (1, 'HONG GILDONG JR', 'DATA ENGINEER LEAD');
SELECT * FROM T8D3_STAFF;
ROLLBACK;
DROP TABLE T8D3_STAFF PURGE;
```

```text
Table created.
Table altered.
Table altered.
Table renamed.
1 row created.
     EMPNO ENAME                JOB_NAME
---------- -------------------- --------------------
         1 HONG GILDONG JR      DATA ENGINEER LEAD
1 row selected.
Rollback complete.
Table dropped.
```

- 열 길이를 20 으로 늘려 두었기 때문에 15자 이름과 18자 직무가 들어갔다. 늘리기 전의 VARCHAR2(10)·VARCHAR2(9) 였다면 둘 다 너무 길다.
- 테이블 이름은 `RENAME 옛이름 TO 새이름` 외에 `ALTER TABLE 옛이름 RENAME TO 새이름` 으로도 바꾼다.

SQL Server 로 옮긴 같은 작업이다. `ALTER COLUMN` 은 한 문장에 열 하나만 고친다.

```text
ALTER TABLE T8D3_EMP ALTER COLUMN ENAME VARCHAR(20);
ALTER TABLE T8D3_EMP ALTER COLUMN JOB VARCHAR(20);
EXEC sp_rename 'T8D3_EMP.JOB', 'JOB_NAME', 'COLUMN';
EXEC sp_rename 'T8D3_EMP', 'T8D3_STAFF';
```

| 작업 | Oracle | SQL Server |
|------|--------|-----------|
| 열 타입·길이 변경 | `ALTER TABLE t MODIFY (열 타입, …)` | `ALTER TABLE t ALTER COLUMN 열 타입` |
| 여러 열 변경 | 한 문장의 괄호 안에 나열 | 열마다 한 문장 |
| 열 이름 변경 | `ALTER TABLE t RENAME COLUMN a TO b` | `sp_rename 't.a', 'b', 'COLUMN'` |
| 테이블 이름 변경 | `RENAME a TO b`, `ALTER TABLE a RENAME TO b` | `sp_rename 'a', 'b'` |

## 자동 번호: SEQUENCE 와 IDENTITY

주문 번호처럼 1, 2, 3 … 으로 늘어나는 키를 만들 때 Oracle 은 시퀀스 객체를 따로 만든다. 실습장은 시퀀스 생성을 지원하지 않아 문법만 본다.

```text
-- Oracle: 테이블과 별개인 시퀀스 객체
CREATE SEQUENCE ORD_SEQ START WITH 1 INCREMENT BY 1;
INSERT INTO ORDERS (ORDER_ID, ITEM) VALUES (ORD_SEQ.NEXTVAL, 'PEN');
SELECT ORD_SEQ.CURRVAL FROM DUAL;

-- SQL Server: 열 속성으로 붙는 IDENTITY
CREATE TABLE ORDERS (ORDER_ID INT IDENTITY(1, 1) PRIMARY KEY, ITEM VARCHAR(20));
INSERT INTO ORDERS (ITEM) VALUES ('PEN');     -- ORDER_ID 는 적지 않는다
```

- 시퀀스는 테이블과 독립된 객체라 여러 테이블이 하나를 나눠 쓸 수 있다. `NEXTVAL` 로 다음 값을 얻고 `CURRVAL` 로 방금 얻은 값을 본다.
- `IDENTITY(시작값, 증가값)` 은 그 열에 묶인 속성이다. INSERT 에서 그 열을 빼면 값이 자동으로 채워진다.
- 지금은 Oracle 12c 의 `GENERATED AS IDENTITY` 열, SQL Server 2012 의 `CREATE SEQUENCE` 처럼 서로의 방식을 모두 갖췄다. 두 DB 를 대비하는 문항에서는 Oracle 은 SEQUENCE, SQL Server 는 IDENTITY 로 짝짓는다.

> 내일은 1과목 데이터 모델링 전체를 헷갈리는 개념 짝 위주로 다시 묶는다.

## 📖 용어

- **ISNULL** : 첫 인자가 NULL 이면 두 번째 인자를 돌려주는 SQL Server 함수. Oracle 의 NVL 에 해당한다.
- **GETDATE()** : SQL Server 에서 현재 날짜와 시각을 돌려주는 함수. Oracle 의 SYSDATE 에 해당한다.
- **CONVERT** : 값을 다른 타입으로 바꾸는 SQL Server 함수. 날짜를 문자로 바꿀 때 스타일 번호로 형식을 고른다.
- **TOP(n)** : SQL Server 에서 SELECT 바로 뒤에 써서 결과를 n 행으로 자르는 키워드.
- **EXCEPT** : SQL Server 의 차집합 연산자. Oracle 의 MINUS 에 해당한다.
- **재귀 CTE** : 자기 자신을 참조하는 WITH 절. 시작 행과 다음 단계를 UNION ALL 로 이어 계층을 펼친다.
- **AUTO COMMIT** : 문장 하나가 끝날 때마다 자동으로 확정하는 방식. SQL Server 의 기본값이다.
- **sp_rename** : SQL Server 에서 테이블·열 이름을 바꾸는 시스템 저장 프로시저.
- **SEQUENCE** : 차례로 늘어나는 번호를 내주는 Oracle 의 독립 객체. NEXTVAL·CURRVAL 로 값을 얻는다.
- **IDENTITY** : SQL Server 에서 열에 붙여 INSERT 때 번호를 자동으로 채우는 속성.

## 📝 연습 문제

**문제 1.** Oracle 에서 `SELECT 'A' || NULL || 'B' AS R FROM DUAL;` 을 실행한 결과는?

A) AB  
B) NULL  
C) A  
D) ORA-01722 오류  

**정답: A**  
해설: Oracle 의 `||` 는 NULL 을 빈 문자열처럼 건너뛰므로 A 와 B 만 이어진 AB 가 나온다. NULL 은 SQL Server 에서 `'A' + NULL + 'B'` 로 이었을 때의 결과다. C 는 NULL 뒤를 버린다고 착각한 값이다. ORA-01722 는 문자열에 `+` 를 써서 숫자 변환에 실패했을 때 나는 오류다.

---

**문제 2.** Oracle 의 `SELECT ENAME, NVL(COMM, 0) FROM EMP;` 와 같은 결과를 내는 SQL Server 문장은?

A) `SELECT ENAME, NVL(COMM, 0) FROM EMP;`  
B) `SELECT ENAME, DECODE(COMM, NULL, 0, COMM) FROM EMP;`  
C) `SELECT ENAME, ISNULL(COMM, 0) FROM EMP;`  
D) `SELECT ENAME, NULLIF(COMM, 0) FROM EMP;`  

**정답: C**  
해설: SQL Server 에서 NVL 의 짝은 ISNULL 이다. A 의 NVL 과 B 의 DECODE 는 Oracle 함수라 SQL Server 에는 없다. D 의 NULLIF 는 두 값이 같으면 NULL 을 돌려주는 함수라, COMM 이 0 인 행을 오히려 NULL 로 만든다.

---

**문제 3.** COMM 에 NULL 이 섞인 EMP 에서 `SELECT ENAME, COMM FROM EMP ORDER BY COMM;` 을 실행한다. NULL 인 행의 위치에 대한 설명으로 옳은 것은?

A) Oracle 과 SQL Server 모두 NULL 인 행이 맨 앞에 온다  
B) Oracle 은 NULL 인 행이 맨 뒤에, SQL Server 는 맨 앞에 온다  
C) Oracle 은 NULL 인 행이 맨 앞에, SQL Server 는 맨 뒤에 온다  
D) 두 DB 모두 NULL 인 행을 정렬 결과에서 뺀다  

**정답: B**  
해설: Oracle 은 NULL 을 가장 큰 값처럼 다뤄 오름차순에서 맨 뒤에 두고, SQL Server 는 가장 작은 값처럼 다뤄 맨 앞에 둔다. A 는 SQL Server 의 동작을 Oracle 에도 붙였다. C 는 두 DB 를 뒤바꿨다. ORDER BY 는 행을 거르지 않으므로 D 도 틀리다.

---

**문제 4.** SQL Server 에서 EMP_T 테이블의 ENAME 열을 VARCHAR(30) 으로 늘리는 문장은?

A) `ALTER TABLE EMP_T MODIFY (ENAME VARCHAR(30));`  
B) `ALTER TABLE EMP_T MODIFY COLUMN ENAME VARCHAR(30);`  
C) `ALTER TABLE EMP_T ALTER (ENAME VARCHAR2(30));`  
D) `ALTER TABLE EMP_T ALTER COLUMN ENAME VARCHAR(30);`  

**정답: D**  
해설: SQL Server 는 열 정의를 `ALTER TABLE … ALTER COLUMN 열 타입` 으로 바꾼다. A 는 Oracle 의 MODIFY 문법이다. B 의 `MODIFY COLUMN` 은 SQL Server 문법이 아니다. C 는 COLUMN 키워드가 빠졌고 VARCHAR2 는 Oracle 의 타입 이름이다.

---

**문제 5.** Oracle 문법과, 같은 일을 하는 SQL Server 문법의 짝으로 옳지 않은 것은?

A) `FETCH FIRST n ROWS ONLY` — `TOP(n)`  
B) `DECODE` — `DECODE`  
C) `SEQUENCE` — `IDENTITY`  
D) `CONNECT BY` — 재귀 CTE  

**정답: B**  
해설: DECODE 는 Oracle 에만 있는 함수라 SQL Server 에서는 CASE 로 바꿔 써야 한다. A 의 TOP(n) 은 SQL Server 의 행 제한 방법이다. C 는 자동 번호를 만드는 두 DB 의 대표 방식이다. D 의 재귀 CTE 는 SQL Server 에서 계층을 펼치는 방법이다.

---
