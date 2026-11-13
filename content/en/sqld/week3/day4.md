# Day 4 - NULL Functions and CASE·DECODE

## 📌 Key Takeaways

- `NVL(a, b)` returns b if a is NULL. `NVL2(a, b, c)` returns **b if a is NOT NULL, and c if it is NULL**.
- `NULLIF(a, b)` returns NULL if the two values are equal, otherwise a. `COALESCE` returns the **first** non-NULL argument.
- CASE checks from the top and uses only the **first WHEN that is true**. If ELSE is left out, rows that match nothing get NULL.
- `CASE column WHEN NULL` cannot catch NULL. `DECODE` treats NULLs as equal to each other.
- Oracle treats the empty string `''` as NULL.

## Functions That Handle NULL

So far we've seen that NULL turns arithmetic into NULL. Today's functions turn NULL into another value, or conversely turn a value into NULL.

| Function | Result | Example → Result |
|------|------|------|
| `NVL(a, b)` | b if a is NULL, otherwise a | `NVL(NULL, 0)` → 0 |
| `NVL2(a, b, c)` | b if a is not NULL, c if NULL | `NVL2(300, 'Y', 'N')` → Y |
| `NULLIF(a, b)` | NULL if a = b, otherwise a | `NULLIF(10, 10)` → NULL |
| `COALESCE(a, b, c, …)` | The first non-NULL value | `COALESCE(NULL, NULL, 3)` → 3 |
| `ISNULL(a, b)` | SQL Server's NVL | Does not exist in Oracle |

### NVL — NULL into a Default Value

```sql
SELECT ENAME, COMM, NVL(COMM, 0) C0, SAL + COMM S1, SAL + NVL(COMM, 0) S2 FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME            COMM         C0         S1         S2
---------- ---------- ---------- ---------- ----------
ALLEN             300        300       1900       1900
WARD              500        500       1750       1750
MARTIN           1400       1400       2650       2650
BLAKE                          0                  2850
TURNER              0          0       1500       1500
JAMES                          0                   950
```

- For BLAKE and JAMES, `SAL + COMM` is NULL, but `SAL + NVL(COMM, 0)` gives the salary as is.
- Values that aren't NULL (including TURNER's 0) are unchanged.

The types of the two arguments must match. If you give a string as the replacement for the numeric column COMM, Oracle tries to convert `'NONE'` to a number and fails.

```sql
SELECT ENAME, NVL(COMM, 'NONE') FROM EMP WHERE DEPTNO = 10;
```

```text
SELECT ENAME, NVL(COMM, 'NONE') FROM EMP WHERE DEPTNO = 10
                        *
ERROR at line 1:
ORA-01722: unable to convert string value containing 'N' to a number:
ORA-03302: (ORA-01722 details) invalid string value: NONE
```

- To display it as text, first convert the first argument to a string: `NVL(TO_CHAR(COMM), 'NONE')`.
- In SQL Server, the same job is done with `ISNULL(COMM, 0)`. In Oracle, `ISNULL` is an ORA-00904 (invalid identifier) error.

### NVL2 — Splitting Into "Has a Value" and "Doesn't"

```sql
SELECT ENAME, COMM, NVL2(COMM, 'Has comm', 'No comm') FLAG, NVL2(COMM, SAL + COMM, SAL) PAY FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME            COMM FLAG                PAY
---------- ---------- ------------ ----------
ALLEN             300 Has comm           1900
WARD              500 Has comm           1750
MARTIN           1400 Has comm           2650
BLAKE                 No comm            2850
TURNER              0 Has comm           1500
JAMES                 No comm             950
```

- The second argument is for when the value is **not NULL**, and the third is for when it is NULL. It's easy to remember the order backwards.
- TURNER's 0 is not NULL, so it is `Has comm`.

### NULLIF — NULL If Equal

```sql
SELECT ENAME, SAL, NULLIF(SAL, 1250) N FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME             SAL          N
---------- ---------- ----------
ALLEN            1600       1600
WARD             1250
MARTIN           1250
BLAKE            2850       2850
TURNER           1500       1500
JAMES             950        950
```

- Only WARD and MARTIN, whose SAL is 1250, became NULL. For the rest, the first argument SAL comes out as is.
- `NULLIF(a, b)` is the same as `CASE WHEN a = b THEN NULL ELSE a END`. To prevent division by zero, it is used like `x / NULLIF(y, 0)`.

### COALESCE — The First One With a Value

```sql
SELECT ENAME, COMM, MGR, COALESCE(COMM, MGR, 0) C FROM EMP WHERE DEPTNO IN (10, 30);
```

```text
ENAME            COMM        MGR          C
---------- ---------- ---------- ----------
ALLEN             300       7698        300
WARD              500       7698        500
MARTIN           1400       7698       1400
BLAKE                       7839       7839
CLARK                       7839       7839
KING                                      0
TURNER              0       7698          0
JAMES                       7698       7698
MILLER                      7782       7782
```

