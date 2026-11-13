# Day 2 - Aggregate and Row-Order Window Functions

## 📌 Key Takeaways

- `SUM(SAL) OVER (PARTITION BY DEPTNO)` attaches the department total to every row of that department. If there is no ORDER BY inside OVER, the calculation range is the whole partition.
- If you give OVER an ORDER BY, the default range becomes `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which produces a **running total**. Because it is RANGE, tied rows are added together.
- ROWS sets the window by physical row count, and RANGE sets it by a range of sort values. To split ties one row at a time, use ROWS.
- `LAG`·`LEAD(column, offset, default)` fetch the values of the previous and next rows. If there is no such row, you get NULL, or the default value if you supplied one.
- `LAST_VALUE` returns the current row's value because its default range ends at the current row. To get the value at the end of the partition, widen the range to `UNBOUNDED FOLLOWING`.

## Adding OVER to an Aggregate Function

To show the department total and each employee's salary on one screen, GROUP BY is not enough, because GROUP BY leaves only one row per department. If you attach OVER to an aggregate function, the rows stay as they are and the aggregate value is simply added beside them.

```sql
SELECT DEPTNO, ENAME, SAL, SUM(SAL) OVER (PARTITION BY DEPTNO) AS DEPT_SUM, ROUND(AVG(SAL) OVER (PARTITION BY DEPTNO)) AS DEPT_AVG, COUNT(*) OVER () AS CNT FROM EMP WHERE DEPTNO IN (10, 20) ORDER BY DEPTNO, ENAME;
```

```text
    DEPTNO ENAME             SAL   DEPT_SUM   DEPT_AVG        CNT
---------- ---------- ---------- ---------- ---------- ----------
        10 CLARK            2450       8750       2917          8
        10 KING             5000       8750       2917          8
        10 MILLER           1300       8750       2917          8
        20 ADAMS            1100      10875       2175          8
        20 FORD             3000      10875       2175          8
        20 JONES            2975      10875       2175          8
        20 SCOTT            3000      10875       2175          8
        20 SMITH             800      10875       2175          8
```

- `OVER ()` treats all the rows that passed WHERE as one partition. That is why CNT is 8, not 14.
- SUM, AVG, COUNT, MAX, and MIN are all used the same way. Unlike ranking functions, the inside of OVER may be left empty.
- You can calculate directly with the attached value. `SAL - AVG(SAL) OVER (PARTITION BY DEPTNO)` is the difference from the department average.

- The average for department 30 is 1566.66…, so ALLEN's (1600) difference is 33 and JAMES's (950) is −617. In W5, we got the department average with a correlated subquery. A window function reads the table only once and gives the same result.

This aggregate form can't be used in WHERE either. However, the error number differs from the ranking functions.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL > AVG(SAL) OVER ();
```

