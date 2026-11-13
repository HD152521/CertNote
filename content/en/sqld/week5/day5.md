# Day 5 - GROUPING SETS and the GROUPING Function

## 📌 Key Points

- `GROUPING SETS (set1, set2, …)` aggregates only the sets you list and combines them. It is neither a hierarchy nor all combinations: **only what you pick** comes out.
- If a set has several columns, wrap them in parentheses. `(DEPTNO, JOB)` is one set, and `()` is the grand-total set.
- `GROUPING(column)` is **1 if the column was folded away by aggregation and became NULL** in that row, and **0** if the row was grouped by an actual value. It separates an original NULL from a subtotal NULL.
- Use CASE or DECODE together with GROUPING to attach 'Subtotal' and 'Total' labels to subtotal rows.
- ROLLUP and CUBE can both be rewritten with GROUPING SETS. `ROLLUP(A, B)` = `GROUPING SETS ((A, B), A, ())`.

## GROUPING SETS — Only the Sets You Need

Yesterday's CUBE(DEPTNO, JOB) produced 18 rows, including the 9 detail rows. If you only want to see department subtotals and job subtotals, the detail and the grand total are clutter. GROUPING SETS lets you list the sets yourself.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS (DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB          SUM_SAL
---------- --------- ----------
        10                 8750
        20                10875
        30                 9400
           ANALYST         6000
           CLERK           4150
           MANAGER         8275
           PRESIDENT       5000
           SALESMAN        5600
```

- It is the 3 rows of the (DEPTNO) set plus the 5 rows of the (JOB) set, 8 rows.
- It is the same as joining the result of `GROUP BY DEPTNO` and the result of `GROUP BY JOB` with UNION ALL. In each set, the column that was not used is NULL.
- `GROUPING SETS (DEPTNO, JOB)` is **not** an aggregation by (DEPTNO, JOB) combination. The comma inside the parentheses is a separator between sets.

### Parenthesized Sets and the () Grand Total

If a set has two or more columns, wrap them in parentheses. The empty parentheses `()` are the grand total, not grouped by any column.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), DEPTNO, ()) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB          SUM_SAL
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        10                 8750
        20 ANALYST         6000
        20 CLERK           1900
        20 MANAGER         2975
        20                10875
        30 CLERK            950
        30 MANAGER         2850
        30 SALESMAN        5600
        30                 9400
                          29025
```

- There are three sets: (DEPTNO, JOB), (DEPTNO), and (). It is the same 13 rows as yesterday's `ROLLUP(DEPTNO, JOB)`.

| Notation | Sets | Rows |
|------|------|-----:|
| `GROUPING SETS (DEPTNO, JOB)` | (DEPTNO), (JOB) | 8 |
| `GROUPING SETS ((DEPTNO, JOB))` | (DEPTNO, JOB) | 9 |
| `GROUPING SETS ((DEPTNO, JOB), ())` | (DEPTNO, JOB), () | 10 |
| `GROUPING SETS (DEPTNO, JOB, ())` | (DEPTNO), (JOB), () | 9 |
| `GROUPING SETS ((DEPTNO, JOB), DEPTNO, ())` | (DEPTNO, JOB), (DEPTNO), () | 13 |

- `GROUPING SETS ((DEPTNO, JOB))`, with just one set listed, is the same as a plain `GROUP BY DEPTNO, JOB`.
- For the row count, just add up the rows of each set. (DEPTNO) is 3, (JOB) is 5, (DEPTNO, JOB) is 9, and () is 1.

The sets do not even need to use the same columns. Here we aggregate department 10 once by job and once by manager.

```sql
SELECT DEPTNO, JOB, MGR, SUM(SAL) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), (DEPTNO, MGR)) HAVING DEPTNO = 10 ORDER BY DEPTNO, JOB, MGR;
```

```text
    DEPTNO JOB              MGR   SUM(SAL)
---------- --------- ---------- ----------
        10 CLERK                      1300
        10 MANAGER                    2450
        10 PRESIDENT                  5000
        10                 7782       1300
        10                 7839       2450
        10                            5000
```

- The upper three rows are the (DEPTNO, JOB) set, and the lower three rows are the (DEPTNO, MGR) set.
- The blank MGR in the last row is KING's actual MGR value, NULL. It is blank even though it is not a subtotal row. You cannot tell them apart from the screen alone.

