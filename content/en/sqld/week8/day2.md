# Day 2 - Pitfalls Roundup 2 (Execution Order and Joins)

## 📌 Key Takeaways

- A SELECT statement is processed not in the order it is written but in the order **FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY**. A SELECT alias can be used only in ORDER BY, which comes after it.
- WHERE runs before grouping, so it cannot use aggregate functions (ORA-00934), and the SELECT after GROUP BY can contain only grouping columns and aggregates (ORA-00979).
- ROWNUM is assigned at the WHERE stage and ORDER BY comes last. To cut a Top N after sorting, sort first in an inline view. `ROWNUM = 2` and `ROWNUM > 1` are not errors but return 0 rows.
- Joining n tables needs at least n−1 join conditions. Each missing one creates a Cartesian product to that extent. Put `(+)` on the side **that will be filled with NULL** (the deficient side).
- If you put a condition on the inner table of an outer join in WHERE, the NULL rows drop out and it behaves like an inner join. If a single-row subquery returns two or more rows, you get ORA-01427, and BETWEEN includes both endpoints.

## Written Order and Processing Order

A SELECT statement starts with SELECT, but Oracle processes it in a different order. Execution-order problems are solved by recasting them as "is that name visible in this clause?"

| Written order | Processing order | What happens at this step | What is visible at this step |
|:-------:|:-------:|------------------|------------------|
| 1 SELECT | 5 | Computes the expressions to output and assigns aliases | Grouping columns, aggregate results |
| 2 FROM | 1 | Reads and joins the tables | All columns of the tables |
| 3 WHERE | 2 | Filters rows one by one | Table columns (no aggregates or aliases) |
| 4 GROUP BY | 3 | Groups the rows | Table columns |
| 5 HAVING | 4 | Filters the groups | Grouping columns, aggregates |
| 6 ORDER BY | 6 | Sorts the result | SELECT aliases, table columns |

This one table explains the four errors and behaviors below.

### Aliases Only in ORDER BY

ORDER BY comes after SELECT, so the alias already exists.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE DEPTNO = 10 ORDER BY ANNUAL DESC;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
CLARK           29400
MILLER          15600
```

If you use the same alias in WHERE, it is a name that has not been created yet.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

```text
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000
                                                *
ERROR at line 1:
ORA-00904: "ANNUAL": invalid identifier
```

- In WHERE, rewrite the expression itself instead of the alias (`WHERE SAL * 12 > 30000`).
- The exam judges by the rule that SELECT aliases cannot be used in GROUP BY or HAVING either. The Oracle 23ai in our practice lab allows `GROUP BY alias` and `HAVING alias`, so it runs without error (W4 Day 2). In versions before 23ai, it is ORA-00904.

### Aggregate Functions Cannot Be Used in WHERE

WHERE is the stage before grouping rows. The per-department average has not been computed yet.

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO
                                       *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

Move the aggregate condition to HAVING, which filters after grouping.

```sql
SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO HAVING AVG(SAL) > 2000 ORDER BY AVG_SAL DESC;
```

```text
    DEPTNO    AVG_SAL
---------- ----------
        10       2917
        20       2175
```

### Columns Not in GROUP BY Cannot Be Used in SELECT

When you group by department, one department becomes one row. You cannot decide which of the several employee names to show in that one row.

```sql
SELECT DEPTNO, ENAME, SUM(SAL) FROM EMP GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, ENAME, SUM(SAL) FROM EMP GROUP BY DEPTNO
               *
ERROR at line 1:
ORA-00979: "ENAME": must appear in the GROUP BY clause or be used in an aggregate function
```

- The textbook wording is `not a GROUP BY expression`. 23ai also tells you the name of the offending column. The number is the same.
- The opposite direction is fine. Leaving a column that is in GROUP BY out of SELECT is not an error.

### A Non-Aggregate Condition in HAVING

Writing a condition on a grouping column rather than an aggregate in HAVING is not an error either.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING DEPTNO > 10 ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          5
        30          6
```

