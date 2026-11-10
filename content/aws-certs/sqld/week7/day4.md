# Day 4 - 트랜잭션 제어어 TCL (COMMIT·ROLLBACK·SAVEPOINT)

## 📌 핵심 정리

- 트랜잭션은 함께 성공하거나 함께 취소돼야 하는 작업 묶음이다. 성질은 원자성·일관성·고립성·지속성(ACID)이다.
- `COMMIT` 은 변경을 확정하고, `ROLLBACK` 은 마지막 COMMIT 이후의 변경을 모두 취소한다. `ROLLBACK TO 저장점` 은 그 저장점 뒤만 취소한다.
- `ROLLBACK TO` 를 하면 그 저장점 **뒤에** 만든 저장점은 사라진다. 같은 이름으로 다시 만든 저장점은 앞의 것을 덮어쓴다.
- Oracle 에서 DDL(CREATE·ALTER·DROP·TRUNCATE)은 실행 전후로 **암묵적 COMMIT** 을 한다. 앞에 있던 DML 도 함께 확정된다.
- Oracle 은 DML 뒤에 명시적 COMMIT 이 필요하다. SQL Server 는 기본이 AUTO COMMIT 이라 문장마다 바로 확정된다.

## 계좌 이체로 보는 트랜잭션

A 계좌에서 10만 원을 빼고 B 계좌에 10만 원을 넣는 이체는 UPDATE 두 문장이다. 첫 문장만 반영되고 둘째 문장이 실패하면 돈이 사라진다. 두 문장은 **둘 다 반영되거나 둘 다 취소**돼야 한다.

- 이렇게 하나의 논리적 작업 단위로 묶인 DML 들을 트랜잭션이라 부른다.
- 트랜잭션을 확정하거나 취소하는 명령이 TCL(Transaction Control Language)이다. COMMIT·ROLLBACK·SAVEPOINT 가 있다.

| 성질 | 이름 | 뜻 | 이체의 예 |
|-----|-----|----|---------|
| Atomicity | 원자성 | 전부 반영되거나 전혀 반영되지 않는다 | 빼기만 되고 넣기는 안 되는 일이 없다 |
| Consistency | 일관성 | 실행 전후로 데이터가 규칙(제약 조건)을 지킨다 | 두 계좌 잔액의 합이 그대로다 |
| Isolation | 고립성 | 실행 중인 트랜잭션의 중간 결과를 다른 트랜잭션이 보지 못한다 | 빼기만 된 순간의 잔액이 남에게 보이지 않는다 |
| Durability | 지속성 | 확정된 결과는 장애가 나도 남는다 | COMMIT 뒤 서버가 꺼져도 이체 결과가 남는다 |

## COMMIT 과 ROLLBACK

```text
COMMIT;                     -- 지금까지의 변경을 확정
ROLLBACK;                   -- 마지막 COMMIT 이후의 변경을 모두 취소
SAVEPOINT 이름;             -- 중간 저장점 만들기
ROLLBACK TO [SAVEPOINT] 이름; -- 저장점 뒤의 변경만 취소
```

```sql
CREATE TABLE T_DEPT AS SELECT * FROM DEPT;
INSERT INTO T_DEPT VALUES (50, 'EDUCATION', 'SEOUL');
COMMIT;
DELETE FROM T_DEPT WHERE DEPTNO = 10;
ROLLBACK;
SELECT DEPTNO, DNAME FROM T_DEPT ORDER BY DEPTNO;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
1 row created.
Commit complete.
1 row deleted.
Rollback complete.
    DEPTNO DNAME
---------- --------------
        10 ACCOUNTING
        20 RESEARCH
        30 SALES
        40 OPERATIONS
        50 EDUCATION
5 rows selected.
Table dropped.
```

- 50번 부서는 COMMIT 으로 확정됐다. 뒤의 ROLLBACK 이 되돌리지 못한다.
- 10번 부서를 지운 DELETE 는 COMMIT 전이라 ROLLBACK 으로 취소됐다.
- 피드백 문구는 `Commit complete.`, `Rollback complete.` 다.

