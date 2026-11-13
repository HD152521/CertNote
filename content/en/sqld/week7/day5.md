# Day 5 - Data Definition Language (DDL) and Data Control Language (DCL)

## 📌 Key Takeaways

- DDL handles table structure. It includes `CREATE`, `ALTER`, `DROP`, `RENAME`, and `TRUNCATE`, and in Oracle it is committed immediately when run.
- There are five constraints: PRIMARY KEY (NOT NULL + no duplicates), UNIQUE (no duplicates, multiple NULLs allowed), NOT NULL, CHECK, and FOREIGN KEY (only values that exist in the parent).
- A FOREIGN KEY's `ON DELETE CASCADE` deletes the children when the parent is deleted, and `ON DELETE SET NULL` changes the children's foreign key to NULL. With no option, a parent that has children cannot be deleted.
- `CREATE TABLE … AS SELECT` (CTAS) copies the structure and data, but of the constraints **only NOT NULL** comes along. DEFAULT is not copied either.
- DCL's `GRANT` and `REVOKE` give and take away privileges. For object privileges, `WITH GRANT OPTION` makes revocation cascade; for system privileges, `WITH ADMIN OPTION` does not cascade.

## CREATE TABLE — Data Types and DEFAULT

```text
CREATE TABLE table (
  column datatype [DEFAULT value] [CONSTRAINT name] [constraint],
  …,
  [CONSTRAINT name] constraint (column, …)   -- table-level constraint
);
```

| Data type | Meaning | Points to note |
|-------|----|--------|
| `NUMBER(p, s)` | A number with p digits in total and s digits after the decimal point | `NUMBER(7,2)` holds at most 99999.99 |
| `VARCHAR2(n)` | Variable-length characters, up to n bytes | Stores only as much as the length you put in |
| `CHAR(n)` | Fixed-length characters of n bytes | Shorter values are padded with trailing spaces to n |
| `DATE` | Date and time (to the second) | If there is no time, it is 00:00:00 |

- `LENGTH(CAST('AB' AS CHAR(5)))` was 5, and `LENGTH(CAST('AB' AS VARCHAR2(5)))` was 2. CHAR pads the leftover space with spaces.
- SQL Server's variable-length character type is `VARCHAR`. `VARCHAR2` is Oracle's name.

## Constraints

| Constraint | What it blocks | NULL | Per table |
|---------|-------|------|-------|
| PRIMARY KEY | NULL and duplicates | Not allowed | One |
| UNIQUE | Duplicates | Multiple rows allowed | Several |
| NOT NULL | NULL | Not allowed | Several (column level only) |
| CHECK | Values for which the condition is false | Allowed (UNKNOWN passes) | Several |
| FOREIGN KEY | Values not in the parent table | Allowed | Several |

We create the constraints with names and try inserting values that violate each one.

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

| Error | Constraint violated | Situation |
|-----|--------|-----|
| ORA-00001 | PRIMARY KEY, UNIQUE | The same value already exists |
| ORA-01400 | NOT NULL (including PK) | You tried to insert NULL |
| ORA-02290 | CHECK | The condition `SAL > 0` is false |
| ORA-02291 | FOREIGN KEY | The value inserted into the child is not in the parent (parent key not found) |
| ORA-02292 | FOREIGN KEY | You tried to delete a parent that a child references (child record found) |

- 23ai appends the column name and an ORA-03301 detail line to ORA-00001. Earlier versions give the single line `ORA-00001: unique constraint (SCOTT.T_DEPT_PK) violated`.
- We dropped the child table T_EMP first. If you reverse the order and DROP the parent first, you get ORA-02449. To drop the parent first, use `DROP TABLE T_DEPT CASCADE CONSTRAINTS` to remove the children's foreign keys along with it.
- A constraint you did not name gets a system name such as `SYS_C008727`. It is hard to tell from the error message which constraint it is.

We checked the relationship between NULL and constraints separately.

- Even when we inserted NULL into a UNIQUE column twice, both went in. NULLs are not regarded as equal to each other.
- Inserting NULL into a `CHECK (A > 0)` column also went in. CHECK blocks only when the condition is FALSE, and lets the UNKNOWN of a NULL comparison pass.
- Inserting NULL into a foreign key column goes in without looking for a parent.

## Delete Options for a FOREIGN KEY

We create three child tables that reference the same parent. Only the option differs.

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

- Department 20 is referenced by T_EMP3, which has no option, so the deletion was rejected. The whole statement failed, so the department 20 rows in T_EMP1 and T_EMP2 are also unchanged.
- When department 30 was deleted, the 6 rows of department 30 employees in T_EMP1, which is CASCADE, were deleted along with it (14 → 8).
- T_EMP2, which is SET NULL, kept all 14 rows, and the DEPTNO of 6 of them became NULL.

