# Day 5 - Standard Joins (ANSI)

## 📌 Key Takeaways

- ANSI notation writes the join condition in **`ON` of the FROM clause**, leaving only row-filtering conditions in WHERE.
- **NATURAL JOIN** does an EQUI join on **all** columns with the same name, and **USING** does it on the columns you specify. In both cases, **adding a prefix to that column is an error** (ORA-25155, ORA-25154).
- **CROSS JOIN** is a Cartesian product. You cannot attach ON to it.
- `LEFT`, `RIGHT`, and `FULL OUTER JOIN` keep every row of the table on the side named by the direction. FULL cannot be written with Oracle's `(+)`.
- In an outer join, a condition on the inner table is a **pairing condition if you put it in ON** and a **result filter if you put it in WHERE**. The number of result rows differs.

## INNER JOIN ... ON

Moving yesterday's EQUI join to ANSI notation, you use `JOIN` instead of a comma and `ON` instead of WHERE.

```sql
SELECT E.ENAME, D.DNAME
FROM EMP E INNER JOIN DEPT D ON E.DEPTNO = D.DEPTNO
WHERE E.DEPTNO = 10
ORDER BY E.ENAME;
```

```text
ENAME      DNAME
---------- --------------
CLARK      ACCOUNTING
KING       ACCOUNTING
MILLER     ACCOUNTING
```

- `INNER` can be omitted. Writing just `JOIN` means INNER JOIN.
- The join condition (ON) and the ordinary condition (WHERE) are split into different clauses, so it is easy to see whether you left out a condition.
- ON can also take conditions other than `=`. A Non-EQUI join can be expressed in ANSI too.

If you write only `JOIN` and give no join condition, it is a syntax error. If you need a Cartesian product, use CROSS JOIN.

```sql
SELECT COUNT(*) FROM EMP JOIN DEPT;
```

```text
SELECT COUNT(*) FROM EMP JOIN DEPT
                                 *
ERROR at line 1:
ORA-02000: missing ON or USING keyword
```

## NATURAL JOIN

NATURAL JOIN **finds all the columns with the same name** in the two tables and connects rows whose values in those columns are equal. You do not write a condition separately.

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP NATURAL JOIN DEPT WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME          DEPTNO DNAME
---------- ---------- --------------
CLARK              10 ACCOUNTING
KING               10 ACCOUNTING
MILLER             10 ACCOUNTING
```

- The only column EMP and DEPT have in common is DEPTNO, so it becomes the same join as `E.DEPTNO = D.DEPTNO`.
- The common column DEPTNO is **merged into one** in the result. That is why writing `DEPTNO` without a prefix does not raise ORA-00918.

Looking at it with `SELECT *` reveals the merged form.

```sql
SELECT * FROM DEPT NATURAL JOIN EMP WHERE EMPNO = 7839;
```

```text
    DEPTNO DNAME          LOC                EMPNO ENAME      JOB              MGR HIREDATE          SAL       COMM
---------- -------------- ------------- ---------- ---------- --------- ---------- ---------- ---------- ----------
        10 ACCOUNTING     NEW YORK            7839 KING       PRESIDENT            1981-11-17       5000
```

```sql
SELECT * FROM DEPT D JOIN EMP E ON D.DEPTNO = E.DEPTNO WHERE EMPNO = 7839;
```

```text
    DEPTNO DNAME          LOC                EMPNO ENAME      JOB              MGR HIREDATE          SAL       COMM     DEPTNO
---------- -------------- ------------- ---------- ---------- --------- ---------- ---------- ---------- ---------- ----------
        10 ACCOUNTING     NEW YORK            7839 KING       PRESIDENT            1981-11-17       5000                    10
```

- NATURAL JOIN: the common column DEPTNO appears **only once at the front**, followed by the remaining columns. That is 10 columns.
- ON join: the DEPTNO of **both** sides appears. That is 11 columns.

### Do Not Put a Prefix on the Common Column

The merged DEPTNO is not a column of either one table. Attaching a table alias is an error.

```sql
SELECT E.ENAME, E.DEPTNO FROM EMP E NATURAL JOIN DEPT D;
```

```text
SELECT E.ENAME, E.DEPTNO FROM EMP E NATURAL JOIN DEPT D
                *
