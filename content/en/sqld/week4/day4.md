# Day 4 - Joins (EQUI, Non-EQUI, (+))

## 📌 Key Takeaways

- An **EQUI join** pairs rows of two tables with `=`, and a **Non-EQUI join** pairs them with an operator other than `=`, such as `BETWEEN` or `>`.
- If the join condition is missing, you get a **Cartesian product**. EMP 14 rows × DEPT 4 rows = **56 rows**.
- To connect N tables completely, you need **at least N-1** join conditions.
- The Oracle outer join `(+)` goes on **the side that will be filled with NULL because its values run short**. `E.DEPTNO(+) = D.DEPTNO` keeps every row of DEPT.
- If both tables have a column with the same name and you write it without a prefix, you get **ORA-00918** (column ambiguously specified).

## What It Means to Connect Two Tables

EMP has only the department number (DEPTNO), and the department name is in DEPT. To see "employee name and department name" together, you have to pair the rows of the two tables that have the same DEPTNO. That is a join.

```text
EMP                                DEPT
ENAME   DEPTNO                     DEPTNO  DNAME
CLARK   10   ───────────────────▶  10      ACCOUNTING
KING    10   ───────────────────▶  10      ACCOUNTING
SMITH   20   ───────────────────▶  20      RESEARCH
...                                30      SALES
                                   40      OPERATIONS   ← no match
```

Oracle's traditional notation lists the tables in FROM separated by commas and writes the pairing condition in WHERE.

## EQUI Join

```sql
SELECT E.ENAME, E.DEPTNO, D.DNAME
FROM EMP E, DEPT D
WHERE E.DEPTNO = D.DEPTNO
  AND E.DEPTNO = 10
ORDER BY E.ENAME;
```

```text
ENAME          DEPTNO DNAME
---------- ---------- --------------
CLARK              10 ACCOUNTING
KING               10 ACCOUNTING
MILLER             10 ACCOUNTING
```

- `E` and `D` are **table aliases**. In FROM, you write them after the table name with a space (you do not use `AS`).
- In WHERE, the join condition (`E.DEPTNO = D.DEPTNO`) and the ordinary condition (`E.DEPTNO = 10`) sit together with `AND`.

Let us count the rows of the whole join result.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        14
```

- All 14 employees found a match, so there are 14 rows. DEPT 40, which has no match, does not appear in the result. An EQUI join keeps **only the rows that have a match on both sides**.

### When Column Names Collide — ORA-00918

DEPTNO exists in both EMP and DEPT. If you do not say which table it belongs to, Oracle cannot choose.

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP, DEPT WHERE EMP.DEPTNO = DEPT.DEPTNO;
```

```text
SELECT ENAME, DEPTNO, DNAME FROM EMP, DEPT WHERE EMP.DEPTNO = DEPT.DEPTNO
              *
ERROR at line 1:
ORA-00918: DEPTNO: column ambiguously specified - appears in DEPT and EMP
```

- ENAME and DNAME exist in only one table, so they work without a prefix.
- Even for a column that exists in only one table, adding a prefix makes it easier to read, and it does not break if a column with the same name appears later.

### Once You Pick an Alias, Use the Alias

If you give an alias in FROM, the original table name can no longer be used as a prefix within that query.

```sql
SELECT EMP.ENAME FROM EMP E WHERE E.EMPNO = 7839;
```

```text
SELECT EMP.ENAME FROM EMP E WHERE E.EMPNO = 7839
       *
ERROR at line 1:
ORA-00904: "EMP"."ENAME": invalid identifier
```

- The alias `E` stands in for EMP, so a column called `EMP.ENAME` is considered not to exist.

## Cartesian Product — When You Leave Out the Condition

If you just list tables with no join condition, every row of one side is paired with every row of the other.

```sql
SELECT COUNT(*) FROM EMP, DEPT;
```

```text
  COUNT(*)
----------
        56
```

```sql
SELECT COUNT(*) FROM EMP, SALGRADE;
```

```text
  COUNT(*)
----------
        70
```

- EMP 14 × DEPT 4 = 56, and EMP 14 × SALGRADE 5 = 70.
- An unintended Cartesian product inflates the row count enormously. If the result is strangely large, start by counting the join conditions.

Even with three tables, if there is only one condition, a product arises with the remaining table.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        70
```

- EMP and DEPT are connected, giving 14 rows, but there is no condition with SALGRADE, so it is 14 × 5 = 70.
- To connect all N tables, you need **N-1 or more** join conditions.

## Non-EQUI Join

The join condition does not have to be `=`. SALGRADE is a table that assigns a grade to each salary range (LOSAL to HISAL).

```text
GRADE  LOSAL  HISAL
    1    700   1200
    2   1201   1400
    3   1401   2000
    4   2001   3000
    5   3001   9999