| Option | When you delete a parent row |
|-----|--------------|
| None (default) | Rejected if children exist (ORA-02292) |
| `ON DELETE CASCADE` | Child rows are deleted too |
| `ON DELETE SET NULL` | Child rows stay and the foreign key column is changed to NULL |

- Oracle has no `ON UPDATE CASCADE`. SQL Server also supports `ON UPDATE CASCADE` and `SET DEFAULT`.

## CTAS — Copying a Table

`CREATE TABLE new_table AS SELECT …` creates a new table with the structure and rows of the SELECT result as is. Adding `WHERE 1 = 2` copies only the structure.

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

- The original T_DEPT has NOT NULL and CHECK (type C) and PRIMARY KEY (P). The copy T_DEPT2 kept only a single NOT NULL.
- With no PK, DEPTNO 10 went in twice. With no CHECK, LOC 'X' went in too.
- The LOC of 10 SALES is empty. The DEFAULT 'SEOUL' was not copied either.
- NOT NULL stayed, so an INSERT that omits DNAME gives ORA-01400.
- In SQL Server, `SELECT … INTO new_table FROM …` does the same job.

## ALTER · RENAME · TRUNCATE · DROP

| Statement | What it does |
|-----|-------|
| `ALTER TABLE t ADD (column datatype)` | Add a column. The new column is attached at the end |
| `ALTER TABLE t MODIFY (column datatype)` | Change data type, length, DEFAULT, or NOT NULL |
| `ALTER TABLE t DROP COLUMN column` | Drop a column |
| `ALTER TABLE t RENAME COLUMN a TO b` | Rename a column |
| `ALTER TABLE t ADD CONSTRAINT name …` | Add a constraint |
| `ALTER TABLE t DROP CONSTRAINT name` | Drop a constraint |
| `RENAME a TO b` | Rename a table |
| `TRUNCATE TABLE t` | Delete all rows, keep the structure |
| `DROP TABLE t [CASCADE CONSTRAINTS] [PURGE]` | Drop a table |

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

- When you ADD a column with a DEFAULT, existing rows are filled with that value too. BONUS is 0 everywhere.
- A MODIFY that increases the length always works. Shrinking it below the values already stored gives ORA-01441.
- You cannot add a NOT NULL column without a DEFAULT to a table that has rows (ORA-01758), because the new column would be NULL for the existing rows.
- Without `PURGE`, a dropped table goes to the Recycle Bin and can be restored with `FLASHBACK TABLE`. PURGE deletes it immediately without passing through the Recycle Bin.
- SQL Server uses `ALTER TABLE t ALTER COLUMN …` to change a column and `sp_rename` to rename.

## DCL — Granting and Revoking Privileges

DCL creates users and manages privileges. The practice lab account has no privileges, so we look at syntax only, without result tables.

```text
CREATE USER user IDENTIFIED BY password;
GRANT system_privilege [, …] TO user [WITH ADMIN OPTION];
GRANT object_privilege [, …] ON object TO user [WITH GRANT OPTION];
REVOKE privilege [ON object] FROM user;
```

| Aspect | System privileges | Object privileges |
|-----|----------|---------|
| Examples | CREATE SESSION, CREATE TABLE, CREATE VIEW | SELECT, INSERT, UPDATE, DELETE ON table |
| Option that lets the grantee pass it on | `WITH ADMIN OPTION` | `WITH GRANT OPTION` |
| After granting A → B → C, if A revokes B's privilege | Only B's is revoked; C's **remains** | C's privilege is **revoked as well** |

- Whether revocation cascades was checked in the practice container by creating three users (A, B, C).
- `CREATE USER` alone does not let the user connect. The `CREATE SESSION` privilege is needed to log in.

### ROLE

Instead of granting privileges to each user one by one, you create a bundle of privileges (a ROLE) and grant it all at once.

```text
CREATE ROLE R_DEV;
GRANT CREATE SESSION, CREATE TABLE TO R_DEV;
GRANT R_DEV TO KIM;
REVOKE R_DEV FROM KIM;
```

| Predefined ROLE | Privileges it contains (as of 23ai) |
|----------|---------------------|
| CONNECT | Connection privileges such as CREATE SESSION |
| RESOURCE | Object-creation privileges such as CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TRIGGER |
| DBA | Almost all system privileges |

- In the practice container, RESOURCE also contained CREATE VIEW and CREATE SYNONYM. Textbooks for earlier versions say RESOURCE has no CREATE VIEW. For the exam, it is enough to know "CONNECT is for connecting, RESOURCE is for creating objects."

> Next week is the final review before the exam, and we start by revisiting the NULL and COUNT questions that are easy to mix up.

## 📖 Glossary