- The result is the same as filtering first with `WHERE DEPTNO > 10` and then grouping. The WHERE version reduces rows before grouping, and the HAVING version discards groups after everything is grouped.
- The only columns you can use outside an aggregate in HAVING are grouping columns. If you use an ungrouped column, as in `HAVING SAL > 1000`, it is ORA-00979.

| Confusing pair | WHERE | HAVING |
|-----------|-------|--------|
| What it filters | Rows | Groups |
| Aggregate functions | Cannot be used (ORA-00934) | Can be used |
| Non-aggregate conditions | Can be used | Can be used if it is a grouping column |
| Without GROUP BY | Can be used | Can be used. The whole table becomes one group |

## ROWNUM Is Assigned Before Sorting

ROWNUM is a number assigned to rows that pass WHERE. ORDER BY is last in processing order, so within the same SELECT, **numbers are assigned and the cut is made first, and then** sorting happens.

```sql
SELECT ROWNUM, ENAME, SAL FROM EMP WHERE ROWNUM <= 3 ORDER BY SAL DESC;
```

```text
    ROWNUM ENAME             SAL
---------- ---------- ----------
         2 ALLEN            1600
         3 WARD             1250
         1 SMITH             800
```

- It first cut the 3 rows that were read first (SMITH, ALLEN, and WARD in the practice container) and then sorted only those 3 rows. These are not the top 3 by salary. Which 3 rows get read first is not guaranteed either.
- The numbers appearing in the shuffled order 2, 3, 1 is the proof that "numbers were assigned before sorting."

If you move the sort inside an inline view, the numbers are assigned to the sorted result.

```sql
SELECT ROWNUM AS RN, ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3;
```

```text
        RN ENAME             SAL
---------- ---------- ----------
         1 KING             5000
         2 FORD             3000
         3 SCOTT            3000
```

With `ROWNUM = 2`, the first row receives number 1 and is rejected, then the next row becomes a candidate for number 1 again, so number 2 is never created (W6 Day 3).

```sql
SELECT COUNT(*) FROM EMP WHERE ROWNUM = 2;
```

```text
  COUNT(*)
----------
         0
```

- `ROWNUM > 1` is also 0 rows for the same reason. The fact that it does not raise an error is where the answer choices diverge.

## When Join Conditions Are Missing

### Cartesian Product and n−1 Conditions

If you list tables in FROM without a join condition, every row pairs with every other row. That is 14 rows of EMP × 4 rows of DEPT.

```sql
SELECT COUNT(*) FROM EMP, DEPT;
```

```text
  COUNT(*)
----------
        56
```

If you join three tables but write only one condition, a product still arises with the table that has no condition. SALGRADE has 5 rows.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        70
```

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO AND E.SAL BETWEEN S.LOSAL AND S.HISAL;
```

```text
  COUNT(*)
----------
        14
```

| Number of tables | Join conditions needed (minimum) | If one condition is missing |
|--------:|-------------------:|----------------|
| 2 | 1 | 14 × 4 = 56 rows |
| 3 | 2 | (EMP⋈DEPT 14 rows) × SALGRADE 5 rows = 70 rows |
| n | n−1 | Each missing link creates a product |

- The second condition is BETWEEN, not `=`. The n−1 is the number of conditions, and they need not be equality (a non-equi join).

### (+) Goes on the Deficient Side

`(+)` goes on the side **that will be padded with a NULL row** when there is no match. If you want to keep all departments, leave DEPT as it is and put `(+)` on the EMP-side column.

| Side you want to keep | Expression to write | Converted to ANSI |
|------------|--------|-------------|
| All departments | `D.DEPTNO = E.DEPTNO(+)` | `DEPT D LEFT JOIN EMP E` |
| All employees | `E.DEPTNO = D.DEPTNO(+)` | `EMP E LEFT JOIN DEPT D` |

- If you memorize it as "attach it to the side you keep," you get it backwards. The side with the symbol is the side that is short and gets supplemented.

