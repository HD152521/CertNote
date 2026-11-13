# Day 5 - Subject 2 Wrap-Up

## 📌 Key Takeaways

- Functions split into **single-row** functions (character, numeric, date, conversion, NULL), which produce one value per row, and **multi-row** functions (aggregates), which fold several rows into one. Window functions aggregate without reducing the rows.
- For multi-row subqueries, use `IN`, `ANY`, `ALL`, and `EXISTS`. `> ANY` means greater than the minimum, `> ALL` means greater than the maximum, and if the subquery is empty, `ALL` is true for every row.
- The number of grouping sets is n + 1 for `ROLLUP`, 2ⁿ for `CUBE`, and for `GROUPING SETS` just the number you list. The number of result rows is the sum of the group counts produced by each grouping set.
- On ties, RANK skips (1, 2, 2, 4), DENSE_RANK does not skip (1, 2, 2, 3), and ROW_NUMBER gives different numbers. If OVER has only ORDER BY, the range is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.
- DELETE is DML so it can be undone, while TRUNCATE and DROP are DDL so they are committed immediately in Oracle. There are five constraints: PK, UNIQUE, NOT NULL, CHECK, and FK.

## Scope of This Note

We re-lay Subject 2 (SQL Basics and Applications, plus management statements), learned in W3 to W7, focusing on confusing pairs. The NULL and COUNT pitfalls are in W8 Day 1, the execution-order and join pitfalls in W8 Day 2, and the Oracle vs SQL Server differences in W8 Day 3, so they are not covered here.

## Functions: Single-Row and Multi-Row

| Category | Representative functions | Where results diverge |
|------|---------|----------------|
| Character | `SUBSTR`, `INSTR`, `LENGTH`, `TRIM`, `LTRIM`, `RTRIM`, `LPAD`, `RPAD`, `REPLACE` | Positions count from 1. If SUBSTR's start is negative, it counts from the end. INSTR returns 0 if not found |
| Numeric | `ROUND`, `TRUNC`, `CEIL`, `FLOOR`, `MOD`, `ABS`, `SIGN` | If the digit count is negative, it cuts in the integer part. CEIL is the larger integer, FLOOR the smaller |
| Date | `SYSDATE`, `ADD_MONTHS`, `MONTHS_BETWEEN`, `LAST_DAY`, `NEXT_DAY` | Date − date = days, date + date = error. If you ADD_MONTHS to a month-end, the result is also a month-end |
| Conversion | `TO_CHAR`, `TO_DATE`, `TO_NUMBER` | These three are Oracle's explicit conversion functions (the standard `CAST` can also be used). Implicit conversion gives results that depend on NLS settings |
| NULL | `NVL`, `NVL2`, `NULLIF`, `COALESCE` | `NVL2(a, b, c)` gives b if a is not NULL. `NULLIF(a, b)` gives NULL if equal, a if different |
| Conditional | `CASE`, `DECODE` | CASE uses only the first true WHEN. DECODE treats NULL and NULL as equal |
| Multi-row | `COUNT`, `SUM`, `AVG`, `MAX`, `MIN` | One value per group. Except for `COUNT(*)`, they skip NULL |

We run the cases where signs and digit counts get mixed up in numeric and character functions all at once.

```sql
SELECT SUBSTR('SQLDEVELOPER', -3, 2) AS SUB, INSTR('SQLDEVELOPER', 'E', 1, 2) AS INS, ROUND(45.678, -1) AS RND, TRUNC(45.678, 1) AS TRC, CEIL(-1.2) AS CL, FLOOR(-1.2) AS FL, MOD(-7, 3) AS MD FROM DUAL;
```

```text
SU        INS        RND        TRC         CL         FL         MD
-- ---------- ---------- ---------- ---------- ---------- ----------
PE          7         50       45.6         -1         -2         -1
```

- `SUBSTR(…, -3, 2)` is two characters starting from the third character from the end, P. `INSTR(…, 'E', 1, 2)` is the position 7 of the second E.
- `ROUND(45.678, -1)` rounds at the ones place to give 50, and `TRUNC(45.678, 1)` keeps up to the first decimal place to give 45.6.
- For negative numbers, CEIL goes toward 0 (−1) and FLOOR goes away from 0 (−2). Oracle's MOD takes the sign of the first argument, giving −1.

## Subqueries: Position and Operators

| Position | Name | Restriction |
|------|------|------|
| SELECT clause | Scalar subquery | Must return only one row and one column |
| FROM clause | Inline view | ORDER BY can be used |
| WHERE, HAVING clause | Nested subquery | ORDER BY cannot be used (ORA-00907) |

