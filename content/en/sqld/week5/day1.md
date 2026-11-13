# Day 1 - Subquery Basics

## 📌 Key Points

- A subquery is a SELECT wrapped in parentheses. It can appear in the SELECT, FROM, WHERE, and HAVING clauses, and it has a different name depending on where it sits.
- Use single-row operators such as `=`, `>`, `<` with a **single-row subquery**, and `IN`, `ANY`, `ALL`, `EXISTS` with a **multi-row subquery**. Mixing them up gives ORA-01427.
- `> ANY` means "greater than the minimum", and `> ALL` means "greater than the maximum". When the subquery returns no rows, `ALL` is true and `ANY` is false.
- If a `NOT IN` list contains even one NULL, the result is **0 rows**. Avoid it with `NOT EXISTS` or an `IS NOT NULL` condition.
- You cannot use ORDER BY inside a WHERE-clause subquery (ORA-00907). You can in an inline view in the FROM clause.

## Why Put a Query Inside a Query

To find "employees who earn more than JONES", you first need to know JONES's salary. Instead of looking the value up and copying it by hand, you put the SELECT that finds it in parentheses and use it right where the condition goes.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL > (SELECT SAL FROM EMP WHERE ENAME = 'JONES') ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
```

- The part inside the parentheses is the **subquery** (inner query), and the outer part is the **main query**.
- The subquery `SELECT SAL FROM EMP WHERE ENAME = 'JONES'` returns 2975, so the main query runs as if it were `SAL > 2975`.
- A subquery must always be wrapped in parentheses.

## Where a Subquery Can Go

| Location | Name | Shape it must return | Example |
|------|------|-----------------|----|
| SELECT clause | Scalar subquery | One row, one column | `(SELECT ROUND(AVG(SAL)) FROM EMP)` |
| FROM clause | Inline view | A table (multiple rows and columns) | `FROM (SELECT DEPTNO, COUNT(*) ...) D` |
| WHERE clause | Nested subquery | A shape that fits the operator | `SAL > (SELECT ...)` |
| HAVING clause | Nested subquery | A shape that fits the operator | `HAVING AVG(SAL) > (SELECT ...)` |

Put it in the SELECT clause and every row gets the same value; put it in the FROM clause and its result is used like a table. Put it in the HAVING clause and you can compare each group against an overall value. Here we find departments whose average is higher than the overall average salary (2073.21…).

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP GROUP BY DEPTNO HAVING AVG(SAL) > (SELECT AVG(SAL) FROM EMP) ORDER BY DEPTNO;
```

```text
    DEPTNO   AVG(SAL)
---------- ----------
        10 2916.66667
        20       2175
```

- Department 30's average is 1566.66…, so it was left out.
- Scalar subqueries and inline views are covered in detail on Day 2. Today the focus is the comparison rules in WHERE and HAVING.

## Single-Row Subqueries and Multi-Row Subqueries

Subqueries are also classified by **the number of rows they return**. The number of rows decides which operators you can use.

| Type | Number of result rows | Operators used |
|------|----------|-----------|
| Single-row subquery | 0 or 1 row | `=`, `<>`, `>`, `>=`, `<`, `<=` |
| Multi-row subquery | Multiple rows | `IN`, `NOT IN`, `ANY` (`SOME`), `ALL`, `EXISTS` |
| Multi-column subquery | Multiple columns | `(col1, col2) IN (...)` |

### When a Single-Row Operator Gets Multiple Rows — ORA-01427

To find the employee with the highest salary in department 30, reduce the values to one with `MAX`.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 30);
```

```text
ENAME             SAL
---------- ----------
BLAKE            2850
```

Without `MAX`, the subquery returns 6 rows of salaries for the 6 people in department 30. `=` can only compare against a single value.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 30);
```

```text
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 30)
                                        *
ERROR at line 1:
ORA-01427: single-row subquery returns more than one row
```

- The error occurs at run time when the result turns out to have 2 or more rows. The same statement raises no error if the data changes so that only 1 row comes back.
- If the subquery returns **0 rows**, that is not an error. The comparison value becomes NULL, so the condition is never true and the result is 0 rows.
- `IN` has no problem even if the subquery returns just 1 row. When you do not know how many rows will come back, a multi-row operator is the safe choice.