```text
SELECT ENAME, SAL FROM EMP WHERE SAL > AVG(SAL) OVER ()
                                       *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

- In the practice container (23ai), the check tripped on the aggregate function name first and raised ORA-00934. Either way, the conclusion is the same: it can't be used in WHERE. Wrap it in an inline view and filter there.

## Running Total — The Moment You Add ORDER BY

When you put ORDER BY inside OVER, the same SUM gives a completely different value. Look at department 30 in ascending salary order.

```sql
SELECT ENAME, SAL, SUM(SAL) OVER (ORDER BY SAL, ENAME) AS CUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL        CUM
---------- ---------- ----------
JAMES             950        950
MARTIN           1250       2200
WARD             1250       3450
TURNER           1500       4950
ALLEN            1600       6550
BLAKE            2850       9400
```

- It is the sum from the first row of the partition to the current row, that is, a running total. The last row is the department total, 9400.
- The default range when ORDER BY is present is as follows. Even if you don't write it, it is treated as if this clause were attached.

```text
RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
```

| Inside OVER | Calculation range | Meaning of SUM |
|---------|---------|-----------|
| Empty / PARTITION BY only | Whole partition | Partition total |
| ORDER BY present, no window clause | Start ~ current row (RANGE) | Running total |
| ORDER BY + window clause | The range you specify | Sum over that range |

## The RANGE Pitfall — Ties Are Added Together

The example above broke ties with `ORDER BY SAL, ENAME`. If you use only `ORDER BY SAL`, the running totals of MARTIN and WARD (1250) become the same.

```sql
SELECT ENAME, SAL, SUM(SAL) OVER (ORDER BY SAL) AS RANGE_SUM, SUM(SAL) OVER (ORDER BY SAL, ENAME ROWS UNBOUNDED PRECEDING) AS ROWS_SUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL  RANGE_SUM   ROWS_SUM
---------- ---------- ---------- ----------
JAMES             950        950        950
MARTIN           1250       3450       2200
WARD             1250       3450       3450
TURNER           1500       4950       4950
ALLEN            1600       6550       6550
BLAKE            2850       9400       9400
```

- In RANGE, CURRENT ROW is not "the current row" but **all rows with the same sort value as the current row**. WARD goes into MARTIN's window too, so it becomes 950 + 1250 + 1250 = 3450.
- ROWS counts physical rows one by one. It is 2200 through MARTIN and 3450 through WARD.
- `ROWS UNBOUNDED PRECEDING` is the shortened form of `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

> ⚠️ **Pitfall**: If you memorize "give only ORDER BY and you get a running total that adds one row at a time", you'll be wrong. The default is RANGE, so rows with the same sort value get the same running value. In answer choices that have ties, check the values of the tied rows first.

## ROWS vs RANGE, and Reading a Window Clause

A window clause looks like `ROWS|RANGE BETWEEN start AND end`.

| Boundary | Meaning |
|------|----|
| `UNBOUNDED PRECEDING` | First row of the partition |
| `n PRECEDING` | n before the current row (for RANGE, sort value − n) |
| `CURRENT ROW` | The current row (for RANGE, all rows with the same value) |
| `n FOLLOWING` | n after the current row (for RANGE, sort value + n) |
| `UNBOUNDED FOLLOWING` | Last row of the partition |

- If you omit `BETWEEN` and write only the start, the end is CURRENT ROW.
- The start must not come after the end. `BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING` is the sum "from the current row to the end"; if you reverse the order, you get ORA-30486.

### One Row Before and After — Moving Average

`ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING` covers the row just before, the current row, and the row just after, up to three rows.

```sql
SELECT ENAME, SAL, AVG(SAL) OVER (ORDER BY SAL, ENAME ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS MOV_AVG, SUM(SAL) OVER (ORDER BY SAL, ENAME ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS MOV_SUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL    MOV_AVG    MOV_SUM
---------- ---------- ---------- ----------
JAMES             950       1100       2200
MARTIN           1250       1150       3450
WARD             1250 1333.33333       4000
TURNER           1500       1450       4350
ALLEN            1600 1983.33333       5950
BLAKE            2850       2225       4450
```

- The first row, JAMES, has no previous row, so only two rows (950 + 1250) are added. The average is also divided by 2, giving 1100.
- The last row, BLAKE, has no following row either, so it is just the two rows ALLEN and BLAKE.

### Numbers in RANGE Are Value Ranges

`RANGE BETWEEN 150 PRECEDING AND 150 FOLLOWING` means "rows within ±150 of the current salary". The number of rows doesn't matter.

```sql
SELECT ENAME, SAL, COUNT(*) OVER (ORDER BY SAL RANGE BETWEEN 150 PRECEDING AND 150 FOLLOWING) AS NEAR_CNT FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL   NEAR_CNT
---------- ---------- ----------
JAMES             950          1
MARTIN           1250          2
WARD             1250          2
TURNER           1500          2
ALLEN            1600          2
BLAKE            2850          1
```