| Operator | Meaning | If the subquery result is empty |
|--------|----|----------------|
| `=`, `>`, `<` … | Single-row comparison. If several rows come, ORA-01427 | No comparison target, so 0 rows |
| `IN` | Equal to one of the list | 0 rows |
| `> ANY` | Greater than at least one = greater than the minimum | 0 rows |
| `> ALL` | Greater than all = greater than the maximum | **Every row is true** |
| `EXISTS` | True if the subquery produces even one row | False |

Based on the department 30 salaries (950, 1250, 1250, 1500, 1600, 2850), we count the result rows of three operators side by side. The last column is `> ALL` based on the nonexistent department 99.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE SAL > ANY (SELECT SAL FROM EMP WHERE DEPTNO = 30)) AS GT_ANY, (SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 30)) AS GT_ALL, (SELECT COUNT(*) FROM EMP WHERE SAL IN (SELECT SAL FROM EMP WHERE DEPTNO = 30)) AS IN_CNT, (SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 99)) AS ALL_EMPTY FROM DUAL;
```

```text
    GT_ANY     GT_ALL     IN_CNT  ALL_EMPTY
---------- ---------- ---------- ----------
        12          4          6         14
```

- `> ANY` is the 12 employees greater than 950. Only JAMES at 950 and SMITH at 800 drop out.
- `> ALL` is the 4 employees greater than 2850: KING, FORD, SCOTT, and JONES.
- If there is no value to compare against, `> ALL` has no value to violate "greater than all," so all 14 employees are true.
- If the inside uses an outer column, it is a correlated subquery, and if not, a non-correlated subquery. A correlated subquery is recomputed for each outer row (W5 Day 2).

## Set Operators: Rules for Joining Vertically

| Operator | Result | Duplicates |
|--------|------|------|
| `UNION` | Union | Removed |
| `UNION ALL` | Concatenation | Kept |
| `INTERSECT` | Intersection | Removed |
| `MINUS` | Difference, the second removed from the first | Removed |

- The number of columns (ORA-01789) and the data type family (ORA-01790) must match between the upper and lower SELECTs.
- The result column names are set by the first SELECT. ORDER BY is written only once, at the very end.
- The operators have equal precedence, so they are evaluated from top to bottom.

We compare the row counts of the four operators using the department 10 jobs (CLERK, MANAGER, PRESIDENT) and the department 20 jobs (CLERK 2, ANALYST 2, MANAGER 1).

```sql
SELECT (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS U, (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS UA, (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 INTERSECT SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS I, (SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 20)) AS M FROM DUAL;
```

```text
         U         UA          I          M
---------- ---------- ---------- ----------
         4          8          2          1
```

- UNION ALL is 3 + 5 = 8 rows as is. UNION removes duplicates, leaving the 4 rows CLERK, MANAGER, PRESIDENT, and ANALYST.
- The common ones are the 2 rows CLERK and MANAGER, and the job only in department 10 is the 1 row PRESIDENT.

## ROLLUP, CUBE, GROUPING SETS: Counting Result Rows

Count the rows in two steps. First expand the list of grouping sets, then add the group counts that come out of each grouping set.

| Syntax | Expanded grouping sets | Number of sets |
|------|---------|--------|
| `ROLLUP(A, B)` | (A, B), (A), () | n + 1 = 3 |
| `CUBE(A, B)` | (A, B), (A), (B), () | 2ⁿ = 4 |
| `GROUPING SETS(A, B)` | (A), (B) | 2, as listed |
| `GROUPING SETS((A, B), ())` | (A, B), () | 2 |

The group counts in EMP are 9 (DEPTNO, JOB) combinations, 3 DEPTNO values, 5 JOB values, and 1 grand total.

```sql
SELECT (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY DEPTNO, JOB)) AS BASE, (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY ROLLUP(DEPTNO, JOB))) AS RLP, (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY CUBE(DEPTNO, JOB))) AS CUB, (SELECT COUNT(*) FROM (SELECT DEPTNO, JOB FROM EMP GROUP BY GROUPING SETS(DEPTNO, JOB))) AS GSETS FROM DUAL;
```

```text
      BASE        RLP        CUB      GSETS
---------- ---------- ---------- ----------
         9         13         18          8