- It looks from the left and picks the first non-NULL value. ALLEN gets COMM, BLAKE gets MGR, and KING, where both are NULL, gets 0.
- With two arguments, it is the same as `NVL`. The difference is that it can take three or more. If all arguments are NULL, the result is NULL too.

### Aggregate Functions Skip NULL

This is Week 4 material, but it pairs with the NULL functions, so let's look at just the results first.

```sql
SELECT COUNT(COMM) A, COUNT(NVL(COMM, 0)) B, SUM(COMM) C, AVG(COMM) D, AVG(NVL(COMM, 0)) E FROM EMP;
```

```text
         A          B          C          D          E
---------- ---------- ---------- ---------- ----------
         4         14       2200        550 157.142857
```

- `AVG(COMM)` divides by the 4 employees who have a COMM (2200 / 4). To get the average over all 14, you have to fill in 0 with `NVL` (2200 / 14).

## CASE — Choosing a Value by Condition

CASE comes in two forms.

| Form | Syntax | Comparison method |
|------|------|------|
| **simple CASE** | `CASE expr WHEN value THEN result … [ELSE result] END` | expr = value (equality only) |
| **searched CASE** | `CASE WHEN condition THEN result … [ELSE result] END` | Any condition (`>`, `BETWEEN`, `IS NULL` …) |

```sql
SELECT ENAME, DEPTNO, CASE DEPTNO WHEN 10 THEN 'ACCOUNTING' WHEN 20 THEN 'RESEARCH' ELSE 'ETC' END DNAME FROM EMP WHERE JOB = 'MANAGER';
```

```text
ENAME          DEPTNO DNAME
---------- ---------- ----------
JONES              20 RESEARCH
BLAKE              30 ETC
CLARK              10 ACCOUNTING
```

Range conditions are written with a searched CASE.

```sql
SELECT ENAME, SAL, CASE WHEN SAL >= 3000 THEN 'HIGH' WHEN SAL >= 1500 THEN 'MID' ELSE 'LOW' END GRADE FROM EMP WHERE DEPTNO = 20;
```

```text
ENAME             SAL GRAD
---------- ---------- ----
SMITH             800 LOW
JONES            2975 MID
SCOTT            3000 HIGH
ADAMS            1100 LOW
FORD             3000 HIGH
```

> ⚠️ **The order of WHEN changes the result.** CASE stops at the first WHEN that is true. If you write the broad condition (`>= 1500`) first, as below, even SAL 3000 gets caught there, and not a single `HIGH` appears.

```sql
SELECT ENAME, SAL, CASE WHEN SAL >= 1500 THEN 'MID' WHEN SAL >= 3000 THEN 'HIGH' ELSE 'LOW' END GRADE FROM EMP WHERE DEPTNO = 20;
```

```text
ENAME             SAL GRAD
---------- ---------- ----
SMITH             800 LOW
JONES            2975 MID
SCOTT            3000 MID
ADAMS            1100 LOW
FORD             3000 MID
```

- If `ELSE` is left out, rows that match none of the WHENs get **NULL**.

```sql
SELECT ENAME, SAL, CASE WHEN SAL > 2000 THEN SAL * 1.1 END RAISE FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME             SAL      RAISE
---------- ---------- ----------
CLARK            2450       2695
KING             5000       5500
MILLER           1300
```

The results of THEN and ELSE must be of the same type. If the first result is a string, the rest must be strings too.

```sql
SELECT CASE 1 WHEN 1 THEN 'A' WHEN 2 THEN 2 END FROM DUAL;
```

```text
SELECT CASE 1 WHEN 1 THEN 'A' WHEN 2 THEN 2 END FROM DUAL
                                          *
ERROR at line 1:
ORA-00932: expression (2) is of data type NUMBER, which is incompatible with expected data type CHAR
```

## DECODE — Oracle's Own simple CASE

`DECODE(expr, value1, result1, value2, result2, …, default)` is a simple CASE written as a single function.

```sql
SELECT ENAME, DEPTNO, DECODE(DEPTNO, 10, 'ACCOUNTING', 20, 'RESEARCH', 'ETC') DNAME FROM EMP WHERE JOB = 'MANAGER';
```

```text
ENAME          DEPTNO DNAME
---------- ---------- ----------
JONES              20 RESEARCH
BLAKE              30 ETC
CLARK              10 ACCOUNTING
```

- If the argument count ends up even (no default at the end), rows that match nothing get NULL. If you remove `'ETC'` above, BLAKE becomes NULL.
- It compares only for **equality (=)**. A range condition like `SAL >= 3000` can't be used directly in DECODE, so use a searched CASE.
- DECODE is an Oracle function. SQL Server doesn't have it; use CASE.

### Where CASE and DECODE Diverge on NULL Comparison

