# Day 4 - Group Functions ROLLUP and CUBE

## 📌 Key Points

- `GROUP BY ROLLUP(A, B)` adds **subtotals per A** and a **grand total** row to the (A, B) groups. With n arguments, there are **n + 1** grouping sets.
- In ROLLUP, the argument order is the hierarchy. `ROLLUP(A, B)` and `ROLLUP(B, A)` have different subtotal bases, so their results differ.
- `CUBE(A, B)` produces subtotals for **every possible combination**. With n arguments there are **2ⁿ** grouping sets, and the argument order does not affect the set of result rows.
- In subtotal and total rows, columns that were not grouped are shown as **NULL**. To tell them apart from values that are NULL to begin with, use Day 5's GROUPING.
- The row order of ROLLUP and CUBE results is not guaranteed. If you need an order on screen, use ORDER BY.

## When You Need Subtotal Rows

Yesterday we attached a total row beneath the detail rows by hand with UNION ALL. If you need both per-department subtotals and an overall grand total, you have to write several SELECTs and join them. ROLLUP finishes that job in one GROUP BY line.

```sql
SELECT DEPTNO, SUM(SAL) FROM EMP GROUP BY ROLLUP(DEPTNO) ORDER BY DEPTNO;
```

```text
    DEPTNO   SUM(SAL)
---------- ----------
        10       8750
        20      10875
        30       9400
                29025
```

- The first three rows are the per-department totals, the same as `GROUP BY DEPTNO`.
- The last row is the overall total with no department grouping, that is, the **grand total**. The DEPTNO slot that was not grouped is NULL (blank).
- Ascending ORDER BY puts NULL last. That is why the grand total row comes last.

## ROLLUP(A, B) — Folding Up One at a Time from the Right

With two columns, one more level of subtotal appears. We attach department subtotals and a grand total to the totals by department and job.

```sql
SELECT DEPTNO, JOB, COUNT(*) AS CNT, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB              CNT    SUM_SAL
---------- --------- ---------- ----------
        10 CLERK              1       1300
        10 MANAGER            1       2450
        10 PRESIDENT          1       5000
        10                    3       8750
        20 ANALYST            2       6000
        20 CLERK              2       1900
        20 MANAGER            1       2975
        20                    5      10875
        30 CLERK              1        950
        30 MANAGER            1       2850
        30 SALESMAN           4       5600
        30                    6       9400
                             14      29025
```

`ROLLUP(DEPTNO, JOB)` creates three grouping sets.

| Grouping set | Meaning | Rows | Columns that are NULL in the result |
|------|----|-----:|-----------------|
| (DEPTNO, JOB) | By department and job | 9 | None |
| (DEPTNO) | Department subtotal | 3 | JOB |
| () | Grand total | 1 | DEPTNO, JOB |

- It groups by dropping one argument at a time from the right. (A, B) → (A) → ().
- The total is 13 rows. 9 + 3 + 1.
- The job subtotal (JOB), grouped by `JOB` alone, is **not created**. ROLLUP treats the left column as the upper level of the hierarchy and produces only subtotals for that hierarchy.

### Counting the Grouping Sets

| Expression | Grouping sets created | Number of sets |
|----|----------|------:|
| `ROLLUP(A)` | (A), () | 2 |
| `ROLLUP(A, B)` | (A, B), (A), () | 3 |
| `ROLLUP(A, B, C)` | (A, B, C), (A, B), (A), () | 4 |
| `ROLLUP` with n arguments | n + 1 sets, dropping one at a time from the right | n + 1 |

- The number of grouping sets and the number of result rows are different. The row count is the sum, over each set, of the number of combinations of values actually present.

## Changing the Argument Order Changes the Result

In `ROLLUP(JOB, DEPTNO)`, job is the upper level. The subtotal basis changes from department to job.

```sql
SELECT JOB, DEPTNO, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY ROLLUP(JOB, DEPTNO) ORDER BY JOB, DEPTNO;
```

```text
JOB           DEPTNO    SUM_SAL
--------- ---------- ----------
ANALYST           20       6000
ANALYST                    6000
CLERK             10       1300
CLERK             20       1900
CLERK             30        950
CLERK                      4150
MANAGER           10       2450
MANAGER           20       2975
MANAGER           30       2850
MANAGER                    8275
PRESIDENT         10       5000
PRESIDENT                  5000
SALESMAN          30       5600
SALESMAN                   5600
                          29025
```

