# Day 3 - 데이터 조작어 DML (INSERT·UPDATE·DELETE·MERGE)

## 📌 핵심 정리

- DML 은 행을 바꾸는 문장이다. `INSERT`(넣기), `UPDATE`(고치기), `DELETE`(지우기), `MERGE`(있으면 고치고 없으면 넣기)가 있다.
- INSERT 에서 열 목록을 생략하면 **모든 열을 테이블 정의 순서대로** 채워야 한다. 값이 모자라면 ORA-00947, 남으면 ORA-00913 이다.
- 열 목록에서 빠진 열에는 DEFAULT 값이, DEFAULT 가 없으면 NULL 이 들어간다. `VALUES (…, DEFAULT)` 로 기본값을 직접 고를 수도 있다.
- `DELETE` 는 DML 이라 ROLLBACK 할 수 있다. `TRUNCATE` 는 DDL 이라 되돌릴 수 없고 구조는 남긴다. `DROP` 은 구조까지 없앤다.
- `MERGE INTO 대상 USING 원본 ON (조건)` 은 조건이 맞는 행을 `WHEN MATCHED THEN UPDATE`, 맞지 않는 행을 `WHEN NOT MATCHED THEN INSERT` 로 처리한다.

## 실습 전에 — 복사본에서 바꾼다

DML 예제는 원본 EMP·DEPT 를 바꾸지 않는다. 블록마다 `CREATE TABLE … AS SELECT` 로 복사본을 만들고, 끝에서 `DROP TABLE … PURGE` 로 지운다.

- 그래서 블록마다 첫 줄은 `Table created.`, 마지막 줄은 `Table dropped.` 이다.
- 출력은 SQL*Plus 의 피드백을 켜고(`SET FEEDBACK ON`) 받았다. `1 row created.`, `3 rows updated.` 처럼 처리한 행 수가 찍힌다. 문장 사이 빈 줄은 생략했다.
- 복사 문법(CTAS)과 PURGE 는 Day 5 에서 다룬다.

## INSERT — 행 넣기

```text
INSERT INTO 테이블 [(열1, 열2, …)] VALUES (값1, 값2, …);
INSERT INTO 테이블 [(열1, 열2, …)] SELECT …;
```

```sql
CREATE TABLE T_DEPT AS SELECT * FROM DEPT;
INSERT INTO T_DEPT (DEPTNO, DNAME, LOC) VALUES (50, 'EDUCATION', 'SEOUL');
INSERT INTO T_DEPT VALUES (60, 'IT', NULL);
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (70, 'HR');
SELECT * FROM T_DEPT ORDER BY DEPTNO;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
1 row created.
1 row created.
1 row created.
    DEPTNO DNAME          LOC
---------- -------------- -------------
        10 ACCOUNTING     NEW YORK
        20 RESEARCH       DALLAS
        30 SALES          CHICAGO
        40 OPERATIONS     BOSTON
        50 EDUCATION      SEOUL
        60 IT
        70 HR
7 rows selected.
Table dropped.
```

| 쓰는 법 | 규칙 |
|--------|-----|
| 열 목록을 쓴다 (50) | 적은 열의 순서대로 값을 준다. 테이블 정의 순서와 달라도 된다 |
| 열 목록을 생략한다 (60) | 모든 열에 정의 순서대로 값을 준다. 비울 열은 `NULL` 을 직접 적는다 |
| 일부 열만 적는다 (70) | 빠진 LOC 에는 DEFAULT 값, 없으면 NULL 이 들어간다 |

- 문자와 날짜 값은 작은따옴표로 감싼다. 숫자는 감싸지 않는다.
- 빠진 열에 NOT NULL 제약이 있고 DEFAULT 가 없으면 ORA-01400(cannot insert NULL) 오류가 난다.

### 값의 개수와 DEFAULT

열에 DEFAULT 를 정해 두면 값을 주지 않은 INSERT 에 그 값이 들어간다.