ERROR at line 1:
ORA-25155: column used in NATURAL join cannot have qualifier
```

- `E.ENAME` is not a common column, so a prefix is fine. What caused the problem is `E.DEPTNO`.

If there is no common column at all, NATURAL JOIN becomes a join with no condition, that is, a Cartesian product.

```sql
SELECT COUNT(*) FROM EMP NATURAL JOIN SALGRADE;
```

```text
  COUNT(*)
----------
        70
```

- EMP and SALGRADE have no columns with the same name. It is 14 × 5 = 70 rows.
- Conversely, if there is an unintended column with the same name (for example a `NAME` that both tables have), that column also goes into the condition. The result of a NATURAL JOIN depends on column names.

## USING

USING lets you **choose directly which of the same-named columns to use for the join**. You write the column name in parentheses.

```sql
SELECT ENAME, DEPTNO, DNAME FROM EMP JOIN DEPT USING (DEPTNO) WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME          DEPTNO DNAME
---------- ---------- --------------
CLARK              10 ACCOUNTING
KING               10 ACCOUNTING
MILLER             10 ACCOUNTING
```

A column used in USING is also merged into one, like in NATURAL JOIN, so you cannot attach a prefix. It is the same in SELECT and in WHERE.

```sql
SELECT ENAME, DEPTNO FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.DEPTNO = 10;
```

```text
SELECT ENAME, DEPTNO FROM EMP E JOIN DEPT D USING (DEPTNO) WHERE E.DEPTNO = 10
                                                                 *
ERROR at line 1:
ORA-25154: column part of USING clause cannot have qualifier
```

| Notation | Join columns | Prefix on common column | Common column display |
|------|--------|--------------|------------|
| `NATURAL JOIN` | **All** same-named columns (automatic) | Not allowed (ORA-25155) | Once |
| `JOIN ... USING (column)` | The columns specified in parentheses | Not allowed (ORA-25154) | Once |
| `JOIN ... ON condition` | As written in the condition | **Required** (otherwise ORA-00918) | Both sides separately |

- NATURAL JOIN and USING can only do EQUI joins on same-named columns. Columns with different names or Non-EQUI conditions can only be written with ON.

## CROSS JOIN

CROSS JOIN is used when you create a Cartesian product **on purpose**.

```sql
SELECT COUNT(*) FROM EMP CROSS JOIN DEPT;
```

```text
  COUNT(*)
----------
        56
```

It is a join that takes no condition, so attaching ON is a syntax error.

```sql
SELECT COUNT(*) FROM EMP CROSS JOIN DEPT ON EMP.DEPTNO = DEPT.DEPTNO;
```

```text
SELECT COUNT(*) FROM EMP CROSS JOIN DEPT ON EMP.DEPTNO = DEPT.DEPTNO
                                         *
ERROR at line 1:
ORA-03048: SQL reserved word 'ON' is not syntactically valid following '...(*) FROM EMP CROSS JOIN DEPT '
```

- Writing a condition in WHERE after CROSS JOIN is possible. Then the result becomes the same as an EQUI join.

## OUTER JOIN — LEFT, RIGHT, FULL

The direction points to the left table or the right table relative to the `JOIN` keyword. All rows on that side are kept even without a match.

```sql
SELECT D.DEPTNO, D.DNAME, E.ENAME
FROM DEPT D LEFT OUTER JOIN EMP E ON D.DEPTNO = E.DEPTNO
WHERE D.DEPTNO IN (10, 40)
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

- Department 40 on the left (DEPT) was kept without a match. It is the same result as yesterday's `E.DEPTNO(+) = D.DEPTNO`.
- `OUTER` can be omitted. `LEFT JOIN` means the same thing.

| ANSI | Oracle `(+)` | Side fully kept | Result rows for EMP and DEPT |
|------|-------------|------------|-----:|
| `DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO` | `E.DEPTNO(+) = D.DEPTNO` | DEPT | 15 |
| `EMP E RIGHT JOIN DEPT D ON E.DEPTNO = D.DEPTNO` | `E.DEPTNO(+) = D.DEPTNO` | DEPT | 15 |
| `EMP E FULL JOIN DEPT D ON E.DEPTNO = D.DEPTNO` | Cannot be expressed | Both sides | 15 |

