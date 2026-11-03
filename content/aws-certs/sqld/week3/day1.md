# Day 1 - 관계형 DB 와 SELECT

## 📌 핵심 정리

- 관계형 DB 는 데이터를 **테이블(행 × 열)** 로 담고, 기본키(PK)·외래키(FK)로 테이블끼리 잇는다.
- SQL 은 DML·DDL·DCL·TCL 로 나뉜다. `SELECT` 는 보통 DML 로 분류하고, 따로 DQL 이라 부르기도 한다.
- 별칭은 `AS` 를 생략할 수 있고, 공백·대소문자·특수문자를 살리려면 **큰따옴표**로 감싼다.
- `DISTINCT` 는 SELECT 목록 **전체 조합**의 중복을 없앤다. NULL 도 하나의 값처럼 한 번만 남는다.
- NULL 이 낀 **산술 연산은 NULL** 이다. 단 Oracle 의 연결 연산자 `||` 는 NULL 을 빈 문자열처럼 건너뛴다.

## 관계형 데이터베이스의 뼈대

1과목에서 엔터티·속성·관계로 그린 모델이 실제 DB 에서는 테이블·컬럼·키가 된다.

| 모델링 용어 | DB 용어 | 다른 이름 | 예 (EMP 테이블) |
|------|------|------|------|
| 엔터티 | **테이블** | 릴레이션 | 사원 전체 |
| 인스턴스 | **행** | 로우, 튜플, 레코드 | 사원 한 명(SMITH) |
| 속성 | **열** | 컬럼, 필드 | 이름(ENAME), 급여(SAL) |
| 주식별자 | **기본키(PK)** | Primary Key | 사번(EMPNO) |
| 관계 | **외래키(FK)** | Foreign Key | 부서번호(DEPTNO) → DEPT |

- **기본키**는 행 하나를 유일하게 가리킨다. 값이 겹칠 수 없고 NULL 도 안 된다.
- **외래키**는 다른 테이블의 기본키를 참조한다. EMP.DEPTNO 에는 DEPT 에 있는 부서번호(또는 NULL)만 들어간다.
- 테이블 안에서 **행의 순서는 의미가 없다.** 정렬된 결과가 필요하면 `ORDER BY` 를 써야 한다(4주차).

이 노트의 예제는 전부 아래 세 테이블을 쓴다.

| 테이블 | 내용 | 행 수 | 주요 컬럼 |
|------|------|------:|------|
| EMP | 사원 | 14 | EMPNO, ENAME, JOB, MGR, HIREDATE, SAL, COMM, DEPTNO |
| DEPT | 부서 | 4 | DEPTNO, DNAME, LOC |
| SALGRADE | 급여 등급 | 5 | GRADE, LOSAL, HISAL |

- 예제 결과의 날짜는 **YYYY-MM-DD** 로 보인다. Oracle 의 기본 날짜 표시는 환경 설정(NLS)에 따라 달라서, 노트는 세션 설정을 이 형식으로 맞춰 두고 실행했다.

## SQL 문장의 종류

| 분류 | 뜻 | 명령어 |
|------|------|------|
| **DML** (Data Manipulation Language) | 데이터를 조회·변경 | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE` |
| **DDL** (Data Definition Language) | 구조(테이블 등)를 정의 | `CREATE`, `ALTER`, `DROP`, `RENAME`, `TRUNCATE` |
| **DCL** (Data Control Language) | 권한을 주고 뺏음 | `GRANT`, `REVOKE` |
| **TCL** (Transaction Control Language) | 트랜잭션을 확정·취소 | `COMMIT`, `ROLLBACK`, `SAVEPOINT` |

- `SELECT` 만 떼어 **DQL**(Data Query Language)이라 부르는 교재도 있다. 보기에 DQL 이 없으면 DML 로 본다.
- `TRUNCATE` 는 데이터를 지우지만 **DDL** 이다. `DELETE` 와 헷갈리기 쉬운 짝이다. 차이는 7주차에 다룬다.
- 이번 주는 `SELECT` 하나만 다룬다. 나머지 문장은 7주차의 몫이다.

## SELECT 의 기본 구조

```text
SELECT  [DISTINCT] 컬럼, 식, ...     ← 무엇을 보여 줄까
FROM    테이블                        ← 어디서 가져올까
```

- `SELECT` 와 `FROM` 은 필수다. 조건(`WHERE`), 정렬(`ORDER BY`)은 그다음에 붙는다.
- 키워드·테이블명·컬럼명은 **대소문자를 가리지 않는다.** `select ename from emp` 도 같다. 작은따옴표 안의 문자열 값은 가린다.
- 문장 끝의 `;` 는 SQL 도구에 "여기까지가 한 문장"이라고 알리는 표시다.

`*` 는 모든 컬럼을 테이블에 정의된 순서대로 가져온다.

```sql
SELECT * FROM DEPT;
```

```text
    DEPTNO DNAME          LOC
