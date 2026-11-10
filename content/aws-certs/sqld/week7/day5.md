# Day 5 - 데이터 정의어 DDL 과 데이터 제어어 DCL

## 📌 핵심 정리

- DDL 은 테이블 구조를 다룬다. `CREATE`·`ALTER`·`DROP`·`RENAME`·`TRUNCATE` 가 있고, Oracle 에서는 실행하면 바로 확정된다.
- 제약 조건은 다섯 가지다. PRIMARY KEY(NOT NULL + 중복 금지), UNIQUE(중복 금지, NULL 은 여러 개 허용), NOT NULL, CHECK, FOREIGN KEY(부모에 있는 값만).
- FOREIGN KEY 의 `ON DELETE CASCADE` 는 부모를 지울 때 자식도 지우고, `ON DELETE SET NULL` 은 자식의 외래 키를 NULL 로 바꾼다. 옵션이 없으면 자식이 있는 부모는 지울 수 없다.
- `CREATE TABLE … AS SELECT`(CTAS)는 구조와 데이터를 복사하지만 제약 조건은 **NOT NULL 만** 따라온다. DEFAULT 도 복사되지 않는다.
- DCL 의 `GRANT`·`REVOKE` 는 권한을 주고 뺏는다. 객체 권한의 `WITH GRANT OPTION` 은 회수가 연쇄되고, 시스템 권한의 `WITH ADMIN OPTION` 은 연쇄되지 않는다.

## CREATE TABLE — 자료형과 DEFAULT

```text
CREATE TABLE 테이블 (
  열 자료형 [DEFAULT 값] [CONSTRAINT 이름] [제약 조건],
  …,
  [CONSTRAINT 이름] 제약 조건 (열, …)   -- 테이블 수준 제약
);
```

| 자료형 | 뜻 | 주의할 점 |
|-------|----|--------|
| `NUMBER(p, s)` | 전체 p 자리, 소수점 아래 s 자리 숫자 | `NUMBER(7,2)` 는 최대 99999.99 다 |
| `VARCHAR2(n)` | 최대 n 바이트 가변 길이 문자 | 넣은 길이만큼만 저장한다 |
| `CHAR(n)` | n 바이트 고정 길이 문자 | 짧은 값은 뒤에 공백을 채워 n 으로 맞춘다 |
| `DATE` | 날짜와 시각(초 단위) | 시각이 없으면 0시 0분 0초다 |

- `LENGTH(CAST('AB' AS CHAR(5)))` 는 5, `LENGTH(CAST('AB' AS VARCHAR2(5)))` 는 2 였다. CHAR 는 남는 자리를 공백으로 채운다.
- SQL Server 의 가변 길이 문자형은 `VARCHAR` 다. `VARCHAR2` 는 Oracle 의 이름이다.

## 제약 조건

| 제약 조건 | 막는 것 | NULL | 테이블당 |
|---------|-------|------|-------|
| PRIMARY KEY | NULL 과 중복 | 허용 안 함 | 하나 |
| UNIQUE | 중복 | 여러 행 허용 | 여러 개 |
| NOT NULL | NULL | 허용 안 함 | 여러 개 (열 수준만) |
| CHECK | 조건이 거짓인 값 | 허용 (UNKNOWN 은 통과) | 여러 개 |
| FOREIGN KEY | 부모 테이블에 없는 값 | 허용 | 여러 개 |

제약 조건마다 이름을 붙여 만들고, 어긋나는 값을 하나씩 넣어 본다.

