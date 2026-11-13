# Day 3 - Differences Between Oracle and SQL Server

## 📌 Key Takeaways

- String concatenation is `||` in Oracle and `+` in SQL Server. Oracle's `||` skips NULL, while SQL Server's `+` gives NULL when it meets NULL.
- NULL replacement is `NVL` in Oracle and `ISNULL` in SQL Server. `COALESCE`, `NULLIF`, and `CASE` work in both DBs. `DECODE` and `NVL2` exist only in Oracle.
- Oracle treats `''` as NULL and places NULL last in an ascending sort. SQL Server distinguishes `''` from NULL, and NULL comes first in ascending order.
- Top N is `ROWNUM` or `FETCH FIRST` in Oracle and `TOP(n)` in SQL Server. The outer join `(+)`, hierarchical query `CONNECT BY`, and difference `MINUS` are Oracle notation, while SQL Server uses ANSI joins, recursive CTEs, and `EXCEPT`.
- In Oracle you COMMIT explicitly after DML, and DDL is auto-committed. In SQL Server the default is AUTO COMMIT, and inside `BEGIN TRAN` even DDL is rolled back.

## When Another DB's Syntax Is Mixed into the Answer Choices

The notes and practice lab in this track are Oracle-based, but some exam questions say "in SQL Server." In that case, the answer choices mix the syntax of both DBs. If you know the pairs that do the same job, you can immediately eliminate the choice that picks "a function that does not exist in this DB."

Here we gather in one place the differences we pointed out one line at a time in earlier weeks. The practice lab is Oracle, so for Oracle we attach execution results, and for SQL Server we write only the syntax.

| Category | Oracle | SQL Server | Note where it first appeared |
|------|--------|-----------|------------|
| String concatenation | `\|\|`, `CONCAT(a, b)` | `+`, `CONCAT(a, b, …)` | W3 Day 1, 2 |
| NULL replacement | `NVL`, `NVL2`, `COALESCE` | `ISNULL`, `COALESCE` | W3 Day 4 |
| Conditional branching | `DECODE`, `CASE` | `CASE` | W3 Day 4 |
| Substring, length | `SUBSTR`, `LENGTH` | `SUBSTRING`, `LEN` | W3 Day 2 |
| Current date and time | `SYSDATE` | `GETDATE()` | W3 Day 3 |
| Type conversion | `TO_CHAR`, `TO_NUMBER`, `TO_DATE`, `CAST` | `CONVERT`, `CAST` | W3 Day 3 |
| `''` | NULL | Zero-length string | W3 Day 4 |
| NULL in ascending order | Last | First | W4 Day 3 |
| Outer join | `(+)`, ANSI `OUTER JOIN` | ANSI `OUTER JOIN` | W4 Day 4, 5 |
| Set difference | `MINUS` | `EXCEPT` | W5 Day 3 |
| Top N | `ROWNUM`, `FETCH FIRST` | `TOP(n)`, `TOP(n) WITH TIES` | W6 Day 3 |
| Hierarchy expansion | `START WITH … CONNECT BY` | Recursive CTE (`WITH`) | W6 Day 4, 5 |
| Default commit mode | Explicit COMMIT | AUTO COMMIT | W7 Day 4 |
| Column definition change | `ALTER TABLE … MODIFY` | `ALTER TABLE … ALTER COLUMN` | W7 Day 5 |
| Renaming | `RENAME`, `ALTER TABLE … RENAME` | `sp_rename` | W7 Day 5 |
| Auto numbering | `SEQUENCE` | `IDENTITY` | This note |

## Concatenation and Replacing NULL

Oracle's `||` is an operator exclusively for strings. NULL is skipped like an empty string.

```sql
SELECT ENAME || ' / ' || JOB AS EJ, 'A' || NULL || 'B' AS AB FROM EMP WHERE EMPNO = 7839;
```

```text
EJ                     AB
---------------------- --
KING / PRESIDENT       AB
```

SQL Server does the same job with `+`. The `+` handles both addition and concatenation.