---------- -------------- -------------
        10 ACCOUNTING     NEW YORK
        20 RESEARCH       DALLAS
        30 SALES          CHICAGO
        40 OPERATIONS     BOSTON
```

필요한 컬럼만 쉼표로 나열할 수도 있다. 컬럼 자리에는 계산식도 올 수 있다.

```sql
SELECT ENAME, SAL, SAL * 12 AS ANNUAL FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME             SAL     ANNUAL
---------- ---------- ----------
CLARK            2450      29400
KING             5000      60000
MILLER           1300      15600
```

- `WHERE DEPTNO = 10` 은 10번 부서만 고르는 조건이다. 예제를 짧게 하려고 붙였고, 자세한 내용은 Day 5 에서 본다.
- 계산식은 테이블의 데이터를 바꾸지 않는다. 결과 화면에만 만들어지는 값이다.

## 별칭(alias)

계산식에 이름을 붙이지 않으면 식 자체가 컬럼 제목이 된다. 별칭으로 제목을 바꾼다.

| 쓰는 법 | 예 | 화면의 제목 |
|------|------|------|
| `AS` + 이름 | `SAL * 12 AS ANNUAL` | `ANNUAL` |
| `AS` 생략 | `SAL * 12 ANNUAL` | `ANNUAL` |
| 큰따옴표 | `SAL * 12 "연 봉"` | `연 봉` (적은 그대로) |
| 따옴표 없는 소문자 | `ENAME name` | `NAME` (대문자로 바뀜) |

```sql
SELECT ENAME AS "사원 이름", SAL "월급", SAL * 12 연봉 FROM EMP WHERE DEPTNO = 10;
```

```text
사원 이름        월급       연봉
---------- ---------- ----------
CLARK            2450      29400
KING             5000      60000
MILLER           1300      15600
```

공백이 든 별칭을 따옴표 없이 쓰면 오류가 난다. `사원` 까지를 별칭으로 읽고, 그 뒤에 `FROM` 이 와야 하는데 `이름` 이 나왔기 때문이다.

```sql
SELECT ENAME 사원 이름 FROM EMP WHERE DEPTNO = 10;
```

```text
SELECT ENAME 사원 이름 FROM EMP WHERE DEPTNO = 10
                  *
ERROR at line 1:
ORA-00923: FROM keyword not found where expected
```

- 큰따옴표가 필요한 경우: **공백**, **대소문자 유지**, **특수문자**, 예약어를 별칭으로 쓸 때.
- **작은따옴표**는 문자열 값이다. `SAL 'MONTHLY'` 처럼 별칭에 쓰면 오류다. 작은따옴표 = 값, 큰따옴표 = 이름으로 기억한다.

> ⚠️ **SELECT 에서 만든 별칭은 WHERE 에서 못 쓴다.** `WHERE` 가 `SELECT` 보다 먼저 처리되어, 그 시점에는 별칭이 아직 없다. 실행 순서는 4주차 Day 2 에서 정리한다.

```sql
SELECT EMPNO, ENAME, SAL AS 급여 FROM EMP WHERE 급여 > 3000;
```

```text
SELECT EMPNO, ENAME, SAL AS 급여 FROM EMP WHERE 급여 > 3000
                                                *
ERROR at line 1:
ORA-00904: "급여": invalid identifier
```

## DISTINCT — 중복 행 없애기

`DISTINCT` 는 `SELECT` 바로 뒤에 한 번 쓴다. 14명의 직무를 중복 없이 보면 다섯 가지다.

```sql
SELECT DISTINCT JOB FROM EMP ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
SALESMAN
```

- `ORDER BY` 는 결과 순서를 고정하려고 붙였다. 없으면 `DISTINCT` 결과의 순서는 정해져 있지 않다.

컬럼을 둘 이상 쓰면 **조합 전체**가 같을 때만 하나로 합친다. `DISTINCT` 가 첫 컬럼에만 걸리는 것이 아니다.

```sql
SELECT DISTINCT DEPTNO, JOB FROM EMP ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB
---------- ---------
        10 CLERK
        10 MANAGER
        10 PRESIDENT
        20 ANALYST
        20 CLERK
        20 MANAGER
        30 CLERK
        30 MANAGER
        30 SALESMAN
