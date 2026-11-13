# Day 1 - Ranking Functions

## 📌 Key Takeaways

- A window function looks like `function() OVER (PARTITION BY … ORDER BY …)`. Unlike GROUP BY, it does not reduce the number of rows; it attaches a value to every row.
- Tie handling is what separates the three. **RANK** gives 1, 2, 2, 4 / **DENSE_RANK** gives 1, 2, 2, 3 / **ROW_NUMBER** gives 1, 2, 3, 4.
- With `PARTITION BY`, the ranking restarts at 1 for each group. If you omit it, the whole result set is one group.
- Window functions can only be used in the SELECT clause and the ORDER BY clause. Using one in WHERE or HAVING raises **ORA-30483**; to filter by rank, wrap the query in an inline view.
- Window functions are calculated in the SELECT step, on the rows that remain after WHERE, GROUP BY, and HAVING.

## Aggregation Without Reducing Rows

In W4, a GROUP BY that totals by department leaves only one row per department. To see an employee's name together with that employee's rank, you need to keep the rows as they are and just attach a value. Window functions do exactly that.

```text
function_name(argument) OVER (
    [PARTITION BY column]          -- which group to calculate within
    [ORDER BY column [ASC|DESC]]   -- in what order to look at rows within the group
    [ROWS | RANGE window clause]   -- how many rows to include in the calculation range (Day 2)
)
```

- Only a function with `OVER` is a window function. A `RANK` without `OVER` is interpreted as the aggregate-type RANK in the last section below.
- All three parts inside the parentheses can be omitted. However, ranking functions require `ORDER BY`.
- The group that a window function works on is called a **partition**. It is similar to a GROUP BY group, but rows are not merged.

## RANK · DENSE_RANK · ROW_NUMBER

Let's put the three functions side by side, ordered by salary descending. Two people have a salary of 3000 (FORD and SCOTT), and two have 1250 (MARTIN and WARD).

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK, DENSE_RANK() OVER (ORDER BY SAL DESC) AS DRNK, ROW_NUMBER() OVER (ORDER BY SAL DESC, ENAME) AS RN FROM EMP ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL        RNK       DRNK         RN
---------- ---------- ---------- ---------- ----------
KING             5000          1          1          1
FORD             3000          2          2          2
SCOTT            3000          2          2          3
JONES            2975          4          3          4
BLAKE            2850          5          4          5
CLARK            2450          6          5          6
ALLEN            1600          7          6          7
TURNER           1500          8          7          8
MILLER           1300          9          8          9
MARTIN           1250         10          9         10
WARD             1250         10          9         11
ADAMS            1100         12         10         12
JAMES             950         13         11         13
SMITH             800         14         12         14
```

| Function | Tie handling | Rank after a tie | Last value (14 employees) |
|------|---------|-------------|---------------|
| RANK | Same rank | Skips as many ranks as there are tied rows (2, 2 → **4**) | 14 |
| DENSE_RANK | Same rank | Does not skip (2, 2 → **3**) | 12 (the number of distinct salaries) |
| ROW_NUMBER | Different numbers | Always increases by 1 | 14 |

- The last RANK value in the table above is 14 because, when EMP is ordered by salary descending, there is no tie at the very end (SMITH, 800). If the last value is tied, the last rank is smaller than the row count. If you order department 20 by salary ascending, FORD and SCOTT share 4th place with 3000, and there are 5 rows.
- The last DENSE_RANK value is the **number of distinct values**. EMP has 12 distinct salaries.
- Olympic medal standings are RANK. If two athletes tie for 2nd place, the next athlete is 4th.

### ROW_NUMBER and Ties

ROW_NUMBER gives each row its own number even when there is a tie. But which of FORD and SCOTT gets number 2 is not decided by `ORDER BY SAL DESC` alone.

```sql
SELECT ENAME, SAL, ROW_NUMBER() OVER (ORDER BY SAL DESC) AS RN FROM EMP WHERE SAL >= 2900 ORDER BY RN;
```

```text
ENAME             SAL         RN
---------- ---------- ----------
KING             5000          1
FORD             3000          2
SCOTT            3000          3
JONES            2975          4
```

- In the practice container, FORD got number 2. Oracle does not guarantee this order. If the execution plan changes, SCOTT can become number 2, and in this site's practice lab SCOTT actually comes out as number 2.
- To fix the numbering, give a second key that breaks the tie, like `ORDER BY SAL DESC, ENAME`. The RN column in the three-function comparison above was built that way.

> ⚠️ **Pitfall**: The `ORDER BY` inside a window is only the order in which ranks are assigned. The order of rows on the result screen is decided by the `ORDER BY` at the end of the statement. If you leave out the final ORDER BY, there is no guarantee the rows come out in rank order.

## Sort Direction and NULL

Ranking functions follow the ORDER BY NULL rules as they are. Oracle treats NULL as the largest value. So in descending order, NULL comes first, that is, it becomes rank 1.

```sql
SELECT ENAME, SAL, COMM, RANK() OVER (ORDER BY COMM DESC) AS RNK FROM EMP WHERE DEPTNO = 30 ORDER BY RNK, ENAME;
```

```text
ENAME             SAL       COMM        RNK
---------- ---------- ---------- ----------
BLAKE            2850                     1
JAMES             950                     1
MARTIN           1250       1400          3
WARD             1250        500          4
ALLEN            1600        300          5
TURNER           1500          0          6
```

- BLAKE and JAMES, who have no commission, tie for 1st place. NULLs were treated as ties with each other.
- To rank only the people who have a commission, either push NULLs to the end with `ORDER BY COMM DESC NULLS LAST`, or filter them out in WHERE with `COMM IS NOT NULL`.

## PARTITION BY — Ranking Within a Group

With `PARTITION BY DEPTNO`, the ranking restarts at 1 every time the department changes.

```sql
SELECT DEPTNO, ENAME, SAL, RANK() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC) AS RNK FROM EMP ORDER BY DEPTNO, RNK, ENAME;
```

```text
    DEPTNO ENAME             SAL        RNK
