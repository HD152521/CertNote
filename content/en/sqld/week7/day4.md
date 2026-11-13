# Day 4 - Transaction Control Language, TCL (COMMIT·ROLLBACK·SAVEPOINT)

## 📌 Key Takeaways

- A transaction is a group of operations that must succeed together or be cancelled together. Its properties are atomicity, consistency, isolation, and durability (ACID).
- `COMMIT` makes changes permanent, and `ROLLBACK` cancels all changes since the last COMMIT. `ROLLBACK TO savepoint` cancels only what came after that savepoint.
- When you `ROLLBACK TO` a savepoint, any savepoints created **after** it disappear. A savepoint recreated with the same name overwrites the earlier one.
- In Oracle, DDL (CREATE, ALTER, DROP, TRUNCATE) performs an **implicit COMMIT** before and after it runs. Any DML before it is committed along with it.
- Oracle requires an explicit COMMIT after DML. SQL Server defaults to AUTO COMMIT, so each statement is committed immediately.

## Transactions Through a Bank Transfer

A transfer that takes 100,000 won out of account A and puts 100,000 won into account B is two UPDATE statements. If only the first statement takes effect and the second fails, the money vanishes. The two statements must **both take effect or both be cancelled**.

- DML statements grouped as one logical unit of work like this are called a transaction.
- The commands that confirm or cancel a transaction are TCL (Transaction Control Language): COMMIT, ROLLBACK, and SAVEPOINT.

| Property | Name | Meaning | Transfer example |
|-----|-----|----|---------|
| Atomicity | Atomicity | Everything takes effect, or nothing does | It never happens that the withdrawal succeeds but the deposit does not |
| Consistency | Consistency | Data obeys the rules (constraints) before and after execution | The sum of the two account balances stays the same |
| Isolation | Isolation | Other transactions cannot see the intermediate results of a running transaction | The balance at the moment only the withdrawal has happened is invisible to others |
| Durability | Durability | Committed results survive failures | After COMMIT, the transfer result remains even if the server shuts down |

## COMMIT and ROLLBACK

```text
COMMIT;                     -- make all changes so far permanent
ROLLBACK;                   -- cancel all changes since the last COMMIT
SAVEPOINT name;             -- create an intermediate savepoint
ROLLBACK TO [SAVEPOINT] name; -- cancel only the changes after the savepoint
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

- Department 50 was made permanent by COMMIT. The later ROLLBACK cannot undo it.
- The DELETE that removed department 10 was before a COMMIT, so ROLLBACK cancelled it.
- The feedback messages are `Commit complete.` and `Rollback complete.`

### State Before and After COMMIT and ROLLBACK

| Point in time | Session that made the change | Other sessions | Locks |
|-----|----------|---------|-----|
| Right after DML (before COMMIT) | Sees the changed values | Sees the values from **before** the change | Held on the changed rows |
| After COMMIT | Changed values | Changed values | Released |
| After ROLLBACK | Original values | Original values | Released |

- Other sessions cannot see changes before COMMIT, because of isolation. Oracle shows other sessions the pre-change values so that reads are not blocked.
- If another session tries to UPDATE or DELETE the same row, it waits until the lock is released.
- The blocks in the practice lab run in a single session, so you cannot see this difference directly. You can verify it by opening two SQL*Plus windows.

## SAVEPOINT — Undoing Only Part of the Work

ROLLBACK cancels everything since the last COMMIT. To cancel only the latter part of a long transaction, set savepoints along the way.

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

Here it is in chronological order.

```text
CTAS ─ CLARK=1000 ─ [SP1] ─ KING=2000 ─ [SP2] ─ delete MILLER
                                          ◀── ROLLBACK TO SP2 : MILLER restored
                       ◀────────────────────── ROLLBACK TO SP1 : KING restored, SP2 gone
 ◀──────────────────────────────────────────── ROLLBACK        : CLARK restored