- TURNER's (1500) range is 1350 to 1650, so it contains two people, TURNER and ALLEN.
- To use a number with RANGE, the ORDER BY must be a single numeric or date column. If you give two, as in `ORDER BY SAL, ENAME`, you get ORA-30486.

## LAG · LEAD — Values from Neighboring Rows

`LAG(column)` fetches the value of the immediately preceding row in the sort order, and `LEAD(column)` fetches the value of the immediately following row. Look at department 30 in hire-date order.

```sql
SELECT ENAME, HIREDATE, SAL, LAG(SAL) OVER (ORDER BY HIREDATE) AS PREV_SAL, LEAD(SAL) OVER (ORDER BY HIREDATE) AS NEXT_SAL FROM EMP WHERE DEPTNO = 30 ORDER BY HIREDATE;
```

```text
ENAME      HIREDATE          SAL   PREV_SAL   NEXT_SAL
---------- ---------- ---------- ---------- ----------
ALLEN      1981-02-20       1600                  1250
WARD       1981-02-22       1250       1600       2850
BLAKE      1981-05-01       2850       1250       1500
TURNER     1981-09-08       1500       2850       1250
MARTIN     1981-09-28       1250       1500        950
JAMES      1981-12-03        950       1250
```

- The first row has no previous row, so PREV_SAL is NULL; for the last row, NEXT_SAL is NULL.
- The syntax is `LAG(column, offset, default)`. The default offset is 1, and if you omit the default value it is NULL.

```sql
SELECT ENAME, HIREDATE, SAL, LAG(SAL, 2) OVER (ORDER BY HIREDATE) AS LAG2, LAG(SAL, 2, 0) OVER (ORDER BY HIREDATE) AS LAG2_0, LEAD(ENAME, 1, 'NONE') OVER (ORDER BY HIREDATE) AS NEXT_EMP FROM EMP WHERE DEPTNO = 30 ORDER BY HIREDATE;
```

```text
ENAME      HIREDATE          SAL       LAG2     LAG2_0 NEXT_EMP
---------- ---------- ---------- ---------- ---------- ----------
ALLEN      1981-02-20       1600                     0 WARD
WARD       1981-02-22       1250                     0 BLAKE
BLAKE      1981-05-01       2850       1600       1600 TURNER
TURNER     1981-09-08       1500       1250       1250 MARTIN
MARTIN     1981-09-28       1250       2850       2850 JAMES
JAMES      1981-12-03        950       1500       1500 NONE
```

- `LAG(SAL, 2)` is two rows back. For the first two rows there is no row to fetch, so they are NULL.
- If you give 0 as the third argument, you get 0 instead of NULL. The result is the same as `NVL(LAG(SAL, 2), 0)`.
- If you give PARTITION BY, it does not cross partition boundaries. The first row where the department changes gets NULL for LAG again. In hire-date order `LAG(ENAME) OVER (PARTITION BY DEPTNO ORDER BY HIREDATE)`, the first hire in department 10, CLARK, and the first hire in department 20, SMITH, get NULL.
- LAG and LEAD require ORDER BY and do not accept a window clause. `LAG(SAL) OVER (ORDER BY SAL ROWS 1 PRECEDING)` raises ORA-03097.

## FIRST_VALUE · LAST_VALUE

FIRST_VALUE is the value of the first row of the window, and LAST_VALUE is the value of the last row of the window. The range of the window determines the result.

```sql
SELECT ENAME, SAL, FIRST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME) AS TOP_EMP, LAST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME) AS LAST_DEF, LAST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS LAST_FULL FROM EMP WHERE DEPTNO = 30 ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL TOP_EMP    LAST_DEF   LAST_FULL
---------- ---------- ---------- ---------- ----------
BLAKE            2850 BLAKE      BLAKE      JAMES
ALLEN            1600 BLAKE      ALLEN      JAMES
TURNER           1500 BLAKE      TURNER     JAMES
MARTIN           1250 BLAKE      MARTIN     JAMES
WARD             1250 BLAKE      WARD       JAMES
JAMES             950 BLAKE      JAMES      JAMES
```