---------- ---------- ---------- ----------
        10 KING             5000          1
        10 CLARK            2450          2
        10 MILLER           1300          3
        20 FORD             3000          1
        20 SCOTT            3000          1
        20 JONES            2975          3
        20 ADAMS            1100          4
        20 SMITH             800          5
        30 BLAKE            2850          1
        30 ALLEN            1600          2
        30 TURNER           1500          3
        30 MARTIN           1250          4
        30 WARD             1250          4
        30 JAMES             950          6
```

- There are still 14 rows. With GROUP BY DEPTNO, they would have shrunk to 3 rows.
- FORD and SCOTT in department 20 tie for 1st place within the department, and JONES is 3rd.
- PARTITION BY can take several columns. `PARTITION BY DEPTNO, JOB` counts separately for each department-job combination.

Switch to DENSE_RANK and there are no skipped ranks within the same partition. This is salary ascending by job.

```sql
SELECT JOB, ENAME, SAL, DENSE_RANK() OVER (PARTITION BY JOB ORDER BY SAL) AS DR FROM EMP WHERE JOB IN ('SALESMAN', 'CLERK') ORDER BY JOB, DR, ENAME;
```

```text
JOB       ENAME             SAL         DR
--------- ---------- ---------- ----------
CLERK     SMITH             800          1
CLERK     JAMES             950          2
CLERK     ADAMS            1100          3
CLERK     MILLER           1300          4
SALESMAN  MARTIN           1250          1
SALESMAN  WARD             1250          1
SALESMAN  TURNER           1500          2
SALESMAN  ALLEN            1600          3
```

- Among SALESMAN, MARTIN and WARD tie for 1st, and TURNER is 2nd. With RANK, TURNER would be 3rd.

## When ORDER BY Is Missing

A ranking function needs to know what to line the rows up by. Leaving it empty, as in `OVER ()`, is an error.

```sql
SELECT ENAME, SAL, RANK() OVER () AS RNK FROM EMP WHERE DEPTNO = 10;
```

```text
SELECT ENAME, SAL, RANK() OVER () AS RNK FROM EMP WHERE DEPTNO = 10
                   *
ERROR at line 1:
ORA-30485: missing ORDER BY expression in the window specification
```

- In Oracle, ROW_NUMBER raises the same ORA-30485.
- Aggregate-type window functions such as SUM and AVG accept `OVER ()`. They treat all rows as one partition and attach the same value to each row (Day 2).

## You Can't Use It in WHERE — ORA-30483

If you put a ranking function in WHERE to get "the top 3 salaries", you get an error.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3;
```