- **DDL** : Statements that create, change, and remove the structure of objects such as tables. In Oracle they are committed immediately when run.
- **Constraint** : A rule for the values a column may hold. It blocks any INSERT, UPDATE, or DELETE that violates it.
- **Foreign key (FOREIGN KEY)** : A constraint that allows only primary key values of another table (the parent). It preserves referential integrity.
- **CTAS** : `CREATE TABLE … AS SELECT`, a statement that makes a query result into a new table as is.
- **Recycle Bin** : Where a table dropped without PURGE stays for a while. It can be restored with FLASHBACK TABLE.
- **DCL** : Statements that grant and revoke privileges. They are GRANT and REVOKE.
- **ROLE** : A named bundle of several privileges. Used to grant privileges to a user all at once.
- **WITH GRANT OPTION / WITH ADMIN OPTION** : Options that let the recipient pass on the object privilege / system privilege they received.

## 📝 Practice Questions

**Question 1.** A table with PRIMARY KEY, NOT NULL, CHECK, and FOREIGN KEY constraints was copied with `CREATE TABLE … AS SELECT * FROM …`. Which constraint comes along to the new table?

A) PRIMARY KEY  
B) NOT NULL  
C) FOREIGN KEY  
D) CHECK  

**Answer: B**  
Explanation: CTAS copies the column structure and data, but of the constraints it brings only NOT NULL. Because the PRIMARY KEY is gone, the same value can be inserted again. FOREIGN KEY and CHECK are also lost, so recreate them with ALTER TABLE … ADD CONSTRAINT if needed. DEFAULT values are not copied either.

---

**Question 2.** A child table's foreign key is `REFERENCES T_DEPT (DEPTNO) ON DELETE SET NULL`, and there are 6 child rows that reference department 30. What is the result of running `DELETE FROM T_DEPT WHERE DEPTNO = 30;`?

A) The 6 child rows are deleted too  
B) The deletion is rejected with ORA-02292 because child rows exist  
C) The DEPTNO of the child rows is changed to the column's DEFAULT value  
D) The 6 child rows remain and only their DEPTNO becomes NULL  

**Answer: D**  
Explanation: SET NULL deletes the parent row and changes the children's foreign key column to NULL. It does not delete the rows. Deleting the child rows as well is ON DELETE CASCADE. ORA-02292 is the behavior when there is no delete option. Oracle has no SET DEFAULT option.

---

**Question 3.** What is the result of running `ALTER TABLE EMP_T ADD (GRADE NUMBER NOT NULL);` on EMP_T, which has 3 rows?

A) ORA-01758 occurs and the column is not added  
B) The column is added with GRADE filled with NULL for the 3 existing rows  
C) The column is added with GRADE filled with 0 for the 3 existing rows  
D) The column is added and only the NOT NULL constraint is ignored  

**Answer: A**  
Explanation: If you add a NOT NULL column without a DEFAULT to a table that has rows, there is no value to put in the new column of the existing rows. So ORA-01758 (table must be empty to add mandatory column) occurs. Filling with NULL would violate NOT NULL, so B is impossible. To fill with 0 you would have to give `DEFAULT 0` as well. There is no behavior that silently ignores a constraint.

---

**Question 4.** You ran `INSERT INTO T_U VALUES (NULL);` twice on a table created with `CREATE TABLE T_U (A NUMBER UNIQUE);`. What is the result of `SELECT COUNT(*) FROM T_U;`?

A) 1  
B) 0  
C) 2  
D) Because it is a UNIQUE column, NOT NULL is applied together at table creation, so both INSERTs fail  

**Answer: C**  
Explanation: UNIQUE blocks duplicates, but NULLs are not regarded as equal to each other, so it accepts multiple NULL rows. Both INSERTs succeed, giving 2. 1 treats the second NULL as a duplicate. What blocks NULL is PRIMARY KEY and NOT NULL; UNIQUE does not include NOT NULL.

---

**Question 5.** A granted a privilege to B with `GRANT SELECT ON A.T_OBJ TO B WITH GRANT OPTION;`, and B then granted the same privilege to C. After that, A ran `REVOKE SELECT ON A.T_OBJ FROM B;`. What happens to C's privilege?

A) Only B's is revoked and C's privilege remains  
B) C's privilege is revoked as well  
C) REVOKE raises an error because C's privilege must be revoked first  
D) B's privilege remains and only C's privilege is revoked  

**Answer: B**  
Explanation: When you revoke an object privilege that was received with WITH GRANT OPTION, the privileges that user passed on to others are also revoked in a cascade. C's privilege remaining is the behavior when a system privilege was granted with WITH ADMIN OPTION, so A is wrong. Because the revocation cascades automatically, there is no need to follow an order and no error occurs. The REVOKE target is B, so D, where B's privilege remains, is wrong.