### COMMIT·ROLLBACK 전후의 상태

| 시점 | 변경한 세션 | 다른 세션 | 잠금 |
|-----|----------|---------|-----|
| DML 직후 (COMMIT 전) | 바뀐 값이 보인다 | 바뀌기 **전** 값이 보인다 | 바뀐 행에 걸려 있다 |
| COMMIT 후 | 바뀐 값 | 바뀐 값 | 풀린다 |
| ROLLBACK 후 | 원래 값 | 원래 값 | 풀린다 |

- 다른 세션은 COMMIT 전의 변경을 볼 수 없다. 고립성 때문이다. Oracle 은 다른 세션에 변경 전 값을 보여 줘 읽기가 막히지 않게 한다.
- 다른 세션이 같은 행을 UPDATE·DELETE 하려 하면 잠금이 풀릴 때까지 기다린다.
- 실습장의 블록은 세션 하나에서 돌기 때문에 이 차이를 직접 볼 수 없다. SQL*Plus 창을 두 개 띄우면 확인할 수 있다.

## SAVEPOINT — 일부만 되돌리기

ROLLBACK 은 COMMIT 이후 전부를 취소한다. 긴 트랜잭션에서 뒤쪽 일부만 취소하려면 중간에 저장점을 찍어 둔다.

```sql
CREATE TABLE EMP_T AS SELECT EMPNO, ENAME, SAL FROM EMP WHERE DEPTNO = 10;
UPDATE EMP_T SET SAL = 1000 WHERE ENAME = 'CLARK';
SAVEPOINT SP1;
UPDATE EMP_T SET SAL = 2000 WHERE ENAME = 'KING';
SAVEPOINT SP2;
DELETE FROM EMP_T WHERE ENAME = 'MILLER';
ROLLBACK TO SP2;
SELECT ENAME, SAL FROM EMP_T ORDER BY ENAME;
ROLLBACK TO SAVEPOINT SP1;
SELECT ENAME, SAL FROM EMP_T ORDER BY ENAME;
ROLLBACK TO SP2;
ROLLBACK;
SELECT ENAME, SAL FROM EMP_T ORDER BY ENAME;
DROP TABLE EMP_T PURGE;
```

```text
Table created.
1 row updated.
Savepoint created.
1 row updated.
Savepoint created.
1 row deleted.
Rollback complete.
ENAME             SAL
---------- ----------
CLARK            1000
KING             2000
MILLER           1300
3 rows selected.
Rollback complete.
ENAME             SAL
---------- ----------
CLARK            1000
KING             5000
MILLER           1300
3 rows selected.
ROLLBACK TO SP2
*
ERROR at line 1:
ORA-01086: savepoint 'SP2' never established in this session or is invalid
Rollback complete.
ENAME             SAL
---------- ----------
CLARK            2450
KING             5000
MILLER           1300
3 rows selected.
Table dropped.
```

시간 순서로 정리하면 다음과 같다.

```text
CTAS ─ CLARK=1000 ─ [SP1] ─ KING=2000 ─ [SP2] ─ MILLER 삭제
                                          ◀── ROLLBACK TO SP2 : MILLER 복구
                       ◀────────────────────── ROLLBACK TO SP1 : KING 복구, SP2 소멸
 ◀──────────────────────────────────────────── ROLLBACK        : CLARK 복구
```

- `ROLLBACK TO SP2` 는 SP2 뒤의 DELETE 만 취소했다. CLARK·KING 의 변경은 남아 있다.
- `ROLLBACK TO SP1` 뒤에 SP2 로 돌아가려 하자 ORA-01086 이 났다. SP1 보다 뒤에 만든 SP2 는 이미 사라졌기 때문이다.
- `ROLLBACK TO` 는 트랜잭션을 끝내지 않는다. 마지막 ROLLBACK 이 CLARK 의 변경까지 모두 취소했다.
- CTAS 는 DDL 이라 그 시점에 커밋되었다. ROLLBACK 해도 EMP_T 자체는 남는다.

### 같은 이름의 저장점