```

| Syntax | Calculation | Rows |
|------|------|------|
| `GROUP BY DEPTNO, JOB` | 9 | 9 |
| `ROLLUP(DEPTNO, JOB)` | 9 + 3 + 1 | 13 |
| `CUBE(DEPTNO, JOB)` | 9 + 3 + 5 + 1 | 18 |
| `GROUPING SETS(DEPTNO, JOB)` | 3 + 5 | 8 |

- In ROLLUP, the argument order changes the subtotal basis. With `ROLLUP(JOB, DEPTNO)`, the subtotals are 5 per JOB, so it is 9 + 5 + 1 = 15 rows. CUBE gives the same set of rows regardless of order.
- The collapsed column in a subtotal row appears as NULL. To tell it apart from a genuine NULL, check whether `GROUPING(column)` is 1.

## Window Functions: Ties and the Default Range

We line up department 30 by salary ascending. MARTIN and WARD tie at 1250. The last column is a running sum with only ORDER BY given in OVER.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL) AS RNK, DENSE_RANK() OVER (ORDER BY SAL) AS DRNK, ROW_NUMBER() OVER (ORDER BY SAL, ENAME) AS RN, SUM(SAL) OVER (ORDER BY SAL) AS RUN_SUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL        RNK       DRNK         RN    RUN_SUM
---------- ---------- ---------- ---------- ---------- ----------
JAMES             950          1          1          1        950
MARTIN           1250          2          2          2       3450
WARD             1250          2          2          3       3450
TURNER           1500          4          3          4       4950
ALLEN            1600          5          4          5       6550
BLAKE            2850          6          5          6       9400
```

- After the tie, TURNER's RANK is 4 and DENSE_RANK is 3. ROW_NUMBER was given ENAME as a second key, so MARTIN is fixed at 2 and WARD at 3.
- In RUN_SUM, MARTIN and WARD are both 3450. The default range is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, so rows with the same SAL value are added all at once. To accumulate one row at a time, change it to `ROWS` (W6 Day 2).

| Inside OVER | Calculation range |
|---------|---------|
| Empty `OVER ()` | All rows |
| `PARTITION BY` only | The whole partition |
| Includes `ORDER BY` | From the start of the partition up to the current row's value (RANGE) |

- Window functions are used only in the SELECT and ORDER BY clauses. Using one in WHERE gives ORA-30483, so to filter by rank, wrap it in an inline view.
- `LAST_VALUE` returning the current row's value (when there are no ties in the sort value) is also due to the same default range. If there are ties, the value of the last row with the same sort value comes out.

> ⚠️ **Pitfall**: Rank-function questions ask separately for the "rank after a tie" and the "last rank." The last value of RANK is the row count if there is no tie at the very end, and the last value of DENSE_RANK is the number of distinct values.

## Hierarchical Queries: PRIOR Direction and Terms

| Term | Meaning |
|------|----|
| `START WITH` | The root (starting) row condition |
| `CONNECT BY PRIOR EMPNO = MGR` | Goes down to rows whose MGR equals the EMPNO of an already-found row (forward) |
| `CONNECT BY PRIOR MGR = EMPNO` | Goes up to rows whose EMPNO equals the MGR of an already-found row (reverse) |
| `LEVEL` | Depth where the root is 1 |
| `CONNECT_BY_ISLEAF` | 1 if there are no children in that expansion |
| `CONNECT_BY_ROOT column` | The root value of the tree the row belongs to |
| `SYS_CONNECT_BY_PATH(column, '/')` | The path joined from the root to the current row |
| `ORDER SIBLINGS BY` | Keeps the tree shape and sorts only among siblings |

We start from SMITH and go up.

```sql
SELECT LEVEL, ENAME, CONNECT_BY_ISLEAF AS LEAF FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO ORDER BY LEVEL;
```

```text
     LEVEL ENAME            LEAF
---------- ---------- ----------
         1 SMITH               0
         2 FORD                0
         3 JONES               0
         4 KING                1
```

- Even in reverse, LEVEL is 1 at the starting point. KING, the top of the organization, is LEVEL 4 here.
- Leaf-node judgment also follows the expansion direction. In the reverse expansion, KING has nowhere further up to go, so LEAF is 1.
- A WHERE condition builds the tree and then removes only that row, while a CONNECT BY condition also cuts off the branches below that row.

## PIVOT and UNPIVOT

- `PIVOT (aggregate FOR column IN (value AS alias, …))` turns row values into column headers. **All the remaining columns** not used in the aggregate or FOR become the grouping basis, so you reduce the columns through an inline view before passing it in.
- `UNPIVOT (value_column FOR name_column IN (column, …))` does the opposite and turns columns into rows. NULL rows are discarded by default, and given `INCLUDE NULLS` they are kept.