### IN — Equal to Any One in the List

- `IN` is shorthand for `= OR = OR =`. `SAL IN (SELECT MIN(SAL) FROM EMP GROUP BY DEPTNO)` picks employees whose salary equals one of the per-department minimums 800, 950, and 1300.
- It does not check whether the salary is the minimum of the employee's own department. That comparison is handled by the multi-column subquery below.

### ANY and ALL

`ANY` is true if **at least one** value in the list satisfies the condition, and `ALL` is true only if **all** of them do. The salaries in department 30 are 950, 1250, 1250, 1500, 1600, and 2850.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 30) ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
JONES            2975
```

- `> ALL`: must be greater than the largest value, 2850. BLAKE himself (2850) is left out because `2850 > 2850` is false.
- If you use `> ANY` in the same spot, you only need to be greater than the smallest value, 950. Outside department 30, only SMITH (800) is left out.

| Expression | Same meaning |
|----|--------|
| `> ANY (list)` | `> MIN(list)` |
| `< ANY (list)` | `< MAX(list)` |
| `> ALL (list)` | `> MAX(list)` |
| `< ALL (list)` | `< MIN(list)` |
| `= ANY (list)` | `IN (list)` |
| `<> ALL (list)` | `NOT IN (list)` |

When the subquery returns **0 rows**, the two operators behave in opposite ways. DEPT 40 has no employees.

```sql
SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 40);
SELECT COUNT(*) FROM EMP WHERE SAL > ANY (SELECT SAL FROM EMP WHERE DEPTNO = 40);
```

```text
  COUNT(*)
----------
        14

  COUNT(*)
----------
         0
```

- `ALL`: there is no value that fails the condition, so it is true. All 14 rows come back.
- `ANY`: there is no value that satisfies the condition, so it is false. That is why `> ALL` and `> (SELECT MAX ...)` differ only when the subquery is empty. The MAX version compares against NULL and returns 0 rows.

### EXISTS — Is There One or Not

`EXISTS` is **true if the subquery returns even 1 row**. It does not look at what value is returned, so it is written like `SELECT 1`. Here are the departments that have an employee earning 3000 or more.

```sql
SELECT DNAME FROM DEPT D WHERE EXISTS (SELECT 1 FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.SAL >= 3000) ORDER BY DNAME;
```

```text
DNAME
--------------
ACCOUNTING
RESEARCH
```

- `D.DEPTNO` inside the subquery is a column of the main query. This form, which re-checks the subquery for each outer row, is the correlated subquery of Day 2.
- EXISTS can stop as soon as it finds one row that satisfies the condition and finish with true, without searching further.

## Multi-Column Subqueries

When you compare two or more columns, wrap them in parentheses and compare them as a **pair**. This statement finds the top earner in each department.

```sql
SELECT ENAME, DEPTNO, SAL FROM EMP WHERE (DEPTNO, SAL) IN (SELECT DEPTNO, MAX(SAL) FROM EMP GROUP BY DEPTNO) ORDER BY DEPTNO, ENAME;
```

```text
ENAME          DEPTNO        SAL
---------- ---------- ----------
KING               10       5000
FORD               20       3000
SCOTT              20       3000
BLAKE              30       2850
```

- The subquery result is three pairs: (10, 5000), (20, 3000), (30, 2850). In department 20, two people earn 3000, so FORD and SCOTT both appear.
- The number of columns on the left must equal the number of SELECT columns in the subquery.

Comparing as a pair is different from comparing the columns separately. Check this using the (department, job) combinations of SMITH (20, CLERK) and ALLEN (30, SALESMAN).

```sql
SELECT ENAME, DEPTNO, JOB FROM EMP WHERE (DEPTNO, JOB) IN (SELECT DEPTNO, JOB FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN')) ORDER BY DEPTNO, ENAME;
```

```text
ENAME          DEPTNO JOB
---------- ---------- ---------
ADAMS              20 CLERK
SMITH              20 CLERK
ALLEN              30 SALESMAN
MARTIN             30 SALESMAN
TURNER             30 SALESMAN
WARD               30 SALESMAN
```

```sql
SELECT ENAME, DEPTNO, JOB FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN')) AND JOB IN (SELECT JOB FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN')) ORDER BY DEPTNO, ENAME;
```

```text
ENAME          DEPTNO JOB
---------- ---------- ---------
ADAMS              20 CLERK
SMITH              20 CLERK
ALLEN              30 SALESMAN
JAMES              30 CLERK
MARTIN             30 SALESMAN
TURNER             30 SALESMAN
WARD               30 SALESMAN
```

- Compared separately, the department only has to be in {20, 30} and the job only has to be in {CLERK, SALESMAN}. That is why JAMES, who is (30, CLERK), slips in.
- Pair comparison accepts only the two combinations (20, CLERK) and (30, SALESMAN). It is 6 rows versus 7 rows.

If you put one column in front of the single-row operator `=` and the subquery returns two columns, the counts do not match.

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = (SELECT DEPTNO, DNAME FROM DEPT WHERE DEPTNO = 10);
```