```text
SELECT ENAME + ' / ' + JOB FROM EMP WHERE EMPNO = 7839;   -- KING / PRESIDENT
SELECT 'A' + NULL + 'B';                                  -- NULL
SELECT CONCAT('A', NULL, 'B');                            -- AB (CONCAT treats NULL as an empty string)
```

In Oracle, `+` is only an arithmetic operator. If you use it on strings, it tries to convert them to numbers and fails.

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

- Oracle before 23ai shows the same error as a single line, `ORA-01722: invalid number`. The error number is the same.
- By exam standards, Oracle's `CONCAT` takes two arguments (W3 Day 2). SQL Server's `CONCAT` accepts several arguments.

The functions that replace NULL with another value have different names. COALESCE is a standard function, so it is the same in both DBs.

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

- JONES has a NULL COMM, so COALESCE picked the next argument, MGR (7839). KING has NULL for both COMM and MGR, so it ends at the final 0.
- In SQL Server, `ISNULL(COMM, 0)` is the counterpart of `NVL(COMM, 0)`. If you use ISNULL in Oracle, it is a name that does not exist, so you get ORA-00904.

```sql
SELECT ISNULL(COMM, 0) FROM EMP;
```

```text
SELECT ISNULL(COMM, 0) FROM EMP
       *
ERROR at line 1:
ORA-00904: "ISNULL": invalid identifier
```

## Functions That Differ Only in Name

These are functions that do the same job and differ only in name or argument shape.

```sql
SELECT SUBSTR('DATABASE', 1, 4) AS SUB, LENGTH('DATABASE') AS LEN, TO_CHAR(DATE '2026-11-04', 'YYYY/MM/DD') AS CH, CAST('123' AS NUMBER) + 1 AS CA FROM DUAL;
```

```text
SUB         LEN CH                 CA
---- ---------- ---------- ----------
DATA          8 2026/11/04        124
```

Translated to SQL Server, it looks like this.

```text
SELECT SUBSTRING('DATABASE', 1, 4),                 -- DATA (up to SQL Server 2022, the length argument cannot be omitted)
       LEN('DATABASE'),                             -- 8
       CONVERT(VARCHAR(10), GETDATE(), 111),        -- today's date as yyyy/mm/dd
       CAST('123' AS INT) + 1;                      -- 124
```

| Job | Oracle | SQL Server |
|------|--------|-----------|
| Current date and time | `SYSDATE` | `GETDATE()` |
| One day later | `SYSDATE + 1` | `DATEADD(DAY, 1, GETDATE())` |
| Date → string | `TO_CHAR(date, 'format')` | `CONVERT(VARCHAR, date, style_number)` |
| Round up | `CEIL` | `CEILING` |
| Remainder | `MOD(m, n)` | `m % n` |

- `CAST(value AS type)` is standard syntax, so both DBs have it. Only the type names are each DB's own.
- SYSDATE has no parentheses and GETDATE has parentheses. A choice written as `SYSDATE()` or `GETDATE` is a wrong form in both.

## '' and NULL, and Where They Sort

Oracle does not have a separate zero-length string. Writing `''` is the same as NULL.

```sql
SELECT CASE WHEN '' IS NULL THEN 'NULL' ELSE 'NOT NULL' END AS E, LENGTH('') AS L, NVL('', 'EMPTY') AS N FROM DUAL;
```

```text
E                 L N
-------- ---------- -----
NULL                EMPTY
```

- `LENGTH('')` is also NULL, not 0. In SQL Server, `LEN('')` is 0 and `'' IS NULL` is false.

The position of NULL in sorting is also opposite. Oracle treats NULL as the largest value.

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

- In ascending order, BLAKE and JAMES, whose COMM is NULL, came last. If you run the same statement in SQL Server, the two come first.
- If you change to DESC, both flip. In Oracle NULL comes first, and in SQL Server it comes last.
- In Oracle you can set the position directly with `NULLS FIRST` and `NULLS LAST` (W4 Day 3).

> ⚠️ **Check the DBMS stated in the question first.** The two DBs are exactly opposite in where NULL sorts and how `''` is handled. If it says "in SQL Server," read the results above in reverse.

## Cutting the Top N Rows

