# Day 3 - Data Manipulation Language, DML (INSERT·UPDATE·DELETE·MERGE)

## 📌 Key Takeaways

- DML consists of statements that change rows: `INSERT` (add), `UPDATE` (modify), `DELETE` (remove), and `MERGE` (update if it exists, insert if it does not).
- If you omit the column list in INSERT, you must fill **every column in the table's definition order**. Too few values gives ORA-00947, and too many gives ORA-00913.
- Columns left out of the column list get their DEFAULT value, or NULL if there is no DEFAULT. You can also choose the default explicitly with `VALUES (…, DEFAULT)`.
- `DELETE` is DML, so it can be rolled back. `TRUNCATE` is DDL, so it cannot be undone, and it keeps the structure. `DROP` removes the structure too.
- `MERGE INTO target USING source ON (condition)` handles rows that match the condition with `WHEN MATCHED THEN UPDATE` and rows that do not match with `WHEN NOT MATCHED THEN INSERT`.

## Before You Practice — Change the Copies

The DML examples do not change the original EMP and DEPT. In each block, we make a copy with `CREATE TABLE … AS SELECT` and drop it at the end with `DROP TABLE … PURGE`.

- So the first line of each block is `Table created.` and the last line is `Table dropped.`
- The output was captured with SQL*Plus feedback turned on (`SET FEEDBACK ON`). It prints the number of rows processed, such as `1 row created.` or `3 rows updated.`. Blank lines between statements were omitted.
- The copy syntax (CTAS) and PURGE are covered on Day 5.

## INSERT — Adding Rows

```text
INSERT INTO table [(column1, column2, …)] VALUES (value1, value2, …);
INSERT INTO table [(column1, column2, …)] SELECT …;
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

| How you write it | Rule |
|--------|-----|
| With a column list (50) | Give values in the order of the columns you listed. It may differ from the table's definition order |
| Without a column list (60) | Give values for all columns in definition order. Write `NULL` explicitly for any column you want to leave empty |
| Only some columns listed (70) | The omitted LOC gets its DEFAULT value, or NULL if there is none |

- Wrap character and date values in single quotes. Do not wrap numbers.
- If an omitted column has a NOT NULL constraint and no DEFAULT, you get error ORA-01400 (cannot insert NULL).

### Number of Values and DEFAULT

If you define a DEFAULT on a column, that value goes in when an INSERT gives no value for it.

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

- 50 left out LOC, and 60 used the `DEFAULT` keyword, so both received the default SEOUL.
- 70 put in NULL **explicitly**. When you specify a value, DEFAULT is not used.
- 80 gave only two values with no column list, so ORA-00947 (not enough values); 90 gave three values for two columns, so ORA-00913 (too many values). The rows that errored were not inserted.

### INSERT … SELECT

If you use SELECT instead of VALUES, the entire query result goes in at once. Do not use VALUES or parentheses.

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

- `WHERE 1 = 2` is always false, so it creates an empty table: the structure is copied, but no rows.
- A single statement inserted the 3 rows of department 10. The feedback is also `3 rows created.`
- The number and order of the SELECT columns must match the INSERT target columns. The second INSERT left out SAL, so SCOTT's and FORD's SAL are NULL.

## UPDATE — Changing Values

```text
UPDATE table SET column1 = value1 [, column2 = value2 …] [WHERE condition];
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

- Chain multiple columns after SET with commas. The SAL on the right side of `SAL = SAL * 1.1` is the value **before** the change.
- A scalar subquery can determine the value. SMITH's salary became 3000, the highest salary in department 20.
- Wrapping columns in parentheses, as in `SET (JOB, SAL) = (SELECT JOB, SAL …)`, changes several columns with a single subquery.
- If no row matches, it is not an error but `0 rows updated.`
- If you omit WHERE, every row is changed. The last UPDATE set COMM to NULL for all 14 rows.

## DELETE · TRUNCATE · DROP

`DELETE FROM table [WHERE condition];` removes the rows that match the condition. In Oracle you may omit `FROM`.

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