```

- 14행이 9행이 됐다. 20번 부서의 CLERK(SMITH, ADAMS)와 30번 부서의 SALESMAN 네 명이 각각 한 행으로 줄었다.
- `SELECT DEPTNO, DISTINCT JOB` 처럼 중간에 쓰는 문법은 없다.

NULL 은 값이 없다는 표시지만, `DISTINCT` 는 NULL 끼리를 같은 것으로 보고 한 행만 남긴다.

```sql
SELECT DISTINCT COMM FROM EMP ORDER BY COMM DESC;
```

```text
      COMM
----------

      1400
       500
       300
         0
```

- COMM 이 NULL 인 사원은 10명이지만 결과에는 맨 위 빈 칸 한 줄로만 나온다. Oracle 의 내림차순 정렬은 NULL 을 맨 앞에 둔다.
- 0 과 NULL 은 다른 값이다. TURNER 의 COMM 0 은 따로 한 줄을 차지한다.

## 산술 연산

| 연산자 | 뜻 | 우선순위 |
|------|------|------|
| `*`, `/` | 곱하기, 나누기 | 먼저 |
| `+`, `-` | 더하기, 빼기 | 나중 |
| `( )` | 괄호 안을 먼저 | 가장 먼저 |

```sql
SELECT ENAME, SAL + 100 * 2, (SAL + 100) * 2 FROM EMP WHERE EMPNO = 7369;
```

```text
ENAME       SAL+100*2 (SAL+100)*2
---------- ---------- -----------
SMITH            1000        1800
```

- `SAL + 100 * 2` 는 `800 + 200`, `(SAL + 100) * 2` 는 `900 × 2` 다.
- Oracle 은 정수끼리 나눠도 소수점까지 계산한다. `10 / 4` 는 2 가 아니라 2.5 다.

## DUAL 과 연결 연산자 ||

테이블과 상관없는 계산을 할 때도 Oracle 은 전통적으로 `FROM` 을 요구한다. 그때 쓰는 것이 **DUAL** 이다.

- DUAL 은 컬럼 `DUMMY` 하나에 값 `'X'` 한 행만 든 테이블이다. 결과가 정확히 한 행 나오게 하려고 쓴다.
- 실습장의 Oracle 23ai 는 `SELECT 1 + 2;` 처럼 `FROM` 을 빼도 실행된다. 23ai 이전 버전에서는 오류이므로, 시험 문제는 `FROM DUAL` 을 붙인 형태로 본다.
- SQL Server 는 원래 `FROM` 없이 `SELECT 1 + 2` 를 쓴다.

`||` 는 값을 이어 붙여 한 문자열로 만든다. 숫자나 날짜도 문자로 바뀌어 붙는다.

```sql
SELECT ENAME || '의 직무는 ' || JOB || '이다' AS INTRO FROM EMP WHERE DEPTNO = 10;
```

```text
INTRO
---------------------------------------
CLARK의 직무는 MANAGER이다
KING의 직무는 PRESIDENT이다
MILLER의 직무는 CLERK이다
```

- SQL Server 는 `||` 대신 `+` 로 문자열을 잇는다. 두 DB 공통으로는 `CONCAT` 함수가 있다(Day 2).

## NULL 이 끼면 계산 결과도 NULL

NULL 은 0 도 빈칸도 아닌 **"모르는 값"** 이다. 모르는 값에 무엇을 더해도 결과는 모른다.

```sql
SELECT ENAME, SAL, COMM, SAL + COMM, SAL * 12 + COMM AS ANNUAL FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME             SAL       COMM   SAL+COMM     ANNUAL
---------- ---------- ---------- ---------- ----------
ALLEN            1600        300       1900      19500
WARD             1250        500       1750      15500
MARTIN           1250       1400       2650      16400
BLAKE            2850
TURNER           1500          0       1500      18000
JAMES             950
```

- BLAKE 와 JAMES 는 COMM 이 NULL 이라 `SAL + COMM` 과 연봉이 모두 NULL(빈 칸)이 됐다. SAL 값이 있어도 소용없다.
- TURNER 는 COMM 이 0 이라 정상 계산된다. 0 은 값이다.
- NULL 을 0 으로 바꿔 계산하려면 `NVL(COMM, 0)` 을 쓴다(Day 4).

> ⚠️ **Oracle 의 `||` 는 예외다.** 산술과 달리 NULL 을 빈 문자열처럼 건너뛴다. `'A' || NULL || 'B'` 는 NULL 이 아니라 `'AB'` 다. 표준 SQL 과 SQL Server 의 `+` 연결은 NULL 을 돌려준다.

```sql
SELECT ENAME || NULL || JOB FROM EMP WHERE EMPNO = 7839;
```

```text
ENAME||NULL||JOB
-------------------
KINGPRESIDENT
```

내일은 문자열을 자르고 붙이는 문자 함수와, 반올림·버림을 하는 숫자 함수를 다룬다.

## 📖 용어

- **테이블** : 행과 열로 이루어진 데이터 묶음. 모델의 엔터티가 DB 에 만들어진 모습이다.
- **기본키(PK)** : 행 하나를 유일하게 가리키는 열. 중복과 NULL 이 안 된다.
- **외래키(FK)** : 다른 테이블의 기본키를 가리키는 열. 테이블끼리 잇는 연결 고리다.
- **DML·DDL·DCL·TCL** : 데이터 조작, 구조 정의, 권한 제어, 트랜잭션 제어 문장의 분류.
- **별칭(alias)** : 결과 컬럼에 붙이는 이름. `AS` 는 생략할 수 있다.
- **DISTINCT** : SELECT 결과에서 완전히 같은 행을 하나만 남기는 키워드.
- **DUAL** : 한 행·한 열짜리 Oracle 기본 테이블. 테이블 없이 계산할 때 쓴다.
- **NULL** : 값이 없거나 모른다는 표시. 0 이나 공백 문자와 다르다.

## 📝 연습 문제

**문제 1.** 다음 중 TCL(Transaction Control Language)에 해당하는 명령어는?

A) GRANT  
B) COMMIT  
C) ALTER  
D) MERGE  

**정답: B**  
해설: TCL 은 트랜잭션을 확정하거나 취소하는 `COMMIT`, `ROLLBACK`, `SAVEPOINT` 다. `GRANT` 는 권한을 주는 DCL, `ALTER` 는 구조를 바꾸는 DDL, `MERGE` 는 데이터를 넣거나 고치는 DML 이다.

---

**문제 2.** EMP 테이블에서 BLAKE 의 SAL 은 2850, COMM 은 NULL 이다. 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT SAL * 12 + COMM FROM EMP WHERE ENAME = 'BLAKE';
```

