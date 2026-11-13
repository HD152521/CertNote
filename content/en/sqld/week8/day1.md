# Day 1 - Pitfalls Roundup 1 (NULL and COUNT)

## 📌 Key Takeaways

- Arithmetic involving NULL yields NULL, and comparing with NULL (`=`, `<>`) is neither true nor false but UNKNOWN. Find NULL only with `IS NULL`.
- In Oracle, `||` skips NULL as if it were an empty string, and `''` is stored and compared as NULL.
- `COUNT(*)` counts rows, while `COUNT(column)` counts non-NULL values. SUM and AVG also exclude NULL, so `AVG(COMM)` and `AVG(NVL(COMM, 0))` differ.
- If there are 0 target rows, COUNT is 0, while SUM, MAX, and AVG are NULL. With a GROUP BY attached, the result is 0 rows altogether.
- If a `NOT IN` list or subquery contains even one NULL, the result is 0 rows. `NOT EXISTS` is not affected by NULL.

## NULL Is Not a Value, It Is "Unknown"

In W2 Day 5, we defined NULL as "a value not yet known, or a value that does not apply." SQL follows this definition all the way through. Whatever you add to an unknown value is still unknown, and if you ask whether an unknown value equals 300, the answer is "unknown." Most pitfalls come from this one line.

| Operation | When NULL is involved | How to avoid it |
|------|-----------|---------|
| Arithmetic `SAL + COMM` | NULL | `SAL + NVL(COMM, 0)` |
| Comparison `COMM = NULL`, `COMM <> 0` | UNKNOWN (discarded by WHERE) | `COMM IS NULL`, `COMM IS NOT NULL` |
| Concatenation `ENAME \|\| COMM` (Oracle) | NULL is skipped | Nothing to do |
| Aggregation `SUM(COMM)`, `COUNT(COMM)` | Computed without the NULL rows | To change the denominator, put `NVL` inside |

## Arithmetic and Comparison

Add salary and commission for employees in department 30.

```sql
SELECT ENAME, SAL, COMM, SAL + COMM AS TOTAL, SAL + NVL(COMM, 0) AS TOTAL2 FROM EMP WHERE DEPTNO = 30 ORDER BY ENAME;
```

```text
ENAME             SAL       COMM      TOTAL     TOTAL2
---------- ---------- ---------- ---------- ----------
ALLEN            1600        300       1900       1900
BLAKE            2850                             2850
JAMES             950                              950
MARTIN           1250       1400       2650       2650
TURNER           1500          0       1500       1500
WARD             1250        500       1750       1750
```

- For BLAKE and JAMES, COMM is NULL, so TOTAL is NULL too. Even though there is a salary of 2850, the result is blank.
- TURNER's COMM is 0. Since 0 is a value, `1500 + 0 = 1500` comes out normally. Treating NULL and 0 as the same thing is a mistake.

With comparisons, rows just disappear without any error.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE COMM = NULL) AS EQ_NULL, (SELECT COUNT(*) FROM EMP WHERE COMM IS NULL) AS IS_NULL, (SELECT COUNT(*) FROM EMP WHERE COMM <> 0) AS NE_ZERO FROM DUAL;
```

```text
   EQ_NULL    IS_NULL    NE_ZERO
---------- ---------- ----------
         0         10          3
```

- `COMM = NULL` is not true for any row. It causes no syntax error, so it is easy to miss that it is wrong.
- Why `COMM <> 0` gives 3: the non-zero values are exactly three, 300, 500, and 1400. For the 10 employees with NULL, "is not 0" is also UNKNOWN, so they drop out.
- So even adding the 1 employee from `COMM = 0` and the 3 from `COMM <> 0` does not reach 14. The remaining 10 can be caught only with `IS NULL`.

## Concatenation and Empty Strings (Oracle)

Unlike arithmetic, Oracle's `||` does not become NULL when it meets NULL.

```sql
SELECT EMPNO, ENAME || NULL || '!' AS NAME_NULL, LENGTH(ENAME || NULL) AS LEN FROM EMP WHERE EMPNO IN (7499, 7839) ORDER BY EMPNO;
```

```text
     EMPNO NAME_NULL          LEN