```sql
CREATE TABLE T_DEPT (DEPTNO NUMBER(2) CONSTRAINT T_DEPT_PK PRIMARY KEY, DNAME VARCHAR2(14) CONSTRAINT T_DEPT_NN NOT NULL CONSTRAINT T_DEPT_UK UNIQUE, LOC VARCHAR2(13) DEFAULT 'SEOUL');
CREATE TABLE T_EMP (EMPNO NUMBER(4) CONSTRAINT T_EMP_PK PRIMARY KEY, ENAME VARCHAR2(10), SAL NUMBER(7,2) CONSTRAINT T_EMP_CK CHECK (SAL > 0), DEPTNO NUMBER(2) CONSTRAINT T_EMP_FK REFERENCES T_DEPT (DEPTNO));
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (10, 'ACCOUNTING');
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (10, 'SALES');
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (20, 'ACCOUNTING');
INSERT INTO T_DEPT (DEPTNO) VALUES (30);
INSERT INTO T_EMP VALUES (1, 'KIM', 0, 10);
INSERT INTO T_EMP VALUES (1, 'KIM', 100, 99);
INSERT INTO T_EMP VALUES (1, 'KIM', 100, 10);
DELETE FROM T_DEPT WHERE DEPTNO = 10;
DROP TABLE T_EMP PURGE;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
Table created.
1 row created.
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (10, 'SALES')
*
ERROR at line 1:
ORA-00001: unique constraint (SCOTT.T_DEPT_PK) violated on table SCOTT.T_DEPT columns (DEPTNO)
ORA-03301: (ORA-00001 details) row with column values (DEPTNO:10) already exists
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (20, 'ACCOUNTING')
*
ERROR at line 1:
ORA-00001: unique constraint (SCOTT.T_DEPT_UK) violated on table SCOTT.T_DEPT columns (DNAME)
ORA-03301: (ORA-00001 details) row with column values (DNAME:'ACCOUNTING') already exists
INSERT INTO T_DEPT (DEPTNO) VALUES (30)
*
ERROR at line 1:
ORA-01400: cannot insert NULL into ("SCOTT"."T_DEPT"."DNAME")
INSERT INTO T_EMP VALUES (1, 'KIM', 0, 10)
*
ERROR at line 1:
ORA-02290: check constraint (SCOTT.T_EMP_CK) violated
INSERT INTO T_EMP VALUES (1, 'KIM', 100, 99)
*
ERROR at line 1:
ORA-02291: integrity constraint (SCOTT.T_EMP_FK) violated - parent key not found
1 row created.
DELETE FROM T_DEPT WHERE DEPTNO = 10
*
ERROR at line 1:
ORA-02292: integrity constraint (SCOTT.T_EMP_FK) violated - child record found
Table dropped.
Table dropped.
```

| 오류 | 어긴 제약 | 상황 |
|-----|--------|-----|
| ORA-00001 | PRIMARY KEY, UNIQUE | 같은 값이 이미 있다 |
| ORA-01400 | NOT NULL (PK 포함) | NULL 을 넣으려 했다 |
| ORA-02290 | CHECK | 조건 `SAL > 0` 이 거짓이다 |
| ORA-02291 | FOREIGN KEY | 자식에 넣은 값이 부모에 없다 (parent key not found) |
| ORA-02292 | FOREIGN KEY | 자식이 참조하는 부모를 지우려 했다 (child record found) |

- 23ai 는 ORA-00001 에 열 이름과 ORA-03301 상세 줄을 덧붙인다. 이전 버전은 `ORA-00001: unique constraint (SCOTT.T_DEPT_PK) violated` 한 줄이다.
- 자식 테이블 T_EMP 를 먼저 지웠다. 순서를 바꿔 부모를 먼저 DROP 하면 ORA-02449 가 난다. 부모를 먼저 지우려면 `DROP TABLE T_DEPT CASCADE CONSTRAINTS` 로 자식의 외래 키를 함께 없앤다.
- 이름을 주지 않은 제약 조건은 `SYS_C008727` 같은 시스템 이름을 받는다. 오류 메시지에서 어느 제약인지 알아보기 어렵다.

NULL 과 제약 조건의 관계는 따로 확인했다.