```

If you pair by which range an employee's salary falls into, you can attach a grade.

```sql
SELECT E.ENAME, E.SAL, S.GRADE
FROM EMP E, SALGRADE S
WHERE E.SAL BETWEEN S.LOSAL AND S.HISAL
  AND E.DEPTNO = 30
ORDER BY S.GRADE, E.ENAME;
```

```text
ENAME             SAL      GRADE
---------- ---------- ----------
JAMES             950          1
MARTIN           1250          2
WARD             1250          2
ALLEN            1600          3
TURNER           1500          3
BLAKE            2850          4
```

- EMP and SALGRADE have no columns with the same values. We paired the rows that fall in the range with `BETWEEN`.
- The ranges do not overlap, so each employee is paired with exactly one grade.

Counting the headcount by grade means using a Non-EQUI join together with GROUP BY.

```sql
SELECT S.GRADE, COUNT(*)
FROM EMP E, SALGRADE S
WHERE E.SAL BETWEEN S.LOSAL AND S.HISAL
GROUP BY S.GRADE
ORDER BY S.GRADE;
```

```text
     GRADE   COUNT(*)
---------- ----------
         1          3
         2          3
         3          2
         4          5
         5          1
```

- The total is 3 + 3 + 2 + 5 + 1 = 14, the same as the number of employees.

`<>` or `>` can also be a join condition. With such conditions, one row is easily paired with many rows and the result grows large.

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO <> D.DEPTNO;
```

```text
  COUNT(*)
----------
        42
```

- Each employee is paired with the 3 departments that are not their own, so it is 14 × 3 = 42.

## Joining Three Tables

By adding conditions one at a time you can keep connecting tables. Here we look at the managers' (MANAGER) names, department names, and salary grades all at once.

```sql
SELECT E.ENAME, D.DNAME, S.GRADE
FROM EMP E, DEPT D, SALGRADE S
WHERE E.DEPTNO = D.DEPTNO
  AND E.SAL BETWEEN S.LOSAL AND S.HISAL
  AND E.JOB = 'MANAGER'
ORDER BY E.ENAME;
```

```text
ENAME      DNAME               GRADE
---------- -------------- ----------
BLAKE      SALES                   4
CLARK      ACCOUNTING              4
JONES      RESEARCH                4
```

- With 3 tables and 2 join conditions (one EQUI, one Non-EQUI), the N-1 rule is satisfied.
- `E.JOB = 'MANAGER'` is not a join condition but an ordinary condition that filters rows.

## Oracle Outer Join (+)

An EQUI join throws away DEPT 40, which has no match. To keep every row of one table even without a match, you use an outer join. In Oracle's notation, you attach **`(+)` to the column on the side that will be filled with NULL because it has no match**.

```sql
SELECT D.DEPTNO, D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND D.DEPTNO IN (10, 40)
ORDER BY D.DEPTNO, E.ENAME;
```

```text
    DEPTNO DNAME          ENAME
---------- -------------- ----------
        10 ACCOUNTING     CLARK
        10 ACCOUNTING     KING
        10 ACCOUNTING     MILLER
        40 OPERATIONS
```

- Because `(+)` is attached on the EMP side, **every row of DEPT** is kept. Department 40 has no employee to pair with, so ENAME is NULL.
- A way to remember: `(+)` is a mark meaning "add a NULL row to the side that falls short". You attach it on the **opposite side** from the table you want to keep.

| Condition | Table fully kept | Rows |
|------|----------------|-----:|
| `E.DEPTNO = D.DEPTNO` | None (only matched rows) | 14 |
| `E.DEPTNO(+) = D.DEPTNO` | DEPT | 15 |
| `E.DEPTNO = D.DEPTNO(+)` | EMP | 14 |

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO(+) = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO = D.DEPTNO(+);
```

```text
  COUNT(*)
----------
        14
```

- The side that keeps EMP stays at 14 rows. No employee lacks a department, so there is no row to fill with NULL.

When you count the outer join result by department, what you count matters.

```sql
SELECT D.DEPTNO, COUNT(E.EMPNO) AS CNT, COUNT(*) AS ROWS_
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
GROUP BY D.DEPTNO
ORDER BY D.DEPTNO;
```

```text
    DEPTNO        CNT      ROWS_
---------- ---------- ----------
        10          3          3
        20          5          5
        30          6          6
        40          0          1