```sql
CREATE TABLE T_DEPT AS SELECT * FROM DEPT;
SAVEPOINT A;
DELETE FROM T_DEPT WHERE DEPTNO = 10;
SAVEPOINT A;
DELETE FROM T_DEPT WHERE DEPTNO = 20;
ROLLBACK TO A;
SELECT DEPTNO FROM T_DEPT ORDER BY DEPTNO;
ROLLBACK;
SELECT COUNT(*) FROM T_DEPT;
ROLLBACK TO A;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
Savepoint created.
1 row deleted.
Savepoint created.
1 row deleted.
Rollback complete.
    DEPTNO
----------
        20
        30
        40
3 rows selected.
Rollback complete.
  COUNT(*)
----------
         4
1 row selected.
ROLLBACK TO A
*
ERROR at line 1:
ORA-01086: savepoint 'A' never established in this session or is invalid
Table dropped.
```

- 두 번째 `SAVEPOINT A` 가 첫 번째 A 를 대신한다. 그래서 `ROLLBACK TO A` 는 20번 부서만 되살렸다.
- ROLLBACK 이나 COMMIT 으로 트랜잭션이 끝나면 저장점도 모두 사라진다. 마지막 `ROLLBACK TO A` 가 ORA-01086 인 이유다.

> ⚠️ **함정**: 저장점이 여럿일 때 `ROLLBACK TO` 는 가장 최근 저장점이 아니라 **이름을 적은 저장점**으로 돌아간다. 그 뒤의 저장점과 변경은 모두 사라지고, 그 앞의 변경은 남는다.

## 자동 커밋 — 의도하지 않아도 확정되는 경우

### DDL 은 암묵적 COMMIT 을 한다

Oracle 은 DDL 을 실행하기 전에 열려 있던 트랜잭션을 COMMIT 하고, DDL 이 끝나면 다시 COMMIT 한다.

```sql
CREATE TABLE T_DEPT AS SELECT * FROM DEPT;
INSERT INTO T_DEPT VALUES (50, 'EDUCATION', 'SEOUL');
CREATE TABLE T_LOG (MSG VARCHAR2(20));
ROLLBACK;
SELECT COUNT(*) FROM T_DEPT;
DROP TABLE T_LOG PURGE;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
1 row created.
Table created.
Rollback complete.
  COUNT(*)
----------
         5
1 row selected.
Table dropped.
Table dropped.
```

- INSERT 뒤에 COMMIT 을 쓰지 않았지만 `CREATE TABLE T_LOG` 가 실행되며 함께 확정됐다. ROLLBACK 을 해도 5행이다.
- 상관없어 보이는 다른 테이블의 DDL 이라도 같다. TRUNCATE·ALTER·DROP·GRANT 도 모두 같은 효과를 낸다.

| 자동으로 COMMIT 되는 경우 | 자동으로 ROLLBACK 되는 경우 |
|---------------------|----------------------|
| DDL(CREATE·ALTER·DROP·TRUNCATE·RENAME) 실행 | 세션이 비정상 종료될 때 |
| DCL(GRANT·REVOKE) 실행 | 장애로 DB 가 내려갈 때 (확정 안 된 변경) |
| SQL*Plus 를 EXIT 로 정상 종료할 때 | |

### 문장 하나가 실패하면

```sql
CREATE TABLE T_DEPT AS SELECT * FROM DEPT;
INSERT INTO T_DEPT VALUES (50, 'EDUCATION', 'SEOUL');
INSERT INTO T_DEPT VALUES (60, 'TOO LONG DEPARTMENT NAME', 'SEOUL');
COMMIT;
SELECT COUNT(*) FROM T_DEPT;
DROP TABLE T_DEPT PURGE;
```

```text
Table created.
1 row created.
INSERT INTO T_DEPT VALUES (60, 'TOO LONG DEPARTMENT NAME', 'SEOUL')
                               *
ERROR at line 1:
ORA-12899: value too large for column "SCOTT"."T_DEPT"."DNAME" (actual: 24, maximum: 14)
Commit complete.
  COUNT(*)
----------
         5
1 row selected.
Table dropped.
```

