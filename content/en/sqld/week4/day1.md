# Day 1 - GROUP BY and Aggregate Functions

## 📌 Key Takeaways

- **`COUNT(*)` counts rows**, **`COUNT(column)` counts the rows where that column is not NULL**, and `COUNT(DISTINCT column)` is the number of distinct values, excluding NULL.
- Aggregate functions **skip NULL when they calculate**. That is why `AVG(COMM)` (550) and `AVG(NVL(COMM,0))` (157.14…) differ.
- If no row matches the condition, **`COUNT` returns 0, while `SUM`, `AVG`, `MAX`, and `MIN` return NULL**.
- When `GROUP BY` is present, SELECT can contain **only GROUP BY columns and aggregate functions**. Break that rule and you get ORA-00979.
- Mixing an aggregate function with a plain column without GROUP BY gives ORA-00937.

## Many Rows into One Value — Aggregate Functions

An aggregate function squeezes the 14 rows of EMP into a single value such as "how many employees are there?" or "what is the total salary?". It takes many rows and returns **one value**.

| Function | Returns | Accepted data types |
|------|------------|-----------|
| `COUNT` | Number of rows | Any data type, `*` |
| `SUM` | Total | Numbers |
| `AVG` | Average | Numbers |
| `MAX` / `MIN` | Maximum / minimum | Numbers, characters, dates |
| `STDDEV` | Standard deviation | Numbers |
| `VARIANCE` | Variance | Numbers |

```sql
SELECT SUM(SAL), AVG(SAL), MIN(SAL), MAX(SAL) FROM EMP;
```

```text
  SUM(SAL)   AVG(SAL)   MIN(SAL)   MAX(SAL)
---------- ---------- ---------- ----------
     29025 2073.21429        800       5000
```

- The 14 salaries add up to 29025, and the average is 29025 ÷ 14 = 2073.21….
- With no WHERE clause, the whole table is **one group**, so the result is **one row**.

`MAX` and `MIN` are not only for numbers. Characters are compared in dictionary order and dates in chronological order.

```sql
SELECT MIN(HIREDATE), MAX(HIREDATE), MIN(ENAME), MAX(ENAME) FROM EMP;
```

```text
MIN(HIREDA MAX(HIREDA MIN(ENAME) MAX(ENAME)
---------- ---------- ---------- ----------
1980-12-17 1987-05-23 ADAMS      WARD
```

- The earliest hire date is 1980-12-17 (SMITH) and the latest is 1987-05-23 (ADAMS).
- In alphabetical order, `ADAMS` is the smallest name and `WARD` is the largest.
- If you pass a character column to `SUM` or `AVG`, it cannot be converted to a number and you get an error. The functions that work on characters and dates are `COUNT`, `MAX`, and `MIN`.

The results for standard deviation and variance are long, so we shorten them with `ROUND`.

```sql
SELECT ROUND(STDDEV(SAL), 2) AS SD, ROUND(VARIANCE(SAL), 2) AS VAR FROM EMP;
```

```text
        SD        VAR
---------- ----------
    1182.5 1398313.87
```

- `VARIANCE` is the variance and `STDDEV` is its square root. 1182.5 × 1182.5 ≈ 1398306, which matches within rounding error.

## The Three Faces of COUNT

Even for the same `COUNT`, what it counts depends on what you put in the parentheses.

```sql
SELECT COUNT(*), COUNT(COMM), COUNT(DISTINCT JOB), COUNT(MGR) FROM EMP;
```

```text
  COUNT(*) COUNT(COMM) COUNT(DISTINCTJOB) COUNT(MGR)
---------- ----------- ------------------ ----------
        14           4                  5         13
```

| Expression | What it counts | Result | Why |
|----|--------|-----:|------|
| `COUNT(*)` | The rows themselves | 14 | Every row, whether or not it has NULL |
| `COUNT(COMM)` | Rows where COMM is not NULL | 4 | ALLEN, WARD, MARTIN, TURNER |
| `COUNT(DISTINCT JOB)` | Distinct JOB values | 5 | CLERK, SALESMAN, MANAGER, ANALYST, PRESIDENT |
| `COUNT(MGR)` | Rows where MGR is not NULL | 13 | Only KING has a NULL MGR |