```sql
CREATE TABLE T_DEPT (DEPTNO NUMBER(2), DNAME VARCHAR2(14), LOC VARCHAR2(13) DEFAULT 'SEOUL');
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (50, 'EDUCATION');
INSERT INTO T_DEPT VALUES (60, 'IT', DEFAULT);
INSERT INTO T_DEPT VALUES (70, 'HR', NULL);
INSERT INTO T_DEPT VALUES (80, 'SUPPORT');
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (90, 'SALES', 'BUSAN');
SELECT * FROM T_DEPT ORDER BY DEPTNO;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
1 row created.
1 row created.
1 row created.
INSERT INTO T_DEPT VALUES (80, 'SUPPORT')
            *
ERROR at line 1:
ORA-00947: not enough values
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (90, 'SALES', 'BUSAN')
            *
ERROR at line 1:
ORA-00913: too many values
    DEPTNO DNAME          LOC
---------- -------------- -------------
        50 EDUCATION      SEOUL
        60 IT             SEOUL
        70 HR
3 rows selected.
Table dropped.
```

- 50 은 LOC 를 빼서, 60 은 `DEFAULT` 키워드로 기본값 SEOUL 을 받았다.
- 70 은 NULL 을 **직접** 넣었다. 값을 명시하면 DEFAULT 는 쓰이지 않는다.
- 80 은 열 목록 없이 값 둘만 줘서 ORA-00947(not enough values), 90 은 열 둘에 값 셋을 줘서 ORA-00913(too many values)이다. 오류 난 행은 들어가지 않았다.

### INSERT … SELECT

VALUES 대신 SELECT 를 쓰면 조회 결과 전체가 한 번에 들어간다. VALUES 와 괄호를 쓰지 않는다.

```sql
CREATE TABLE EMP_T AS SELECT EMPNO, ENAME, SAL FROM EMP WHERE 1 = 2;
INSERT INTO EMP_T SELECT EMPNO, ENAME, SAL FROM EMP WHERE DEPTNO = 10;
INSERT INTO EMP_T (EMPNO, ENAME) SELECT EMPNO, ENAME FROM EMP WHERE JOB = 'ANALYST';
SELECT * FROM EMP_T ORDER BY EMPNO;
DROP TABLE EMP_T PURGE;
```

```text
Table created.
3 rows created.
2 rows created.
     EMPNO ENAME             SAL
---------- ---------- ----------
      7782 CLARK            2450
      7788 SCOTT
      7839 KING             5000
      7902 FORD
      7934 MILLER           1300
5 rows selected.
Table dropped.
```

- `WHERE 1 = 2` 는 항상 거짓이라 구조만 복사하고 행은 0개인 빈 테이블을 만든다.
- 한 문장으로 10번 부서 3행이 들어갔다. 피드백도 `3 rows created.` 다.
- SELECT 의 열 수와 순서는 INSERT 대상 열과 맞아야 한다. 두 번째 INSERT 는 SAL 을 빼서 SCOTT·FORD 의 SAL 이 NULL 이다.

## UPDATE — 값 고치기

```text
UPDATE 테이블 SET 열1 = 값1 [, 열2 = 값2 …] [WHERE 조건];
```

```sql
CREATE TABLE EMP_T AS SELECT * FROM EMP;
UPDATE EMP_T SET SAL = SAL * 1.1, COMM = 100 WHERE DEPTNO = 10;
UPDATE EMP_T SET SAL = (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 20) WHERE ENAME = 'SMITH';
UPDATE EMP_T SET (JOB, SAL) = (SELECT JOB, SAL FROM EMP WHERE ENAME = 'SCOTT') WHERE ENAME = 'ADAMS';
UPDATE EMP_T SET COMM = 0 WHERE ENAME = 'NOBODY';
SELECT ENAME, JOB, SAL, COMM FROM EMP_T WHERE DEPTNO IN (10, 20) ORDER BY DEPTNO, ENAME;
UPDATE EMP_T SET COMM = NULL;
DROP TABLE EMP_T PURGE;
```