A) 34200  
B) 0  
C) 오류가 발생한다  
D) NULL  

**정답: D**  
해설: NULL 이 포함된 산술 연산의 결과는 NULL 이다. `2850 * 12` 는 34200 이지만, 여기에 NULL 을 더하는 순간 전체가 NULL 이 된다. 34200 을 얻으려면 `SAL * 12 + NVL(COMM, 0)` 처럼 NULL 을 먼저 0 으로 바꿔야 한다.

---

**문제 3.** 다음 중 Oracle 에서 실행하면 오류가 발생하는 SQL 은?

A) `SELECT ENAME 사원 이름 FROM EMP;`  
B) `SELECT ENAME AS "사원 이름" FROM EMP;`  
C) `SELECT ENAME 이름 FROM EMP;`  
D) `SELECT ENAME AS NAME FROM EMP;`  

**정답: A**  
해설: 별칭에 공백이 있으면 큰따옴표로 감싸야 한다. A 는 `사원` 까지를 별칭으로 읽은 뒤 `FROM` 대신 `이름` 이 나와 ORA-00923 오류가 난다. B 는 큰따옴표로 감쌌고, C 와 D 는 공백 없는 별칭이라 정상 실행된다.

---

**문제 4.** EMP 테이블(사원 14명)에 대해 다음 SQL 을 실행했을 때 결과 행의 수는? (부서별 직무: 10번 CLERK·MANAGER·PRESIDENT, 20번 ANALYST·CLERK·MANAGER, 30번 CLERK·MANAGER·SALESMAN)

```sql
SELECT DISTINCT DEPTNO, JOB FROM EMP;
```

A) 3  
B) 5  
C) 9  
D) 14  

**정답: C**  
해설: `DISTINCT` 는 SELECT 목록 전체 조합의 중복을 없앤다. 부서마다 직무가 세 가지씩이므로 (부서, 직무) 조합은 9개다. 3 은 DEPTNO 만, 5 는 JOB 만 DISTINCT 했을 때의 행 수다.

---

**문제 5.** Oracle 에서 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT 'A' || NULL || 'B' FROM DUAL;
```

A) NULL  
B) AB  
C) A B  
D) 오류가 발생한다  

**정답: B**  
해설: Oracle 의 연결 연산자 `||` 는 NULL 을 빈 문자열처럼 취급한다. 그래서 결과는 `'AB'` 다. 산술 연산(`+`, `*` 등)은 NULL 이 끼면 결과가 NULL 이 되지만 `||` 는 그렇지 않다. 공백은 따로 넣지 않았으므로 `A B` 도 아니다.