- 실패한 INSERT 만 취소되고 앞의 50번 INSERT 는 트랜잭션에 남았다. 이것을 문장 수준 롤백이라 부른다.
- 오류가 났다고 트랜잭션 전체가 취소되지는 않는다. 이어진 COMMIT 이 50번 행을 확정했다.

## Oracle 과 SQL Server

| 구분 | Oracle | SQL Server |
|------|--------|-----------|
| 기본 모드 | 명시적 COMMIT 이 필요하다 | AUTO COMMIT. 문장마다 바로 확정 |
| 트랜잭션 시작 | 첫 DML 이 실행되면 자동으로 시작 | `BEGIN TRAN` 으로 명시 |
| 저장점 | `SAVEPOINT 이름` / `ROLLBACK TO 이름` | `SAVE TRAN 이름` / `ROLLBACK TRAN 이름` |
| DDL 과 트랜잭션 | 암묵적 COMMIT. 되돌릴 수 없다 | 트랜잭션 안의 DDL 도 ROLLBACK 할 수 있다 |

SQL Server 에서 여러 문장을 하나로 묶으려면 이렇게 쓴다.

```text
BEGIN TRAN;
UPDATE ACCOUNT SET BAL = BAL - 100000 WHERE ID = 'A';
UPDATE ACCOUNT SET BAL = BAL + 100000 WHERE ID = 'B';
COMMIT TRAN;      -- 문제가 있으면 ROLLBACK TRAN;
```

- SQL Server 에서도 `SET IMPLICIT_TRANSACTIONS ON` 을 주면 Oracle 처럼 COMMIT 을 직접 해야 하는 암시적 트랜잭션 모드가 된다.
- 실습장과 이 노트의 블록은 Oracle 기준이다. SQL*Plus 의 `SHOW AUTOCOMMIT` 은 실습 컨테이너에서 `autocommit OFF` 를 보여 줬다.

> 내일은 테이블을 만들고 고치는 DDL(CREATE·ALTER·DROP)과 제약 조건, 권한을 주고 빼는 DCL(GRANT·REVOKE)을 다룬다.

## 📖 용어

- **트랜잭션** : 함께 확정되거나 함께 취소돼야 하는 작업의 묶음. 데이터베이스가 일을 처리하는 논리적 단위다.
- **TCL** : 트랜잭션을 제어하는 명령. COMMIT·ROLLBACK·SAVEPOINT 가 있다.
- **ACID** : 트랜잭션이 지켜야 할 네 성질. 원자성·일관성·고립성·지속성의 머리글자다.
- **저장점(SAVEPOINT)** : 트랜잭션 중간에 찍어 두는 표시. ROLLBACK TO 로 그 지점까지만 되돌린다.
- **암묵적 COMMIT** : 사용자가 COMMIT 을 쓰지 않아도 DDL·DCL 실행이나 정상 종료 때 자동으로 확정되는 것.
- **AUTO COMMIT** : 문장 하나가 끝날 때마다 자동으로 COMMIT 하는 모드. SQL Server 의 기본값이다.
- **문장 수준 롤백** : 실패한 문장 하나의 변경만 취소하고 같은 트랜잭션의 앞선 변경은 남기는 동작.

## 📝 연습 문제

**문제 1.** EMP_T(CLARK 2450, KING 5000, MILLER 1300)에서 다음을 차례로 실행했다. `UPDATE EMP_T SET SAL = 1000 WHERE ENAME = 'CLARK';` → `SAVEPOINT SP1;` → `UPDATE EMP_T SET SAL = 2000 WHERE ENAME = 'KING';` → `SAVEPOINT SP2;` → `DELETE FROM EMP_T WHERE ENAME = 'MILLER';` → `ROLLBACK TO SP1;` → `COMMIT;`. 확정된 KING 의 SAL 은?

A) 5000  
B) 2000  
C) KING 행이 없다  
D) 1000  