From Oracle 12c, you attach a row-limiting clause after ORDER BY. If you give `WITH TIES`, rows with the same value as the last row are kept as well.

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

- SCOTT and FORD have the same SAL, so the order between them is not determined by ORDER BY SAL alone. Only the fact that 3 rows remain is certain.

SQL Server puts TOP right after SELECT. The result is the same 3 rows as above.

```text
SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP ORDER BY SAL DESC;
```

- `TOP … WITH TIES` is an error in SQL Server without ORDER BY.
- Oracle's ROWNUM gets its numbers before sorting, so cutting after sorting needs an inline view (W6 Day 3). TOP and FETCH FIRST do not have this pitfall.

## Joins, Sets, and Branching

Writing an outer join with `(+)` in the WHERE clause is notation unique to Oracle. SQL Server accepts only ANSI joins.

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

- ANSI notation also runs as is in Oracle. The one you can use in common across both DBs is ANSI.

The set difference operator is `MINUS` in Oracle and `EXCEPT` in SQL Server.

```sql
SELECT DEPTNO FROM DEPT MINUS SELECT DEPTNO FROM EMP;
```

```text
    DEPTNO
----------
        40
```

- The Oracle 23ai in the practice lab also accepts `EXCEPT` (W5 Day 3). On the exam, treat Oracle's set difference as MINUS.

Choosing a result according to a value can be done in Oracle with both DECODE and CASE. SQL Server has no DECODE, so only CASE is used.

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

## Hierarchical Queries and Recursive CTEs

`START WITH … CONNECT BY PRIOR` is Oracle's hierarchical query syntax. We expand up to 2 levels below KING.

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

SQL Server has no CONNECT BY. It builds the same tree with a WITH clause that references itself (a recursive CTE).

```text
WITH ORG (EMPNO, ENAME, MGR, LVL) AS (
  SELECT EMPNO, ENAME, MGR, 1 FROM EMP WHERE MGR IS NULL        -- starting row (the role of START WITH)
  UNION ALL
  SELECT E.EMPNO, E.ENAME, E.MGR, O.LVL + 1
  FROM EMP E JOIN ORG O ON E.MGR = O.EMPNO                      -- one level down (the role of CONNECT BY)
)
SELECT LVL, ENAME, MGR FROM ORG WHERE LVL <= 2;
```

- The first SELECT is the root, and the SELECT after UNION ALL finds "subordinates of the previous level." It stops when there are no more rows to find.
- There is no pseudo-column like LEVEL. You create a column yourself, like LVL, and count the depth.
- Oracle has also supported recursive WITH since 11g R2. When SQLD says Oracle's hierarchical query, it refers to CONNECT BY.

## Transactions and DDL

We revisit the comparison from W7 Day 4. Even for the same single UPDATE statement, the state after it ends differs.

| Situation | Oracle | SQL Server (default settings) |
|------|--------|-------------------|
| After running one UPDATE statement | A transaction is open. Unconfirmed until COMMIT | Confirmed immediately when the statement ends |
| Followed by ROLLBACK | The UPDATE is canceled | Nothing to undo |
| CREATE, ALTER, TRUNCATE after DML | Auto-commits up to the preceding DML | If inside a transaction, it is bundled together |
| ROLLBACK of DDL inside a transaction | Not possible | Possible |

```text
BEGIN TRAN;
CREATE TABLE T_TEMP (ID INT);
TRUNCATE TABLE ORDERS;
ROLLBACK TRAN;          -- SQL Server: T_TEMP disappears and the rows of ORDERS come back
```

- If you follow the same flow in Oracle, a commit happens at the CREATE, so nothing is left for ROLLBACK to undo.
- Even SQL Server, if `SET IMPLICIT_TRANSACTIONS ON`, must COMMIT explicitly like Oracle. Unless the question says otherwise, assume the default AUTO COMMIT.

## Data Types and DDL Syntax

| Purpose | Oracle | SQL Server |
|------|--------|-----------|
| Variable-length string | `VARCHAR2(n)` | `VARCHAR(n)` |
| Fixed-length string | `CHAR(n)` | `CHAR(n)` |
| Integer | `NUMBER(p)` | `INT` |
| Decimal | `NUMBER(p, s)` | `DECIMAL(p, s)`, `NUMERIC(p, s)` |
| Date and time | `DATE` (to the second) | `DATETIME` |