- TURNER's COMM is **0**. Zero is not NULL, so it is included in `COUNT(COMM)`.
- Only `COUNT(*)` counts rows that contain NULL, because it only looks at whether the row exists.

Even with `DISTINCT`, NULL is still left out.

```sql
SELECT COUNT(DISTINCT MGR) AS M1, COUNT(MGR) AS M2 FROM EMP;
```

```text
        M1         M2
---------- ----------
         6         13
```

- The MGR values are six distinct ones: 7902, 7698, 7839, 7566, 7782, and 7788. KING's NULL is not counted as a kind of value either.
- `COUNT(DISTINCT column)` is "the count after removing duplicates", and NULL is filtered out before that.

## Aggregate Functions Skip NULL

Every aggregate function except `COUNT(*)` treats **rows with NULL as if they did not exist**. This property changes the result of an average.

```sql
SELECT AVG(COMM), AVG(NVL(COMM, 0)), SUM(COMM), COUNT(COMM) FROM EMP;
```

```text
 AVG(COMM) AVG(NVL(COMM,0))  SUM(COMM) COUNT(COMM)
---------- ---------------- ---------- -----------
       550       157.142857       2200           4
```

| Expression | Numerator | Denominator | Result |
|----|-----:|-----:|-----:|
| `AVG(COMM)` | 2200 | **4** (rows that are not NULL) | 550 |
| `AVG(NVL(COMM,0))` | 2200 | **14** (all rows, after turning NULL into 0) | 157.14… |

- If a question says "treat employees without a commission as 0 when you calculate the average", you must convert with `NVL` first.
- `SUM(COMM)` is 2200 whether or not you wrap it in NVL. Skipping NULL and adding 0 give the same result in a sum.

In a row-level operation, NULL makes the result NULL. The value differs depending on whether you add before or after aggregating.

```sql
SELECT SUM(SAL + COMM), SUM(SAL) + SUM(COMM) FROM EMP;
```

```text
SUM(SAL+COMM) SUM(SAL)+SUM(COMM)
------------- ------------------
         7800              31225
```

- `SUM(SAL + COMM)`: `SAL + COMM` is calculated for each row first. For the 10 employees whose COMM is NULL it becomes NULL and drops out of the sum, leaving only the 4 employees with a COMM (1900 + 1750 + 2650 + 1500 = 7800).
- `SUM(SAL) + SUM(COMM)`: it adds the two totals, 29025 and 2200, each of which has already skipped NULL.

> ⚠️ **Trap**: "Aggregate functions ignore NULL" refers to the values **that get passed into** the aggregate function. If you calculate per row before the aggregate function, as in `SAL + COMM`, NULL has already been produced at that step.

## When There Are No Rows

What happens when no row matches the WHERE condition? Department 40 (OPERATIONS) has no employees.

```sql
SELECT COUNT(*) AS CNT, SUM(SAL) AS TOTAL FROM EMP WHERE DEPTNO = 40;
```

```text
       CNT      TOTAL
---------- ----------
         0
```

- The result is **one row**. An aggregate without GROUP BY creates a single group called "the whole", even if the input is empty.
- `COUNT` is **0**, and `SUM` is **NULL** (blank). With no values to add, the total cannot be determined.
- `AVG`, `MAX`, and `MIN` are also NULL for the same reason.

| Function | Result for an empty set |
|------|-------------|
| `COUNT(*)`, `COUNT(column)` | 0 |
| `SUM`, `AVG`, `MAX`, `MIN` | NULL |