```sql
SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT (COUNT(*) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30)) ORDER BY JOB;
```

```text
JOB              D10        D20        D30
--------- ---------- ---------- ----------
ANALYST            0          2          0
CLERK              1          2          1
MANAGER            1          1          1
PRESIDENT          1          0          0
SALESMAN           0          0          4
```

- The inline view passes only DEPTNO and JOB, so the remaining one, JOB, is the grouping basis, giving 5 rows. If you pass EMP as is, even EMPNO becomes a grouping basis, giving 14 rows (W7 Day 1).
- COUNT gives 0 if there are no matching rows, and a SUM would have given NULL.

## Regular Expressions: Five Functions

| Function | What it returns |
|------|----------|
| `REGEXP_LIKE(string, pattern)` | A condition (used in WHERE). True if the pattern is anywhere |
| `REGEXP_SUBSTR(string, pattern, start, nth)` | The matched substring |
| `REGEXP_INSTR` | The matched position (0 if none) |
| `REGEXP_REPLACE` | The replaced string. Use `\1` to reuse a parenthesized group |
| `REGEXP_COUNT` | The number of matches |

```sql
SELECT REGEXP_SUBSTR('A12-B345-C6', '[0-9]+', 1, 2) AS SUB, REGEXP_COUNT('A12-B345-C6', '[0-9]') AS CNT, REGEXP_INSTR('A12-B345-C6', '-') AS INS, REGEXP_REPLACE('2026-11-04', '(\d+)-(\d+)-(\d+)', '\3/\2/\1') AS REP FROM DUAL;
```

```text
SUB        CNT        INS REP
--- ---------- ---------- ----------
345          6          4 04/11/2026
```

- The second match of `[0-9]+` is 345. `[0-9]` is one digit character, so the count is 6.
- LIKE requires the whole string to match, while REGEXP_LIKE is satisfied by a partial match. To match the whole, wrap it with `^…$`.

## Management Statements: Dividing into Four

| Category | Commands | Confirmed in Oracle |
|------|-------|--------------|
| DML | `INSERT`, `UPDATE`, `DELETE`, `MERGE` (including `SELECT`) | Confirmed only on COMMIT, can ROLLBACK |
| DDL | `CREATE`, `ALTER`, `DROP`, `RENAME`, `TRUNCATE` | Implicit COMMIT before and after execution |
| DCL | `GRANT`, `REVOKE` | Immediately on execution |
| TCL | `COMMIT`, `ROLLBACK`, `SAVEPOINT` | — |

- Some textbooks separate SELECT as DQL. If there is no DQL among the answer choices, treat it as DML.
- When one DDL runs, uncommitted DML before it is also confirmed together. `ROLLBACK TO savepoint` cancels only what came after that savepoint, and savepoints created after it disappear.

### DELETE, TRUNCATE, DROP

We compare the three statements by "what remains."

| Question | DELETE | TRUNCATE | DROP |
|------|--------|----------|------|
| Category | DML | DDL | DDL |
| Can it delete only some rows? | Yes, with WHERE | No | No |
| ROLLBACK in Oracle | Possible | Not possible | Not possible |
| Table structure after deleting | Remains | Remains | Gone (ORA-00942) |
| Storage space | Stays | Returned | Returned |

### Constraints

| Constraint | NULL | Duplicates | Per table |
|------|------|------|--------|
| PRIMARY KEY | Not allowed | Not allowed | One |
| UNIQUE | Multiple allowed | Not allowed | Several |
| NOT NULL | Not allowed | Allowed | Per column |
| CHECK | Passes if the condition is NULL | Allowed | Several |
| FOREIGN KEY | Allowed | Allowed | Several (only parent PK or UNIQUE values) |

- Without an FK option, a parent row that has children cannot be deleted. `ON DELETE CASCADE` deletes the children too, and `ON DELETE SET NULL` changes the child FK to NULL.
- When copying with CTAS (`CREATE TABLE … AS SELECT`), of the constraints only NOT NULL comes along.
- `WITH GRANT OPTION` on object privileges cascades on REVOKE, while `WITH ADMIN OPTION` on system privileges does not cascade.

## Exam Format

- 50 questions, 90 minutes, all multiple choice, 2 points per question.
- Subject 2, SQL Basics and Applications, is 40 questions and 80 points. Below 40% in any subject is a failure, so for Subject 2, below 32 points (16 questions) is a fail regardless of the total.
- Passing requires a total of 60 points or more with no subject failure in either subject.