```text
SELECT ENAME FROM EMP WHERE DEPTNO = (SELECT DEPTNO, DNAME FROM DEPT WHERE DEPTNO = 10)
                                      *
ERROR at line 1:
ORA-00913: too many values
```

- **ORA-01427** is for too many rows, and **ORA-00913** is for too many columns.

## NOT IN and NULL

Here is what happens when we try to find employees who are not managers, that is, employees who do not appear as anyone's MGR, using `NOT IN`.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP);
```

```text
  COUNT(*)
----------
         0
```

There are 8 employees with no subordinates, yet we got 0. The reason is that KING's **NULL** is mixed into the MGR column.

- `EMPNO NOT IN (7902, 7698, …, NULL)` is `EMPNO <> 7902 AND … AND EMPNO <> NULL`.
- `EMPNO <> NULL` is UNKNOWN, neither true nor false. If even one UNKNOWN is in a chain of AND conditions, the whole thing can never be true.
- `IN` expands to OR, so even with a NULL mixed in, it is true if the value equals any of the others. The problem only arises with `NOT IN`.

> ⚠️ **Pitfall**: If the result of a `NOT IN` subquery contains even one NULL, the result is **0 rows** with no error. Add `WHERE MGR IS NOT NULL` to the subquery or switch to `NOT EXISTS`.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP WHERE MGR IS NOT NULL);
```

```text
  COUNT(*)
----------
         8
```

```sql
SELECT COUNT(*) FROM EMP E WHERE NOT EXISTS (SELECT 1 FROM EMP M WHERE M.MGR = E.EMPNO);
```

```text
  COUNT(*)
----------
         8
```

- `NOT EXISTS` only checks "is there no matching row". There is no place for a NULL comparison to interfere, so the result is the correct 8.

## ORDER BY Inside a Subquery

A WHERE-clause subquery only passes a list of values, so order has no meaning. Oracle raises a syntax error if you use ORDER BY here.

```sql
SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT ORDER BY DEPTNO);
```

```text
SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT ORDER BY DEPTNO)
                                                                  *
ERROR at line 1:
ORA-00907: missing right parenthesis
```

- The error message says "missing right parenthesis". This is because the parser expects the parenthesis to close before ORDER BY.
- You can use ORDER BY in an inline view in the FROM clause. Top-N queries, which sort and then cut the first few rows with `ROWNUM`, rely on this property (W6).

| Location | ORDER BY |
|------|---------|
| WHERE / HAVING subquery | Not allowed (ORA-00907) |
| FROM-clause inline view | Allowed |
| Main query | Once, at the very end |

- From Oracle 12c, if you attach `FETCH FIRST n ROWS ONLY` after ORDER BY, it is also accepted in a WHERE-clause subquery, because the sort is used to pick the "first n rows". The explanations and questions in this note assume the case where ORDER BY is used without FETCH.

> Tomorrow we cover correlated subqueries that reference outer rows, scalar subqueries in the SELECT clause, and inline views and views in the FROM clause.

## 📖 Glossary

