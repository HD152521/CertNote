# Day 3 - Top N Queries

## 📌 Key Takeaways

- ROWNUM is a number assigned, starting from 1, to the rows that **pass the WHERE condition**, in sequence. It is assigned before sorting (ORDER BY).
- `ROWNUM = 2` and `ROWNUM > 1` return 0 rows. The first row must receive number 1 before the next row can receive number 2, but the first row fails the condition.
- `WHERE ROWNUM <= 3 ORDER BY SAL DESC` first cuts off an arbitrary 3 rows and then sorts them. If you want the top 3, apply ROWNUM outside an inline view that has already been sorted.
- From 12c on, you can use `ORDER BY … FETCH FIRST n ROWS ONLY`. `OFFSET` skips rows, and `WITH TIES` includes the ties at the end.
- SQL Server uses `SELECT TOP(n)`. `TOP(n) WITH TIES` requires an ORDER BY.

## When You Need Only the Top n Rows

"The top 3 salaries" can also be found with a ranking function, but that approach ranks every row and then filters. Oracle has two mechanisms that cut the row count itself. The old way is **ROWNUM**, and the one introduced in 12c is **FETCH FIRST**.

## When Is ROWNUM Assigned?

ROWNUM is not a column stored in the table. It is a sequence number that Oracle attaches each time a query emits a row.

```sql
SELECT ROWNUM, ENAME, SAL FROM EMP WHERE ROWNUM <= 3;
```

```text
    ROWNUM ENAME             SAL
---------- ---------- ----------
         1 SMITH             800
         2 ALLEN            1600
         3 WARD             1250
```

- Since there is no sorting, which 3 rows come out is not guaranteed. In the practice container, they came out starting from SMITH, in the order they were entered.
- The number is assigned the moment a row passes WHERE. The processing order is as follows.

```text
Read one row
  → Check the WHERE conditions that are not ROWNUM → if it passes, assign the next number (ROWNUM)
  → Check the ROWNUM condition → if it passes, emit it as a result and increase the number by 1
  → (When all rows are done) sort with ORDER BY
```

- If you use it together with other conditions, the rows that pass those conditions receive the numbers. `WHERE DEPTNO = 30 AND ROWNUM <= 3` gives 3 employees from department 30.
- Numbers are used only on rows that are emitted as results. Rows that fail don't take a number.

## Why ROWNUM = 2 Returns 0 Rows

`ROWNUM = 1` returns one row. But `ROWNUM = 2` has no rows at all.

```sql
SELECT COUNT(*) AS CNT FROM EMP WHERE ROWNUM = 2;
```

```text
       CNT
----------
         0
```

1. The first row gets the candidate number 1. `1 = 2` is false, so it is dropped.
2. Since the first row was dropped, the number does not increase. The second row also gets the candidate number 1 and is dropped.
3. All 14 rows get 1 and are dropped. Number 2 never appears.

For the same reason, any condition that doesn't include 1 returns 0 rows.

```sql
SELECT COUNT(*) AS CNT FROM EMP WHERE ROWNUM > 1;
```

```text
       CNT
----------
         0
```

| Condition | Number of result rows (14-row table) | Reason |
|------|---------------------|-----|
| `ROWNUM = 1` | 1 | The first row passes as number 1 |
| `ROWNUM <= 3`, `ROWNUM < 4` | 3 | 1, 2, 3 pass in sequence |
| `ROWNUM >= 1` | 14 | Every row passes |
| `ROWNUM = 2` | 0 | Number 1 doesn't pass, so there is no number 2 |
| `ROWNUM > 1` | 0 | Same as above |
| `ROWNUM BETWEEN 4 AND 6` | 0 | Same as above |

- To get the 4th to 6th rows, **freeze ROWNUM as a column** on the inside and compare it on the outside. The paging example below shows how.

> ⚠️ **Pitfall**: ROWNUM conditions behave as expected only with `=` 1, `<`, and `<=`. `ROWNUM = 2`, `ROWNUM > n`, and `ROWNUM BETWEEN 2 AND …` are not errors; they return 0 rows. A choice saying "it raises an error" is a wrong answer.

## Using It with ORDER BY — Rows Are Cut Before Sorting

If you use ROWNUM and ORDER BY in the same SELECT to get the top 3, you won't get the result you want.

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

- An arbitrary 3 rows (SMITH, ALLEN, WARD) were cut off first in WHERE. ORDER BY sorted only those 3 rows.
- The proof is that ROWNUM is scrambled as 2, 3, 1. The numbers were assigned before sorting.
- Which 3 rows get cut is also not guaranteed. There is no guarantee the result includes KING.

The fix is to put the sorting inside an inline view. The inner result is passed to the outside already sorted, and the outer WHERE assigns numbers in that order.

```sql
SELECT ROWNUM, ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3;
```

```text
    ROWNUM ENAME             SAL
---------- ---------- ----------
         1 KING             5000
         2 FORD             3000
         3 SCOTT            3000
```

- In the inner `ORDER BY SAL DESC, ENAME`, ENAME fixes the order of the tied FORD and SCOTT. Without it, it is not determined which of the two gets number 3.
- ORDER BY inside an inline view is allowed, as we saw in W5 Day 1. It can't be used inside a subquery in the WHERE clause.