### Only Columns Used in the Sets Go in SELECT

GROUPING SETS follows the GROUP BY rules as they are. If you SELECT a column that is in none of the sets, you get ORA-00979.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS (DEPTNO, ());
```

```text
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY GROUPING SETS (DEPTNO, ())
               *
ERROR at line 1:
ORA-00979: "JOB": must appear in the GROUP BY clause or be used in an aggregate function
```

## The GROUPING Function — Is This NULL a Subtotal?

When the NULLs in subtotal rows mix with NULLs in the original data, you cannot tell the two apart from the screen alone. If you aggregate department 10 with `ROLLUP(JOB, MGR)`, PRESIDENT appears on two lines.

```sql
SELECT JOB, MGR, SUM(SAL) AS SUM_SAL, GROUPING(MGR) AS G_M FROM EMP WHERE DEPTNO = 10 GROUP BY ROLLUP(JOB, MGR) ORDER BY JOB, G_M, MGR;
```

```text
JOB              MGR    SUM_SAL        G_M
--------- ---------- ---------- ----------
CLERK           7782       1300          0
CLERK                      1300          1
MANAGER         7839       2450          0
MANAGER                    2450          1
PRESIDENT                  5000          0
PRESIDENT                  5000          1
                           8750          1
```

- On PRESIDENT's first line, G_M is **0**. It is a detail row grouped by an MGR value, and that value is KING's MGR, NULL.
- On the second line, G_M is **1**. It is the job subtotal with MGR folded away, so NULL is displayed.
- You cannot separate the two lines with `MGR IS NULL`, because MGR is NULL on both.

| GROUPING(column) | Meaning | Value seen in that column |
|------------|----|---------------|
| 0 | A row grouped by the actual value of that column | The data value (NULL if it was NULL originally) |
| 1 | A subtotal or grand-total row aggregated by folding that column | NULL |

Looking at the GROUPING of both columns in a ROLLUP(DEPTNO, JOB) result reveals the kind of each row.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL, GROUPING(DEPTNO) AS G_D, GROUPING(JOB) AS G_J FROM EMP GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB          SUM_SAL        G_D        G_J
---------- --------- ---------- ---------- ----------
        10 CLERK           1300          0          0
        10 MANAGER         2450          0          0
        10 PRESIDENT       5000          0          0
        10                 8750          0          1
        20 ANALYST         6000          0          0
        20 CLERK           1900          0          0
        20 MANAGER         2975          0          0
        20                10875          0          1
        30 CLERK            950          0          0
        30 MANAGER         2850          0          0
        30 SALESMAN        5600          0          0
        30                 9400          0          1
                          29025          1          1
```

| G_D | G_J | Kind of row |
|----:|----:|---------|
| 0 | 0 | Detail by department and job |
| 0 | 1 | Department subtotal |
| 1 | 1 | Grand total |

- ROLLUP(DEPTNO, JOB) has no (1, 0) combination, because it does not create job subtotals. With CUBE, job subtotal rows with (1, 0) would appear.
- Use GROUPING only in queries that have GROUP BY. Without it you get ORA-30481. In a plain GROUP BY, every row is 0.

## Attaching Subtotal and Total Labels

If you branch with CASE on the GROUPING value, you can put text in place of the blanks.

```sql
SELECT CASE GROUPING(DEPTNO) WHEN 1 THEN 'Total' ELSE TO_CHAR(DEPTNO) END AS DEPT_L, CASE WHEN GROUPING(DEPTNO) = 1 THEN ' ' WHEN GROUPING(JOB) = 1 THEN 'Subtotal' ELSE JOB END AS JOB_L, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY GROUPING(DEPTNO), DEPTNO, GROUPING(JOB), JOB;
```

```text
DEPT_L                                   JOB_L        SUM_SAL
---------------------------------------- --------- ----------
10                                       CLERK           1300
10                                       MANAGER         2450
10                                       PRESIDENT       5000
10                                       Subtotal        8750
20                                       ANALYST         6000
20                                       CLERK           1900
20                                       MANAGER         2975
20                                       Subtotal       10875
30                                       CLERK            950
30                                       MANAGER         2850
30                                       SALESMAN        5600
30                                       Subtotal        9400
Total                                                   29025
```