- **Subquery**: A SELECT statement placed in parentheses inside another SQL statement. The outer statement is called the main query.
- **Single-row subquery**: A subquery whose result is 0 or 1 row. Used with single-row operators such as `=` and `>`.
- **Multi-row subquery**: A subquery whose result can be multiple rows. Used with `IN`, `ANY`, `ALL`, and `EXISTS`.
- **Multi-column subquery**: A subquery that returns multiple columns and is compared as a pair, like `(A, B) IN (...)`.
- **ANY / ALL**: True if at least one / all of the values in the list satisfy the condition. On an empty list, ANY is false and ALL is true.
- **EXISTS**: True if the subquery result has 1 or more rows. It does not look at the returned values.
- **ORA-01427**: The error when the subquery after a single-row operator returns 2 or more rows.
- **ORA-00913**: The error when the subquery returns more columns than the comparison expects (too many values).

## 📝 Practice Questions

**Question 1.** Department 30 of EMP has 6 employees. Which is the correct result of running the following SQL in Oracle?

```sql
SELECT ENAME FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 30);
```

A) 6 rows, the employees of department 30, are returned  
B) 1 row, BLAKE, the top earner in department 30, is returned  
C) ORA-01427 is raised  
D) ORA-00913 is raised  

**Answer: C**  
Explanation: `=` is a single-row operator, so it compares against only one value. The subquery returns 6 rows of department 30 salaries, so ORA-01427 (single-row subquery returns more than one row) is raised. To compare against multiple values you must use `IN`, and the 1 row for BLAKE is the result when the values are reduced with `MAX(SAL)`. ORA-00913 is the error for too many columns, not rows.

---

**Question 2.** The MGR column of EMP contains one NULL (KING's), and 8 employees have no subordinates. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP);
```

A) 0  
B) 8  
C) 6  
D) 14  

**Answer: A**  
Explanation: `NOT IN` compares against every value in the list with `<>` and joins them with AND. If the list contains NULL, `EMPNO <> NULL` becomes UNKNOWN, so no row can ever be true. That is why the result is 0. 8 is the result when you add `WHERE MGR IS NOT NULL` or switch to `NOT EXISTS`, and 6 is the number of managers counted with `IN`.

---

**Question 3.** Department 30 has employees. Which condition produces the same result as `SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 30)`?

A) `SAL > (SELECT MIN(SAL) FROM EMP WHERE DEPTNO = 30)`  
B) `SAL >= (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 30)`  
C) `SAL IN (SELECT SAL FROM EMP WHERE DEPTNO = 30)`  
D) `SAL > (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 30)`  

**Answer: D**  
Explanation: `> ALL` must be greater than every value in the list, so it means greater than the largest value. `> MIN` is the same condition as `> ANY`. `>= MAX` also includes the employee equal to the maximum (BLAKE), so the result differs. `IN` checks whether the value equals one of the values in the list.

---

**Question 4.** Which of the following raises an error when run in Oracle?

A) `SELECT COUNT(*) FROM (SELECT ENAME FROM EMP ORDER BY ENAME);`  
B) `SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT ORDER BY DEPTNO);`  
C) `SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING COUNT(*) > (SELECT COUNT(*) FROM EMP WHERE DEPTNO = 10);`  
D) `SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT WHERE LOC = 'DALLAS');`  

**Answer: B**  
Explanation: You cannot use ORDER BY inside a WHERE-clause subquery, so ORA-00907 (missing right parenthesis) is raised. A is a FROM-clause inline view, so ORDER BY is allowed and it returns 14. C is a single-row subquery in the HAVING clause and returns departments 20 and 30. D uses the multi-row operator IN, so it is fine.

---

**Question 5.** SMITH is (20, CLERK) and ALLEN is (30, SALESMAN). In EMP, (20, CLERK) has 2 people, (30, SALESMAN) has 4, and (30, CLERK) has 1. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP WHERE (DEPTNO, JOB) IN (SELECT DEPTNO, JOB FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN'));
```

A) 2  
B) 7  
C) ORA-00913 is raised  
D) 6  

**Answer: D**  
Explanation: A multi-column subquery compares (department, job) as a pair. The only accepted combinations are (20, CLERK) and (30, SALESMAN), so the result is 2 + 4 = 6. 7 is the result when DEPTNO and JOB are compared separately with IN, which lets in JAMES, who is (30, CLERK). The number of columns on the left and in the subquery is the same, 2, so no error is raised.