### Paging — From the n-th to the m-th Row

To get ranks 4 to 6, use one more layer of inline view. In the middle step, give ROWNUM an alias (RN) to turn it into an ordinary column.

```sql
SELECT ENAME, SAL FROM (SELECT ROWNUM AS RN, ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 6) WHERE RN >= 4;
```

```text
ENAME             SAL
---------- ----------
JONES            2975
BLAKE            2850
CLARK            2450
```

| Step | What it does |
|------|-------|
| Innermost | Sorts by salary descending |
| Middle | Assigns ROWNUM in the sorted order and keeps up to number 6. Freezes it as the RN column |
| Outer | Keeps only the rows where RN is 4 or more. RN is now an ordinary numeric column |

## FETCH FIRST — The Standard Syntax from 12c On

From Oracle 12c, you can use the ANSI-standard row limiting clause. It goes after ORDER BY and cuts the result once sorting is done.

```text
ORDER BY sort_column
[OFFSET number_of_rows_to_skip ROWS]
FETCH { FIRST | NEXT } n { ROW | ROWS } { ONLY | WITH TIES }
```

- `FIRST` and `NEXT`, and `ROW` and `ROWS`, mean the same thing. Pick whichever reads better.
- Since it is processed after ORDER BY, unlike ROWNUM it gives the first n rows of the sorted result.

```sql
SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME FETCH FIRST 3 ROWS ONLY;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
```

### OFFSET — Skipping the First n Rows

Paging shrinks from two layers of inline views to a single line.

```sql
SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY;
```

```text
ENAME             SAL
---------- ----------
JONES            2975
BLAKE            2850
CLARK            2450
```

- It skips the first 3 rows (KING, FORD, SCOTT) and fetches the next 3. The result is the same as the ROWNUM paging above.
- If you use only `OFFSET 12 ROWS` without FETCH, you get everything from the 13th row to the end. In EMP, that is the two rows JAMES and SMITH.

### WITH TIES — Including the Ties at the End

`FETCH FIRST 2 ROWS WITH TIES` additionally fetches all rows that have the same sort value as the 2nd row. The outer ORDER BY is there to fix the display order.

```sql
SELECT * FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC FETCH FIRST 2 ROWS WITH TIES) ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
```

- The 2nd row's salary is 3000, and there is one more row with 3000, so 3 rows came out.
- What decides a tie is the ORDER BY before FETCH. If you add ENAME to the inner ORDER BY too, the tie disappears and only 2 rows come out.
- With `ONLY`, it would be exactly 2 rows. Which of FORD and SCOTT remains is not determined.

| Method | When it is processed | Tie handling | Oracle version |
|------|---------|---------|-----------|
| ROWNUM | WHERE step (before sorting) | Cuts in row order | All versions |
| `ROW_NUMBER() OVER` + inline view | SELECT step → outer WHERE | Exactly n rows | 8i and later |
| `RANK() OVER` + inline view | SELECT step → outer WHERE | Includes ties | 8i and later |
| `FETCH FIRST n ROWS ONLY` | After ORDER BY | Exactly n rows | 12c and later |
| `FETCH FIRST n ROWS WITH TIES` | After ORDER BY | Includes ties at the end | 12c and later |

## Top N with ROW_NUMBER

The approach from Day 1 is also Top N. If you make the number a column with ROW_NUMBER, you can pick a range directly with BETWEEN.

```sql
SELECT ENAME, SAL FROM (SELECT ENAME, SAL, ROW_NUMBER() OVER (ORDER BY SAL DESC, ENAME) AS RN FROM EMP) WHERE RN BETWEEN 4 AND 6 ORDER BY RN;
```

```text
ENAME             SAL
---------- ----------
JONES            2975
BLAKE            2850
CLARK            2450
```

- With ROWNUM, `BETWEEN 4 AND 6` gave 0 rows. RN is a value already calculated in the inline view, so it doesn't have that problem.
- Adding `PARTITION BY` turns it into "top n per department". ROWNUM and FETCH FIRST cut only across the whole result, so Top N per group is the job of window functions.

## SQL Server's TOP

SQL Server uses TOP right after SELECT instead of ROWNUM or FETCH FIRST. The practice lab is Oracle, so below we only look at the syntax.

```text
SELECT TOP(3) ENAME, SAL FROM EMP ORDER BY SAL DESC;              -- 3 rows after sorting
SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP ORDER BY SAL DESC;    -- 2 rows + ties at the end
SELECT TOP(20) PERCENT ENAME, SAL FROM EMP ORDER BY SAL DESC;     -- percentage
```

- TOP cuts from the result after ORDER BY has been processed. There is no pitfall like ROWNUM, where rows are cut before sorting.
- `WITH TIES` must have an ORDER BY. Without one, SQL Server raises an error.
- Using only `TOP(3)` without ORDER BY is not an error, but which 3 rows come out is not determined.
- Running `SELECT TOP 3 ENAME FROM EMP` in Oracle reads TOP as a column name and raises ORA-00923.