```text
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3
                                                                         *
ERROR at line 1:
ORA-30483: window  functions are not allowed here
```

The same goes for HAVING.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING RANK() OVER (ORDER BY COUNT(*) DESC) = 1;
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING RANK() OVER (ORDER BY COUNT(*) DESC) = 1
                                                        *
ERROR at line 1:
ORA-30483: window  functions are not allowed here
```

The fix is the inline view from W5 Day 2. Calculate the rank inside as a column, then filter on that column in the outer WHERE.

```sql
SELECT ENAME, SAL, RNK FROM (SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP) WHERE RNK <= 3 ORDER BY RNK, ENAME;
```

```text
ENAME             SAL        RNK
---------- ---------- ----------
KING             5000          1
FORD             3000          2
SCOTT            3000          2
```

- Once the inner SELECT finishes, RNK is an ordinary column. The outer WHERE simply compares that column.
- Using the alias `RNK` from the same SELECT in WHERE doesn't work either, because WHERE is processed before SELECT (ORA-00904).

Top 2 per department works the same way. To get exactly 2 per department even with ties, use ROW_NUMBER.

```sql
SELECT DEPTNO, ENAME, SAL FROM (SELECT DEPTNO, ENAME, SAL, ROW_NUMBER() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC, ENAME) AS RN FROM EMP) WHERE RN <= 2 ORDER BY DEPTNO, RN;
```

```text
    DEPTNO ENAME             SAL
---------- ---------- ----------
        10 KING             5000
        10 CLARK            2450
        20 FORD             3000
        20 SCOTT            3000
        30 BLAKE            2850
        30 ALLEN            1600
```

| Condition | Function to choose | Result for department 20 (`<= 2`) |
|------|---------|---------------------|
| Include all ties | RANK or DENSE_RANK | FORD·SCOTT (both 1st) |
| Exactly n rows | ROW_NUMBER (+ a key to break ties) | FORD·SCOTT (numbers 1 and 2) |
| Everyone up to the 3rd-highest salary | DENSE_RANK `<= 3` | FORD·SCOTT·JONES·ADAMS |

- Department 20 happens to give the same result. Change it to `<= 1`, and RANK returns two rows while ROW_NUMBER returns one.

## Where It Sits in the Execution Order

Put window functions into the W4 Day 2 execution order, and it looks like this.

```text
FROM → WHERE → GROUP BY → HAVING → SELECT (window function calculation) → ORDER BY
```

- A window function only sees **the rows that passed WHERE**. If you keep only department 20 and then assign ranks, you get ranks within the department, not overall ranks.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE DEPTNO = 20 ORDER BY RNK, ENAME;
```

```text
ENAME             SAL        RNK
---------- ---------- ----------
FORD             3000          1
SCOTT            3000          1
JONES            2975          3
ADAMS            1100          4
SMITH             800          5
```

- JONES was 4th overall but is 3rd here, because KING was removed by WHERE.
- Since it is calculated after GROUP BY, you can also rank aggregate results. Put the aggregate function inside the window, as in `ORDER BY SUM(SAL)`.

```sql
SELECT DEPTNO, SUM(SAL) AS SUM_SAL, RANK() OVER (ORDER BY SUM(SAL) DESC) AS RNK FROM EMP GROUP BY DEPTNO ORDER BY RNK;
```

```text
    DEPTNO    SUM_SAL        RNK
---------- ---------- ----------
        20      10875          1
        30       9400          2
        10       8750          3
```

- ORDER BY comes after SELECT, so it can use window functions. `ORDER BY RANK() OVER (ORDER BY SAL DESC), ENAME` does not raise an error.

## RANK Without OVER

`RANK(value) WITHIN GROUP (ORDER BY column)` is not a window function but an aggregate function. It returns, as a single row, "what rank would this value get if it were inserted?"

```sql
SELECT RANK(1500) WITHIN GROUP (ORDER BY SAL DESC) AS RNK FROM EMP;
```

```text
       RNK
----------
         8
```

- A salary of 1500 equals TURNER's salary, so TURNER's rank, 8, came out.
- With OVER you get a value per row; with WITHIN GROUP you get a single result row. In answer choices, tell the two forms apart.

> Tomorrow we cover aggregate window functions that use SUM and AVG with OVER, and LAG and LEAD, which fetch the previous and next rows.