- UNIQUE 열에 NULL 을 두 번 넣어도 둘 다 들어갔다. NULL 끼리는 같은 값으로 보지 않는다.
- `CHECK (A > 0)` 열에 NULL 을 넣어도 들어갔다. CHECK 는 조건이 FALSE 일 때만 막고, NULL 비교의 UNKNOWN 은 통과시킨다.
- 외래 키 열에 NULL 을 넣으면 부모를 찾지 않고 들어간다.

## FOREIGN KEY 의 삭제 옵션

자식 테이블 셋을 만들어 같은 부모를 참조하게 한다. 옵션만 다르다.

```sql
CREATE TABLE T_DEPT AS SELECT DEPTNO, DNAME FROM DEPT;
ALTER TABLE T_DEPT ADD CONSTRAINT T_DEPT_PK PRIMARY KEY (DEPTNO);
CREATE TABLE T_EMP1 (EMPNO NUMBER(4), DEPTNO NUMBER(2) CONSTRAINT T_EMP1_FK REFERENCES T_DEPT (DEPTNO) ON DELETE CASCADE);
CREATE TABLE T_EMP2 (EMPNO NUMBER(4), DEPTNO NUMBER(2) CONSTRAINT T_EMP2_FK REFERENCES T_DEPT (DEPTNO) ON DELETE SET NULL);
CREATE TABLE T_EMP3 (EMPNO NUMBER(4), DEPTNO NUMBER(2) CONSTRAINT T_EMP3_FK REFERENCES T_DEPT (DEPTNO));
INSERT INTO T_EMP1 SELECT EMPNO, DEPTNO FROM EMP;
INSERT INTO T_EMP2 SELECT EMPNO, DEPTNO FROM EMP;
INSERT INTO T_EMP3 SELECT EMPNO, DEPTNO FROM EMP WHERE DEPTNO = 20;
DELETE FROM T_DEPT WHERE DEPTNO = 20;
DELETE FROM T_DEPT WHERE DEPTNO = 30;
SELECT (SELECT COUNT(*) FROM T_EMP1) AS E1_ROWS, (SELECT COUNT(*) FROM T_EMP2) AS E2_ROWS, (SELECT COUNT(*) FROM T_EMP2 WHERE DEPTNO IS NULL) AS E2_NULL FROM DUAL;
DROP TABLE T_DEPT CASCADE CONSTRAINTS PURGE;
DROP TABLE T_EMP1 PURGE;
DROP TABLE T_EMP2 PURGE;
DROP TABLE T_EMP3 PURGE;
```

```text
Table created.
Table altered.
Table created.
Table created.
Table created.
14 rows created.
14 rows created.
5 rows created.
DELETE FROM T_DEPT WHERE DEPTNO = 20
*
ERROR at line 1:
ORA-02292: integrity constraint (SCOTT.T_EMP3_FK) violated - child record found
1 row deleted.
   E1_ROWS    E2_ROWS    E2_NULL
---------- ---------- ----------
         8         14          6
1 row selected.
Table dropped.
Table dropped.
Table dropped.
Table dropped.
```

- 20번 부서는 옵션이 없는 T_EMP3 이 참조하고 있어 삭제가 거부됐다. 문장 전체가 실패해 T_EMP1·T_EMP2 의 20번 행도 그대로다.
- 30번 부서를 지우자 CASCADE 인 T_EMP1 에서는 30번 사원 6행이 함께 지워졌다(14 → 8).
- SET NULL 인 T_EMP2 는 14행이 그대로이고, 그중 6행의 DEPTNO 가 NULL 이 됐다.

| 옵션 | 부모 행을 지우면 |
|-----|--------------|
| 없음 (기본) | 자식이 있으면 거부한다 (ORA-02292) |
| `ON DELETE CASCADE` | 자식 행도 함께 지운다 |
| `ON DELETE SET NULL` | 자식 행은 남기고 외래 키 열을 NULL 로 바꾼다 |

- Oracle 에는 `ON UPDATE CASCADE` 가 없다. SQL Server 는 `ON UPDATE CASCADE`·`SET DEFAULT` 도 지원한다.