```text
Table created.
3 rows updated.
1 row updated.
1 row updated.
0 rows updated.
ENAME      JOB              SAL       COMM
---------- --------- ---------- ----------
CLARK      MANAGER         2695        100
KING       PRESIDENT       5500        100
MILLER     CLERK           1430        100
ADAMS      ANALYST         3000
FORD       ANALYST         3000
JONES      MANAGER         2975
SCOTT      ANALYST         3000
SMITH      CLERK           3000
8 rows selected.
14 rows updated.
Table dropped.
```

- 여러 열은 SET 뒤에 쉼표로 잇는다. `SAL = SAL * 1.1` 의 오른쪽 SAL 은 바꾸기 **전** 값이다.
- 스칼라 서브쿼리로 값을 정할 수 있다. SMITH 의 급여가 20번 부서 최고 급여 3000 이 됐다.
- `SET (JOB, SAL) = (SELECT JOB, SAL …)` 처럼 괄호로 묶으면 서브쿼리 한 번으로 여러 열을 바꾼다.
- 맞는 행이 없으면 오류가 아니라 `0 rows updated.` 다.
- WHERE 를 빼면 모든 행이 바뀐다. 마지막 UPDATE 는 14행 전부의 COMM 을 NULL 로 만들었다.

## DELETE · TRUNCATE · DROP

`DELETE FROM 테이블 [WHERE 조건];` 은 조건에 맞는 행을 지운다. Oracle 에서는 `FROM` 을 생략해도 된다.

```sql
CREATE TABLE EMP_T AS SELECT * FROM EMP;
DELETE FROM EMP_T WHERE DEPTNO = 30;
SELECT COUNT(*) FROM EMP_T;
ROLLBACK;
SELECT COUNT(*) FROM EMP_T;
DELETE EMP_T;
TRUNCATE TABLE EMP_T;
ROLLBACK;
SELECT COUNT(*) FROM EMP_T;
DROP TABLE EMP_T PURGE;
SELECT COUNT(*) FROM EMP_T;
```

```text
Table created.
6 rows deleted.
  COUNT(*)
----------
         8
1 row selected.
Rollback complete.
  COUNT(*)
----------
        14
1 row selected.
14 rows deleted.
Table truncated.
Rollback complete.
  COUNT(*)
----------
         0
1 row selected.
Table dropped.
SELECT COUNT(*) FROM EMP_T
                     *
ERROR at line 1:
ORA-00942: table or view "SCOTT"."EMP_T" does not exist
```

- DELETE 로 지운 6행은 ROLLBACK 으로 돌아왔다. 아직 COMMIT 하지 않은 변경이기 때문이다.
- TRUNCATE 는 DDL 이다. 실행하는 순간 앞의 `DELETE EMP_T` 까지 함께 확정되어 ROLLBACK 해도 0행이다.
- DROP 뒤에는 테이블 자체가 없어 ORA-00942 다. 오류 문구의 `"SCOTT"."EMP_T"` 표기는 23ai 형식이고, 이전 버전은 `table or view does not exist` 만 보여 준다.

| 구분 | DELETE | TRUNCATE | DROP |
|------|--------|----------|------|
| 종류 | DML | DDL | DDL |
| 지우는 것 | 조건에 맞는 행 (WHERE 가능) | 모든 행 (WHERE 불가) | 행 + 테이블 구조 |
| ROLLBACK | 가능 (COMMIT 전) | 불가 (자동 커밋) | 불가 (자동 커밋) |
| 테이블 구조 | 남는다 | 남는다 | 없어진다 |
| 저장 공간 | 그대로 둔다 | 처음 크기로 돌려준다 | 돌려준다 |
| 속도 | 행마다 기록을 남겨 느리다 | 빠르다 | 빠르다 |