- DEPTNO is a number, so we converted it with `TO_CHAR` to put it in the same column as the text label. The THEN values of a CASE must have matching data types.
- We also used GROUPING in ORDER BY to fix the order detail → subtotal → total. It does not rely on where NULL sorts.

DECODE does the same job. Here we attach an 'All' label to a CUBE result.

```sql
SELECT DECODE(GROUPING(DEPTNO), 1, 'All', DEPTNO) AS DEPT_L, DECODE(GROUPING(JOB), 1, 'All', JOB) AS JOB_L, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY CUBE(DEPTNO, JOB) ORDER BY GROUPING(DEPTNO), DEPTNO, GROUPING(JOB), JOB;
```

```text
DEPT_L                                   JOB_L        SUM_SAL
---------------------------------------- --------- ----------
10                                       CLERK           1300
10                                       MANAGER         2450
10                                       PRESIDENT       5000
10                                       All             8750
20                                       ANALYST         6000
20                                       CLERK           1900
20                                       MANAGER         2975
20                                       All            10875
30                                       CLERK            950
30                                       MANAGER         2850
30                                       SALESMAN        5600
30                                       All             9400
All                                      ANALYST         6000
All                                      CLERK           4150
All                                      MANAGER         8275
All                                      PRESIDENT       5000
All                                      SALESMAN        5600
All                                      All            29025
```

- In `DECODE(GROUPING(DEPTNO), 1, 'All', DEPTNO)`, the first result value is a character string, so the numeric DEPTNO is converted to a string and returned.
- The last row, where both columns are 'All', is the grand total, and the rows where only one side is 'All' are subtotals.

> ⚠️ **Pitfall**: If you give a label column the same alias as the original column name, ORDER BY reads that name as the alias. If you name it `AS JOB` and use `ORDER BY GROUPING(JOB)`, the JOB inside GROUPING points to the alias that contains an aggregate expression, and ORA-00934 is raised (based on Oracle 23ai, the practice environment of this note). Give the label alias a different name.

```sql
SELECT DECODE(GROUPING(JOB), 1, 'Sum', JOB) AS JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(JOB) ORDER BY GROUPING(JOB), JOB;
```

```text
SELECT DECODE(GROUPING(JOB), 1, 'Sum', JOB) AS JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(JOB) ORDER BY GROUPING(JOB), JOB
                                                                                                                         *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

GROUPING can also be used in HAVING. Use it to keep or remove only the subtotal rows.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), DEPTNO, ()) HAVING GROUPING(JOB) = 1 ORDER BY DEPTNO;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10                 8750
        20                10875
        30                 9400
                          29025
```

## Rewriting ROLLUP and CUBE as GROUPING SETS

ROLLUP and CUBE are shorthand for frequently used lists of sets. All of them can be expanded into GROUPING SETS.

| Original notation | Equivalent GROUPING SETS |
|---------|-----------------|
| `GROUP BY A, B` | `GROUPING SETS ((A, B))` |
| `ROLLUP(A)` | `GROUPING SETS (A, ())` |
| `ROLLUP(A, B)` | `GROUPING SETS ((A, B), A, ())` |
| `ROLLUP(A, B, C)` | `GROUPING SETS ((A, B, C), (A, B), A, ())` |
| `CUBE(A, B)` | `GROUPING SETS ((A, B), A, B, ())` |
| `A, ROLLUP(B)` | `GROUPING SETS ((A, B), A)` |
| `ROLLUP((A, B))` | `GROUPING SETS ((A, B), ())` |

This is the statement with CUBE(DEPTNO, JOB) expanded. The result is the same 18 rows as yesterday's CUBE.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS ((DEPTNO, JOB), (DEPTNO), (JOB), ()) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        10                 8750
        20 ANALYST         6000
        20 CLERK           1900
        20 MANAGER         2975
        20                10875
        30 CLERK            950
        30 MANAGER         2850
        30 SALESMAN        5600
        30                 9400
           ANALYST         6000
           CLERK           4150
           MANAGER         8275
           PRESIDENT       5000
           SALESMAN        5600
                          29025