### WHERE After an Outer Join

We want to attach CLERK employees to each department while still showing departments that have no CLERK. In the `(+)` notation, you must put `(+)` on every EMP-side condition for the outer join to hold.

```sql
SELECT D.DNAME, E.ENAME FROM DEPT D, EMP E WHERE D.DEPTNO = E.DEPTNO(+) AND E.JOB(+) = 'CLERK' ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     MILLER
OPERATIONS
RESEARCH       ADAMS
RESEARCH       SMITH
SALES          JAMES
```

If you leave out one `(+)` on `E.JOB`, OPERATIONS disappears.

```sql
SELECT D.DNAME, E.ENAME FROM DEPT D, EMP E WHERE D.DEPTNO = E.DEPTNO(+) AND E.JOB = 'CLERK' ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     MILLER
RESEARCH       ADAMS
RESEARCH       SMITH
SALES          JAMES
```

- For the OPERATIONS row, the outer join filled E.JOB with NULL. Then testing `NULL = 'CLERK'` is not true, so it drops out. The result is the same as an inner join.
- In ANSI notation, the same difference arises between ON and WHERE. `LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND E.JOB = 'CLERK'` gives the 5 rows above, and `ON D.DEPTNO = E.DEPTNO WHERE E.JOB = 'CLERK'` gives 4 rows. In the practice container, each produced the same rows as the two results above.

| Position of the inner table (EMP) condition | When it applies | Department with no match |
|------------------------|--------|-----------|
| WHERE condition with `(+)`, or ON | While pairing | Remains as NULL |
| WHERE condition without `(+)` | After the outer join finishes | Dropped (becomes the same as an inner join) |

> ⚠️ **Pitfall**: In an outer join problem, if WHERE has a condition on a **column of the table that will be NULL-padded** without `(+)`, the number of result rows is the same as an inner join even though you used an outer join. When counting rows for the answer choices, remove the NULL rows first.

### Do Not Put an Alias on the Common Column of NATURAL JOIN or USING

NATURAL JOIN and USING merge the common column into one. The merged column belongs to neither table, so attaching `E.` or `D.` is an error (W4 Day 5).

```sql
SELECT D.DEPTNO, DNAME FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.ENAME = 'KING';
```

```text
SELECT D.DEPTNO, DNAME FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.ENAME = 'KING'
       *
ERROR at line 1:
ORA-25154: column part of USING clause cannot have qualifier
```

```sql
SELECT E.DEPTNO, DNAME FROM EMP E NATURAL JOIN DEPT D WHERE ENAME = 'KING';
```

```text
SELECT E.DEPTNO, DNAME FROM EMP E NATURAL JOIN DEPT D WHERE ENAME = 'KING'
       *
ERROR at line 1:
ORA-25155: column used in NATURAL join cannot have qualifier
```

If you remove the alias, both run. You may attach an alias to `E.ENAME`, which is not a common column.

```sql
SELECT DEPTNO, DNAME FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.ENAME = 'KING';
```

```text
    DEPTNO DNAME
---------- --------------
        10 ACCOUNTING
```

| Join method | Alias on the common column | Error number |
|---------|------------|---------|
| `JOIN … ON` | Must be attached | ORA-00918 if omitted |
| `JOIN … USING (column)` | Must not be attached | ORA-25154 |
| `NATURAL JOIN` | Must not be attached | ORA-25155 |

## Subqueries and Set Operators

### Multiple Rows for a Single-Row Operator

A subquery after a single-row operator such as `=` or `>` must return one row or fewer. The two ANALYSTs both have a salary of 3000, but there are two rows.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE JOB = 'ANALYST');
```

```text
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE JOB = 'ANALYST')
                                        *