- SQL Server 에서는 `BEGIN TRAN` 안에서 실행한 TRUNCATE 를 ROLLBACK 으로 되돌릴 수 있다. 위 표의 "불가"는 Oracle 기준이다.

> ⚠️ **함정**: "모든 행을 지우되 되돌릴 수 있어야 한다"면 TRUNCATE 가 아니라 WHERE 없는 DELETE 다. "구조는 남기고 빠르게 비운다"면 TRUNCATE, "테이블이 필요 없다"면 DROP 이다.

## MERGE — 있으면 고치고 없으면 넣기

원본 데이터를 대상 테이블에 반영할 때, 이미 있는 행은 UPDATE, 없는 행은 INSERT 해야 할 때가 있다. 두 문장을 나눠 쓰는 대신 MERGE 한 문장으로 처리한다.

```text
MERGE INTO 대상 테이블 별칭
USING 원본(테이블·뷰·서브쿼리) 별칭
ON (대상과 원본을 잇는 조건)
WHEN MATCHED THEN
  UPDATE SET 열 = 값 [, …]
WHEN NOT MATCHED THEN
  INSERT (열, …) VALUES (값, …);
```

T_BONUS 에는 10번 부서 CLARK·KING·MILLER 가 보너스 0 으로 있다. MANAGER·PRESIDENT 4명(JONES·BLAKE·CLARK·KING)을 원본으로 MERGE 한다.

```sql
CREATE TABLE T_BONUS AS SELECT EMPNO, ENAME, SAL AS BONUS FROM EMP WHERE DEPTNO = 10;
UPDATE T_BONUS SET BONUS = 0;
MERGE INTO T_BONUS B USING (SELECT EMPNO, ENAME, SAL FROM EMP WHERE JOB IN ('MANAGER', 'PRESIDENT')) E ON (B.EMPNO = E.EMPNO) WHEN MATCHED THEN UPDATE SET B.BONUS = E.SAL * 0.1 WHEN NOT MATCHED THEN INSERT (EMPNO, ENAME, BONUS) VALUES (E.EMPNO, E.ENAME, E.SAL * 0.05);
SELECT * FROM T_BONUS ORDER BY EMPNO;
DROP TABLE T_BONUS PURGE;
```

```text
Table created.
3 rows updated.
4 rows merged.
     EMPNO ENAME           BONUS
---------- ---------- ----------
      7566 JONES          148.75
      7698 BLAKE           142.5
      7782 CLARK             245
      7839 KING              500
      7934 MILLER              0
5 rows selected.
Table dropped.
```

| 원본 행 | ON 결과 | 처리 | 보너스 |
|--------|--------|-----|------|
| CLARK, KING | 대상에 있다 (MATCHED) | UPDATE | 급여의 10% |
| JONES, BLAKE | 대상에 없다 (NOT MATCHED) | INSERT | 급여의 5% |
| (원본에 없는 MILLER) | 원본에 없다 | 손대지 않는다 | 0 그대로 |

- 피드백 `4 rows merged.` 는 UPDATE 2행과 INSERT 2행을 합친 수다.
- MERGE 는 원본 기준으로 돈다. 대상에만 있는 MILLER 는 지워지지도 바뀌지도 않는다.
- UPDATE·INSERT 문장 안에는 테이블 이름을 다시 쓰지 않는다. `UPDATE SET …`, `INSERT (…) VALUES (…)` 로 바로 이어진다.

### MERGE 의 규칙

```sql
CREATE TABLE T_BONUS AS SELECT EMPNO, ENAME, SAL AS BONUS FROM EMP WHERE DEPTNO = 10;
MERGE INTO T_BONUS B USING (SELECT EMPNO, SAL FROM EMP WHERE DEPTNO = 10) E ON (B.EMPNO = E.EMPNO) WHEN MATCHED THEN UPDATE SET B.EMPNO = E.EMPNO;
MERGE INTO T_BONUS B USING (SELECT EMPNO, ENAME FROM EMP WHERE DEPTNO = 20) E ON (B.EMPNO = E.EMPNO) WHEN NOT MATCHED THEN INSERT (EMPNO, ENAME, BONUS) VALUES (E.EMPNO, E.ENAME, 0);
SELECT COUNT(*) FROM T_BONUS;
DROP TABLE T_BONUS PURGE;
```

