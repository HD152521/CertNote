# Day 3 - The ORDER BY Clause and Sorting

## 📌 Key Takeaways

- Without ORDER BY, **row order is not guaranteed.** The order in a result is decided by ORDER BY.
- A sort key can be a **column name, a SELECT alias, or a position number in the SELECT list**. With several keys, the next key breaks ties when the earlier key is equal.
- Oracle treats **NULL as the largest value**. It goes last in ASC and first in DESC. SQL Server is the opposite.
- `NULLS FIRST` / `NULLS LAST` let you set the NULL position directly (Oracle).
- You can also sort by a column that is not in SELECT. But **with DISTINCT it is ORA-01791**, and with GROUP BY only GROUP BY columns or aggregate functions are allowed.

## Only ORDER BY Decides the Order

The rows of a table have no fixed order. Running the same SELECT twice does not guarantee the same order, and if the execution plan or the storage location changes, the order can change too. The only thing that decides the order of a result is ORDER BY.

- ORDER BY is **the very last** step in the logical execution order. It sorts the result after SELECT is finished.
- The default is ascending, `ASC`, and for descending you add `DESC`.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL;
```

```text
ENAME             SAL
---------- ----------
SMITH             800
ADAMS            1100
JONES            2975
FORD             3000
SCOTT            3000
```

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC;
```

```text
ENAME             SAL
---------- ----------
SCOTT            3000
FORD             3000
JONES            2975
ADAMS            1100
SMITH             800
```

- The order of FORD and SCOTT, who have the same salary, was swapped between the two runs. That is because DESC is not simply the ascending result reversed but a fresh sort, and the order among equal values was never specified.
- To also fix the order of rows with equal values, add one more sort key.

## Three Ways to Write a Sort Key

| Method | Example | Note |
|------|-----|------|
| Column name (or expression) | `ORDER BY SAL` | It does not have to be in SELECT (see the restrictions below) |
| SELECT alias | `ORDER BY ANNUAL` | ORDER BY comes after SELECT, so it knows the alias |
| Position number | `ORDER BY 3` | Which column of the SELECT list it is |

An example of sorting by alias.

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

An example of sorting by position number. The 3 is the third column of the SELECT list, SAL.

```sql
SELECT ENAME, JOB, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY 3 DESC;
```

```text
ENAME      JOB              SAL
---------- --------- ----------
KING       PRESIDENT       5000
CLARK      MANAGER         2450
MILLER     CLERK           1300
```

- The position number is **the order in the SELECT list, not the column order of the table**. The third column of EMP is JOB, but here 3 means SAL.
- Using a number larger than the SELECT list is an error.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY 4;
```

```text
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY 4
                                                      *
ERROR at line 1:
ORA-01785: ORDER BY item must be the number of a SELECT-list expression
```

An alias created with double quotation marks is case-sensitive, so it must be written in the same form in ORDER BY too.

```sql
SELECT ENAME AS "Name", SAL FROM EMP WHERE DEPTNO = 10 ORDER BY "Name";
```

```text
Name              SAL
---------- ----------
CLARK            2450
KING             5000
MILLER           1300
```

## Sorting by Several Keys

If you list keys separated by commas, the result is **sorted by the first key, and only rows with the same first key are sorted by the second key**. ASC and DESC are attached to each key separately.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC, ENAME ASC;
```

```text
ENAME             SAL
---------- ----------
FORD             3000
SCOTT            3000
JONES            2975
ADAMS            1100
SMITH             800
```

- FORD and SCOTT, tied at 3000, were ordered by name. Unlike the first example, this order is the same every time.
- `DESC` applies only to the key right before it, SAL. ENAME follows the `ASC` written separately (it is the same if omitted).

This is the typical two-level sort: highest salary first within each department.

```sql
SELECT ENAME, DEPTNO, SAL
FROM EMP
WHERE JOB IN ('CLERK', 'MANAGER')
ORDER BY DEPTNO, SAL DESC;
```