- The 6 rows removed by DELETE came back with ROLLBACK, because that change had not been committed yet.
- TRUNCATE is DDL. The moment it ran, the preceding `DELETE EMP_T` was committed along with it, so even after ROLLBACK there are 0 rows.
- After DROP, the table itself no longer exists, hence ORA-00942. The `"SCOTT"."EMP_T"` notation in the error message is the 23ai format; earlier versions show only `table or view does not exist`.

| Aspect | DELETE | TRUNCATE | DROP |
|------|--------|----------|------|
| Type | DML | DDL | DDL |
| What it removes | Rows matching the condition (WHERE allowed) | All rows (no WHERE) | Rows + table structure |
| ROLLBACK | Possible (before COMMIT) | Not possible (auto-commit) | Not possible (auto-commit) |
| Table structure | Remains | Remains | Gone |
| Storage space | Left as is | Returned to initial size | Returned |
| Speed | Slow, because it logs each row | Fast | Fast |

- In SQL Server, a TRUNCATE run inside `BEGIN TRAN` can be undone with ROLLBACK. The "not possible" in the table above is for Oracle.

> ⚠️ **Trap**: If the requirement is "delete all rows but be able to undo it," the answer is a DELETE without WHERE, not TRUNCATE. If it is "empty it quickly but keep the structure," it is TRUNCATE; if "the table is no longer needed," it is DROP.

## MERGE — Update If It Exists, Insert If It Does Not

When you reflect source data into a target table, you sometimes need to UPDATE rows that already exist and INSERT rows that do not. Instead of writing two separate statements, you handle it with a single MERGE statement.

```text
MERGE INTO target_table alias
USING source (table, view, or subquery) alias
ON (condition joining target and source)
WHEN MATCHED THEN
  UPDATE SET column = value [, …]
WHEN NOT MATCHED THEN
  INSERT (column, …) VALUES (value, …);
```

T_BONUS holds CLARK, KING, and MILLER from department 10 with a bonus of 0. We MERGE the 4 MANAGER and PRESIDENT employees (JONES, BLAKE, CLARK, KING) in as the source.

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

| Source row | ON result | Action | Bonus |
|--------|--------|-----|------|
| CLARK, KING | Exists in the target (MATCHED) | UPDATE | 10% of salary |
| JONES, BLAKE | Not in the target (NOT MATCHED) | INSERT | 5% of salary |
| (MILLER, not in the source) | Not in the source | Left alone | Still 0 |

- The feedback `4 rows merged.` is the sum of 2 UPDATE rows and 2 INSERT rows.
- MERGE is driven by the source. MILLER, who exists only in the target, is neither deleted nor changed.
- You do not write the table name again inside the UPDATE and INSERT clauses. They continue directly as `UPDATE SET …` and `INSERT (…) VALUES (…)`.

### Rules of MERGE

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

- A column used in the ON clause cannot be changed in UPDATE SET (ORA-38104), because changing the join key would destabilize the matching.
- You may write just one of WHEN MATCHED and WHEN NOT MATCHED. The second MERGE used only the INSERT clause and inserted the 5 employees of department 20. In Oracle 9i both were required; from 10g you can use just one.
- That is why COUNT is 8, the existing 3 rows plus 5.
- From 10g you can append `UPDATE SET … WHERE condition` and `DELETE WHERE condition` to the MATCHED clause.
- If two source rows match one target row, the same row would be modified twice, which raises ORA-30926. The source must have one row per ON-column value.

> Tomorrow we cover TCL (COMMIT, ROLLBACK, SAVEPOINT), which confirms or undoes DML changes, and transactions.

## 📖 Glossary

- **DML** : Statements that change the contents of rows. They are INSERT, UPDATE, DELETE, and MERGE.
- **Column list** : The column names written in parentheses after the table name in INSERT. It specifies which columns receive values and in what order.
- **DEFAULT** : The default value that goes into a column when no value is given. You can also write it directly as a keyword inside `VALUES`.
- **INSERT … SELECT** : An INSERT that inserts all rows of a query result in a single statement. It does not use VALUES.
- **TRUNCATE** : A DDL statement that removes all rows of a table and returns the space. The structure remains, and it cannot be rolled back.
- **MERGE** : A statement that compares the source and the target by the ON condition, doing UPDATE where they match and INSERT where they do not.
- **ORA-00947 / ORA-00913** : The errors when the INSERT values are fewer than the columns / more than the columns.

