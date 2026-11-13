# Day 1 - The PIVOT and UNPIVOT Clauses

## 📌 Key Takeaways

- `PIVOT (aggregate FOR column IN (value AS alias, …))` turns the values of one column into column headers. Each value in the IN list becomes one result column.
- PIVOT groups by **all the remaining columns** that are used in neither the aggregate nor the FOR clause. That is why you pass only the columns you need through an inline view.
- If you give the aggregate an alias, the result column name is `valuealias_aggregatealias`. With two or more aggregates, aliases are practically required.
- `UNPIVOT (value_column FOR name_column IN (column, …))` does the opposite and turns columns into rows. By default it drops NULL rows; add `INCLUDE NULLS` to keep them.
- Without PIVOT, `SUM(CASE WHEN … THEN … END)` or `SUM(DECODE(…))` with a GROUP BY produces the same table.

## Spreading a Tall Result Sideways

If you total salary by job and department with GROUP BY, you get one row per (job, department) combination. You have to scan 9 rows top to bottom. Put the departments across as columns and you get a 5-row table (one row per job) that is easy to compare at a glance.

```text
GROUP BY JOB, DEPTNO            PIVOT result
JOB       DEPTNO  SUM           JOB        10     20     30
CLERK         10  1300   ──▶    CLERK    1300   1900    950
CLERK         20  1900          MANAGER  2450   2975   2850
CLERK         30   950          …
…
```

- The transformation that turns row values (10, 20, 30) into column names is called PIVOT. The opposite direction is UNPIVOT.
- Oracle supports the PIVOT and UNPIVOT clauses from 11g onward. SQL Server also has PIVOT, but its syntax differs, for example the IN list uses column names in square brackets.

## Basic PIVOT Syntax

```text
SELECT *
FROM (inline view with only the columns to pass in)
PIVOT (
  aggregate_function(value column) [AS aggregate_alias]
  FOR column to spread IN (value1 [AS alias1], value2 [AS alias2], …)
)
[ORDER BY …];
```

| Part | What it does |
|------|-------|
| Aggregate function | Computes the value that goes into each cell. SUM, COUNT, MAX, AVG, etc. |
| FOR column | The column whose values become column headers |
| IN (…) | The list of columns to create in the result. Values not in the list are dropped from the result |
| Remaining columns | Implicitly grouped by. They determine the rows of the result |

Salary totals by job and department.

```sql
SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10, 20, 30)) ORDER BY JOB;
```

```text
JOB               10         20         30
--------- ---------- ---------- ----------
ANALYST                    6000
CLERK           1300       1900        950
MANAGER         2450       2975       2850
PRESIDENT       5000
SALESMAN                              5600
```

- The inline view has three columns: JOB, DEPTNO, and SAL. SAL is used in the aggregate and DEPTNO in FOR, so the remaining column JOB determines the rows.
- A cell with no employee for that combination is NULL. SUM returns NULL when there are no rows to aggregate.
- Without aliases, the column names become `10`, `20`, `30`. Because they start with a digit, you must use double quotes such as `"10"` to refer to them from the outside.

## Aliases in the IN List

Naming columns with `value AS alias` makes them easier to work with in the outer query.

```sql
SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30)) WHERE D30 IS NOT NULL ORDER BY JOB;
```

```text
JOB              D10        D20        D30
--------- ---------- ---------- ----------
CLERK           1300       1900        950
MANAGER         2450       2975       2850
SALESMAN                              5600
```

- The result of PIVOT is a table with columns D10, D20, and D30. WHERE and ORDER BY apply to this table.
- The IN list must be **constants**. When we used a subquery such as `IN (SELECT DEPTNO FROM DEPT)` in the practice container, it raised ORA-00936 (missing expression). Subqueries and `ANY` can be used only with PIVOT XML.
- You may put a value that does not exist in the data into the list. With `IN (10, 20, 30, 40)` a column 40 is created and every cell in it is NULL.

When spreading character values, wrap them in quotes. Here is the headcount by job for each department.

```sql
SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT (COUNT(*) FOR JOB IN ('CLERK' AS CLERK, 'MANAGER' AS MGR, 'SALESMAN' AS SALES)) ORDER BY DEPTNO;
```

```text
    DEPTNO      CLERK        MGR      SALES
---------- ---------- ---------- ----------
        10          1          1          0
        20          2          1          0
        30          1          1          4
```

- COUNT returns **0**, not NULL, when there are no rows to count. This differs from the blank cells in the SUM result.
- When we wrote `IN ('CLERK', 'MANAGER')` without aliases, the column names came out with the quotes included, like `'CLERK'` and `'MANAGER'`.

## Why You Need an Inline View

