# Day 5 - The WHERE Clause

## 📌 Key Takeaways

- `BETWEEN a AND b` **includes both a and b**. If a is greater than b, not a single row comes back.
- In `LIKE`, `%` is zero or more characters and `_` is exactly one character. To search for these symbols themselves, define an escape character with `ESCAPE`.
- NULL can't be found with `=`. Use only **`IS NULL` / `IS NOT NULL`**.
- The precedence of logical operators is **NOT > AND > OR**. When in doubt, add parentheses.
- If a `NOT IN (…)` list contains even one NULL, the result is **0 rows**.

## WHERE Picks Rows

If `SELECT` picks columns, `WHERE` picks rows. Only rows where the condition is **true (TRUE)** stay in the result.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL >= 3000;
```

```text
ENAME             SAL
---------- ----------
SCOTT            3000
KING             5000
FORD             3000
```

| Operator | Meaning |
|------|------|
| `=` | Equal |
| `>`, `>=`, `<`, `<=` | Greater than, greater than or equal, less than, less than or equal |
| `<>`, `!=`, `^=` | Not equal (all three mean the same) |

- String and date values are wrapped in single quotes. String values are **case-sensitive.**
- `'clerk'` can't find `CLERK`. The result is 0 rows.

```sql
SELECT COUNT(*) FROM EMP WHERE JOB = 'clerk';
```

```text
  COUNT(*)
----------
         0
```

## Ranges and Lists — BETWEEN, IN

### BETWEEN a AND b

Same as `a <= value AND value <= b`. Both endpoints are included.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL BETWEEN 1250 AND 1600;
```

```text
ENAME             SAL
---------- ----------
ALLEN            1600
WARD             1250
MARTIN           1250
TURNER           1500
MILLER           1300
```

- WARD and MARTIN at 1250 and ALLEN at 1600 are all included.
- The smaller value must come first. `BETWEEN 1600 AND 1250` is `SAL >= 1600 AND SAL <= 1250`, which can never be true.

```sql
SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 1600 AND 1250;
```

```text
  COUNT(*)
----------
         0
```

`NOT BETWEEN` is outside the range, that is, `value < a OR value > b`. `BETWEEN` can be used with dates too. `HIREDATE BETWEEN DATE '1982-01-01' AND DATE '1987-12-31'` picks three employees: MILLER, SCOTT, and ADAMS.

### IN (list)

`IN` is the same as joining `=` conditions with `OR`. `DEPTNO IN (10, 40)` is `DEPTNO = 10 OR DEPTNO = 40`.

```sql
SELECT ENAME, DEPTNO FROM EMP WHERE DEPTNO IN (10, 40);
```

```text
ENAME          DEPTNO
---------- ----------
CLARK              10
KING               10
MILLER             10
```

- Department 40 has no employees, so only the three in department 10 appear. It's not an error if the list contains values that aren't there.

You can also group several columns and compare them as pairs. The (job, department) pair must exactly match a pair in the list.

```sql
SELECT ENAME, JOB, DEPTNO FROM EMP WHERE (JOB, DEPTNO) IN (('MANAGER', 20), ('CLERK', 30));
```

```text
ENAME      JOB           DEPTNO
---------- --------- ----------
JONES      MANAGER           20
JAMES      CLERK             30
```

## Pattern Search — LIKE

| Symbol | Meaning | Example | Names it matches |
|------|------|------|------|
| `%` | Any string of zero or more characters | `'J%'` | Starts with J |
| `_` | Exactly one character | `'_A%'` | Second character is A |
| Combination | | `'%S'` | Ends with S |
| Combination | | `'____'` | Exactly four characters |

```sql
SELECT ENAME FROM EMP WHERE ENAME LIKE '_A%';
```

```text
ENAME
----------
WARD
MARTIN
JAMES
```

- `LIKE` is case-sensitive too. `LIKE 'k%'` can't find KING.
- Writing `LIKE 'KING'` without any wildcard is the same as `= 'KING'`.

### ESCAPE — Searching for % or _ Itself

Even if you want to find `_` literally, `LIKE '%_%'` means "any string of one or more characters." With `ESCAPE` you define an escape character, and the `_` or `%` right after that character is read as an ordinary character.

```sql
SELECT 'OK' R FROM DUAL WHERE 'SALES_2026' LIKE '%\_%' ESCAPE '\';
```

```text
R
--
OK
```