- FIRST_VALUE is fine even with the default range (start ~ current row), because the first row is always BLAKE.
- For LAST_VALUE, the end of the default range is the current row. That is why LAST_DEF shows the row's own name.
- To get the last value of the partition (JAMES, the lowest salary), widen the end to `UNBOUNDED FOLLOWING`. LAST_FULL is that result.

## Ratios and Distributions

| Function | Calculation | Range |
|------|-----|-----|
| `RATIO_TO_REPORT(column) OVER ()` | Value / partition total | 0 ~ 1 (for positive values) |
| `PERCENT_RANK() OVER (ORDER BY …)` | (RANK − 1) / (row count − 1) | 0 ~ 1, first row is 0 |
| `CUME_DIST() OVER (ORDER BY …)` | Number of rows at or below the current value / row count | Greater than 0 ~ 1 |
| `NTILE(n) OVER (ORDER BY …)` | Number of the bucket when rows are split into n buckets | 1 ~ n |

```sql
SELECT ENAME, SAL, ROUND(RATIO_TO_REPORT(SAL) OVER (), 3) AS RATIO, ROUND(SAL / SUM(SAL) OVER (), 3) AS SAME FROM EMP WHERE DEPTNO = 30 ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL      RATIO       SAME
---------- ---------- ---------- ----------
BLAKE            2850       .303       .303
ALLEN            1600        .17        .17
TURNER           1500        .16        .16
MARTIN           1250       .133       .133
WARD             1250       .133       .133
JAMES             950       .101       .101
```