```sql
SELECT COUNT(*) FROM EMP E RIGHT OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

```sql
SELECT COUNT(*) FROM EMP E FULL OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;
```

```text
  COUNT(*)
----------
        15
```

- LEFT and RIGHT are equivalent when you swap the table order. `A LEFT JOIN B` is `B RIGHT JOIN A`.
- FULL is "rows with a match on both sides + rows only on the left + rows only on the right". In this data no employee is without a department, so only DEPT 40 is added, making 15 rows.

Outer joins are also used to pick out only the rows without a match. The rows where the key on the NULL-filled side is NULL are the rows without a match.

```sql
SELECT D.DNAME FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO WHERE E.EMPNO IS NULL;
```

```text
DNAME
--------------
OPERATIONS
```

ANSI joins and `(+)` cannot be mixed in one query.

```sql
SELECT COUNT(*) FROM EMP E JOIN DEPT D ON E.DEPTNO = D.DEPTNO WHERE E.DEPTNO(+) = D.DEPTNO;
```

```text
SELECT COUNT(*) FROM EMP E JOIN DEPT D ON E.DEPTNO = D.DEPTNO WHERE E.DEPTNO(+) = D.DEPTNO
                                                                    *
ERROR at line 1:
ORA-25156: old style outer join (+) cannot be used with ANSI joins
```

## In ON or in WHERE?

In an INNER JOIN, the result is the same whether you put a condition in ON or in WHERE. In an outer join it is different. Here the situation is that you want to attach the employees with a salary of 3000 or more by department, but still show every department.

```sql
SELECT D.DNAME, E.ENAME, E.SAL
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND E.SAL >= 3000
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME             SAL
-------------- ---------- ----------
ACCOUNTING     KING             5000
OPERATIONS
RESEARCH       FORD             3000
RESEARCH       SCOTT            3000
SALES
```

```sql
SELECT D.DNAME, E.ENAME, E.SAL
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO
WHERE E.SAL >= 3000
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME             SAL
-------------- ---------- ----------
ACCOUNTING     KING             5000
RESEARCH       FORD             3000
RESEARCH       SCOTT            3000
```

| Condition position | When it is applied | Result |
|----------|------------|------|
| ON | **When pairing**. Only employees who meet the condition are accepted as a match | SALES and OPERATIONS, which have no match, are also kept with NULL (5 rows) |
| WHERE | It filters the result rows **after the outer join is finished** | The NULL rows drop out because `NULL >= 3000` is not true (3 rows) |

- If you put a condition on the inner table (EMP) in WHERE, the NULL-filled rows disappear and it effectively becomes an INNER JOIN. It is the same phenomenon as the case we saw yesterday where `(+)` was left off `E.SAL > 2900`.

> ⚠️ **Trap**: Conversely, **if you put a condition on the kept side (DEPT) in ON, rows do not decrease.** `ON D.DEPTNO = E.DEPTNO AND D.DEPTNO = 10` means "only pair department 10 with employees". The other departments all remain in the result, and only the employee columns become NULL. To filter the rows of the kept side, write it in WHERE.

```sql
SELECT D.DNAME, E.ENAME
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND D.DEPTNO = 10
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     CLARK
ACCOUNTING     KING
ACCOUNTING     MILLER
OPERATIONS
RESEARCH
SALES
```

```sql
SELECT D.DNAME, E.ENAME
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO
WHERE D.DEPTNO = 10
ORDER BY D.DNAME, E.ENAME;
```

```text
DNAME          ENAME
-------------- ----------
ACCOUNTING     CLARK
ACCOUNTING     KING
ACCOUNTING     MILLER
```

- The ON version has 6 rows and the WHERE version has 3. In the ON version, the employee columns of RESEARCH and SALES are empty even though they have employees. That is because they are not department 10, so no match was accepted.

If you GROUP BY the outer join result, you can even get the headcount of 0 for a department with no employees.

```sql
SELECT D.DNAME, COUNT(E.EMPNO) AS CNT
FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO
GROUP BY D.DNAME
ORDER BY D.DNAME;
```

```text
DNAME                 CNT
-------------- ----------
ACCOUNTING              3
OPERATIONS              0
RESEARCH                5
SALES                   6
```

- When we ran GROUP BY with only EMP in Day 1, department 40 did not appear. If you outer join with DEPT as the base, OPERATIONS 0 shows up.

> Next week we cover subqueries, which put a query inside a query.

## 📖 Glossary

- **ANSI join**: The standard notation that writes the join condition as `JOIN ... ON` in the FROM clause.
- **INNER JOIN**: A join that keeps only rows that have a match meeting the condition. `INNER` can be omitted.
- **NATURAL JOIN**: Automatically does an EQUI join on all columns with the same name. If there is no common column, it is a Cartesian product.
- **USING**: Does an EQUI join on columns you choose from among the same-named columns. You cannot attach a prefix to those columns.
- **CROSS JOIN**: A join that pairs every row with every row without a condition. The result is a Cartesian product.
- **LEFT / RIGHT OUTER JOIN**: A join that keeps all rows of the left / right table even without a match.
- **FULL OUTER JOIN**: A join that keeps all rows of both tables. It cannot be written with Oracle's `(+)`.
- **ORA-25155 / ORA-25154**: The errors raised when you attach a prefix to a NATURAL JOIN common column / a USING column.

## 📝 Practice Questions

**Question 1.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT E.ENAME, E.DEPTNO FROM EMP E NATURAL JOIN DEPT D;
```