ERROR at line 1:
ORA-01427: single-row subquery returns more than one row
```

- Even if the values are the same, it is judged by the number of rows. The number of rows is determined only by running it, so this is a runtime error rather than a parse error.
- If the subquery returns 0 rows, it is not an error. The comparison target becomes NULL and the result is 0 rows. The COUNT(*) of `WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 40)` was 0.
- To accept multiple rows, use `IN`. `SAL IN (SELECT SAL FROM EMP WHERE JOB = 'ANALYST')` gives the two rows FORD and SCOTT.

### UNION and UNION ALL

We stack the jobs in department 10 (3 rows) and department 20 (5 rows) one above the other.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
ANALYST
CLERK
CLERK
CLERK
MANAGER
MANAGER
PRESIDENT
```

| Confusing pair | UNION | UNION ALL |
|-----------|-------|-----------|
| Duplicates | Removed across the whole result | Left as they are |
| Row count | May be less than 3 + 5 (4 here) | Always 3 + 5 = 8 |
| Duplicates within the same side | Removed too | Left as they are |

- UNION removes not only duplicates between the two results but also **duplicates within one side**. The two CLERKs in department 20 become one.
- ORDER BY is written only once, after the entire set operation. When we put it after the first SELECT, we got ORA-03048 in the practice container. The textbook lists it as ORA-00933.

## Boundaries of Conditions

### BETWEEN Includes Both Endpoints

`BETWEEN a AND b` is `>= a AND <= b`. MARTIN and WARD at 1250 and ALLEN at 1600 are all included.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL BETWEEN 1250 AND 1600 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL
---------- ----------
MARTIN           1250
WARD             1250
MILLER           1300
TURNER           1500
ALLEN            1600
```

- You must write the smaller value first. `BETWEEN 1600 AND 1250` is `>= 1600 AND <= 1250`, so it returns 0 rows with no error.
- `NOT BETWEEN a AND b` is `< a OR > b`. The boundary values are excluded from the result.

### _ and ESCAPE in LIKE

`%` is zero or more characters, and `_` is **exactly one character**. These are the employees whose second letter is A.

```sql
SELECT ENAME FROM EMP WHERE ENAME LIKE '_A%' ORDER BY ENAME;
```

```text
ENAME
----------
JAMES
MARTIN
WARD
```

To find `_` itself, put the character designated by ESCAPE in front of it to turn off its wildcard meaning. We apply two patterns to the three values 'A_B', 'AXB', and 'AB'.

```sql
SELECT V FROM (SELECT 'A_B' AS V FROM DUAL UNION ALL SELECT 'AXB' FROM DUAL UNION ALL SELECT 'AB' FROM DUAL) WHERE V LIKE 'A_B' ORDER BY V;
```

```text
V
---
AXB
A_B
```

```sql
SELECT V FROM (SELECT 'A_B' AS V FROM DUAL UNION ALL SELECT 'AXB' FROM DUAL UNION ALL SELECT 'AB' FROM DUAL) WHERE V LIKE 'A\_B' ESCAPE '\' ORDER BY V;
```

```text
V
---
A_B
```

| Pattern | 'A_B' | 'AXB' | 'AB' | Reason |
|-----|:----:|:----:|:---:|-----|
| `'A_B'` | O | O | X | `_` is any single character. 'AB' has no middle character |
| `'A\_B' ESCAPE '\'` | O | X | X | `\_` is the underscore character itself |
| `'A%B'` | O | O | O | `%` can also be zero characters |