PIVOT has no separate GROUP BY. Instead it uses **every column not used in the aggregate or in FOR** as the grouping key. If you pass EMP as is, columns such as EMPNO, ENAME, and HIREDATE also become grouping keys.

```sql
SELECT * FROM EMP PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30)) ORDER BY EMPNO FETCH FIRST 4 ROWS ONLY;
```

```text
     EMPNO ENAME      JOB              MGR HIREDATE         COMM        D10        D20        D30
---------- ---------- --------- ---------- ---------- ---------- ---------- ---------- ----------
      7369 SMITH      CLERK           7902 1980-12-17                              800
      7499 ALLEN      SALESMAN        7698 1981-02-20        300                             1600
      7521 WARD       SALESMAN        7698 1981-02-22        500                             1250
      7566 JONES      MANAGER         7839 1981-04-02                             2975
```

- EMPNO differs on every row, so no rows get grouped together. The result stays at 14 rows, and each total is just that employee's salary.
- `SELECT COUNT(*) FROM EMP PIVOT (…)` also returned 14. If you expected 5 rows (one per job), that result is wrong.
- Pass only the columns you need and the rows are grouped at the level you want. Pass only DEPTNO and SAL and no column is left over, so everything collapses into a single row.

```sql
SELECT * FROM (SELECT DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30));
```

```text
       D10        D20        D30
---------- ---------- ----------
      8750      10875       9400
```

| Columns passed in | Grouping key (remaining columns) | Result rows |
|-------|-----------------|--------:|
| All of EMP | EMPNO, ENAME, JOB, MGR, HIREDATE, COMM | 14 |
| JOB, DEPTNO, SAL | JOB | 5 |
| DEPTNO, SAL | None | 1 |

> ⚠️ **Trap**: The number of rows in a PIVOT result is decided not by the IN list but by the **columns left over from the ones you passed in**. Even if an answer choice says "the result comes out by job," if FROM contains just a table name, every column of EMP becomes a grouping key.

## Using Multiple Aggregates

If you list aggregate functions separated by commas, each value in the IN list produces as many columns as there are aggregates. The column name is `valuealias_aggregatealias`.

```sql
SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) AS S, COUNT(*) AS C FOR DEPTNO IN (10 AS D10, 20 AS D20)) ORDER BY JOB;
```

```text
JOB            D10_S      D10_C      D20_S      D20_C
--------- ---------- ---------- ---------- ----------
ANALYST                       0       6000          2
CLERK           1300          1       1900          2
MANAGER         2450          1       2975          1
PRESIDENT       5000          1                     0
SALESMAN                      0                     0
```

- 2 values × 2 aggregates = 4 columns.
- Even for the same cell, SUM shows NULL and COUNT shows 0, so they differ.
- If you give an alias to only one aggregate, only the aliased part goes into the name. For `SUM(SAL) AS TOT FOR DEPTNO IN (10 AS D10, 20)`, the column names were `D10_TOT` and `20_TOT`.
- If you leave the aliases off both aggregates, the column names collide. In the practice container this raised ORA-56907 (duplicate column name).

## UNPIVOT — Turning Columns into Rows

UNPIVOT gathers values scattered across several columns into one column. Which column each value originally came from is recorded in a new name column.

```text
SELECT *
FROM table
UNPIVOT [INCLUDE NULLS | EXCLUDE NULLS] (
  new column to hold the values
  FOR new column to hold the original column names IN (column1 [AS value1], column2 [AS value2], …)
);
```

Turn the SAL and COMM of employees in department 30 into (item, value) rows.

```sql
SELECT EMPNO, ENAME, ITEM, VAL FROM (SELECT EMPNO, ENAME, SAL, COMM FROM EMP WHERE DEPTNO = 30) UNPIVOT (VAL FOR ITEM IN (SAL, COMM)) ORDER BY EMPNO, ITEM;
```

```text
     EMPNO ENAME      ITEM        VAL
---------- ---------- ---- ----------
      7499 ALLEN      COMM        300
      7499 ALLEN      SAL        1600
      7521 WARD       COMM        500
      7521 WARD       SAL        1250
      7654 MARTIN     COMM       1400
      7654 MARTIN     SAL        1250
      7698 BLAKE      SAL        2850
      7844 TURNER     COMM          0
      7844 TURNER     SAL        1500
      7900 JAMES      SAL         950
```

- You might expect 6 employees × 2 columns = 12 rows, but there are 10. BLAKE's and JAMES's COMM are NULL, so no rows were created for them.
- The default is `EXCLUDE NULLS`. TURNER's COMM of 0 is not NULL, so it stays.
- The ITEM column holds the original column names as strings. You can also change them with AS, as in `IN (SAL AS 'SAL', COMM AS 'COMM')`.
- The columns in the IN list must have the same data type. Mixing a number and a string, as in `IN (SAL, ENAME)`, raised ORA-01790.