A) 14 rows appear  
B) 56 rows appear  
C) An ORA-00918 error occurs  
D) An ORA-25155 error occurs  

**Answer: D**  
Explanation: The common column DEPTNO of a NATURAL JOIN is merged into one in the result, so it is not a column of either single table. That is why attaching a prefix, as in `E.DEPTNO`, gives ORA-25155 (column used in NATURAL join cannot have qualifier). A prefix is fine on `E.ENAME`, which is not a common column.

---

**Question 2.** DEPT has 4 departments. CLERK is 1 person in department 10, 2 in department 20, and 1 in department 30, and department 40 has no employees. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM DEPT D LEFT JOIN EMP E ON D.DEPTNO = E.DEPTNO AND E.JOB = 'CLERK';
```

A) 5  
B) 4  
C) 14  
D) 15  

**Answer: A**  
Explanation: `E.JOB = 'CLERK'` is in ON, so it is a condition used only when pairing. There are 1 + 2 + 1 = 4 rows paired with CLERK, and department 40, which has no match, remains as one row with NULL, giving 5 rows. If you put the same condition in WHERE, the NULL row drops out and it becomes 4 rows.

---

**Question 3.** Every employee in EMP belongs to a department that exists in DEPT, and DEPT 40 has no employees. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP E FULL OUTER JOIN DEPT D ON E.DEPTNO = D.DEPTNO;
```

A) 14  
B) 18  
C) 15  
D) 56  

**Answer: C**  
Explanation: FULL OUTER JOIN adds the unmatched rows from both sides to the matched rows. All 14 employees have a match, so that is 14 rows. There are no rows only on the EMP side, and department 40, which is only on the DEPT side, adds one more row, making 15 rows.

---

**Question 4.** EMP and SALGRADE have no columns with the same name. EMP has 14 rows and SALGRADE has 5 rows. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP NATURAL JOIN SALGRADE;
```

A) 0  
B) 70  
C) An error occurs  
D) 14  

**Answer: B**  
Explanation: NATURAL JOIN uses all columns with the same name as its join condition. If there is no common column, it becomes a join with no condition at all, and a Cartesian product comes out. It is 14 × 5 = 70 rows, and no error occurs.

---

**Question 5.** Which of the following causes an error when run in Oracle?

A) SELECT COUNT(*) FROM EMP CROSS JOIN DEPT;  
B) SELECT COUNT(*) FROM EMP JOIN DEPT USING (DEPTNO);  
C) SELECT COUNT(*) FROM EMP NATURAL JOIN DEPT;  
D) SELECT COUNT(*) FROM EMP JOIN DEPT;  

**Answer: D**  
Explanation: `JOIN` (INNER JOIN) must receive its join condition through ON or USING. Writing it without a condition gives ORA-02000 (missing ON or USING keyword). A join without a condition must be written as CROSS JOIN, and NATURAL JOIN finds its condition automatically, so it does not need ON.