## 📖 Glossary

- **Window function**: A function that attaches a calculated value to each row without merging rows. It comes with an `OVER` clause. Also called an analytic function.
- **Partition**: A group split off by `PARTITION BY`. A window function calculates separately for each partition.
- **RANK**: Gives tied rows the same rank, and the next rank skips as many as the number of tied rows (1, 2, 2, 4).
- **DENSE_RANK**: Gives tied rows the same rank, and the next rank does not skip (1, 2, 2, 3).
- **ROW_NUMBER**: Gives a different number, starting from 1, one by one, even for ties. The order among tied rows is decided by a second sort key.
- **ORA-30483**: The error raised when a window function is used where it isn't allowed, such as WHERE, HAVING, or GROUP BY.
- **ORA-30485**: The error raised when a ranking function's OVER has no ORDER BY.
- **Inline view**: A subquery in the FROM clause. It is used to turn a rank into a column and then filter on it from the outside.

## 📝 Practice Questions

**Question 1.** In `SELECT ENAME, DENSE_RANK() OVER (ORDER BY SAL DESC) AS DR FROM EMP;`, what is the DR value for JONES (salary 2975)? (The top salaries are KING 5000, FORD·SCOTT 3000, JONES 2975, in that order.)

A) 4  
B) 3  
C) 2  
D) 5  

**Answer: B**  
Explanation: DENSE_RANK does not skip ranks after a tie. KING is 1, FORD·SCOTT are 2, and JONES is 3. 4 is the value from RANK, which skips as many ranks as there are ties. 2 is the rank of FORD·SCOTT, and 5 is BLAKE's rank under RANK.

---

**Question 2.** Which of the following SQL statements raises an error in Oracle?

A) `SELECT ENAME FROM EMP ORDER BY RANK() OVER (ORDER BY SAL DESC), ENAME;`  
B) `SELECT * FROM (SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) RNK FROM EMP) WHERE RNK <= 3;`  
C) `SELECT DEPTNO, RANK() OVER (ORDER BY SUM(SAL) DESC) FROM EMP GROUP BY DEPTNO;`  
D) `SELECT ENAME FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3;`  

**Answer: D**  
Explanation: A window function cannot be used in the WHERE clause, so it raises ORA-30483. The ORDER BY in A is processed after SELECT, so it can use window functions. B is the normal solution: make the rank a column in an inline view, then filter in the outer WHERE. In C, the window is calculated after GROUP BY, so an aggregate function can be put in the window ORDER BY.

---

**Question 3.** When numbering rows by salary descending, which function gives different numbers even to FORD and SCOTT, who have the same salary?

A) ROW_NUMBER  
B) RANK  
C) DENSE_RANK  
D) COUNT  

**Answer: A**  
Explanation: ROW_NUMBER gives different numbers that increase by 1 even for ties. RANK and DENSE_RANK give ties the same rank. COUNT is not a ranking function; it is an aggregate function that counts rows.

---

**Question 4.** In `SELECT ENAME, RANK() OVER (PARTITION BY DEPTNO ORDER BY SAL DESC) AS RNK FROM EMP;`, what is the RNK of WARD (1250) in department 30? (Department 30 salaries: BLAKE 2850, ALLEN 1600, TURNER 1500, MARTIN 1250, WARD 1250, JAMES 950)

A) 5  
B) 3  
C) 4  
D) 10  

**Answer: C**  
Explanation: PARTITION BY DEPTNO ranks only within department 30. MARTIN and WARD tie for 4th place with 1250. 5 is a value you could get from ROW_NUMBER, which gives ties different numbers. 10 is the rank across all 14 employees without a partition.

---

**Question 5.** In `SELECT ENAME, RANK() OVER (ORDER BY SAL DESC) AS RNK FROM EMP WHERE DEPTNO = 20;`, what is JONES's RNK? (Department 20: FORD 3000, SCOTT 3000, JONES 2975, ADAMS 1100, SMITH 800. The overall 1st place, KING, is in department 10.)

A) 4  
B) 3  
C) 2  
D) 1  

**Answer: B**  
Explanation: The window function calculates only over the 5 employees of department 20 that passed WHERE. FORD·SCOTT tie for 1st, so JONES is 3rd. 4 is the overall rank including KING. 2 is the DENSE_RANK value, and 1 is the rank of FORD·SCOTT.