```sql
SELECT COUNT(*) FROM DUAL WHERE 'SALES2026' LIKE '%\_%' ESCAPE '\';
```

```text
  COUNT(*)
----------
         0
```

- `SALES2026`, which has no underscore, is not matched. It is a value that would have matched if written as `'%_%'` without ESCAPE.
- You can choose any character as the escape character. `'50%' LIKE '%#%' ESCAPE '#'` looks for strings that end with `%`.

## NULL Is Found Only with IS NULL

Comparing NULL with anything gives **UNKNOWN**, neither true nor false. WHERE keeps only true rows, so rows that are UNKNOWN drop out.

> ⚠️ **`COMM = NULL` is not an error; it gives 0 rows.** The syntax is valid, so it runs, but no row ever becomes true. When looking for NULL, always use `IS NULL`, and `IS NOT NULL` for the opposite.

```sql
SELECT COUNT(*) FROM EMP WHERE COMM = NULL;
```

```text
  COUNT(*)
----------
         0
```

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM IS NOT NULL;
```

```text
ENAME            COMM
---------- ----------
ALLEN             300
WARD              500
MARTIN           1400
TURNER              0
```

For the same reason, NULL rows drop out of negative conditions too. The 10 employees whose COMM is NULL are not included in `COMM <> 300`.

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM <> 300;
```

```text
ENAME            COMM
---------- ----------
WARD              500
MARTIN           1400
TURNER              0
```

## Logical Operators and Precedence

| Operator | True when | Precedence |
|------|------|------|
| `NOT` | The condition is false | 1 (first) |
| `AND` | Both conditions are true | 2 |
| `OR` | At least one is true | 3 |

Without parentheses, `AND` binds before `OR`.

```sql
SELECT ENAME, JOB, SAL FROM EMP WHERE JOB = 'SALESMAN' OR JOB = 'MANAGER' AND SAL > 2900;
```

```text
ENAME      JOB              SAL
---------- --------- ----------
ALLEN      SALESMAN        1600
WARD       SALESMAN        1250
JONES      MANAGER         2975
MARTIN     SALESMAN        1250
TURNER     SALESMAN        1500
```

- It is actually read as `JOB = 'SALESMAN' OR (JOB = 'MANAGER' AND SAL > 2900)`. That's why all four low-paid SALESMEN came out.

If you wanted "SALESMAN or MANAGER with salary over 2900," group the OR first with parentheses.

```sql
SELECT ENAME, JOB, SAL FROM EMP WHERE (JOB = 'SALESMAN' OR JOB = 'MANAGER') AND SAL > 2900;
```

```text
ENAME      JOB              SAL
---------- --------- ----------
JONES      MANAGER         2975
```

| When NULL is involved | Result |
|------|------|
| `TRUE AND UNKNOWN` | UNKNOWN |
| `FALSE AND UNKNOWN` | FALSE |
| `TRUE OR UNKNOWN` | TRUE |
| `FALSE OR UNKNOWN` | UNKNOWN |
| `NOT UNKNOWN` | UNKNOWN |

## Negation Operators and the NOT IN Pitfall

| Positive | Negative |
|------|------|
| `=` | `<>`, `!=`, `^=`, `NOT column =` |
| `BETWEEN a AND b` | `NOT BETWEEN a AND b` |
| `IN (…)` | `NOT IN (…)` |
| `LIKE` | `NOT LIKE` |
| `IS NULL` | `IS NOT NULL` |

`NOT IN (a, b)` is `column <> a AND column <> b`. If the list contains NULL, `column <> NULL` becomes UNKNOWN, and since the parts are joined with AND, the whole thing can never be true.

```sql
SELECT COUNT(*) FROM EMP WHERE MGR NOT IN (7698, 7839, NULL);
```

```text
  COUNT(*)
----------
         0
```

Conversely, `IN` is joined with OR, so even with NULL mixed in, the search works normally on the remaining values.

```sql
SELECT ENAME, MGR FROM EMP WHERE MGR IN (7566, NULL);
```

```text
ENAME             MGR
---------- ----------
SCOTT            7566
FORD             7566
```

This pitfall is even harder to spot in subqueries. Because KING's MGR is NULL, the SQL below, which looks for "employees who are nobody's manager," returns 0.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP);
```

```text
  COUNT(*)
----------
         0