## CTAS — 테이블 복사

`CREATE TABLE 새 테이블 AS SELECT …` 는 SELECT 결과의 구조와 행을 그대로 새 테이블로 만든다. `WHERE 1 = 2` 를 붙이면 구조만 복사한다.

```sql
CREATE TABLE T_DEPT (DEPTNO NUMBER(2) CONSTRAINT T_DEPT_PK PRIMARY KEY, DNAME VARCHAR2(14) CONSTRAINT T_DEPT_NN NOT NULL, LOC VARCHAR2(13) DEFAULT 'SEOUL' CONSTRAINT T_DEPT_CK CHECK (LOC <> 'X'));
INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (10, 'ACCOUNTING');
CREATE TABLE T_DEPT2 AS SELECT * FROM T_DEPT;
SELECT SUBSTR(TABLE_NAME, 1, 8) AS TNAME, CONSTRAINT_TYPE AS T, SUBSTR(SEARCH_CONDITION_VC, 1, 20) AS COND FROM USER_CONSTRAINTS WHERE TABLE_NAME IN ('T_DEPT', 'T_DEPT2') ORDER BY TNAME, T, COND;
INSERT INTO T_DEPT2 (DEPTNO, DNAME) VALUES (10, 'SALES');
INSERT INTO T_DEPT2 VALUES (20, 'IT', 'X');
INSERT INTO T_DEPT2 (DEPTNO) VALUES (30);
SELECT * FROM T_DEPT2 ORDER BY DEPTNO, DNAME;
DROP TABLE T_DEPT2 PURGE;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
1 row created.
Table created.
TNAME                            T COND
-------------------------------- - --------------------------------------------------------------------------------
T_DEPT                           C "DNAME" IS NOT NULL
T_DEPT                           C LOC <> 'X'
T_DEPT                           P
T_DEPT2                          C "DNAME" IS NOT NULL
4 rows selected.
1 row created.
1 row created.
INSERT INTO T_DEPT2 (DEPTNO) VALUES (30)
*
ERROR at line 1:
ORA-01400: cannot insert NULL into ("SCOTT"."T_DEPT2"."DNAME")
    DEPTNO DNAME          LOC
---------- -------------- -------------
        10 ACCOUNTING     SEOUL
        10 SALES
        20 IT             X
3 rows selected.
Table dropped.
Table dropped.
```

- 원본 T_DEPT 에는 NOT NULL·CHECK(유형 C)와 PRIMARY KEY(P)가 있다. 복사본 T_DEPT2 에는 NOT NULL 하나만 남았다.
- PK 가 없어 DEPTNO 10 이 두 번 들어갔다. CHECK 가 없어 LOC 'X' 도 들어갔다.
- 10 SALES 의 LOC 가 비었다. DEFAULT 'SEOUL' 도 복사되지 않았다.
- NOT NULL 은 그대로라 DNAME 을 뺀 INSERT 는 ORA-01400 이다.
- SQL Server 에서는 `SELECT … INTO 새 테이블 FROM …` 으로 같은 일을 한다.

## ALTER · RENAME · TRUNCATE · DROP

| 문장 | 하는 일 |
|-----|-------|
| `ALTER TABLE t ADD (열 자료형)` | 열 추가. 새 열은 맨 뒤에 붙는다 |
| `ALTER TABLE t MODIFY (열 자료형)` | 자료형·길이·DEFAULT·NOT NULL 변경 |
| `ALTER TABLE t DROP COLUMN 열` | 열 삭제 |
| `ALTER TABLE t RENAME COLUMN a TO b` | 열 이름 변경 |
| `ALTER TABLE t ADD CONSTRAINT 이름 …` | 제약 조건 추가 |
| `ALTER TABLE t DROP CONSTRAINT 이름` | 제약 조건 삭제 |
| `RENAME a TO b` | 테이블 이름 변경 |
| `TRUNCATE TABLE t` | 모든 행 삭제, 구조는 남김 |
| `DROP TABLE t [CASCADE CONSTRAINTS] [PURGE]` | 테이블 삭제 |