### INCLUDE NULLS

```sql
SELECT EMPNO, ENAME, ITEM, VAL FROM (SELECT EMPNO, ENAME, SAL, COMM FROM EMP WHERE DEPTNO = 30) UNPIVOT INCLUDE NULLS (VAL FOR ITEM IN (SAL, COMM)) ORDER BY EMPNO, ITEM;
```

```text
     EMPNO ENAME      ITEM        VAL
---------- ---------- ---- ----------
      7499 ALLEN      COMM        300
      7499 ALLEN      SAL        1600
      7521 WARD       COMM        500
      7521 WARD       SAL        1250
      7654 MARTIN     COMM       1400
      7654 MARTIN     SAL        1250
      7698 BLAKE      COMM
      7698 BLAKE      SAL        2850
      7844 TURNER     COMM          0
      7844 TURNER     SAL        1500
      7900 JAMES      COMM
      7900 JAMES      SAL         950
```

- `INCLUDE NULLS` goes right after the UNPIVOT keyword, before the parenthesis.
- This time there are 12 rows. The COMM rows for BLAKE and JAMES remain with empty values.

### Reversing a PIVOT Result

Put the PIVOT result above into a WITH clause and UNPIVOT it, and you get back the tall shape. Use `D10 AS 10` so the original department numbers go in instead of the column names.

```sql
WITH P AS (SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30))) SELECT * FROM P UNPIVOT (SAL FOR DEPTNO IN (D10 AS 10, D20 AS 20, D30 AS 30)) ORDER BY JOB, DEPTNO;
```

```text
JOB           DEPTNO        SAL
--------- ---------- ----------
ANALYST           20       6000
CLERK             10       1300
CLERK             20       1900
CLERK             30        950
MANAGER           10       2450
MANAGER           20       2975
MANAGER           30       2850
PRESIDENT         10       5000
SALESMAN          30       5600
```

- Of the 15 cells (5 rows × 3 columns), 6 NULL cells are dropped, leaving 9 rows. Adding INCLUDE NULLS to the same statement gave 15 rows.
- The 9 rows that came back equal the totals from `GROUP BY JOB, DEPTNO`. But you do not get back the original rows of the 14 employees. Information that was reduced by aggregation cannot be restored by UNPIVOT.

## Building the Same Table Without PIVOT

Before the PIVOT clause existed, people put a condition on each column with CASE or DECODE and wrapped the whole thing in an aggregate function. It is still an easy approach to port to other DBMSs.

```sql
SELECT JOB, SUM(CASE WHEN DEPTNO = 10 THEN SAL END) AS D10, SUM(CASE WHEN DEPTNO = 20 THEN SAL END) AS D20, SUM(CASE WHEN DEPTNO = 30 THEN SAL END) AS D30 FROM EMP GROUP BY JOB ORDER BY JOB;
```

```text
JOB              D10        D20        D30
--------- ---------- ---------- ----------
ANALYST                    6000
CLERK           1300       1900        950
MANAGER         2450       2975       2850
PRESIDENT       5000
SALESMAN                              5600
```

- `CASE WHEN DEPTNO = 10 THEN SAL END` yields SAL only on rows of department 10; on all other rows there is no ELSE, so it yields NULL. SUM skips NULLs, so only the department 10 total remains.
- The grouping that PIVOT did implicitly is written out here as `GROUP BY JOB`. That is why you can use EMP directly in FROM.
- With DECODE it is `SUM(DECODE(DEPTNO, 10, SAL))`. When nothing matches, the default is NULL, so the result is the same as with CASE. DECODE is an Oracle-only function.

| Method | Grouping key | Column names | Other DBMSs |
|------|--------|-------|---------|
| PIVOT clause | Leftover columns from those passed in (implicit) | IN list values or aliases | Syntax differs by DBMS |
| `SUM(CASE …)` + GROUP BY | Columns written in GROUP BY | AS alias | Standard SQL, so it mostly works as is |
| `SUM(DECODE(…))` + GROUP BY | Columns written in GROUP BY | AS alias | Oracle only |

- Conversely, to turn columns into rows without UNPIVOT, write one SELECT per column and join them with UNION ALL.

> Tomorrow we cover the regular expression functions (REGEXP_LIKE, REGEXP_SUBSTR, and others) that find and replace strings by pattern.

## 📖 Glossary