---------- ----------- ----------
      7499 ALLEN!               5
      7839 KING!                4
```

- NULL is skipped like a zero-length string. Likewise `ENAME || COMM` leaves only the name when COMM is NULL, as with KING.
- SQL Server's `+` concatenation gives NULL if NULL is involved under default settings. Differences between DBMSs are collected separately in W8 Day 3.

Oracle does not distinguish the empty string `''` from NULL.

```sql
SELECT CASE WHEN '' IS NULL THEN 'NULL' ELSE 'NOT NULL' END AS EMPTY, LENGTH('') AS LEN, NVL('', 'XYZ') AS NV FROM DUAL;
```

```text
EMPTY           LEN NV
-------- ---------- ---
NULL                XYZ
```

- `'' IS NULL` is true, and `LENGTH('')` is NULL, not 0. NVL also treats `''` as NULL and returns the replacement value.
- So in Oracle, `WHERE column = ''` is the same as `= NULL` and selects no rows at all.

## Aggregate Functions and NULL

What COUNT counts changes depending on what you put in the parentheses.

```sql
SELECT COUNT(*) AS CNT_ALL, COUNT(COMM) AS CNT_COMM, COUNT(MGR) AS CNT_MGR, COUNT(DISTINCT MGR) AS CNT_DMGR, COUNT(DISTINCT DEPTNO) AS CNT_DEPT FROM EMP;
```

```text
   CNT_ALL   CNT_COMM    CNT_MGR   CNT_DMGR   CNT_DEPT
---------- ---------- ---------- ---------- ----------
        14          4         13          6          3
```

| Expression | What it counts | Result on EMP |
|----|-------|--------|
| `COUNT(*)` | Number of rows, regardless of NULL | 14 |
| `COUNT(COMM)` | Rows where COMM is not NULL. 0 is counted too | 4 |
| `COUNT(MGR)` | Rows where MGR is not NULL. Only KING is excluded | 13 |
| `COUNT(DISTINCT MGR)` | Number of distinct values, excluding NULL | 6 |

- The 4 in `COUNT(COMM)` includes TURNER's 0. It is the number of people with a commission value recorded, not "people who receive a commission."
- `COUNT(DISTINCT …)` also does not count NULL as a value.

SUM and AVG also exclude NULL rows from the calculation. In AVG, this changes the denominator.

```sql
SELECT SUM(COMM), AVG(COMM), ROUND(AVG(NVL(COMM, 0)), 2) AS AVG_NVL, ROUND(SUM(COMM) / COUNT(*), 2) AS SUM_CNT FROM EMP;
```

```text
 SUM(COMM)  AVG(COMM)    AVG_NVL    SUM_CNT
---------- ---------- ---------- ----------
      2200        550     157.14     157.14
```

- `AVG(COMM)` is `2200 / 4`. The denominator is `COUNT(COMM)`.
- `AVG(NVL(COMM, 0))` is the average over 14 rows after turning NULL into 0, so it is `2200 / 14`. It gives the same value as `SUM(COMM) / COUNT(*)`.
- If asked for the "average commission across all employees," use the two expressions below, and if "among employees who have a commission value," use `AVG(COMM)`.

When NULL enters arithmetic inside an aggregate, it vanishes row by row first.

```sql
SELECT SUM(SAL + COMM) AS SUM_PLUS, SUM(SAL) + SUM(COMM) AS PLUS_SUM FROM EMP;
```

```text
  SUM_PLUS   PLUS_SUM
---------- ----------
      7800      31225
```

- `SUM(SAL + COMM)` first computes `SAL + COMM` for each row. For the 10 employees with NULL COMM, the sum is NULL so they drop out, leaving only 4 employees.
- `SUM(SAL) + SUM(COMM)` sums each column while excluding NULL and then adds them, so the salaries of all 14 employees are included.

## Aggregation over 0 Target Rows

Department 40 has no employees.

```sql
SELECT COUNT(*), COUNT(COMM), SUM(SAL), MAX(SAL), NVL(SUM(SAL), 0) AS NVL_SUM FROM EMP WHERE DEPTNO = 40;
```

```text
  COUNT(*) COUNT(COMM)   SUM(SAL)   MAX(SAL)    NVL_SUM