```sql
CREATE TABLE EMP_T AS SELECT EMPNO, ENAME, SAL FROM EMP WHERE DEPTNO = 10;
ALTER TABLE EMP_T ADD (BONUS NUMBER(7,2) DEFAULT 0);
ALTER TABLE EMP_T ADD (MEMO VARCHAR2(20));
ALTER TABLE EMP_T MODIFY (ENAME VARCHAR2(20));
ALTER TABLE EMP_T MODIFY (ENAME VARCHAR2(3));
ALTER TABLE EMP_T RENAME COLUMN SAL TO SALARY;
ALTER TABLE EMP_T DROP COLUMN MEMO;
ALTER TABLE EMP_T ADD CONSTRAINT EMP_T_PK PRIMARY KEY (EMPNO);
ALTER TABLE EMP_T ADD (GRADE NUMBER NOT NULL);
ALTER TABLE EMP_T MODIFY (ENAME NOT NULL);
RENAME EMP_T TO T_STAFF;
SELECT * FROM T_STAFF ORDER BY EMPNO;
TRUNCATE TABLE T_STAFF;
SELECT COUNT(*) FROM T_STAFF;
DROP TABLE T_STAFF PURGE;
```

```text
Table created.
Table altered.
Table altered.
Table altered.
ALTER TABLE EMP_T MODIFY (ENAME VARCHAR2(3))
                          *
ERROR at line 1:
ORA-01441: cannot decrease column length because some value is too big
Table altered.
Table altered.
Table altered.
ALTER TABLE EMP_T ADD (GRADE NUMBER NOT NULL)
            *
ERROR at line 1:
ORA-01758: table must be empty to add mandatory (NOT NULL) column
Table altered.
Table renamed.
     EMPNO ENAME                    SALARY      BONUS
---------- -------------------- ---------- ----------
      7782 CLARK                      2450          0
      7839 KING                       5000          0
      7934 MILLER                     1300          0
3 rows selected.
Table truncated.
  COUNT(*)
----------
         0
1 row selected.
Table dropped.
```

- DEFAULT 를 준 열을 ADD 하면 기존 행에도 그 값이 채워진다. BONUS 가 모두 0 이다.
- 길이를 늘리는 MODIFY 는 언제나 된다. 이미 든 값보다 짧게 줄이면 ORA-01441 이다.
- 행이 있는 테이블에 DEFAULT 없는 NOT NULL 열은 추가할 수 없다(ORA-01758). 기존 행의 새 열이 NULL 이 되기 때문이다.
- `PURGE` 를 빼면 DROP 한 테이블이 휴지통(Recycle Bin)으로 가서 `FLASHBACK TABLE` 로 되살릴 수 있다. PURGE 는 휴지통을 거치지 않고 바로 지운다.
- SQL Server 는 열 변경에 `ALTER TABLE t ALTER COLUMN …`, 이름 변경에 `sp_rename` 을 쓴다.

## DCL — 권한 주고 뺏기

DCL 은 사용자를 만들고 권한을 다룬다. 실습장 계정에는 권한이 없어 결과표 없이 문법만 본다.

```text
CREATE USER 사용자 IDENTIFIED BY 비밀번호;
GRANT 시스템권한 [, …] TO 사용자 [WITH ADMIN OPTION];
GRANT 객체권한 [, …] ON 객체 TO 사용자 [WITH GRANT OPTION];
REVOKE 권한 [ON 객체] FROM 사용자;
```