- Even if you declare `VARCHAR` in Oracle, it is created as VARCHAR2 these days. On the exam, the name of Oracle's variable-length string type is VARCHAR2.
- Oracle's DATE holds not just the date but also hours, minutes, and seconds. In SQL Server, the type that holds only the date is `DATE`, and the type that holds the time too is `DATETIME`.

The statements that modify columns and rename things differ greatly between the two DBs. Oracle lets you list several columns at once inside the parentheses of `MODIFY`.

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

- Because we lengthened the columns to 20, the 15-character name and the 18-character job fit. Had they still been VARCHAR2(10) and VARCHAR2(9) before the lengthening, both would be too long.
- A table name can be changed not only with `RENAME old_name TO new_name` but also with `ALTER TABLE old_name RENAME TO new_name`.

This is the same task translated to SQL Server. `ALTER COLUMN` modifies only one column per statement.

```text
ALTER TABLE T8D3_EMP ALTER COLUMN ENAME VARCHAR(20);
ALTER TABLE T8D3_EMP ALTER COLUMN JOB VARCHAR(20);
EXEC sp_rename 'T8D3_EMP.JOB', 'JOB_NAME', 'COLUMN';
EXEC sp_rename 'T8D3_EMP', 'T8D3_STAFF';
```

| Task | Oracle | SQL Server |
|------|--------|-----------|
| Change column type or length | `ALTER TABLE t MODIFY (column type, …)` | `ALTER TABLE t ALTER COLUMN column type` |
| Change several columns | List them inside the parentheses of one statement | One statement per column |
| Rename a column | `ALTER TABLE t RENAME COLUMN a TO b` | `sp_rename 't.a', 'b', 'COLUMN'` |
| Rename a table | `RENAME a TO b`, `ALTER TABLE a RENAME TO b` | `sp_rename 'a', 'b'` |

## Auto Numbering: SEQUENCE and IDENTITY

When making a key that grows as 1, 2, 3 … such as an order number, Oracle creates a separate sequence object. The practice lab does not support creating sequences, so we only look at the syntax.

```text
-- Oracle: a sequence object separate from the table
CREATE SEQUENCE ORD_SEQ START WITH 1 INCREMENT BY 1;
INSERT INTO ORDERS (ORDER_ID, ITEM) VALUES (ORD_SEQ.NEXTVAL, 'PEN');
SELECT ORD_SEQ.CURRVAL FROM DUAL;

-- SQL Server: IDENTITY attached as a column property
CREATE TABLE ORDERS (ORDER_ID INT IDENTITY(1, 1) PRIMARY KEY, ITEM VARCHAR(20));
INSERT INTO ORDERS (ITEM) VALUES ('PEN');     -- do not write ORDER_ID
```

- A sequence is an object independent of tables, so several tables can share one. You get the next value with `NEXTVAL` and see the value you just got with `CURRVAL`.
- `IDENTITY(seed, increment)` is a property bound to that column. If you leave that column out of INSERT, the value is filled in automatically.
- Nowadays each has the other's approach too, such as Oracle 12c's `GENERATED AS IDENTITY` column and SQL Server 2012's `CREATE SEQUENCE`. In a question contrasting the two DBs, pair Oracle with SEQUENCE and SQL Server with IDENTITY.

> Tomorrow we will regroup all of Subject 1, Data Modeling, focusing on pairs of confusing concepts.

## 📖 Glossary

- **ISNULL** : A SQL Server function that returns its second argument if the first argument is NULL. It corresponds to Oracle's NVL.
- **GETDATE()** : A function that returns the current date and time in SQL Server. It corresponds to Oracle's SYSDATE.
- **CONVERT** : A SQL Server function that converts a value to another type. When converting a date to a string, you choose the format with a style number.
- **TOP(n)** : A keyword used right after SELECT in SQL Server to cut the result to n rows.
- **EXCEPT** : SQL Server's set difference operator. It corresponds to Oracle's MINUS.
- **Recursive CTE** : A WITH clause that references itself. It expands a hierarchy by joining the starting row and the next step with UNION ALL.
- **AUTO COMMIT** : A mode that confirms automatically each time a statement finishes. It is SQL Server's default.
- **sp_rename** : A SQL Server system stored procedure that renames tables and columns.
- **SEQUENCE** : An independent Oracle object that issues sequentially increasing numbers. You get values with NEXTVAL and CURRVAL.
- **IDENTITY** : A property attached to a column in SQL Server that fills in numbers automatically at INSERT.