```sql
SELECT ENAME, COMM, DECODE(COMM, NULL, 'Is NULL', 'Has value') D, CASE COMM WHEN NULL THEN 'Is NULL' ELSE 'Has value' END C FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME            COMM D         C
---------- ---------- --------- ---------
ALLEN             300 Has value Has value
WARD              500 Has value Has value
MARTIN           1400 Has value Has value
BLAKE                 Is NULL   Has value
TURNER              0 Has value Has value
JAMES                 Is NULL   Has value
```

- simple CASE compares as `COMM = NULL`. A `=` with NULL is never true, so BLAKE and JAMES also fall through to `Has value`.
- `DECODE` treats NULL and NULL as equal. That's why it picks out NULL correctly.
- To catch NULL with CASE, use a searched CASE and write `CASE WHEN COMM IS NULL THEN …`.

> ⚠️ **In Oracle, `''` is NULL.** There is no separate zero-length string. So `'' IS NULL` is true and `NVL('', 'EMPTY')` is `EMPTY`. SQL Server treats `''` and NULL as different values.

```sql
SELECT CASE WHEN '' IS NULL THEN 'NULL' ELSE 'NOT NULL' END E, NVL('', 'EMPTY') N FROM DUAL;
```

```text
E        N
-------- -----
NULL     EMPTY
```

| Comparison | Oracle | SQL Server |
|------|------|------|
| What `''` is | NULL | Zero-length string |
| NULL replacement functions | `NVL`, `COALESCE` | `ISNULL`, `COALESCE` |
| Conditional branching | `CASE`, `DECODE` | `CASE` |

Tomorrow covers the comparison and logical operators that pick rows in the WHERE clause, and the pitfalls of conditions involving NULL.

## 📖 Glossary

- **NVL** : An Oracle function that replaces the first argument with the second if it is NULL.
- **NVL2** : A function that picks one of two values depending on whether the first is NULL. Second if not NULL, third if NULL.
- **NULLIF** : A function that returns NULL if the two values are equal, and the first value if they differ.
- **COALESCE** : A standard function that returns the first non-NULL argument.
- **simple CASE** : A CASE form that compares one expression against several values for equality.
- **searched CASE** : A CASE form where each WHEN takes a free-form condition expression.
- **DECODE** : An Oracle-only function that does the same job as simple CASE. It treats NULLs as equal to each other.

## 📝 Practice Questions

**Question 1.** In the EMP table, BLAKE's SAL is 2850 and COMM is NULL. Which is the correct result of the following SQL?

```sql
SELECT NVL2(COMM, SAL + COMM, SAL) FROM EMP WHERE ENAME = 'BLAKE';
```

A) 2850  
B) NULL  
C) 0  
D) An error occurs  

**Answer: A**  
Explanation: `NVL2(a, b, c)` returns b if a is not NULL, and c if it is NULL. BLAKE's COMM is NULL, so the third argument SAL, 2850, comes out. The second argument `SAL + COMM` is not used, so it doesn't turn the result into NULL.

---

**Question 2.** Which is the correct result of the following SQL?

```sql
SELECT COALESCE(NULL, NULLIF(5, 5), 7, 9) FROM DUAL;
```

A) NULL  
B) 5  
C) 7  
D) 9  

**Answer: C**  
Explanation: `NULLIF(5, 5)` is NULL because the two values are equal. So it becomes `COALESCE(NULL, NULL, 7, 9)`, and the result is 7, the first non-NULL argument. `COALESCE` stops at the first value it finds, so it doesn't reach 9.

---

**Question 3.** For an employee whose SAL is 3000, which is the correct result of the following CASE expression?

```sql
SELECT CASE WHEN SAL >= 1500 THEN 'MID' WHEN SAL >= 3000 THEN 'HIGH' ELSE 'LOW' END FROM EMP WHERE ENAME = 'SCOTT';
```

A) HIGH  
B) MID  
C) LOW  
D) NULL  

**Answer: B**  
Explanation: CASE checks from the top, uses the result of the first WHEN that is true, and stops. 3000 is already true for the first condition `SAL >= 1500`, so the result is `MID`. It never reaches the second WHEN, so to get `HIGH` the order of conditions would have to be swapped.

---

**Question 4.** In Oracle, which is the correct result of the following SQL?

```sql
SELECT NVL('', 'EMPTY') FROM DUAL;
```

A) An empty string ('')  
B) NULL  
C) An error occurs  
D) EMPTY  

**Answer: D**  
Explanation: Oracle treats the zero-length string `''` as NULL. So the first argument of `NVL` is NULL, and the second argument `'EMPTY'` comes out. The result differs from DBMSs like SQL Server that treat `''` as a value different from NULL.

---

**Question 5.** For a row whose DEPTNO is 30, which is the correct result of the following expression?

```sql
SELECT DECODE(DEPTNO, 10, 'A', 20, 'B') FROM EMP WHERE ENAME = 'BLAKE';
```

A) 30  
B) B  
C) NULL  
D) An error occurs  

**Answer: C**  
Explanation: `DECODE` returns the final default value when the expression equals none of the values. The default was omitted, so the result is NULL. It does not return the expression's own value (30), and no error occurs even without a default.