```

- For a one-column set such as `(DEPTNO)`, you may use or omit the parentheses.
- Conversely, some lists can be expressed only with GROUPING SETS. If you want only subtotals, with no detail and no grand total, as in `GROUPING SETS (DEPTNO, JOB)`, you cannot write that with ROLLUP or CUBE.

> Next week we cover window functions, which attach ranks and running values without reducing the number of rows.

## 📖 Glossary

- **GROUPING SETS**: A GROUP BY extension where you list the grouping sets to aggregate yourself. It combines the results of the sets you list.
- **() empty set**: A set not grouped by any column. It produces one grand-total row.
- **GROUPING(column)**: A function that returns 1 if the column was folded away by aggregation in that row, and 0 if the row was grouped by an actual value.
- **Subtotal label**: Putting text such as 'Subtotal' or 'Total' where GROUPING is 1, using CASE or DECODE.
- **ORA-30481**: The error when the GROUPING function is used in a query without GROUP BY.
- **ORA-00934**: The error when a group function is used where it is not allowed. It also occurs when an alias hides a column name.

## 📝 Practice Questions

**Question 1.** In EMP there are 3 departments, 5 jobs, and 9 (department, job) combinations. How many rows does the following SQL return?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS (DEPTNO, JOB);
```

A) 8  
B) 9  
C) 13  
D) 18  

**Answer: A**  
Explanation: The comma in GROUPING SETS separates the sets. The 3 rows of the (DEPTNO) set plus the 5 rows of the (JOB) set make 8 rows. The 9 detail (DEPTNO, JOB) rows and the grand total were not listed, so they do not appear. 9 is the result of `GROUPING SETS ((DEPTNO, JOB))`, 13 is ROLLUP, and 18 is CUBE.

---

**Question 2.** In the result of `SELECT DEPTNO, JOB, SUM(SAL), GROUPING(DEPTNO), GROUPING(JOB) FROM EMP GROUP BY ROLLUP(DEPTNO, JOB);`, what are the values of `GROUPING(DEPTNO)` and `GROUPING(JOB)` in the grand-total row?

A) 0, 0  
B) 0, 1  
C) 1, 0  
D) 1, 1  

**Answer: D**  
Explanation: The grand-total row is aggregated with both DEPTNO and JOB folded away, so both GROUPING values are 1. (0, 0) is a detail row, and (0, 1) is a department subtotal. (1, 0) would be a job subtotal, but ROLLUP(DEPTNO, JOB) does not create that set.

---

**Question 3.** Which of the following produces the same result as `GROUP BY ROLLUP(DEPTNO, JOB)`?

A) `GROUP BY GROUPING SETS (DEPTNO, JOB)`  
B) `GROUP BY GROUPING SETS ((DEPTNO, JOB), DEPTNO, ())`  
C) `GROUP BY GROUPING SETS ((DEPTNO, JOB), JOB, ())`  
D) `GROUP BY CUBE(DEPTNO, JOB)`  

**Answer: B**  
Explanation: ROLLUP(DEPTNO, JOB) creates three sets: (DEPTNO, JOB), (DEPTNO), and (). B lists exactly those. A creates only department subtotals and job subtotals. C is the same set of groups as ROLLUP(JOB, DEPTNO). D adds the job subtotals, giving 18 rows.

---

**Question 4.** When you aggregate department 10 with `GROUP BY ROLLUP(JOB, MGR)`, the PRESIDENT row appears on two lines, and MGR is NULL on both. KING's MGR is NULL to begin with. Which is the correct way to pick out the job subtotal row of the two?

A) Treat the row where `MGR IS NULL` as the subtotal  
B) Treat the row where `NVL(MGR, 0) = 0` as the subtotal  
C) Treat the row where `GROUPING(MGR) = 1` as the subtotal  
D) There is no way to tell the two rows apart  

**Answer: C**  
Explanation: `GROUPING(MGR)` is 1 in a subtotal row aggregated by folding MGR away, and 0 in a row grouped by an actual value. KING's detail row was grouped by the actual value NULL, so it is 0, and the job subtotal row is 1. A and B would pick both rows, because MGR is NULL on both. Since the GROUPING function exists, you can tell them apart.

---

**Question 5.** In EMP there are 3 departments and 5 jobs. How many rows does the following SQL return?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY GROUPING SETS (DEPTNO, JOB, ());
```

A) 8  
B) 18  
C) 13  
D) 9  

**Answer: D**  
Explanation: There are three sets: (DEPTNO), (JOB), and (). 3 + 5 + 1 = 9 rows. The detail (DEPTNO, JOB) combinations were not listed, so they do not appear. 8 is the case without `()`, and 18 is the result of CUBE, which creates everything including the detail.