```

- Department 40 **has 1** row filled with NULL. `COUNT(*)` counts that row and gives 1, while `COUNT(E.EMPNO)` leaves out NULL and gives 0. For the number of employees, `COUNT(E.EMPNO)` is the right one.

### Put (+) on the Other Conditions Too

If you leave out `(+)` on an ordinary condition applied to the outer-joined table, the outer join is undone.

```sql
SELECT D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND E.SAL(+) > 2900
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     KING
OPERATIONS
RESEARCH       FORD
RESEARCH       JONES
RESEARCH       SCOTT
SALES
```

```sql
SELECT D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND E.SAL > 2900
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     KING
RESEARCH       FORD
RESEARCH       JONES
RESEARCH       SCOTT
```

- `E.SAL(+) > 2900`: the salary condition goes into **the pairing step**. SALES and OPERATIONS, which have no employee matching the condition, are also kept with NULL.
- `E.SAL > 2900`: when this condition is applied to the NULL rows made by the outer join, `NULL > 2900` is not true, so they drop out. The result becomes the same as an EQUI join.

> ⚠️ **Trap**: `(+)` can be attached on only one side. If you attach it on both sides, as in `E.DEPTNO(+) = D.DEPTNO(+)`, you get an ORA-01468 error (a predicate may reference only one outer-joined table). A FULL OUTER JOIN, which keeps both sides, can be written only in the ANSI notation we will see tomorrow.

> Tomorrow we write the same joins in the ANSI standard notation such as `JOIN ... ON`, and look at the difference between ON and WHERE.

## 📖 Glossary

- **Join**: An operation that pairs the rows of two or more tables according to a condition to make a single result.
- **EQUI join**: A join that pairs with an `=` condition. Only rows with a match on both sides remain.
- **Non-EQUI join**: A join that pairs with a condition other than `=`, such as `BETWEEN`, `>`, or `<>`.
- **Cartesian product**: The result of pairing every row with every row without a join condition. The row count is the product of the two tables' row counts.
- **Table alias**: A short name given to a table in FROM. Once given, you refer to it only by the alias in that query.
- **Outer join**: A join that does not discard rows without a match but keeps them, filling the opposite side with NULL.
- **`(+)`**: Oracle's outer join notation. You attach it to the column on the side that will be filled with NULL.
- **ORA-00918**: The error raised when a column with the same name in several tables is used without a prefix.

## 📝 Practice Questions

**Question 1.** EMP has 14 rows and DEPT has 4 rows. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP, DEPT;
```

A) 56  
B) 14  
C) 18  
D) 4  

**Answer: A**  
Explanation: There is no join condition, so it becomes a Cartesian product in which every row of EMP is paired with every row of DEPT. The row count is 14 × 4 = 56.

---

**Question 2.** SALGRADE is grade 1 for 700 to 1200, grade 2 for 1201 to 1400, grade 3 for 1401 to 2000, grade 4 for 2001 to 3000, and grade 5 for 3001 to 9999. The employees in EMP with a salary of 2001 to 3000 are JONES 2975, BLAKE 2850, CLARK 2450, SCOTT 3000, and FORD 3000. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP E, SALGRADE S WHERE E.SAL BETWEEN S.LOSAL AND S.HISAL AND S.GRADE = 4;
```

A) 3  
B) 1  
C) 5  
D) 2  

**Answer: C**  
Explanation: With a Non-EQUI join, each employee is paired with the grade of the range their salary belongs to. BETWEEN includes both endpoints, so SCOTT and FORD at 3000 are also grade 4. There are 5 employees in grade 4.

---

**Question 3.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP, DEPT WHERE EMP.DEPTNO = DEPT.DEPTNO;
```

A) 14 rows appear  
B) An ORA-00918 error occurs  
C) 56 rows appear  
D) An ORA-00904 error occurs  

**Answer: B**  
Explanation: DEPTNO is a column that exists in both EMP and DEPT. A prefix was used in WHERE, but the DEPTNO in SELECT has no prefix, so it cannot be determined which table it belongs to. In this case ORA-00918 (column ambiguously specified) occurs.

---

**Question 4.** DEPT has departments 10, 20, 30, and 40, and department 40 has no employees. All 14 people in EMP belong to one of departments 10, 20, and 30. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP E, DEPT D WHERE E.DEPTNO(+) = D.DEPTNO;
```

A) 14  
B) 56  
C) 4  
D) 15  

**Answer: D**  
Explanation: This is an outer join in which `(+)` is on the EMP side, so every row of DEPT is kept. The 14 employees are each paired with their department, and department 40, which has no match, is added as one row with the EMP side filled with NULL. 14 + 1 = 15 rows.

---

**Question 5.** EMP has 14 rows, DEPT has 4 rows, and SALGRADE has 5 rows. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP E, DEPT D, SALGRADE S WHERE E.DEPTNO = D.DEPTNO;
```

A) 14  
B) 70  
C) 280  
D) 56  

**Answer: B**  
Explanation: EMP and DEPT are connected by the join condition and give 14 rows. SALGRADE has no join condition, so a Cartesian product arises between those 14 rows and SALGRADE's 5 rows. 14 × 5 = 70. To connect all three tables, you need at least 2 join conditions.