| 구분 | 시스템 권한 | 객체 권한 |
|-----|----------|---------|
| 예 | CREATE SESSION, CREATE TABLE, CREATE VIEW | SELECT, INSERT, UPDATE, DELETE ON 테이블 |
| 다시 줄 수 있게 하는 옵션 | `WITH ADMIN OPTION` | `WITH GRANT OPTION` |
| A → B → C 로 준 뒤 A 가 B 의 권한을 회수하면 | B 만 회수, C 는 **남는다** | C 의 권한도 **함께 회수** |

- 연쇄 여부는 실습 컨테이너에서 사용자 셋(A·B·C)을 만들어 확인했다.
- `CREATE USER` 만으로는 접속할 수 없다. `CREATE SESSION` 권한이 있어야 로그인된다.

### ROLE

권한을 사용자마다 일일이 주는 대신 권한 묶음(ROLE)을 만들어 한 번에 준다.

```text
CREATE ROLE R_DEV;
GRANT CREATE SESSION, CREATE TABLE TO R_DEV;
GRANT R_DEV TO KIM;
REVOKE R_DEV FROM KIM;
```

| 기본 ROLE | 들어 있는 권한 (23ai 기준) |
|----------|---------------------|
| CONNECT | CREATE SESSION 등 접속 권한 |
| RESOURCE | CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TRIGGER 등 객체 생성 권한 |
| DBA | 거의 모든 시스템 권한 |

- 실습 컨테이너의 RESOURCE 에는 CREATE VIEW·CREATE SYNONYM 도 들어 있었다. 이전 버전 교재는 RESOURCE 에 CREATE VIEW 가 없다고 설명한다. 시험은 "CONNECT 는 접속, RESOURCE 는 객체 생성" 구분이면 충분하다.

> 다음 주는 시험 직전 정리로, 헷갈리기 쉬운 NULL·COUNT 문제부터 다시 본다.

## 📖 용어

- **DDL** : 테이블 같은 객체의 구조를 만들고 바꾸고 없애는 문장. Oracle 에서는 실행하면 바로 확정된다.
- **제약 조건** : 열에 들어갈 값의 규칙. 어긋나는 INSERT·UPDATE·DELETE 를 막는다.
- **외래 키(FOREIGN KEY)** : 다른 테이블(부모)의 기본 키 값만 넣을 수 있게 하는 제약. 참조 무결성을 지킨다.
- **CTAS** : `CREATE TABLE … AS SELECT` 로 조회 결과를 그대로 새 테이블로 만드는 문장.
- **휴지통(Recycle Bin)** : PURGE 없이 DROP 한 테이블이 잠시 머무는 곳. FLASHBACK TABLE 로 되살릴 수 있다.
- **DCL** : 권한을 주고 회수하는 문장. GRANT 와 REVOKE 가 있다.
- **ROLE** : 여러 권한을 묶어 이름을 붙인 것. 사용자에게 한 번에 권한을 주는 데 쓴다.
- **WITH GRANT OPTION / WITH ADMIN OPTION** : 받은 객체 권한 / 시스템 권한을 남에게 다시 줄 수 있게 하는 옵션.

## 📝 연습 문제

**문제 1.** PRIMARY KEY·NOT NULL·CHECK·FOREIGN KEY 가 있는 테이블을 `CREATE TABLE … AS SELECT * FROM …` 로 복사했다. 새 테이블에 따라오는 제약 조건은?

A) PRIMARY KEY  
B) NOT NULL  
C) FOREIGN KEY  
D) CHECK  

**정답: B**  
해설: CTAS 는 열 구조와 데이터를 복사하지만 제약 조건은 NOT NULL 만 가져온다. PRIMARY KEY 가 없어져 같은 값이 다시 들어갈 수 있다. FOREIGN KEY·CHECK 도 빠지므로 필요하면 ALTER TABLE … ADD CONSTRAINT 로 다시 만든다. DEFAULT 값도 복사되지 않는다.

---

**문제 2.** 자식 테이블의 외래 키가 `REFERENCES T_DEPT (DEPTNO) ON DELETE SET NULL` 이고, 30번 부서를 참조하는 자식 행이 6개다. `DELETE FROM T_DEPT WHERE DEPTNO = 30;` 을 실행한 결과는?