Source: the exam information table in content/aws-certs/sqld/README.md (introduction to the Data Qualification SQL certificate, dataq.or.kr, confirmed 2026-11-03).

## 📖 Glossary

- **Single-row function** : A function that produces one result per row. Character, numeric, date, conversion, and NULL functions fall here.
- **Multi-row subquery** : A subquery that returns several rows. Used with `IN`, `ANY`, `ALL`, and `EXISTS`.
- **Grouping set** : Each individual GROUP BY basis that comes out when ROLLUP, CUBE, or GROUPING SETS is expanded. `()` is the grand-total set.
- **Default window range** : The `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` used when OVER has only ORDER BY. It includes tied rows together.
- **Reverse expansion** : A hierarchical query that goes up from child to parent, such as `CONNECT BY PRIOR MGR = EMPNO`.
- **Implicit COMMIT** : The confirmation that happens automatically before and after DDL execution in Oracle.

## 📝 Practice Questions

**Question 1.** The (DEPTNO, JOB) combinations in EMP number 9. What is the result of `SELECT COUNT(*) FROM (SELECT DEPTNO, JOB, COUNT(*) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), ()));`?

A) 13  
B) 10  
C) 9  
D) 18  

**Answer: B**  
Explanation: The expanded grouping sets are two: (DEPTNO, JOB) and the grand total (). Adding 1 grand-total row to the 9 combinations gives 10 rows. 13 is the result of `ROLLUP(DEPTNO, JOB)`, which also adds the 3 DEPTNO subtotal rows. 9 is the value counted by forgetting the `()`. 18 is the result of `CUBE(DEPTNO, JOB)`, which also produces the JOB subtotals.

---

**Question 2.** The department 20 salaries are SCOTT 3000, FORD 3000, JONES 2975, ADAMS 1100, and SMITH 800. In the following SQL, what are the RNK and DRNK values on the JONES row?
`SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) AS RNK, DENSE_RANK() OVER (ORDER BY SAL DESC) AS DRNK FROM EMP WHERE DEPTNO = 20;`

A) 3, 2  
B) 2, 2  
C) 3, 3  
D) 2, 3  

**Answer: A**  
Explanation: The two at 3000 share first place. RANK skips as many as the number of ties, so the next is 3rd place, and DENSE_RANK does not skip, so it is 2nd place. B assumes RANK does not skip either. C assumes DENSE_RANK skips too. D reads the behavior of the two functions swapped.

---

**Question 3.** Department 99 does not exist in EMP. What is the result of `SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 99);`?

A) 0  
B) ORA-01427 error  
C) 1  
D) 14  

**Answer: D**  
Explanation: If the subquery returns 0 rows, the `> ALL` condition has no comparison target to violate, so it is true for every row. So all 14 employees remain. 0 is the result of an operator that becomes false on an empty subquery, such as `> ANY` or `IN`. ORA-01427 is the error when several rows come to a single-row operator, so it does not occur with ALL. 1 is a value with no basis.

---

**Question 4.** Which statement about DELETE, TRUNCATE, and DROP in Oracle is correct?

A) DELETE cannot be used without a WHERE clause  
B) You can attach a WHERE clause to TRUNCATE to delete only some rows  
C) TRUNCATE is DDL so it cannot be undone with ROLLBACK, and the table structure remains  
D) Even after DROP, the table structure remains and you can INSERT right away  

**Answer: C**  
Explanation: TRUNCATE is DDL, so running it is implicitly confirmed and ROLLBACK has no effect. It empties only the rows and keeps the table definition. A is wrong. A DELETE without WHERE deletes all rows. B is wrong. TRUNCATE always deletes all rows. D is wrong. DROP removes even the structure, so later access gives ORA-00942.

---

**Question 5.** In the following SQL, what is the LEVEL value on the KING row? (SMITH's manager is FORD, FORD's manager is JONES, JONES's manager is KING, and KING has no manager)
`SELECT LEVEL, ENAME FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO;`

A) 4  
B) 1  
C) 3  
D) KING is not in the result  

**Answer: A**  
Explanation: `PRIOR MGR = EMPNO` is a reverse expansion that links the manager of an already-found row to the next row. The starting point SMITH is LEVEL 1, then FORD 2, JONES 3, and KING 4. B assumes it is 1 because he is the top of the organization, but LEVEL counts from the START WITH row. C is JONES's LEVEL. D is a mix-up with forward expansion. With forward expansion, it would go down below SMITH and KING would not appear.
