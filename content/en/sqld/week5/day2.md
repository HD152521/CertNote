# Day 2 - Correlated Subqueries, Scalar Subqueries, and Inline Views

## 📌 Key Points

- A **non-correlated subquery** runs once, independently of the main query, and passes its value along. A **correlated subquery** references a column of the main query and is re-evaluated for each outer row.
- A **scalar subquery** stands in for a single value, for example in the SELECT clause. It must be one row and one column; if there are no rows it is NULL, and if there are 2 or more rows it is ORA-01427.
- An **inline view** is a subquery in the FROM clause. From the outside, only the columns the inline view SELECTs (including aliases) are visible.
- A **view** is a virtual table that stores a named SELECT statement. It stores no data of its own, and its advantages are independence, convenience, and security.
- `WITH name AS (subquery)` is a notation that gives an inline view a name and pulls it out to the front of the statement.

## Non-Correlated and Correlated — Does It Look at an Outer Column?

Most of yesterday's subqueries could run on their own, independent of the outside. `(SELECT AVG(SAL) FROM EMP)` gives 2073.21… even if you detach it and run it. This kind of subquery is a **non-correlated subquery**.

"Employees who earn more than their own department's average" is different. The department whose average is needed changes with every outer row.

```sql
SELECT E.ENAME, E.DEPTNO, E.SAL FROM EMP E WHERE E.SAL > (SELECT AVG(S.SAL) FROM EMP S WHERE S.DEPTNO = E.DEPTNO) ORDER BY E.DEPTNO, E.ENAME;
```

```text
ENAME          DEPTNO        SAL
---------- ---------- ----------
KING               10       5000
FORD               20       3000
JONES              20       2975
SCOTT              20       3000
ALLEN              30       1600
BLAKE              30       2850
```

- `E.DEPTNO` inside the subquery is a column of the main query. With this reference, it is a **correlated subquery**.
- The department averages are 2916.67 for department 10, 2175 for 20, and 1566.67 for 30. KING is compared with the average of department 10, and ALLEN with the average of department 30.
- If you detach the subquery, it cannot run because it does not know what `E.DEPTNO` is.

### Differences in How They Run

| Type | Non-correlated subquery | Correlated subquery |
|------|---------------|-------------|
| References an outer column | No | Yes |
| Number of executions (conceptually) | Once. The result is passed to the main query | Re-evaluated for every main query row |
| Execution order | Subquery → main query | Read a main query row → run the subquery with that value |
| Runs on its own | Yes | No |

- The table above describes the logical behavior. In practice, the optimizer may rewrite a correlated subquery as a join or reuse the result for identical values.
- The reference goes only one way. A subquery can see the main query's columns, but the main query cannot see columns inside the subquery.

The same pattern also finds "the top earner in each department". It gives the same result as yesterday's multi-column subquery `(DEPTNO, SAL) IN (...)`.

```sql
SELECT E.ENAME, E.SAL FROM EMP E WHERE E.SAL = (SELECT MAX(SAL) FROM EMP S WHERE S.DEPTNO = E.DEPTNO) ORDER BY E.ENAME;
```

```text
ENAME             SAL
---------- ----------
BLAKE            2850
FORD             3000
KING             5000
SCOTT            3000
```