| Task | Oracle | SQL Server |
|------|--------|-----------|
| Top 3 rows after sorting | Inline view + `ROWNUM <= 3`, or `FETCH FIRST 3 ROWS ONLY` | `TOP(3)` + ORDER BY |
| Include ties | `FETCH FIRST 3 ROWS WITH TIES`, or RANK | `TOP(3) WITH TIES` + ORDER BY |
| 4th to 6th | Double inline view, or `OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY` | `OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY` |

> Tomorrow we cover hierarchical queries (START WITH, CONNECT BY), which walk down a manager-subordinate relationship.

## 📖 Glossary

- **Top N query**: A query that returns only the top (or bottom) n rows by a sort criterion.
- **ROWNUM**: An Oracle virtual column numbered from 1 on the rows that go out as the result. It is assigned when a row passes WHERE, which is before sorting.
- **Pseudo column**: A value that is not stored in the table but is used like a column. ROWNUM and LEVEL are examples.
- **Row limiting clause**: `OFFSET … FETCH …`. An ANSI-standard syntax introduced in 12c that cuts the result after ORDER BY.
- **WITH TIES**: An option that also returns the rows that have the same sort value as the last row cut.
- **Paging**: Splitting the result into chunks of a fixed number of rows and showing only the n-th chunk. It is built with OFFSET or a double inline view.
- **TOP**: SQL Server's row limiting keyword. It is written right after SELECT, as in `SELECT TOP(n)`.

## 📝 Practice Questions

**Question 1.** EMP has 14 rows. What is the result of `SELECT COUNT(*) FROM EMP WHERE ROWNUM = 2;`?

A) 1  
B) 14  
C) 2  
D) 0  

**Answer: D**  
Explanation: The first row receives ROWNUM 1 and is dropped at `1 = 2`. When a row doesn't pass, the number doesn't increase, so every row receives 1 and is dropped. That is why it is 0. It is not an error either. 1 is the result of `ROWNUM = 1`, and 14 is the result of `ROWNUM >= 1`.

---

**Question 2.** Which Oracle SQL correctly gets the top 3 salaries?

A) `SELECT ENAME, SAL FROM EMP WHERE ROWNUM <= 3 ORDER BY SAL DESC;`  
B) `SELECT ENAME, SAL FROM (SELECT ENAME, SAL FROM EMP ORDER BY SAL DESC, ENAME) WHERE ROWNUM <= 3;`  
C) `SELECT ENAME, SAL FROM EMP WHERE ROWNUM BETWEEN 1 AND 3 ORDER BY SAL DESC;`  
D) `SELECT ENAME, SAL FROM EMP WHERE RANK() OVER (ORDER BY SAL DESC) <= 3;`  

**Answer: B**  
Explanation: You have to sort first inside the inline view and apply ROWNUM on the outside so that 3 rows remain in sorted order. In A and C, ROWNUM is processed before ORDER BY, so an arbitrary 3 rows are cut and then sorted. D uses a window function in WHERE, so it raises ORA-30483.

---

**Question 3.** The top salaries in EMP are KING 5000, FORD 3000, SCOTT 3000, JONES 2975, in that order. How many rows does `SELECT ENAME FROM EMP ORDER BY SAL DESC FETCH FIRST 2 ROWS WITH TIES;` return?

A) 2  
B) 4  
C) 3  
D) 1  

**Answer: C**  
Explanation: The 2nd row's salary is 3000, and there is one more row with the same 3000. WITH TIES includes that tied row, returning 3 rows: KING, FORD, SCOTT. 2 is the row count when `ONLY` is used. JONES has a salary of 2975, which is not a tie, so it is not included.

---

**Question 4.** What is the result of `SELECT ENAME FROM EMP ORDER BY SAL DESC, ENAME OFFSET 2 ROWS FETCH FIRST 1 ROW ONLY;`? (By salary descending, with ties by name, the order is KING, FORD, SCOTT, JONES …)

A) SCOTT  
B) FORD  
C) JONES  
D) KING  

**Answer: A**  
Explanation: OFFSET 2 ROWS skips the first two rows, KING and FORD, and FETCH FIRST 1 ROW fetches the next row, SCOTT. FORD is the 2nd row, which falls on the skipped side. JONES is the 4th row, and KING is the first row when there is no OFFSET.

---

**Question 5.** In SQL Server, which statement gets the top 2 salaries and also includes every employee whose salary equals the 2nd place?

A) `SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP;`  
B) `SELECT ENAME, SAL FROM EMP WHERE ROWNUM <= 2 ORDER BY SAL DESC;`  
C) `SELECT TOP(2) ENAME, SAL FROM EMP ORDER BY SAL DESC;`  
D) `SELECT TOP(2) WITH TIES ENAME, SAL FROM EMP ORDER BY SAL DESC;`  

**Answer: D**  
Explanation: SQL Server's `TOP(n) WITH TIES` returns rows up to and including those with the same value as the n-th row by the ORDER BY. A has no ORDER BY, so WITH TIES can't be used. The ROWNUM in B is an Oracle pseudo column and cuts before sorting. C returns exactly 2 rows regardless of ties.