| Expression | Grouping sets | Rows |
|----|------|-----:|
| `ROLLUP(DEPTNO, JOB)` | (DEPTNO, JOB) 9 + (DEPTNO) 3 + () 1 | 13 |
| `ROLLUP(JOB, DEPTNO)` | (JOB, DEPTNO) 9 + (JOB) 5 + () 1 | 15 |

- The 9 detail rows and the 1 grand total row are the same. The intermediate subtotals change from 3 departments to 5 jobs, so the row count differs.
- The column order in the SELECT clause does not affect the result. What decides the subtotal basis is **the order inside the ROLLUP parentheses**.

> ⚠️ **Pitfall**: A plain `GROUP BY DEPTNO, JOB` gives the same groups even if you swap the column order (W4 Day 1). `ROLLUP(DEPTNO, JOB)` and `ROLLUP(JOB, DEPTNO)` have different subtotal sets, so their results differ.

## CUBE — Every Combination

CUBE produces subtotals for every combination you can make from its arguments. Department subtotals and job subtotals come out together.

```sql
SELECT DEPTNO, JOB, SUM(SAL) AS SUM_SAL FROM EMP GROUP BY CUBE(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
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
           ANALYST         6000
           CLERK           4150
           MANAGER         8275
           PRESIDENT       5000
           SALESMAN        5600
                          29025
```

| Grouping set | Meaning | Rows |
|------|----|-----:|
| (DEPTNO, JOB) | By department and job | 9 |
| (DEPTNO) | Department subtotal | 3 |
| (JOB) | Job subtotal | 5 |
| () | Grand total | 1 |

- The total is 18 rows. The 5 job subtotal rows are added to the 13 rows of ROLLUP(DEPTNO, JOB).
- Even if you swap the order with `CUBE(JOB, DEPTNO)`, the sets created are the same, so the set of rows is the same. Only the on-screen order depends on ORDER BY.

| Expression | Number of sets | Example (3 arguments) |
|----|-------|------------|
| `ROLLUP` | n + 1 | 4 |
| `CUBE` | 2ⁿ | 8 |

- With CUBE, every additional argument doubles the number of sets. It also computes subtotals you may not need, so it costs more than ROLLUP.
- With a single argument, the two are the same. `CUBE(DEPTNO)` and `ROLLUP(DEPTNO)` both create (DEPTNO) and ().

## Partial ROLLUP and Parenthesized Groups

A column placed outside ROLLUP is always included in every grouping set. `GROUP BY DEPTNO, ROLLUP(JOB)` has two sets, (DEPTNO, JOB) and (DEPTNO), and has no grand total.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY DEPTNO, ROLLUP(JOB) ORDER BY DEPTNO, JOB;
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
```

- It is the 13 rows of `ROLLUP(DEPTNO, JOB)` minus only the final grand total, so 12 rows.

If you wrap columns in parentheses inside ROLLUP, those columns are treated as **a single unit**. They are not split apart in the middle.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY ROLLUP((DEPTNO, JOB)) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        20 ANALYST         6000
        20 CLERK           1900
        20 MANAGER         2975
        30 CLERK            950
        30 MANAGER         2850
        30 SALESMAN        5600
                          29025
```

- The argument is the single unit (DEPTNO, JOB), so there are only two sets: (DEPTNO, JOB) and (). There is no department subtotal.

| Expression | Grouping sets | Rows |
|----|------|-----:|
| `GROUP BY DEPTNO, JOB` | (DEPTNO, JOB) | 9 |
| `GROUP BY DEPTNO, ROLLUP(JOB)` | (DEPTNO, JOB), (DEPTNO) | 12 |
| `GROUP BY ROLLUP((DEPTNO, JOB))` | (DEPTNO, JOB), () | 10 |
| `GROUP BY ROLLUP(DEPTNO, JOB)` | (DEPTNO, JOB), (DEPTNO), () | 13 |
| `GROUP BY CUBE(DEPTNO, JOB)` | The four above + (JOB) | 18 |

## WHERE Comes First, Subtotals Use the Remaining Rows

WHERE filters rows before groups are made. ROLLUP's subtotals and grand total are also computed only from the remaining rows.

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP WHERE DEPTNO = 10 GROUP BY ROLLUP(DEPTNO, JOB) ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB         SUM(SAL)
---------- --------- ----------
        10 CLERK           1300
        10 MANAGER         2450
        10 PRESIDENT       5000
        10                 8750
                           8750