Add GROUP BY to the same condition and the result changes.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP WHERE DEPTNO = 40 GROUP BY DEPTNO;
```

```text
no rows selected
```

- GROUP BY creates a group **for each value that actually exists**. If no rows remain, there are no groups to create, so the result is **0 rows**.
- What decides between "a single row containing 0" and "no rows at all" is whether GROUP BY is present.

## GROUP BY — One Row per Group

`GROUP BY column` bundles the rows that have the same value in that column and produces one aggregate row per group.

```sql
SELECT DEPTNO, COUNT(*), SUM(SAL), ROUND(AVG(SAL)) AS AVG_SAL
FROM EMP
GROUP BY DEPTNO
ORDER BY DEPTNO;
```

```text
    DEPTNO   COUNT(*)   SUM(SAL)    AVG_SAL
---------- ---------- ---------- ----------
        10          3       8750       2917
        20          5      10875       2175
        30          6       9400       1567
```

- EMP has three DEPTNO values (10, 20, 30), so the result has 3 rows.
- The DEPT table has a 40, but **EMP has no row with 40**, so no group is created. To make 40 appear you need the outer joins in Day 4 and 5.

### Grouping by Several Columns

When you list several columns in GROUP BY, rows with the same **combination of values** are bundled together.

```sql
SELECT DEPTNO, JOB, COUNT(*) AS CNT, SUM(SAL) AS SUM_SAL
FROM EMP
GROUP BY DEPTNO, JOB
ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB              CNT    SUM_SAL
---------- --------- ---------- ----------
        10 CLERK              1       1300
        10 MANAGER            1       2450
        10 PRESIDENT          1       5000
        20 ANALYST            2       6000
        20 CLERK              2       1900
        20 MANAGER            1       2975
        30 CLERK              1        950
        30 MANAGER            1       2850
        30 SALESMAN           4       5600
```

- There are 9 (department, job) combinations that actually exist, so there are 9 rows. It is not 3 departments × 5 jobs = 15.
- The 4 SALESMAN in department 30 form one group, giving a salary sum of 5600.
- The order of the columns (`GROUP BY DEPTNO, JOB` versus `GROUP BY JOB, DEPTNO`) does not change how rows are grouped. The display order is decided by ORDER BY.

## What Can Go in SELECT — ORA-00979 and ORA-00937

With GROUP BY, one group becomes one row. The group for department 30 holds 6 employees, and there is no way to show just one ENAME from it. That is where the rule comes from.

| What can go in SELECT when you use GROUP BY | Example |
|------|-----|
| A column (or expression) used in GROUP BY | `DEPTNO` |
| An aggregate function | `COUNT(*)`, `MAX(SAL)` |
| A constant | `'Department'`, `1` |

If you break the rule, Oracle raises an error.

```sql
SELECT DEPTNO, ENAME, COUNT(*) FROM EMP GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, ENAME, COUNT(*) FROM EMP GROUP BY DEPTNO
               *
ERROR at line 1:
ORA-00979: "ENAME": must appear in the GROUP BY clause or be used in an aggregate function
```

- The problem is ENAME, which the asterisk (`*`) points to. It is neither in GROUP BY nor inside an aggregate function.
- In textbooks the ORA-00979 message appears as `not a GROUP BY expression`. The practice container used for these notes (an Oracle Database 23ai-family release) also tells you which column is the problem, as above. The error number is the same.

If there is no GROUP BY at all and you mix an aggregate function with a plain column, you get an error with a different number.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP;
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP
       *
ERROR at line 1:
ORA-00937: not a single-group group function
```

- `COUNT(*)` tries to squeeze the whole table into one row, while `DEPTNO` tries to show all 14 rows as they are. The two demands collide.

| Situation | Error |
|------|------|
| GROUP BY present + a plain column outside GROUP BY in SELECT | ORA-00979 |
| No GROUP BY + an aggregate function together with a plain column | ORA-00937 |

### Nesting Aggregate Functions

Oracle lets you put one more aggregate function inside an aggregate function. It reduces the per-group results to a single value again.

```sql
SELECT MAX(COUNT(*)) FROM EMP GROUP BY DEPTNO;
```

```text
MAX(COUNT(*))
-------------
            6
```