## 📝 Practice Questions

**Question 1.** You ran `INSERT INTO T_DEPT (DEPTNO, DNAME) VALUES (50, 'EDUCATION');` on a table created with `CREATE TABLE T_DEPT (DEPTNO NUMBER(2), DNAME VARCHAR2(14), LOC VARCHAR2(13) DEFAULT 'SEOUL');`. What is the LOC value of this row?

A) NULL  
B) An empty string `''`  
C) ORA-00947 occurs because there are too few values, and the row is not inserted  
D) SEOUL  

**Answer: D**  
Explanation: A column omitted from the column list receives its DEFAULT value. LOC's DEFAULT is 'SEOUL', so the value is SEOUL. NULL would be the result if there were no DEFAULT or if NULL had been written explicitly. In Oracle an empty string is treated as NULL, so B is also wrong. A column list is present and its count equals the number of values, so ORA-00947 does not occur.

---

**Question 2.** What is the result of running `INSERT INTO T_DEPT VALUES (80, 'SUPPORT');` on T_DEPT(DEPTNO, DNAME, LOC), a copy of DEPT?

A) One row is inserted with LOC as NULL  
B) ORA-00947 (not enough values) occurs  
C) One row is inserted with LOC set to the DEFAULT value  
D) ORA-00913 (too many values) occurs  

**Answer: B**  
Explanation: If you omit the column list, you must give a value for every column. Two values for three columns gives ORA-00947, and the row is not inserted. Filling the empty column with NULL or DEFAULT is the behavior when you use a column list to leave a column out, so A and C are wrong. ORA-00913 is the error when there are more values than columns.

---

**Question 3.** Which statement about Oracle's DELETE, TRUNCATE, and DROP is correct?

A) DELETE is auto-committed, so it cannot be undone with ROLLBACK  
B) DROP TABLE removes only the rows and keeps the table structure  
C) TRUNCATE is DDL, so it cannot be undone with ROLLBACK, and the table structure remains  
D) Adding WHERE to TRUNCATE lets you remove only the rows that match the condition  

**Answer: C**  
Explanation: TRUNCATE is DDL that removes all rows, and it is committed as soon as it runs. The table definition remains. DELETE is DML and can be rolled back before COMMIT, so A is wrong. It is TRUNCATE that keeps the structure, while DROP removes the structure as well. TRUNCATE does not accept WHERE.

---

**Question 4.** T_BONUS has 3 rows: CLARK, KING, and MILLER. After running `MERGE INTO T_BONUS B USING (…) E ON (B.EMPNO = E.EMPNO) WHEN MATCHED THEN UPDATE SET … WHEN NOT MATCHED THEN INSERT …` with a source of 4 rows (JONES, BLAKE, CLARK, KING), how many rows does T_BONUS have?

A) 5  
B) 4  
C) 7  
D) 3  

**Answer: A**  
Explanation: CLARK and KING exist in the target, so they are UPDATEd; JONES and BLAKE do not, so they are INSERTed. MILLER, who exists only in the target, stays as is, so 3 + 2 = 5 rows. 4 assumes MERGE replaces the target with the source. 7 is what you get if all 4 source rows were INSERTed. 3 is what you get with only UPDATE and no INSERT.

---

**Question 5.** You ran `UPDATE EMP_T SET COMM = 0 WHERE ENAME = 'NOBODY';` on EMP_T, a copy of EMP. No employee is named NOBODY. What is the result in SQL*Plus?

A) ORA-01403 (no data found) occurs  
B) ORA-00942 occurs  
C) `1 row updated.`  
D) `0 rows updated.`  

**Answer: D**  
Explanation: An UPDATE whose WHERE matches no rows finishes without an error, having processed 0 rows. ORA-01403 is the error raised in PL/SQL when SELECT INTO finds no row. ORA-00942 is the error when a table does not exist, but EMP_T exists. No row changed, so it is not 1 row either.