- RATIO_TO_REPORT is the same as `SAL / SUM(SAL) OVER ()`. If you put ORDER BY inside OVER, you get ORA-30487.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL) AS RNK, PERCENT_RANK() OVER (ORDER BY SAL) AS PR, ROUND(CUME_DIST() OVER (ORDER BY SAL), 4) AS CD FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL        RNK         PR         CD
---------- ---------- ---------- ---------- ----------
JAMES             950          1          0      .1667
MARTIN           1250          2         .2         .5
WARD             1250          2         .2         .5
TURNER           1500          4         .6      .6667
ALLEN            1600          5         .8      .8333
BLAKE            2850          6          1          1
```

- TURNER's PERCENT_RANK is (4 − 1) / (6 − 1) = 0.6.
- TURNER's CUME_DIST is 4 people at or below 1500 / 6 people = 0.6667. The tied MARTIN and WARD are both 3/6 = 0.5.
- PERCENT_RANK is always 0 for the first row, while CUME_DIST is greater than 0 even for the first row.

```sql
SELECT ENAME, SAL, NTILE(4) OVER (ORDER BY SAL DESC, ENAME) AS GRP FROM EMP ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL        GRP
---------- ---------- ----------
KING             5000          1
FORD             3000          1
SCOTT            3000          1
JONES            2975          1
BLAKE            2850          2
CLARK            2450          2
ALLEN            1600          2
TURNER           1500          2
MILLER           1300          3
MARTIN           1250          3
WARD             1250          3
ADAMS            1100          4
JAMES             950          4
SMITH             800          4
```

- Splitting 14 rows into 4 buckets gives a quotient of 3 and a remainder of 2. The 2 remaining rows go one each to the earliest buckets, giving 4, 4, 3, 3.
- NTILE doesn't look at ties. It cuts by row count alone. If a tie straddles a bucket boundary, the same salary can end up in different buckets.

> Tomorrow we cover Top N queries, which keep only the top n rows using ROWNUM and FETCH FIRST.

## 📖 Glossary

- **Aggregate window function**: SUM, AVG, COUNT, MAX, or MIN with OVER attached. It attaches the aggregate value without reducing rows.
- **Window clause**: `ROWS|RANGE BETWEEN … AND …`. It sets the range of rows to include in the calculation, relative to the current row.
- **ROWS**: Sets the range by physical row count. Ties are also counted one row at a time.
- **RANGE**: Sets the window by a range of sort values. Rows with the same value go in all at once.
- **Running total**: The sum from the first row to the current row. If you give OVER only an ORDER BY, you get this by default.
- **LAG / LEAD**: Fetch the value of the n-th row before / after in the sort order. If there is none, you get the default value (NULL if omitted).
- **CUME_DIST**: The proportion of rows at or below the current value. Called the cumulative distribution.
- **NTILE**: Splits the sorted rows into n buckets and attaches the bucket number. The remainder goes one each to the earliest buckets.

## 📝 Practice Questions

**Question 1.** The salaries in department 30 are 950 (JAMES), 1250 (MARTIN), 1250 (WARD), 1500 (TURNER), 1600 (ALLEN), and 2850 (BLAKE). In `SELECT ENAME, SUM(SAL) OVER (ORDER BY SAL) AS S FROM EMP WHERE DEPTNO = 30;`, what is MARTIN's S value?

A) 2200  
B) 1250  
C) 3450  
D) 9400  

**Answer: C**  
Explanation: The default range when only ORDER BY is given is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. RANGE includes WARD, who has the same sort value, in the window, so it is 950 + 1250 + 1250 = 3450. 2200 is the value you get when adding one row at a time with ROWS and MARTIN comes first. 9400 is the department total when there is no ORDER BY.

---

**Question 2.** Looking at department 30 in hire-date order, ALLEN was hired first. In `SELECT ENAME, LAG(SAL, 1, 0) OVER (ORDER BY HIREDATE) AS P FROM EMP WHERE DEPTNO = 30;`, what is ALLEN's P?

A) 0  
B) NULL  
C) 1250  
D) 1600  

**Answer: A**  
Explanation: ALLEN is the first row, so there is no previous row. Since a default value of 0 was given as the third argument, you get 0 instead of NULL. NULL is the result when the default value is omitted. 1250 is the salary of the next row, WARD, which would be the LEAD value, and 1600 is ALLEN's own salary.

---

**Question 3.** In `SELECT ENAME, LAST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME) AS LV FROM EMP WHERE DEPTNO = 30;`, what is LV on ALLEN's row? (Salary descending: BLAKE, ALLEN, TURNER, MARTIN, WARD, JAMES)

A) JAMES  
B) BLAKE  
C) NULL  
D) ALLEN  

**Answer: D**  
Explanation: There is no window clause, only ORDER BY, so the range is from the first row to the current row. The last row of the window is the current row, ALLEN. JAMES is the value when the range is widened with `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`. BLAKE is the result of FIRST_VALUE.

---

**Question 4.** When `NTILE(4) OVER (ORDER BY SAL DESC, ENAME)` is applied to 14 rows, what are the row counts of buckets 1 through 4, in order?

A) 4, 4, 4, 2  
B) 4, 4, 3, 3  
C) 3, 3, 4, 4  
D) 3, 3, 3, 5  

**Answer: B**  
Explanation: 14 ÷ 4 gives a quotient of 3 and a remainder of 2. The 2 remaining rows go one each to the earliest buckets, giving 4, 4, 3, 3. A and D have bucket sizes differing by 2 or more, so they are not how NTILE distributes. C gives the remainder to the later buckets.

---

**Question 5.** `PERCENT_RANK() OVER (ORDER BY SAL)` was applied to the 6 employees of department 30. TURNER (1500) is 4th by RANK. What is TURNER's value?

A) 0.6  
B) 0.6667  
C) 0.5  
D) 0.8  

**Answer: A**  
Explanation: PERCENT_RANK is (RANK − 1) / (row count − 1), so (4 − 1) / (6 − 1) = 0.6. 0.6667 is CUME_DIST, calculated as 4 people at or below 1500 / 6 people. 0.5 is the CUME_DIST of MARTIN and WARD, and 0.8 is the PERCENT_RANK of ALLEN, who is 5th.