---------- ----------- ---------- ---------- ----------
         0           0                                0
```

- An aggregate without GROUP BY produces 1 result row even when there are no target rows. COUNT is 0, and SUM and MAX are NULL.
- If you need 0, wrap the outside of the aggregate, as in `NVL(SUM(SAL), 0)`. `SUM(NVL(SAL, 0))` has no rows to add, so it is still NULL.
- If you add `GROUP BY DEPTNO` to the same condition, there are no groups to create, so the result is 0 rows. No row with COUNT 0 appears.

> ⚠️ **Pitfall**: If you get "the number of employees in department 40" with `SELECT DEPTNO, COUNT(*) FROM EMP WHERE DEPTNO = 40 GROUP BY DEPTNO`, you get 0 rows, not 0. To see departments with no employees as 0, do an outer join based on DEPT and then count a column that becomes NULL, such as `COUNT(E.EMPNO)`.

## NOT IN and NOT EXISTS

`IN` expands to OR and `NOT IN` expands to AND (W5 Day 1). When the list contains NULL, the two give different results.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (10, NULL)) AS IN_CNT, (SELECT COUNT(*) FROM EMP WHERE DEPTNO NOT IN (10, NULL)) AS NOT_IN_CNT FROM DUAL;
```

```text
    IN_CNT NOT_IN_CNT
---------- ----------
         3          0
```

- `DEPTNO IN (10, NULL)` is `DEPTNO = 10 OR DEPTNO = NULL`. The 3 employees in department 10, where the first part is true, remain.
- `DEPTNO NOT IN (10, NULL)` is `DEPTNO <> 10 AND DEPTNO <> NULL`. The latter part is always UNKNOWN, so the whole AND can never be true.

The same applies when a subquery returns NULL. We find "employees whose salary does not equal anyone's commission amount" in two ways.

```sql
SELECT COUNT(*) FROM EMP WHERE SAL NOT IN (SELECT COMM FROM EMP);
```

```text
  COUNT(*)
----------
         0
```

```sql
SELECT COUNT(*) FROM EMP E WHERE NOT EXISTS (SELECT 1 FROM EMP C WHERE C.COMM = E.SAL);
```

```text
  COUNT(*)
----------
        14
```

- The commission values are 300, 500, 1400, and 0, and no salary equals any of them. The correct answer is 14 employees, but NOT IN returned 0. This is because 10 of the 14 subquery result rows are NULL.
- NOT EXISTS only checks "is there no row satisfying the condition." A row where `C.COMM = E.SAL` is UNKNOWN is simply not a "satisfying row," so it does not spoil the result.
- To rescue NOT IN, put `WHERE COMM IS NOT NULL` in the subquery. Then you get 14.

| Construct | When the subquery contains NULL |
|------|-------------------|
| `IN (subquery)` | True if a matching value exists. NULL is effectively ignored |
| `NOT IN (subquery)` | 0 rows (no error) |
| `NOT EXISTS (subquery)` | Not affected by NULL |

## NVL, NVL2, NULLIF, COALESCE

We line up the four NULL functions from W3 Day 4 side by side on the same rows.

```sql
SELECT EMPNO, ENAME, COMM, MGR, NVL(COMM, 0) AS NV, NVL2(COMM, 'Y', 'N') AS NV2, NULLIF(COMM, 0) AS NIF, COALESCE(COMM, MGR, 0) AS COAL FROM EMP WHERE EMPNO IN (7369, 7499, 7839, 7844) ORDER BY EMPNO;
```

```text
     EMPNO ENAME            COMM        MGR         NV N        NIF       COAL
---------- ---------- ---------- ---------- ---------- - ---------- ----------
      7369 SMITH                       7902          0 N                  7902
      7499 ALLEN             300       7698        300 Y        300        300
      7839 KING                                      0 N                     0
      7844 TURNER              0       7698          0 Y                     0
```