```

- Only department 10 remains, so the department subtotal and the grand total are the same 8750. The grand total is the sum of **the rows that passed WHERE**, not of the whole table (29025).

## Result Order Is Not Guaranteed

Every ROLLUP and CUBE example in this note has ORDER BY attached. Without ORDER BY, in the practice container the detail rows came out mixed up, followed by the subtotals and grand total. This order is a result that can change with the execution plan, and it is not an order that Oracle guarantees.

- The reason ROLLUP results look hierarchical in textbooks, like "detail → subtotal → grand total", is that they come from an execution method that sorts.
- To make the hierarchical order certain, write something like `ORDER BY DEPTNO, JOB`. In ascending order NULL goes last, so the subtotal comes below the detail rows.
- A column that has NULL values to begin with cannot be told apart from a subtotal this way. The GROUPING function, covered next, solves that problem.

> Next time we cover GROUPING SETS, which pick only the grouping sets you want, and the GROUPING function, which distinguishes subtotal rows.

## 📖 Glossary

- **Subtotal**: A row re-aggregated by folding the lower columns for each value of the upper columns. It is the per-department total row of `ROLLUP(DEPTNO, JOB)`.
- **Grand total**: An overall aggregate row not grouped by any column. It corresponds to the grouping set `()`.
- **ROLLUP**: Creates subtotals and a grand total by dropping arguments one at a time from the right. The argument order is the hierarchy.
- **CUBE**: Creates subtotals for every combination you can make from the arguments. The number of grouping sets is 2ⁿ.
- **Grouping set**: The combination of GROUP BY columns used in one aggregation, such as `(DEPTNO, JOB)`, `(DEPTNO)`, and `()`.
- **Partial ROLLUP**: A form like `GROUP BY A, ROLLUP(B)` where only some columns go into ROLLUP, producing subtotals without a grand total.
- **Composite column**: Several columns grouped so they are treated as a single unit, as in `ROLLUP((A, B))`.

## 📝 Practice Questions

**Question 1.** How many grouping sets does `GROUP BY ROLLUP(A, B, C)` create?

A) 3  
B) 8  
C) 6  
D) 4  

**Answer: D**  
Explanation: ROLLUP drops arguments one at a time from the right and creates (A, B, C), (A, B), (A), and (). With n arguments there are n + 1, so 4. 8 is the number of sets (2³) of CUBE(A, B, C), which creates every combination.

---

**Question 2.** In EMP there are 9 (department, job) combinations, 3 departments, and 5 jobs. How many rows does the following SQL return?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY ROLLUP(JOB, DEPTNO);
```

A) 13  
B) 15  
C) 18  
D) 9  

**Answer: B**  
Explanation: `ROLLUP(JOB, DEPTNO)` creates the sets (JOB, DEPTNO), (JOB), and (). 9 + 5 + 1 = 15 rows. It is the order inside ROLLUP, not the column order in the SELECT clause, that decides the subtotal basis. 13 is `ROLLUP(DEPTNO, JOB)`, and 18 is the result of CUBE.

---

**Question 3.** Using the same EMP, how many rows does the following SQL return?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY CUBE(DEPTNO, JOB);
```

A) 13  
B) 15  
C) 18  
D) 14  

**Answer: C**  
Explanation: CUBE creates all four sets: (DEPTNO, JOB), (DEPTNO), (JOB), and (). 9 + 3 + 5 + 1 = 18 rows. 13 and 15 are the results of ROLLUP, which creates only one of the department subtotal or the job subtotal.

---

**Question 4.** In the result of `SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY ROLLUP(DEPTNO, JOB);`, what does the row where DEPTNO is 10 and JOB is NULL mean? (JOB in EMP has no NULLs.)

A) The salary subtotal of department 10  
B) The salary sum of employees in department 10 who have no job  
C) The overall salary grand total  
D) A salary subtotal by job  

**Answer: A**  
Explanation: The (DEPTNO) set of `ROLLUP(DEPTNO, JOB)` is the per-department subtotal, and the ungrouped JOB slot is shown as NULL. JOB has no NULLs to begin with, so this is not a row for employees without a job. The grand total row has NULL in DEPTNO as well. The job subtotal (JOB) is not created by ROLLUP(DEPTNO, JOB).

---

**Question 5.** In EMP there are 9 (department, job) combinations and 3 departments. How many rows does the following SQL return?

```sql
SELECT DEPTNO, JOB, SUM(SAL) FROM EMP GROUP BY DEPTNO, ROLLUP(JOB);
```

A) 13  
B) 9  
C) 12  
D) 15  

**Answer: C**  
Explanation: DEPTNO, which is outside ROLLUP, goes into every set, so the sets are (DEPTNO, JOB) and (DEPTNO). 9 + 3 = 12 rows, with no grand total row. 13 is the result of `ROLLUP(DEPTNO, JOB)`, which also creates the grand total. 9 is the result of a plain GROUP BY.