```text
Table created.
MERGE INTO T_BONUS B USING (SELECT EMPNO, SAL FROM EMP WHERE DEPTNO = 10) E ON (B.EMPNO = E.EMPNO) WHEN MATCHED THEN UPDATE SET B.EMPNO = E.EMPNO
                                                                                *
ERROR at line 1:
ORA-38104: Columns referenced in the ON Clause cannot be updated: "B"."EMPNO"
5 rows merged.
  COUNT(*)
----------
         8
1 row selected.
Table dropped.
```

- ON 절에 쓴 열은 UPDATE SET 에서 바꿀 수 없다(ORA-38104). 연결 기준이 바뀌면 매칭이 흔들리기 때문이다.
- WHEN MATCHED 와 WHEN NOT MATCHED 중 하나만 써도 된다. 두 번째 MERGE 는 INSERT 절만 써서 20번 부서 5명을 넣었다. Oracle 9i 에서는 둘 다 필요했고 10g 부터 하나만 쓸 수 있다.
- 그래서 COUNT 는 기존 3행에 5행을 더한 8 이다.
- 10g 부터 `UPDATE SET … WHERE 조건`, `DELETE WHERE 조건` 을 MATCHED 절에 덧붙일 수 있다.
- 원본 두 행이 대상 한 행과 맞으면 같은 행을 두 번 고치게 되어 ORA-30926 이 난다. 원본은 ON 열 기준으로 한 행씩이어야 한다.

> 내일은 DML 의 변경을 확정하거나 되돌리는 TCL(COMMIT·ROLLBACK·SAVEPOINT)과 트랜잭션을 다룬다.

## 📖 용어

- **DML** : 행의 내용을 바꾸는 문장. INSERT·UPDATE·DELETE·MERGE 가 있다.
- **열 목록** : INSERT 에서 테이블 이름 뒤 괄호에 적는 열 이름들. 값을 넣을 열과 순서를 정한다.
- **DEFAULT** : 값을 주지 않은 열에 대신 들어갈 기본값. `VALUES` 안에 키워드로 직접 쓸 수도 있다.
- **INSERT … SELECT** : 조회 결과의 모든 행을 한 문장으로 넣는 INSERT. VALUES 를 쓰지 않는다.
- **TRUNCATE** : 테이블의 모든 행을 지우고 공간을 돌려주는 DDL. 구조는 남고 ROLLBACK 은 안 된다.
- **MERGE** : 원본과 대상을 ON 조건으로 비교해 맞으면 UPDATE, 없으면 INSERT 하는 문장.
- **ORA-00947 / ORA-00913** : INSERT 의 값이 열보다 모자랄 때 / 남을 때의 오류.

## 📝 연습 문제

**문제 1.** `CREATE TABLE T_DEPT (DEPTNO NUMBER(2), DNAME VARCHAR2(14), LOC VARCHAR2(13) DEFAULT 'SEOUL');` 로 만든 테이블에 `INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (50, 'EDUCATION');` 를 실행했다. 이 행의 LOC 값은?

A) NULL  
B) 빈 문자열 `''`  
C) 값이 모자라 ORA-00947 오류가 나고 행이 들어가지 않는다  
D) SEOUL  

**정답: D**  
해설: 열 목록에서 빠진 열에는 DEFAULT 값이 들어간다. LOC 의 DEFAULT 가 'SEOUL' 이라 SEOUL 이다. NULL 은 DEFAULT 가 없거나 NULL 을 직접 적었을 때다. Oracle 에서 빈 문자열은 NULL 로 다뤄져 B 도 틀리다. 열 목록이 있고 그 개수와 값 개수가 같아 ORA-00947 은 나지 않는다.