```

- `ROLLBACK TO SP2` cancelled only the DELETE that came after SP2. The changes to CLARK and KING remain.
- After `ROLLBACK TO SP1`, trying to go back to SP2 raised ORA-01086, because SP2, created after SP1, had already disappeared.
- `ROLLBACK TO` does not end the transaction. The final ROLLBACK cancelled everything, including CLARK's change.
- CTAS is DDL, so it was committed at that point. Even after ROLLBACK, the EMP_T table itself remains.

### Savepoints with the Same Name

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

- The second `SAVEPOINT A` replaces the first A. So `ROLLBACK TO A` restored only department 20.
- Once the transaction ends with ROLLBACK or COMMIT, all savepoints disappear. That is why the final `ROLLBACK TO A` gives ORA-01086.

> ⚠️ **Trap**: With several savepoints, `ROLLBACK TO` goes back to **the savepoint whose name you wrote**, not to the most recent savepoint. Savepoints and changes after it are all gone, and changes before it remain.

## Auto-Commit — When Changes Are Committed Without You Intending It

### DDL Performs an Implicit COMMIT

Oracle COMMITs any open transaction before executing DDL, and COMMITs again when the DDL finishes.

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

- We did not write COMMIT after the INSERT, but running `CREATE TABLE T_LOG` committed it along with itself. Even after ROLLBACK, there are 5 rows.
- It is the same even for DDL on another table that seems unrelated. TRUNCATE, ALTER, DROP, and GRANT all have the same effect.

| When it is automatically COMMITted | When it is automatically ROLLed BACK |
|---------------------|----------------------|
| Running DDL (CREATE, ALTER, DROP, TRUNCATE, RENAME) | When the session ends abnormally |
| Running DCL (GRANT, REVOKE) | When the DB goes down due to a failure (uncommitted changes) |
| Exiting SQL*Plus normally with EXIT | |

### When a Single Statement Fails

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

- Only the failed INSERT was cancelled, and the earlier INSERT of department 50 stayed in the transaction. This is called statement-level rollback.
- An error does not cancel the whole transaction. The COMMIT that followed made row 50 permanent.

## Oracle and SQL Server

| Aspect | Oracle | SQL Server |
|------|--------|-----------|
| Default mode | Requires an explicit COMMIT | AUTO COMMIT. Each statement is committed immediately |
| Starting a transaction | Starts automatically when the first DML runs | Stated explicitly with `BEGIN TRAN` |
| Savepoints | `SAVEPOINT name` / `ROLLBACK TO name` | `SAVE TRAN name` / `ROLLBACK TRAN name` |
| DDL and transactions | Implicit COMMIT. Cannot be undone | DDL inside a transaction can also be rolled back |

To group several statements into one in SQL Server, write it like this.

```text
BEGIN TRAN;
UPDATE ACCOUNT SET BAL = BAL - 100000 WHERE ID = 'A';
UPDATE ACCOUNT SET BAL = BAL + 100000 WHERE ID = 'B';
COMMIT TRAN;      -- if there is a problem, ROLLBACK TRAN;
```

- In SQL Server too, `SET IMPLICIT_TRANSACTIONS ON` puts you in implicit-transaction mode, where you must COMMIT yourself, as in Oracle.
- The practice lab and the blocks in these notes are based on Oracle. In the practice container, SQL*Plus's `SHOW AUTOCOMMIT` showed `autocommit OFF`.

> Tomorrow we cover DDL (CREATE, ALTER, DROP), which creates and modifies tables, along with constraints, and DCL (GRANT, REVOKE), which grants and revokes privileges.

## 📖 Glossary

- **Transaction** : A group of operations that must be committed together or cancelled together. The logical unit in which a database processes work.
- **TCL** : Commands that control transactions. They are COMMIT, ROLLBACK, and SAVEPOINT.
- **ACID** : The four properties a transaction must uphold. The initials of atomicity, consistency, isolation, and durability.
- **Savepoint (SAVEPOINT)** : A marker set in the middle of a transaction. ROLLBACK TO undoes work only back to that point.
- **Implicit COMMIT** : Changes being committed automatically, even though the user did not write COMMIT, when DDL or DCL runs or on a normal exit.
- **AUTO COMMIT** : A mode that COMMITs automatically each time a single statement finishes. It is the default in SQL Server.
- **Statement-level rollback** : The behavior of cancelling only the changes of the one failed statement while keeping earlier changes in the same transaction.

## 📝 Practice Questions

**Question 1.** On EMP_T (CLARK 2450, KING 5000, MILLER 1300), the following were run in order: `UPDATE EMP_T SET SAL = 1000 WHERE ENAME = 'CLARK';` → `SAVEPOINT SP1;` → `UPDATE EMP_T SET SAL = 2000 WHERE ENAME = 'KING';` → `SAVEPOINT SP2;` → `DELETE FROM EMP_T WHERE ENAME = 'MILLER';` → `ROLLBACK TO SP1;` → `COMMIT;`. What is KING's committed SAL?

A) 5000  
B) 2000  
C) The KING row does not exist  
D) 1000  

**Answer: A**  
Explanation: `ROLLBACK TO SP1` cancels the changes after SP1, that is, KING's 2000 and the deletion of MILLER. KING is committed back at its original value of 5000. 2000 is the value if you had gone back to SP2. KING was never deleted. 1000 is CLARK's value, changed before SP1.

---

**Question 2.** On T_DEPT (4 rows), a copy of DEPT, the following were run in order: `INSERT INTO T_DEPT VALUES (50, 'EDUCATION', 'SEOUL');` → `CREATE TABLE T_LOG (MSG VARCHAR2(20));` → `ROLLBACK;`. What is the result of `SELECT COUNT(*) FROM T_DEPT;`?

A) 4  
B) ROLLBACK fails and an error occurs  
C) 5  
D) 0  

**Answer: C**  
Explanation: Oracle DDL implicitly COMMITs any transaction that was open before it. CREATE TABLE committed the INSERT, so ROLLBACK has nothing to undo, giving 5 rows. 4 ignores the auto-commit of DDL. ROLLBACK finishes without an error even when there are no changes to undo. No statement deleted rows from T_DEPT, so it is not 0 either.

---

**Question 3.** Which property says "all operations in a transaction must take effect, or none of them may"?

A) Consistency  
B) Atomicity  
C) Isolation  
D) Durability  

**Answer: B**  
Explanation: All or nothing is atomicity. Consistency is the property that data obeys the rules before and after execution. Isolation is the property that the intermediate results of a running transaction are not visible to other transactions. Durability is the property that COMMITted results survive failures.

---

**Question 4.** Which statement about transaction handling in Oracle and SQL Server is correct?

A) Oracle automatically COMMITs every time a DML statement finishes in its default configuration  
B) In SQL Server, even DDL inside a transaction cannot be rolled back  
C) To start a transaction in Oracle, you must always run BEGIN TRAN first  
D) SQL Server defaults to AUTO COMMIT, so a DML statement is committed as soon as it finishes  

**Answer: D**  
Explanation: SQL Server's default mode is AUTO COMMIT. To group several statements you use BEGIN TRAN. A attributes SQL Server's behavior to Oracle; Oracle needs an explicit COMMIT. SQL Server can also undo DDL inside a transaction, so B is wrong. In Oracle a transaction starts automatically with the first DML, so C is also wrong.

---

**Question 5.** On T_DEPT (10, 20, 30, 40), a copy of DEPT, the following were run in order: `SAVEPOINT A;` → `DELETE FROM T_DEPT WHERE DEPTNO = 10;` → `SAVEPOINT A;` → `DELETE FROM T_DEPT WHERE DEPTNO = 20;` → `ROLLBACK TO A;`. How many rows does T_DEPT have now?

A) 4  
B) 2  
C) 3  
D) ORA-01086 occurs because a savepoint with the same name exists  

**Answer: C**  
Explanation: A savepoint recreated with the same name replaces the earlier one. `ROLLBACK TO A` cancels only the deletion of department 20 after the second A, leaving 3 rows: 20, 30, and 40. 4 assumes it went back to the first A. 2 assumes ROLLBACK TO undid nothing. No error occurs even when the names overlap.