A) 자식 행 6개도 함께 삭제된다  
B) 자식 행이 있어 ORA-02292 오류로 삭제가 거부된다  
C) 자식 행의 DEPTNO 가 열의 DEFAULT 값으로 바뀐다  
D) 자식 행 6개는 남고 DEPTNO 만 NULL 이 된다  

**정답: D**  
해설: SET NULL 은 부모 행을 지우면서 자식의 외래 키 열을 NULL 로 바꾼다. 행은 지우지 않는다. 자식 행을 함께 지우는 것은 ON DELETE CASCADE 다. ORA-02292 는 삭제 옵션이 없을 때의 동작이다. Oracle 에는 SET DEFAULT 옵션이 없다.

---

**문제 3.** 3행이 든 EMP_T 에 `ALTER TABLE EMP_T ADD (GRADE NUMBER NOT NULL);` 을 실행한 결과는?

A) ORA-01758 오류가 나고 열은 추가되지 않는다  
B) 기존 3행의 GRADE 가 NULL 로 채워져 열이 추가된다  
C) 기존 3행의 GRADE 가 0 으로 채워져 열이 추가된다  
D) 열은 추가되고 NOT NULL 제약만 무시된다  

**정답: A**  
해설: 행이 있는 테이블에 DEFAULT 없는 NOT NULL 열을 더하면 기존 행의 새 열에 넣을 값이 없다. 그래서 ORA-01758(table must be empty to add mandatory column)이 난다. NULL 로 채우면 NOT NULL 을 어기므로 B 는 불가능하다. 0 으로 채우려면 `DEFAULT 0` 을 함께 줘야 한다. 제약 조건을 조용히 무시하는 동작은 없다.

---

**문제 4.** `CREATE TABLE T_U (A NUMBER UNIQUE);` 로 만든 테이블에 `INSERT INTO T_U VALUES (NULL);` 을 두 번 실행했다. `SELECT COUNT(*) FROM T_U;` 의 결과는?

A) 1  
B) 0  
C) 2  
D) UNIQUE 열이라 테이블 생성 단계에서 NOT NULL 이 함께 걸려 두 INSERT 모두 실패한다  

**정답: C**  
해설: UNIQUE 는 중복을 막지만 NULL 끼리는 같은 값으로 보지 않아 NULL 행을 여러 개 받는다. 두 INSERT 가 모두 성공해 2 다. 1 은 두 번째 NULL 을 중복으로 본 답이다. NULL 을 막는 것은 PRIMARY KEY 와 NOT NULL 이고, UNIQUE 는 NOT NULL 을 포함하지 않는다.

---

**문제 5.** A 가 B 에게 `GRANT SELECT ON A.T_OBJ TO B WITH GRANT OPTION;` 으로 권한을 주고, B 가 다시 C 에게 같은 권한을 줬다. 그 뒤 A 가 `REVOKE SELECT ON A.T_OBJ FROM B;` 를 실행했다. C 의 권한은?

A) B 만 회수되고 C 의 권한은 남는다  
B) C 의 권한도 함께 회수된다  
C) C 의 권한을 먼저 회수해야 해서 REVOKE 가 오류를 낸다  
D) B 의 권한은 남고 C 의 권한만 회수된다  

**정답: B**  
해설: WITH GRANT OPTION 으로 받은 객체 권한을 회수하면, 그 사용자가 다른 사람에게 준 권한도 연쇄적으로 회수된다. C 의 권한이 남는 것은 시스템 권한을 WITH ADMIN OPTION 으로 줬을 때의 동작이라 A 는 틀리다. 연쇄 회수가 자동이라 순서를 지킬 필요가 없고 오류도 나지 않는다. REVOKE 대상은 B 이므로 B 의 권한이 남는 D 는 틀리다.