- The ESCAPE character is not fixed to `\`. With `ESCAPE '#'`, you write `'A#_B'`. Without an ESCAPE clause, `\` is just an ordinary character.

> Tomorrow we will pair up and organize how the same SQL differs between Oracle and SQL Server (string concatenation, Top N, date functions, and so on).

## 📖 Glossary

- **Logical execution order** : The order in which the clauses of a SELECT statement are processed. It is FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.
- **ORA-00934** : The error when an aggregate function is used where it is not allowed, such as in WHERE.
- **ORA-00979** : The error when a column not in GROUP BY is used in SELECT or HAVING without an aggregate.
- **Cartesian product** : The result of pairing every row of two tables with every other without a join condition. The row count is the product of the two tables' row counts.
- **(+)** : Oracle's outer join notation. It is attached to the column of the side that will be padded with NULL when there is no match.
- **ORA-01427** : The error when a subquery after a single-row operator returns two or more rows.
- **ESCAPE** : The clause that designates the marker character that makes `%` and `_` in a LIKE pattern be searched for literally.

## 📝 Practice Questions

**Question 1.** Which is the correct logical execution order of a SELECT statement?

A) FROM → WHERE → HAVING → GROUP BY → SELECT → ORDER BY  
B) FROM → GROUP BY → WHERE → HAVING → SELECT → ORDER BY  
C) FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY  
D) FROM → WHERE → GROUP BY → SELECT → HAVING → ORDER BY  

**Answer: C**  
Explanation: It reads the table (FROM), filters rows (WHERE), groups (GROUP BY), filters the groups (HAVING), computes the expressions to output (SELECT), and sorts last (ORDER BY). A filters groups before grouping, so it does not hold. B has WHERE after GROUP BY, so it cannot explain why aggregates cannot be used in WHERE. If SELECT came before HAVING as in D, aliases would have to be usable in HAVING, but the exam-standard rule is not that.

---

**Question 2.** What is the result of `SELECT COUNT(*) FROM EMP WHERE ROWNUM = 2;`? (EMP has 14 rows)

A) 0  
B) 1  
C) 14  
D) An error occurs  

**Answer: A**  
Explanation: The first row, as candidate number 1, is tested with `1 = 2` and rejected. A rejected row does not take a number, so the next row also becomes candidate number 1 and is rejected again. Since all 14 rows are the same, the result is 0. 1 is the result for `ROWNUM = 1`. 14 is when every row passes, as with `ROWNUM >= 1`. A ROWNUM comparison is syntactically fine, so no error occurs.

---

**Question 3.** What is the result of `SELECT COUNT(*) FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO WHERE E.JOB = 'CLERK';`? (CLERKs are 1 in department 10, 2 in department 20, and 1 in department 30, and department 40 has no employees)

A) 5  
B) 14  
C) 6  
D) 4  

**Answer: D**  
Explanation: WHERE is applied after the LEFT JOIN finishes. The row for department 40, which has no employees, has E.JOB as NULL, so `NULL = 'CLERK'` is not true and it drops out. What remains is the 4 CLERKs. 5 is the result when the JOB condition is put in ON so that department 40 remains as a NULL row. 14 is the employee count without the JOB condition, and 6 is the headcount of department 30.

---

**Question 4.** What is the result of running `SELECT ENAME FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE JOB = 'ANALYST');`? (The ANALYSTs are the two employees FORD and SCOTT, and both have a salary of 3000)

A) Two rows, FORD and SCOTT, are returned  
B) ORA-01427 occurs  
C) 0 rows are returned  
D) ORA-00934 occurs  

**Answer: B**  
Explanation: `=` is a single-row operator, so the subquery must return one row or fewer. Even though the salary values are the same, the subquery result is two rows, so ORA-01427 (single-row subquery returns more than one row) occurs. A is the result when it is changed to `IN`. C is the result when the subquery returns 0 rows. ORA-00934 is the error for using an aggregate function in WHERE, so it is unrelated here.

---

**Question 5.** What is the result of `SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 1250 AND 1600;`? (There are 2 employees with a salary of 1250 and 1 each with 1300, 1500, and 1600, and the rest are outside this range)

A) 2  
B) 3  
C) 4  
D) 5  

**Answer: D**  
Explanation: BETWEEN includes both endpoints and is the same as `SAL >= 1250 AND SAL <= 1600`. The two at 1250, plus 1300, 1500, and 1600 are all included, giving 5. 2 is the case where both endpoints are excluded (1300, 1500). 3 is the case where the lower endpoint 1250 is excluded, and 4 is the case where the upper endpoint 1600 is excluded.