## 📝 Practice Questions

**Question 1.** What is the result of running `SELECT 'A' || NULL || 'B' AS R FROM DUAL;` in Oracle?

A) AB  
B) NULL  
C) A  
D) ORA-01722 error  

**Answer: A**  
Explanation: Oracle's `||` skips NULL like an empty string, so only A and B are joined, giving AB. NULL is the result when joined as `'A' + NULL + 'B'` in SQL Server. C is a value from mistakenly thinking everything after NULL is dropped. ORA-01722 is the error that occurs when you use `+` on strings and the numeric conversion fails.

---

**Question 2.** Which SQL Server statement produces the same result as Oracle's `SELECT ENAME, NVL(COMM, 0) FROM EMP;`?

A) `SELECT ENAME, NVL(COMM, 0) FROM EMP;`  
B) `SELECT ENAME, DECODE(COMM, NULL, 0, COMM) FROM EMP;`  
C) `SELECT ENAME, ISNULL(COMM, 0) FROM EMP;`  
D) `SELECT ENAME, NULLIF(COMM, 0) FROM EMP;`  

**Answer: C**  
Explanation: In SQL Server, the counterpart of NVL is ISNULL. NVL in A and DECODE in B are Oracle functions, so they do not exist in SQL Server. NULLIF in D is a function that returns NULL if the two values are equal, so it actually turns rows with COMM of 0 into NULL.

---

**Question 3.** You run `SELECT ENAME, COMM FROM EMP ORDER BY COMM;` on EMP, where COMM contains NULLs. Which statement about the position of the NULL rows is correct?

A) In both Oracle and SQL Server, the NULL rows come first  
B) In Oracle the NULL rows come last, and in SQL Server they come first  
C) In Oracle the NULL rows come first, and in SQL Server they come last  
D) In both DBs, the NULL rows are removed from the sorted result  

**Answer: B**  
Explanation: Oracle treats NULL as the largest value and places it last in ascending order, while SQL Server treats it as the smallest value and places it first. A applies SQL Server's behavior to Oracle too. C swaps the two DBs. ORDER BY does not filter rows, so D is also wrong.

---

**Question 4.** In SQL Server, which statement lengthens the ENAME column of the EMP_T table to VARCHAR(30)?

A) `ALTER TABLE EMP_T MODIFY (ENAME VARCHAR(30));`  
B) `ALTER TABLE EMP_T MODIFY COLUMN ENAME VARCHAR(30);`  
C) `ALTER TABLE EMP_T ALTER (ENAME VARCHAR2(30));`  
D) `ALTER TABLE EMP_T ALTER COLUMN ENAME VARCHAR(30);`  

**Answer: D**  
Explanation: SQL Server changes a column definition with `ALTER TABLE … ALTER COLUMN column type`. A is Oracle's MODIFY syntax. `MODIFY COLUMN` in B is not SQL Server syntax. C lacks the COLUMN keyword, and VARCHAR2 is an Oracle type name.

---

**Question 5.** Which is NOT a correct pairing of Oracle syntax with the SQL Server syntax that does the same job?

A) `FETCH FIRST n ROWS ONLY` — `TOP(n)`  
B) `DECODE` — `DECODE`  
C) `SEQUENCE` — `IDENTITY`  
D) `CONNECT BY` — recursive CTE  

**Answer: B**  
Explanation: DECODE exists only in Oracle, so in SQL Server it must be rewritten as CASE. TOP(n) in A is SQL Server's way of limiting rows. C is the representative approach of each DB for creating automatic numbers. The recursive CTE in D is how SQL Server expands a hierarchy.

---