- **PIVOT** : A clause that turns the values of one column into column headers, spreading a tall result sideways.
- **UNPIVOT** : A clause that gathers values scattered across several columns into one column of rows. The opposite direction from PIVOT.
- **FOR column IN (…)** : In PIVOT, the part that specifies the column to spread and the list of columns to create; in UNPIVOT, the list of columns to turn into rows.
- **Implicit GROUP BY** : The behavior where PIVOT uses the remaining columns, those not used in the aggregate or FOR, as the grouping key.
- **INCLUDE NULLS** : An UNPIVOT option that keeps cells whose value is NULL as rows. The default is EXCLUDE NULLS.
- **Crosstab** : A table with classification criteria on both rows and columns and an aggregate in each cell. A PIVOT result has this shape.
- **DECODE** : An Oracle function, `DECODE(expression, value, result, …)`, that picks a result when the value matches. If no value matches, it returns NULL.

## 📝 Practice Questions

**Question 1.** What is the result of `SELECT COUNT(*) FROM EMP PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30));`? (EMP has 14 employees and 5 distinct jobs.)

A) 5  
B) 14  
C) 3  
D) 1  

**Answer: B**  
Explanation: EMP was passed without an inline view, so EMPNO, ENAME, JOB, MGR, HIREDATE, and COMM, everything except SAL and DEPTNO, all become grouping keys. EMPNO differs on every row, so no rows are grouped together, giving 14 rows. 5 is the row count when only JOB, DEPTNO, and SAL are passed in. 3 is the number of values in the IN list and has nothing to do with the row count. 1 is the result when only DEPTNO and SAL are passed in.

---

**Question 2.** Choose the result column names, in order, for `SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) AS TOT FOR DEPTNO IN (10 AS D10, 20));`.

A) JOB, D10, 20  
B) JOB, TOT_D10, TOT_20  
C) JOB, D10_TOT, TOT  
D) JOB, D10_TOT, 20_TOT  

**Answer: D**  
Explanation: When the aggregate has an alias, the column name is `alias of the IN value (or the value itself if none)_aggregate alias`. 10 has the alias D10, so D10_TOT; 20 has no alias, so the value itself gives 20_TOT. A ignores the aggregate alias. B reverses the order of value and aggregate. C drops the value on the 20 side and keeps only the aggregate alias.

---

**Question 3.** What is the result of `WITH P AS (SELECT * FROM (SELECT JOB, DEPTNO, SAL FROM EMP) PIVOT (SUM(SAL) FOR DEPTNO IN (10 AS D10, 20 AS D20, 30 AS D30))) SELECT COUNT(*) FROM P UNPIVOT (SAL FOR DEPTNO IN (D10, D20, D30));`? (P has 5 rows × 3 department columns, and 6 of those cells are NULL.)

A) 9  
B) 15  
C) 5  
D) 6  

**Answer: A**  
Explanation: UNPIVOT defaults to EXCLUDE NULLS, so NULL cells do not become rows. 15 cells minus 6 NULL cells leaves 9 rows. 15 is what you get with `UNPIVOT INCLUDE NULLS`, which keeps the NULL cells. 5 is the original row count of P, and 6 is the number of NULL cells that were discarded.

---

**Question 4.** You want to spread the salary totals of departments 10, 20, and 30 across columns by job, without a PIVOT clause. Which method is appropriate?

A) Write `CASE WHEN DEPTNO = 10 THEN SAL END` for each department in the SELECT clause and do not use GROUP BY  
B) Write `DECODE(DEPTNO, 10, SAL)` for each department and sort with ORDER BY JOB  
C) For each department, wrap the conditional expression in an aggregate function, as in `SUM(CASE WHEN DEPTNO = 10 THEN SAL END)`, and add GROUP BY JOB  
D) Build three SELECTs, one per department, and join them with UNION ALL  

**Answer: C**  
Explanation: You need a conditional expression to keep only each department's values, plus an aggregate function and GROUP BY JOB to gather them into one row per job; only then do you get the same table as PIVOT. A and B have no aggregate and no GROUP BY, so all 14 employee rows remain. Sorting alone does not merge rows. UNION ALL in D stacks rows vertically, which is closer to UNPIVOT.

---

**Question 5.** In `SELECT * FROM (SELECT DEPTNO, JOB FROM EMP) PIVOT (COUNT(*) FOR JOB IN ('SALESMAN' AS S)) ORDER BY DEPTNO;`, what is the value of S on the row for department 10? (Department 10 has no SALESMAN.)

A) NULL  
B) 0  
C) The row for department 10 does not appear  
D) 4  

**Answer: B**  
Explanation: COUNT returns 0 when there are no rows to count. An empty NULL cell is what aggregates such as SUM and MAX produce, so A is wrong. Department 10 has employees, so the row for 10 is created through the grouping key DEPTNO. 4 is the number of SALESMEN in department 30.