| Function | Value returned | Where it gets confusing |
|------|---------|-----------|
| `NVL(a, b)` | b if a is NULL, otherwise a | Only two arguments |
| `NVL2(a, b, c)` | b if a is **not** NULL, c if NULL | Easy to swap the order of b and c. TURNER's 0 gives Y |
| `NULLIF(a, b)` | NULL if a and b are equal, otherwise a | It is a function that creates NULL, not one that removes it |
| `COALESCE(a, b, …)` | The first non-NULL value from the left | For SMITH, COMM is NULL, so MGR 7902 comes out |

- The NV2 column header is cut to a single letter `N` because SQL*Plus fits it to the width of the value (1 character).
- On the TURNER line, NULLIF turns 0 into NULL, while NVL leaves 0 as 0. The two functions work in opposite directions.

## Where NULL Sorts

Oracle sorts NULL as if it were the largest value (W4 Day 3). Look at MGR in department 10.

```sql
SELECT ENAME, MGR FROM EMP WHERE DEPTNO = 10 ORDER BY MGR DESC;
```

```text
ENAME             MGR
---------- ----------
KING
CLARK            7839
MILLER           7782
```

```sql
SELECT ENAME, MGR FROM EMP WHERE DEPTNO = 10 ORDER BY MGR DESC NULLS LAST;
```

```text
ENAME             MGR
---------- ----------
CLARK            7839
MILLER           7782
KING
```

| Sort | Oracle default NULL position | To reverse it |
|------|---------------|---------|
| ASC | Last | `NULLS FIRST` |
| DESC | First | `NULLS LAST` |

- SQL Server does the opposite: it treats NULL as the smallest value and places it first in ASC.

## = NULL Inside CASE

You make the same mistake you made in WHERE inside CASE too. DECODE is the exception.

```sql
SELECT ENAME, COMM, CASE WHEN COMM = NULL THEN 'NONE' ELSE 'HAS' END AS EQ, CASE COMM WHEN NULL THEN 'NONE' ELSE 'HAS' END AS SMP, CASE WHEN COMM IS NULL THEN 'NONE' ELSE 'HAS' END AS ISN, DECODE(COMM, NULL, 'NONE', 'HAS') AS DEC FROM EMP WHERE DEPTNO = 30 ORDER BY ENAME;
```

```text
ENAME            COMM EQ   SMP  ISN  DEC
---------- ---------- ---- ---- ---- ----
ALLEN             300 HAS  HAS  HAS  HAS
BLAKE                 HAS  HAS  NONE NONE
JAMES                 HAS  HAS  NONE NONE
MARTIN           1400 HAS  HAS  HAS  HAS
TURNER              0 HAS  HAS  HAS  HAS
WARD              500 HAS  HAS  HAS  HAS
```

- EQ column: `WHEN COMM = NULL` is UNKNOWN, so the WHEN does not hold and every row goes to ELSE.
- SMP column: the simple CASE `CASE COMM WHEN NULL` is also an internal `COMM = NULL` comparison, so the result is the same.
- ISN column: to separate NULL, use `IS NULL` in a searched CASE.
- DEC column: DECODE treats NULL and NULL as equal. CASE and DECODE, which look like they mean the same thing, part ways here.

> ⚠️ **Pitfall**: If you drop the ELSE and COUNT `CASE WHEN COMM = NULL THEN 1 END`, you get 0 with no error. Using `DECODE(COMM, NULL, 1)` in the same spot gives the number of rows where COMM is NULL.

> Tomorrow we will go over the pitfalls of SQL execution order and of joins that change the number of result rows.

## 📖 Glossary