---

**문제 2.** DEPT 를 복사한 T_DEPT(DEPTNO, DNAME, LOC)에 `INSERT INTO T_DEPT VALUES (80, 'SUPPORT');` 를 실행한 결과는?

A) LOC 가 NULL 인 행이 1개 들어간다  
B) ORA-00947(not enough values) 오류가 난다  
C) LOC 에 DEFAULT 값이 들어간 행이 1개 들어간다  
D) ORA-00913(too many values) 오류가 난다  

**정답: B**  
해설: 열 목록을 생략하면 모든 열에 값을 줘야 한다. 열 셋에 값 둘이라 ORA-00947 이 나고 행은 들어가지 않는다. 빈 열을 NULL·DEFAULT 로 채우는 것은 열 목록을 써서 열을 뺐을 때의 동작이라 A 와 C 는 틀리다. ORA-00913 은 값이 열보다 많을 때의 오류다.

---

**문제 3.** Oracle 의 DELETE·TRUNCATE·DROP 에 대한 설명으로 옳은 것은?

A) DELETE 는 자동으로 커밋되어 ROLLBACK 으로 되돌릴 수 없다  
B) DROP TABLE 은 행만 지우고 테이블 구조는 남긴다  
C) TRUNCATE 는 DDL 이라 ROLLBACK 으로 되돌릴 수 없고 테이블 구조는 남는다  
D) TRUNCATE 에 WHERE 를 붙이면 조건에 맞는 행만 지울 수 있다  

**정답: C**  
해설: TRUNCATE 는 모든 행을 지우는 DDL 로, 실행과 동시에 커밋된다. 테이블 정의는 남는다. DELETE 는 DML 이라 COMMIT 전에는 ROLLBACK 할 수 있어 A 는 틀리다. 구조를 남기는 것은 TRUNCATE 이고 DROP 은 구조까지 없앤다. TRUNCATE 는 WHERE 를 받지 않는다.

---

**문제 4.** T_BONUS 에 CLARK·KING·MILLER 3행이 있다. 원본 JONES·BLAKE·CLARK·KING 4행으로 `MERGE INTO T_BONUS B USING (…) E ON (B.EMPNO = E.EMPNO) WHEN MATCHED THEN UPDATE SET … WHEN NOT MATCHED THEN INSERT …` 를 실행한 뒤 T_BONUS 의 행 수는?

A) 5  
B) 4  
C) 7  
D) 3  

**정답: A**  
해설: CLARK·KING 은 대상에 있어 UPDATE, JONES·BLAKE 는 없어 INSERT 된다. 대상에만 있는 MILLER 는 그대로 남으니 3 + 2 = 5 행이다. 4 는 MERGE 가 원본으로 대상을 바꿔치기한다고 본 답이다. 7 은 원본 4행을 모두 INSERT 했을 때다. 3 은 INSERT 없이 UPDATE 만 했을 때다.

---

**문제 5.** EMP 를 복사한 EMP_T 에 `UPDATE EMP_T SET COMM = 0 WHERE ENAME = 'NOBODY';` 를 실행했다. 이름이 NOBODY 인 사원은 없다. SQL*Plus 의 결과는?

A) ORA-01403(no data found) 오류가 난다  
B) ORA-00942 오류가 난다  
C) `1 row updated.`  
D) `0 rows updated.`  

**정답: D**  
해설: WHERE 에 맞는 행이 없는 UPDATE 는 오류 없이 0행을 처리하고 끝난다. ORA-01403 은 PL/SQL 에서 SELECT INTO 가 행을 못 찾았을 때의 오류다. ORA-00942 는 테이블이 없을 때의 오류인데 EMP_T 는 있다. 바뀐 행이 없으니 1행도 아니다.