```

If you remove NULL from the subquery result, you get the expected 8. Subqueries come up again in Week 5.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP WHERE MGR IS NOT NULL);
```

```text
  COUNT(*)
----------
         8
```

- `ROWNUM`, which picks only the top N rows, is also used in the WHERE clause, but its behavior is distinctive, so it is covered in the Top-N queries of Week 6.

Next week we move on to GROUP BY and aggregate functions, which group rows and summarize them.

## 📖 Glossary

- **WHERE clause** : The clause that keeps only rows where the condition is true in the result.
- **BETWEEN** : A range condition between two values. Both endpoints are included.
- **IN** : A condition that checks whether a value equals one in a list. Same as joining `=` with OR.
- **Wildcard** : A symbol in LIKE that stands for any character. `%` is zero or more characters, and `_` is one character.
- **ESCAPE** : The clause in LIKE that defines the escape character that makes `%` and `_` be read as ordinary characters.
- **UNKNOWN** : The third logical value produced when comparing with NULL. In WHERE it is filtered out like false.
- **Operator precedence** : The order in which things are evaluated first when there are no parentheses. NOT, AND, OR, in that order.

## 📝 Practice Questions

**Question 1.** Given the salaries below in the EMP table, which is the correct result of the following SQL? (ALLEN 1600, WARD 1250, MARTIN 1250, TURNER 1500, MILLER 1300, ADAMS 1100, the rest are above 1600 or below 1100)

```sql
SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 1250 AND 1600;
```

A) 3  
B) 5  
C) 2  
D) 0  

**Answer: B**  
Explanation: `BETWEEN` includes both endpoints. That's WARD and MARTIN at 1250, ALLEN at 1600, and TURNER and MILLER in between, for 5 employees. Counting without the endpoints gives 2, and ADAMS at 1100 is outside the range.

---

**Question 2.** Which employee is **not** included in the result of the following SQL?

```sql
SELECT ENAME FROM EMP WHERE ENAME LIKE '_A%';
```

A) WARD  
B) MARTIN  
C) JAMES  
D) ADAMS  

**Answer: D**  
Explanation: `_` is exactly one character and `%` is zero or more characters, so `'_A%'` means names whose second character is A. WARD, MARTIN, and JAMES have A as the second character. ADAMS has A as the first character and D as the second, so it isn't matched.

---

**Question 3.** Which condition has the same meaning as the following WHERE clause?

```sql
SELECT ENAME FROM EMP WHERE JOB = 'SALESMAN' OR JOB = 'MANAGER' AND SAL > 2900;
```

A) `JOB = 'SALESMAN' OR (JOB = 'MANAGER' AND SAL > 2900)`  
B) `(JOB = 'SALESMAN' OR JOB = 'MANAGER') AND SAL > 2900`  
C) `(JOB = 'SALESMAN' AND SAL > 2900) OR JOB = 'MANAGER'`  
D) `JOB IN ('SALESMAN', 'MANAGER') AND SAL > 2900`  

**Answer: A**  
Explanation: Without parentheses, `AND` binds before `OR`. So `JOB = 'MANAGER' AND SAL > 2900` is grouped first, and that result is joined with `JOB = 'SALESMAN'` by OR. B and D mean the same as each other, but their results differ from the original condition.

---

**Question 4.** Which is the correct result of the following SQL? (The MGR column of EMP contains 7566, 7698, 7782, 7788, 7839, 7902, and NULL)

```sql
SELECT COUNT(*) FROM EMP WHERE MGR NOT IN (7698, 7839, NULL);
```

A) 14  
B) 6  
C) 0  
D) An error occurs  

**Answer: C**  
Explanation: `NOT IN (7698, 7839, NULL)` is `MGR <> 7698 AND MGR <> 7839 AND MGR <> NULL`. The last comparison is always UNKNOWN, so the whole AND chain can never be true, and 0 rows match. It isn't a syntax error, so it runs and `COUNT(*)` returns 0.

---

**Question 5.** Which condition correctly retrieves employees whose COMM is NULL?

A) `WHERE COMM IS NULL`  
B) `WHERE COMM = NULL`  
C) `WHERE COMM = ''`  
D) `WHERE COMM IN (NULL)`  

**Answer: A**  
Explanation: Comparing with NULL using `=` gives UNKNOWN, so no row is matched. B and D are both `= NULL` comparisons, and since `''` is NULL in Oracle, C gives the same result. NULL can be found only with `IS NULL`.