**정답: A**  
해설: `ROLLBACK TO SP1` 은 SP1 뒤의 변경, 즉 KING 의 2000 과 MILLER 삭제를 취소한다. KING 은 원래 값 5000 으로 돌아간 상태로 확정된다. 2000 은 SP2 로 돌아갔을 때의 값이다. KING 은 삭제된 적이 없다. 1000 은 SP1 앞에서 바뀐 CLARK 의 값이다.

---

**문제 2.** DEPT 를 복사한 T_DEPT(4행)에서 `INSERT INTO T_DEPT VALUES (50, 'EDUCATION', 'SEOUL');` → `CREATE TABLE T_LOG (MSG VARCHAR2(20));` → `ROLLBACK;` 을 차례로 실행했다. `SELECT COUNT(*) FROM T_DEPT;` 의 결과는?

A) 4  
B) ROLLBACK 이 실패해 오류가 난다  
C) 5  
D) 0  

**정답: C**  
해설: Oracle 의 DDL 은 실행 전에 열려 있던 트랜잭션을 암묵적으로 COMMIT 한다. CREATE TABLE 이 INSERT 를 확정했으니 ROLLBACK 이 되돌릴 것이 없어 5행이다. 4 는 DDL 의 자동 커밋을 고려하지 않은 답이다. 되돌릴 변경이 없어도 ROLLBACK 은 오류 없이 끝난다. T_DEPT 의 행을 지운 문장은 없어 0 도 아니다.

---

**문제 3.** "트랜잭션 안의 연산은 모두 반영되거나 하나도 반영되지 않아야 한다"는 성질은?

A) 일관성(Consistency)  
B) 원자성(Atomicity)  
C) 고립성(Isolation)  
D) 지속성(Durability)  

**정답: B**  
해설: 전부 아니면 전무(All or Nothing)는 원자성이다. 일관성은 실행 전후로 데이터가 규칙을 지키는 성질이다. 고립성은 실행 중인 트랜잭션의 중간 결과가 다른 트랜잭션에 보이지 않는 성질이다. 지속성은 COMMIT 된 결과가 장애 뒤에도 남는 성질이다.

---

**문제 4.** Oracle 과 SQL Server 의 트랜잭션 처리에 대한 설명으로 옳은 것은?

A) Oracle 은 기본 설정에서 DML 이 끝날 때마다 자동으로 COMMIT 한다  
B) SQL Server 에서는 트랜잭션 안의 DDL 도 ROLLBACK 할 수 없다  
C) Oracle 에서 트랜잭션을 시작하려면 반드시 BEGIN TRAN 을 먼저 실행해야 한다  
D) SQL Server 는 기본이 AUTO COMMIT 이라 DML 문장이 끝나면 바로 확정된다  

**정답: D**  
해설: SQL Server 의 기본 모드는 AUTO COMMIT 이다. 여러 문장을 묶으려면 BEGIN TRAN 을 쓴다. A 는 SQL Server 의 동작을 Oracle 에 붙였다. Oracle 은 명시적 COMMIT 이 필요하다. SQL Server 는 트랜잭션 안의 DDL 도 되돌릴 수 있어 B 는 틀리다. Oracle 은 첫 DML 에서 트랜잭션이 자동으로 시작되어 C 도 틀리다.

---

**문제 5.** DEPT 를 복사한 T_DEPT(10·20·30·40)에서 `SAVEPOINT A;` → `DELETE FROM T_DEPT WHERE DEPTNO = 10;` → `SAVEPOINT A;` → `DELETE FROM T_DEPT WHERE DEPTNO = 20;` → `ROLLBACK TO A;` 를 차례로 실행했다. 이때 T_DEPT 의 행 수는?

A) 4  
B) 2  
C) 3  
D) 같은 이름의 저장점이 있어 ORA-01086 오류가 난다  

**정답: C**  
해설: 같은 이름으로 다시 만든 저장점은 앞의 것을 대신한다. `ROLLBACK TO A` 는 두 번째 A 뒤의 20번 삭제만 취소해 20·30·40 세 행이 남는다. 4 는 첫 번째 A 로 돌아갔다고 본 답이다. 2 는 ROLLBACK TO 가 아무것도 되돌리지 않았다고 본 답이다. 이름이 겹쳐도 오류는 나지 않는다.