- For each outer row, the subquery returns just one value (that department's MAX). That is why using the single-row operator `=` does not raise ORA-01427.

EXISTS is almost always used as a correlated subquery. Here is the number of employees who have at least one subordinate, that is, the number of managers.

```sql
SELECT COUNT(*) FROM EMP E WHERE EXISTS (SELECT 1 FROM EMP M WHERE M.MGR = E.EMPNO);
```

```text
  COUNT(*)
----------
         6
```

## Scalar Subqueries — In the Place of One Value

A **scalar subquery** is a subquery placed where a single value belongs. It is mostly used in the SELECT clause, and its result must be **one row and one column**. Here we attach the headcount of each department, based on DEPT.

```sql
SELECT D.DNAME, (SELECT COUNT(*) FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS CNT FROM DEPT D ORDER BY D.DEPTNO;
```

```text
DNAME                 CNT
-------------- ----------
ACCOUNTING              3
RESEARCH                5
SALES                   6
OPERATIONS              0
```

- The subquery is evaluated once for each of the 4 DEPT rows. Because it uses the outer column `D.DEPTNO`, it is also a correlated subquery.
- OPERATIONS has no employees, but `COUNT(*)` returns 0. The result stays at 4 rows, based on DEPT.

It is also used to fetch the name for a code value instead of using a join.

```sql
SELECT E.ENAME, (SELECT D.DNAME FROM DEPT D WHERE D.DEPTNO = E.DEPTNO) AS DNAME FROM EMP E WHERE E.JOB = 'MANAGER' ORDER BY E.ENAME;
```

```text
ENAME      DNAME
---------- --------------
BLAKE      SALES
CLARK      ACCOUNTING
JONES      RESEARCH
```

### When You Break the One-Row, One-Column Rule

| Subquery result | Value of the scalar subquery |
|-------------|------------------|
| 1 row, 1 column | That value |
| 0 rows | NULL (not an error) |
| 2 or more rows | ORA-01427 |
| 2 or more columns | ORA-00913 |

With 0 rows, it becomes NULL. If you look for the PRESIDENT in each department, there is no row to find in any department other than 10.

```sql
SELECT D.DNAME, (SELECT E.ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.JOB = 'PRESIDENT') AS PRES FROM DEPT D ORDER BY D.DEPTNO;
```

```text
DNAME          PRES
-------------- ----------
ACCOUNTING     KING
RESEARCH
SALES
OPERATIONS
```

- The three departments where the subquery returns 0 rows get NULL with no error. The 4 outer DEPT rows all remain. With an INNER JOIN, the departments without a match would be dropped.
- If you use an aggregate such as `MAX`, even an empty set produces 1 row (with value NULL). The result is the same NULL, but note that `COUNT` returns 0 (W4 Day 1).

If a department has several employees, you cannot pick a single ENAME.

```sql
SELECT D.DNAME, (SELECT ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS ENAME FROM DEPT D;
```

```text
SELECT D.DNAME, (SELECT ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS ENAME FROM DEPT D
                 *
ERROR at line 1:
ORA-01427: single-row subquery returns more than one row
```

Returning two columns cannot go in a single-value slot either. Only KING earns 5000 or more, so there is 1 row, but it has 2 columns.

```sql
SELECT D.DNAME, (SELECT ENAME, SAL FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.SAL >= 5000) AS X FROM DEPT D;
```

```text
SELECT D.DNAME, (SELECT ENAME, SAL FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.SAL >= 5000) AS X FROM DEPT D
                 *
ERROR at line 1:
ORA-00913: too many values
```

> ⚠️ **Pitfall**: If a scalar subquery returns 0 rows, the result is **NULL**, not an error. An error occurs only when it returns 2 or more rows (ORA-01427) or 2 or more columns (ORA-00913).

## Inline Views — Subqueries in the FROM Clause

A subquery placed in the FROM clause is called an **inline view**. Its result is used on the spot like a temporary table. Here we build the department averages as an inline view and join it with EMP.

```sql
SELECT E.ENAME, E.SAL, A.AVG_SAL FROM EMP E, (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) A WHERE E.DEPTNO = A.DEPTNO AND E.SAL > A.AVG_SAL ORDER BY E.ENAME;
```

```text
ENAME             SAL    AVG_SAL
---------- ---------- ----------
ALLEN            1600       1567
BLAKE            2850       1567
FORD             3000       2175
JONES            2975       2175
KING             5000       2917
SCOTT            3000       2175
```

- These are the same 6 people as in the correlated subquery above. The difference is that the department average `AVG_SAL` **can be shown as a result column**. The value of a WHERE-clause subquery cannot be pulled out into the SELECT.
- The inline view `A` is a table with 3 rows (the number of departments), and it is joined to the 14 rows of EMP on DEPTNO.

### Only the Inline View's SELECT List Is Visible from Outside

Outside the inline view, you can reference only the column names produced by the inner SELECT. If you give an expression an alias, that alias becomes the column name.

```sql
SELECT DEPTNO, AVG_SAL FROM (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) WHERE AVG_SAL > 2000 ORDER BY DEPTNO;
```

```text
    DEPTNO    AVG_SAL
---------- ----------
        10       2917
        20       2175
```

A column that was not SELECTed inside is not visible outside.

```sql
SELECT X.ENAME FROM (SELECT ENAME FROM EMP WHERE DEPTNO = 10) X WHERE X.SAL > 1000;
```

```text
SELECT X.ENAME FROM (SELECT ENAME FROM EMP WHERE DEPTNO = 10) X WHERE X.SAL > 1000
                                                                      *
ERROR at line 1:
ORA-00904: "X"."SAL": invalid identifier
```

- The inline view X has only one column, ENAME. Even though EMP originally has SAL, X does not.

You also use an inline view when you want to use a SELECT alias in WHERE. A WHERE at the same query level is processed before SELECT, so it does not know the alias.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL >= 36000;
```

```text
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL >= 36000
                                                *
ERROR at line 1:
ORA-00904: "ANNUAL": invalid identifier
```

```sql
SELECT ENAME, ANNUAL FROM (SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP) WHERE ANNUAL >= 36000 ORDER BY ANNUAL DESC, ENAME;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
FORD            36000
SCOTT           36000
```

- The alias is created inside the inline view, and the outer WHERE receives that result, so `ANNUAL` is visible.
- The inline view itself can also be given an alias (`X`, `A`). In Oracle, you do not use `AS` before a table alias.

## Views (VIEW)

An inline view is used only within its own statement. To use the same SELECT in several places, you give it a name and store it in the database. This is a **view**.

```text
CREATE VIEW view_name AS
SELECT statement;

CREATE OR REPLACE VIEW V_EMP10 AS
SELECT EMPNO, ENAME, JOB FROM EMP WHERE DEPTNO = 10;

SELECT * FROM V_EMP10;      -- Query it like a table
DROP VIEW V_EMP10;          -- Drops only the view definition. The EMP data is untouched
```

- A view **stores only the SELECT statement**. Each time you query it, the defined SELECT runs against the base tables. That is why it is called a virtual table.
- If the data in the base tables changes, the result of querying the view changes right away.
- `CREATE OR REPLACE` changes the definition if a view with the same name already exists. A view's definition is not modified with `ALTER VIEW`.

| Advantage | Description | In the case of V_EMP10 |
|------|------|---------------|
| Independence | Even if the table structure changes, you can fix only the view definition and leave the code that uses the view as is | Even if an EMP column name changes, only the V_EMP10 definition is edited |
| Convenience | Hide a complex join or aggregation behind one view and query it briefly | `SELECT * FROM V_EMP10` without writing the condition every time |
| Security | Include only the columns and rows you want to show and hide the rest | Leave out SAL and COMM and grant permission on this view only |

- There are disadvantages too. You cannot create an index on a view, and to change its definition you have to re-create it. A view that contains joins or aggregations has restrictions on INSERT, UPDATE, and DELETE.
- A Materialized View, which actually stores the result, is a separate object. A regular view does not store data.

## The WITH Clause — Naming a Subquery

`WITH` pulls an inline view out to the front of the statement and gives it a name. This is the inline view join above rewritten with WITH.

```sql
WITH DEPT_AVG AS (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) SELECT E.ENAME, E.SAL, A.AVG_SAL FROM EMP E JOIN DEPT_AVG A ON E.DEPTNO = A.DEPTNO WHERE E.SAL > A.AVG_SAL ORDER BY E.ENAME;
```

```text
ENAME             SAL    AVG_SAL
---------- ---------- ----------
ALLEN            1600       1567
BLAKE            2850       1567
FORD             3000       2175
JONES            2975       2175
KING             5000       2917
SCOTT            3000       2175
```

- The result is the same as the inline view version. `DEPT_AVG` is a name used only within this statement. It is not stored like a view.
- When you reference the same subquery several times in one statement, you only need to define it once. This kind of named subquery is also called a CTE (Common Table Expression).

| Comparison | Inline view | WITH clause | View |
|------|---------|--------|----|
| Where it is defined | Inside the FROM clause | At the very start of the statement | A database object |
| Scope of use | Once, at that spot | Within that statement | Anywhere until dropped |
| Storage | No | No | Stores only the definition (the SELECT statement) |

> Tomorrow we cover set operators that combine or subtract the results of two SELECTs vertically.

## 📖 Glossary

- **Non-correlated subquery**: A subquery that does not reference main query columns and can therefore run on its own.
- **Correlated subquery**: A subquery that references main query columns and is re-evaluated for each outer row.
- **Scalar subquery**: A one-row, one-column subquery used in the place of a single value. If it returns no result, it is NULL.
- **Inline view**: A subquery written in the FROM clause. It is used like a temporary table within that statement.
- **View (VIEW)**: A virtual table that stores a named SELECT statement. It does not store data.
- **Independence, convenience, security**: The three advantages of a view. Absorbing structure changes, simplifying complex queries, and hiding columns and rows.
- **WITH clause**: A notation that names a subquery and defines it at the front of the statement. Also called a CTE.
- **ORA-00904**: The error when you use a column name or alias that is not visible at that spot (invalid identifier).

## 📝 Practice Questions

**Question 1.** The top salary by department is 5000 (KING) for department 10, 3000 (FORD and SCOTT) for 20, and 2850 (BLAKE) for 30. How many rows does the following SQL return?

```sql
SELECT E.ENAME FROM EMP E WHERE E.SAL = (SELECT MAX(SAL) FROM EMP S WHERE S.DEPTNO = E.DEPTNO);
```

A) 1  
B) 4  
C) 3  
D) ORA-01427 is raised  

**Answer: B**  
Explanation: The subquery is a correlated subquery that references the main query's `E.DEPTNO`. For each outer row it returns a single value, the top salary of that employee's department, so using `=` raises no error. In department 20 two people earn 3000, so the result is 4 rows: KING, FORD, SCOTT, and BLAKE. 1 would be the result of comparing against the overall top salary (KING), and 3 is the number of departments.

---

**Question 2.** DEPT has 4 departments, and departments 10, 20, and 30 each have several employees. Which is the correct result of running the following SQL in Oracle?

```sql
SELECT D.DNAME, (SELECT ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO) FROM DEPT D;
```

A) 4 rows are returned, each with the name of the first employee of the department  
B) 14 rows are returned, one per employee  
C) ORA-00913 is raised  
D) ORA-01427 is raised  

**Answer: D**  
Explanation: A scalar subquery in the SELECT clause must be one row and one column. Department 10 returns the names of 3 employees, so ORA-01427 is raised. Oracle does not pick the first row for you, and it does not expand the output into 14 rows. ORA-00913 is the error for 2 or more columns.

---

**Question 3.** DEPT 40 (OPERATIONS) has no employees. Which statement about the result of the following SQL is correct?

```sql
SELECT D.DNAME, (SELECT MAX(SAL) FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS MAX_SAL FROM DEPT D;
```

A) 4 rows are returned, and MAX_SAL for OPERATIONS is NULL  
B) 4 rows are returned, and MAX_SAL for OPERATIONS is 0  
C) The OPERATIONS row is dropped, so 3 rows are returned  
D) An error is raised because some departments have no match  

**Answer: A**  
Explanation: A scalar subquery does not reduce the outer rows. All 4 DEPT rows come back, and for department 40, `MAX` returns NULL on an empty set. It becomes 0 only with `COUNT`. Rows being dropped is the behavior of an INNER JOIN, and having no value is not an error.

---

**Question 4.** Which statement about views (VIEW) is NOT correct?

A) Even if the table structure changes, you can fix only the view definition and leave the programs that use the view as they are  
B) If you turn a complex join query into a view, you can query it with a short SELECT  
C) A view stores the query result separately, so the result is preserved even when the base tables change  
D) You can grant permission on a view that contains only the columns you want to show, hiding the other columns  

**Answer: C**  
Explanation: A regular view is a virtual table that stores only the SELECT statement definition. It runs against the base tables every time you query it, so if the table data changes, the view result changes too. A is independence, B is convenience, and D is security, all of which are advantages of views.

---

**Question 5.** Which of the following runs without an error in Oracle?

A) `SELECT DEPTNO, AVG_SAL FROM (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) WHERE AVG_SAL > 2000;`  
B) `SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL >= 36000;`  
C) `SELECT X.ENAME FROM (SELECT ENAME FROM EMP WHERE DEPTNO = 10) X WHERE X.SAL > 1000;`  
D) `SELECT DEPTNO, AVG(SAL) FROM (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO);`  

**Answer: A**  
Explanation: The alias AVG_SAL given inside the inline view becomes a column name on the outside, so it can be used in WHERE. In B, the WHERE at the same level does not know the SELECT alias, so ORA-00904 is raised. In C, the inline view X does not expose SAL, so it is ORA-00904. D also has no SAL column in the inline view, so `AVG(SAL)` raises ORA-00904.