```text
ENAME          DEPTNO        SAL
---------- ---------- ----------
CLARK              10       2450
MILLER             10       1300
JONES              20       2975
ADAMS              20       1100
SMITH              20        800
BLAKE              30       2850
JAMES              30        950
```

- The department numbers are grouped first in ascending order, and salary is descending only within a department.
- If you swap the key order and write `ORDER BY SAL DESC, DEPTNO`, you get a completely different result, mixed into one salary order.

Sometimes a key is meaningless. If the first key values are all different, the second key never comes into play.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 ORDER BY ENAME DESC, SAL;
```

```text
ENAME             SAL
---------- ----------
MILLER           1300
KING             5000
CLARK            2450
```

- No names overlap, so SAL has no effect on the order.

## Where Does NULL Go?

When sorting, Oracle treats **NULL as a value larger than any other**. We check it with COMM in department 30 (BLAKE and JAMES are NULL, TURNER is 0).

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

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC, ENAME;
```

```text
ENAME            COMM
---------- ----------
BLAKE
JAMES
MARTIN           1400
WARD              500
ALLEN             300
TURNER              0
```

- ASC: the largest value goes last, so NULL is **last**.
- DESC: the largest value goes first, so NULL is **first**.
- 0 is not NULL. TURNER is at the very front of the ascending order, that is, in the place of the smallest value.

### NULLS FIRST / NULLS LAST

Oracle lets you set the NULL position separately from the sort direction.

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM NULLS FIRST, ENAME;
```

```text
ENAME            COMM
---------- ----------
BLAKE
JAMES
TURNER              0
ALLEN             300
WARD              500
MARTIN           1400
```

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC NULLS LAST, ENAME;
```

```text
ENAME            COMM
---------- ----------
MARTIN           1400
WARD              500
ALLEN             300
TURNER              0
BLAKE
JAMES
```

| Sort | Oracle default | To change it |
|------|------------|---------|
| `ASC` | NULL last | `ASC NULLS FIRST` |
| `DESC` | NULL first | `DESC NULLS LAST` |

- `NULLS FIRST` and `NULLS LAST` go right after the key they apply to. They can be used together with the sort direction (ASC, DESC).
- You can also move the position by turning NULL into a value with NVL and then sorting. `ORDER BY NVL(COMM, -1) DESC` treats NULL as -1 and sends it to the end.

> ⚠️ **DBMS difference**: SQL Server treats NULL as **the smallest value**. So NULL comes first in ASC and last in DESC, exactly the opposite of Oracle. If the question names the DBMS, judge by that one.

## Sorting by a Column Not in SELECT

A plain SELECT can sort by a column that is not in the SELECT list. Even though ORDER BY is processed after SELECT, the original row's column values are still available.

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 ORDER BY SAL DESC;
```

```text
ENAME
----------
KING
CLARK
MILLER
```

- SAL is not shown, but the order is descending by salary (5000 → 2450 → 1300).

### Not Allowed with DISTINCT

DISTINCT merges duplicates based on the SELECT list. A merged row contains several original rows, so a single SAL value cannot be determined.

```sql
SELECT DISTINCT JOB FROM EMP ORDER BY SAL;
```

```text
SELECT DISTINCT JOB FROM EMP ORDER BY SAL
                                      *
ERROR at line 1:
ORA-01791: not a SELECTed expression
```

- Behind the single CLERK row are four salaries: 800, 1100, 950, and 1300. There is no way to decide which value to sort by.
- With DISTINCT, sort only by columns in the SELECT list: `SELECT DISTINCT JOB FROM EMP ORDER BY JOB`.

### With GROUP BY, It Works per Group

ORDER BY in a GROUP BY query follows the same rules as SELECT. Only GROUP BY columns or aggregate functions can be used.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO ORDER BY SAL;
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO ORDER BY SAL
                                                          *
ERROR at line 1:
ORA-00979: "SAL": must appear in the GROUP BY clause or be used in an aggregate function
```

Wrapped in an aggregate function, it can be a sort key even if it is not in SELECT.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO ORDER BY MAX(SAL) DESC;
```

```text
    DEPTNO        CNT