- Out of the department headcounts 3, 5, and 6, the maximum, 6, comes out. A nested aggregate requires GROUP BY, and you cannot put a plain column such as DEPTNO in SELECT alongside it.

> Tomorrow we cover HAVING, which filters groups, and the order in which SQL processes its clauses.

## 📖 Glossary

- **Aggregate function**: A function that takes many rows and returns one value. `COUNT`, `SUM`, `AVG`, `MAX`, `MIN`, `STDDEV`, `VARIANCE`.
- **`COUNT(*)`**: Counts rows without caring about NULL.
- **`COUNT(column)`**: Counts only the rows where that column is not NULL.
- **`COUNT(DISTINCT column)`**: Counts the distinct values after removing NULL.
- **Empty set**: The state where no row matches the condition. In that case `COUNT` is 0 and the other aggregates are NULL.
- **Group**: A bundle of rows that share the same GROUP BY column value (or combination of values). It becomes one row in the result.
- **ORA-00979**: The error raised when SELECT contains a column that is neither in GROUP BY nor inside an aggregate function.
- **ORA-00937**: The error raised when you SELECT an aggregate function together with a plain column without GROUP BY.

## 📝 Practice Questions

**Question 1.** The EMP table has 14 rows, and only 4 rows of the COMM column have a value (one of them is 0). Which is the correct result of the following SQL?

```sql
SELECT COUNT(*), COUNT(COMM) FROM EMP;
```

A) 14, 14  
B) 14, 4  
C) 4, 4  
D) 14, 3  

**Answer: B**  
Explanation: `COUNT(*)` counts all 14 rows regardless of NULL. `COUNT(COMM)` counts only rows where COMM is not NULL. TURNER's COMM is 0, and 0 is not NULL, so it is included and the count becomes 4.

---

**Question 2.** EMP has four COMM values, 300, 500, 1400, and 0, and the other 10 rows are NULL (total 2200). What is the result of the following SQL?

```sql
SELECT AVG(COMM) FROM EMP;
```

A) 157.142857  
B) 0  
C) 2200  
D) 550  

**Answer: D**  
Explanation: Aggregate functions skip NULL. `AVG(COMM)` is the average of the 4 non-NULL rows, so 2200 ÷ 4 = 550. 157.142857 is the result of `AVG(NVL(COMM, 0))`, which turns NULL into 0 and makes the denominator 14.

---

**Question 3.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY DEPTNO;
```

A) An ORA-00979 error occurs  
B) 3 rows, one per department  
C) 9 rows, one per department and job combination  
D) An ORA-00937 error occurs  

**Answer: A**  
Explanation: When GROUP BY is present, SELECT can contain only GROUP BY columns and aggregate functions. JOB is neither in GROUP BY nor inside an aggregate function, so ORA-00979 occurs. ORA-00937 is the error you get when there is no GROUP BY at all and you mix an aggregate function with a plain column.

---

**Question 4.** EMP has no employee with DEPTNO 40. Which is the correct result of the following SQL?

```sql
SELECT COUNT(*), SUM(SAL) FROM EMP WHERE DEPTNO = 40;
```

A) No result rows  
B) One row: 0, 0  
C) One row: 0, NULL  
D) One row: NULL, NULL  

**Answer: C**  
Explanation: An aggregate without GROUP BY returns one result row even when there are no input rows. In that case `COUNT` is 0, and `SUM` is NULL because there are no values to add. If you add `GROUP BY DEPTNO` to the same condition, there are no groups to create and the result is 0 rows.

---

**Question 5.** How many rows does the following SQL return? (The departments in EMP are 10, 20, and 30, and there are 5 job types.)

```sql
SELECT DEPTNO, JOB, COUNT(*) FROM EMP GROUP BY DEPTNO, JOB;
```

A) 3  
B) 9  
C) 5  
D) 15  

**Answer: B**  
Explanation: When you GROUP BY several columns, you get one row for each combination of values that actually exists. The (department, job) combinations in EMP are 3 for department 10, 3 for department 20, and 3 for department 30, 9 in all. It does not generate every possible combination (3 × 5 = 15).