- **UNKNOWN** : The result of comparing with NULL. It is neither true nor false, and in WHERE, HAVING, and CASE WHEN it is treated as not true.
- **IS NULL / IS NOT NULL** : The only comparisons that test whether a value is NULL. `= NULL` cannot serve this role.
- **COUNT(\*) / COUNT(column)** : The former is the number of rows, the latter the number of rows where that column is not NULL.
- **NVL2** : An Oracle function used as `NVL2(a, b, c)` that returns b if a is not NULL and c if it is NULL.
- **NULLIF** : A function used as `NULLIF(a, b)` that returns NULL if the two values are equal and a if they differ.
- **COALESCE** : A function that returns the first non-NULL value from the left among its arguments.
- **NULLS FIRST / NULLS LAST** : Oracle options in ORDER BY that place NULL at the very front or very back.

## 📝 Practice Questions

**Question 1.** What is the result of `SELECT AVG(COMM) FROM EMP WHERE DEPTNO = 30;`? (The COMM values of the 6 employees in department 30 are 300, 500, 1400, 0, NULL, NULL)

A) 366.67  
B) 550  
C) 733.33  
D) NULL  

**Answer: B**  
Explanation: AVG excludes NULL, so it is the average of the 4 rows with values, `2200 / 4 = 550`. The 0 is not NULL, so it goes into the denominator. A is the value of `AVG(NVL(COMM, 0))`, which treats NULL as 0 and divides by 6. C is the value when 0 is also excluded and divided by 3. D is the result when there are no target rows at all.

---

**Question 2.** What is the result of `SELECT COUNT(*) FROM EMP WHERE DEPTNO NOT IN (20, 30, NULL);`? (Employees per department: 3 in department 10, 5 in department 20, 6 in department 30)

A) 3  
B) 11  
C) 14  
D) 0  

**Answer: D**  
Explanation: `NOT IN` expands to `DEPTNO <> 20 AND DEPTNO <> 30 AND DEPTNO <> NULL`. The last comparison is always UNKNOWN, so no row can be true and the result is 0. 3 is the result if NULL were removed from the list. 11 is the value obtained by excluding only the 3 employees of department 10, the opposite of the list, and 14 assumes the NOT IN condition filters out no rows at all.

---

**Question 3.** TURNER's COMM is 0. What is the result of `SELECT NVL2(NULLIF(COMM, 0), 'Y', 'N') FROM EMP WHERE ENAME = 'TURNER';`?

A) N  
B) Y  
C) 0  
D) NULL  

**Answer: A**  
Explanation: `NULLIF(0, 0)` is NULL because the two values are equal. `NVL2(NULL, 'Y', 'N')` returns the third argument, N, because the first argument is NULL. B is the answer that treats 0 as a non-NULL value and skips NULLIF. C is the answer that stops at the NULLIF result, and D assumes NVL2 passes NULL through as is.

---

**Question 4.** Department 40 has no employees. What is the result of `SELECT COUNT(*), SUM(SAL) FROM EMP WHERE DEPTNO = 40;`?

A) The result is 0 rows  
B) 0, 0  
C) 0, NULL  
D) NULL, NULL  

**Answer: C**  
Explanation: An aggregate without GROUP BY produces one row even when there are no target rows. COUNT returns 0, and SUM returns NULL because there is nothing to add. A is the result when `GROUP BY DEPTNO` is added. B assumes SUM is also 0, which you get only by using `NVL(SUM(SAL), 0)`. D misses the fact that COUNT does not return NULL.

---

**Question 5.** In EMP, 10 employees have NULL COMM. What is the result of `SELECT COUNT(CASE WHEN COMM = NULL THEN 1 END), COUNT(DECODE(COMM, NULL, 1)) FROM EMP;`?

A) 0, 10  
B) 10, 10  
C) 0, 0  
D) 10, 0  

**Answer: A**  
Explanation: `COMM = NULL` is UNKNOWN, so the WHEN does not hold, and with no ELSE every row becomes NULL. COUNT does not count NULL, so it is 0. DECODE treats NULL and NULL as equal, so it returns 1 for the 10 rows where COMM is NULL, giving 10. B assumes the `= NULL` in CASE works. C assumes DECODE is also an `=` comparison, and D swaps the behavior of the two expressions.