---------- ----------
        10          3
        20          5
        30          6
```

- It was sorted by each department's highest salary in the order 5000, 3000, 2850. MAX(SAL) is not on the screen.

| Query form | Sorting by a column not in SELECT |
|----------|------------------------|
| Plain SELECT | Possible |
| `SELECT DISTINCT` | Not possible (ORA-01791) |
| GROUP BY | Only GROUP BY columns and aggregate functions (anything else is ORA-00979) |

> Tomorrow we cover joins, which attach two tables together, using Oracle's notation.

## 📖 Glossary

- **ORDER BY**: The clause that decides the order of the result. It is the last step in the logical execution order.
- **ASC / DESC**: Ascending / descending. If omitted, it is ASC.
- **Sorting by position number**: A way to specify a sort key by which column of the SELECT list it is, as in `ORDER BY 2`.
- **Multiple sort keys**: A sort in which the next key orders only the rows whose earlier key is equal.
- **NULLS FIRST / NULLS LAST**: Oracle sort options that put NULL first / last.
- **ORA-01791**: The error raised when a DISTINCT query is sorted by an expression that is not in the SELECT list.
- **ORA-01785**: The error raised when an ORDER BY position number exceeds the number of columns in the SELECT list.

## 📝 Practice Questions

**Question 1.** The COMM values of the employees in department 30 are 0, 300, 500, 1400, and two NULLs. When the following SQL is run in Oracle, what is the COMM value in the last row?

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM;
```

A) 0  
B) 1400  
C) 300  
D) NULL  

**Answer: D**  
Explanation: Oracle treats NULL as the largest value when sorting. In ascending order, large values go to the back, so the rows with NULL come last. 0 is not NULL; it is the smallest value, so it comes first.

---

**Question 2.** The salaries in department 20 are SMITH 800, ADAMS 1100, JONES 2975, SCOTT 3000, and FORD 3000. What is the ENAME in the second row of the following SQL result?

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 20 ORDER BY SAL DESC, ENAME;
```

A) FORD  
B) SCOTT  
C) JONES  
D) ADAMS  

**Answer: B**  
Explanation: With the first key, SAL descending, FORD and SCOTT at 3000 come first. They have the same SAL, so the second key, ENAME ascending, separates them, giving FORD then SCOTT. The second row is SCOTT.

---

**Question 3.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT DISTINCT JOB FROM EMP ORDER BY SAL;
```

A) The 5 jobs appear in ascending salary order  
B) The 5 jobs appear in name order  
C) An ORA-01791 error occurs  
D) 14 rows appear  

**Answer: C**  
Explanation: DISTINCT merges duplicate rows based on the SELECT list. A merged JOB row mixes the SAL values of several employees, so the sort value cannot be decided. That is why sorting by SAL, which is not in the SELECT list, gives ORA-01791 (not a SELECTed expression).

---

**Question 4.** Which of the following ORDER BY clauses causes an error when attached after `SELECT ENAME, SAL FROM EMP`?

A) ORDER BY 3  
B) ORDER BY SAL * 12  
C) ORDER BY DEPTNO  
D) ORDER BY NVL(COMM, 0) DESC  

**Answer: A**  
Explanation: A position number points to the order in the SELECT list, so 3 is a position that does not exist in a two-column list. Oracle raises ORA-01785. Because this is a plain SELECT with no DISTINCT or GROUP BY, sorting by DEPTNO or an expression that is not in SELECT is possible.

---

**Question 5.** The COMM values for department 30 are MARTIN 1400, WARD 500, ALLEN 300, TURNER 0, and BLAKE and JAMES are NULL. What is the ENAME in the first row of the following SQL result?

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC NULLS LAST;
```

A) BLAKE  
B) TURNER  
C) MARTIN  
D) JAMES  

**Answer: C**  
Explanation: Oracle's descending order normally puts NULL first, but `NULLS LAST` sends NULL to the end. Among the remaining values, the largest is 1400, so MARTIN becomes the first row.
