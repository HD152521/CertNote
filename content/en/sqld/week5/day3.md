# Day 3 - Set Operators

## 📌 Key Points

- **UNION** is a union (duplicates removed), and **UNION ALL** concatenates the results as they are, duplicates included. **INTERSECT** is an intersection, and **MINUS** is a difference. SQL Server uses **EXCEPT** instead of MINUS.
- The SELECTs above and below must match in **number of columns** (ORA-01789) and **data type family** (ORA-01790).
- The result's column names follow the **first SELECT**. ORDER BY is written **only once, at the very end**, and refers to the first SELECT's column names or aliases, or to a position number.
- UNION, INTERSECT, and MINUS sort or hash-compare to remove duplicates. UNION ALL has no such step, so it is faster.
- Set operators all have the same precedence, so they are evaluated **from top to bottom** in order. Use parentheses to change the order.

## Stacking Two Results Vertically

If a join attaches two tables **side by side**, a set operator combines two SELECT results **vertically**. It combines, subtracts, or picks the overlap, row by row. Today we compare using the jobs in department 10 and department 20.

| Department | Jobs (number of employees) |
|------|-------------|
| 10 | CLERK(1), MANAGER(1), PRESIDENT(1) — 3 rows |
| 20 | ANALYST(2), CLERK(2), MANAGER(1) — 5 rows |
| 30 | CLERK(1), MANAGER(1), SALESMAN(4) — 6 rows |

| Operator | Meaning | Duplicates | Jobs of dept 10 ○ dept 20 |
|--------|----|------|---------------|
| `UNION` | Union | Removed | ANALYST, CLERK, MANAGER, PRESIDENT |
| `UNION ALL` | Union | Kept | 3 + 5 = 8 rows |
| `INTERSECT` | Intersection | Removed | CLERK, MANAGER |
| `MINUS` | Difference | Removed | 10 − 20 = PRESIDENT |

## UNION and UNION ALL

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
ANALYST
CLERK
CLERK
CLERK
MANAGER
MANAGER
PRESIDENT
```

- UNION combines the two results and then keeps only one of each identical row. That gives 4 rows.
- UNION ALL simply concatenates the 3 rows of department 10 and the 5 rows of department 20, giving 8 rows. Duplicates inside one SELECT (the 2 ANALYST rows in department 20) are kept too.
- UNION also removes duplicate rows within a single SELECT. Even if you UNION only department 20, ANALYST appears just once.

### NULLs Are Treated as Equal When Judging Duplicates

In a WHERE `=`, NULL and NULL are not equal. Duplicate detection in set operators is different: it treats two NULLs as the same row.

```sql
SELECT COUNT(*) FROM (SELECT COMM FROM EMP UNION SELECT COMM FROM EMP);
```

```text
  COUNT(*)
----------
         5
```

- The values of COMM are 300, 500, 1400, 0, and 10 NULLs. After UNION, the four values and a single NULL remain, giving 5 rows.
- DISTINCT also collapses NULLs into one in the same way.

### Why UNION ALL Is Faster

| Operator | Extra work |
|--------|---------|
| `UNION ALL` | None. It just concatenates the results |
| `UNION`, `INTERSECT`, `MINUS` | Sort or hash-compare the entire result to find duplicates |

- The larger the result, the higher the cost of sorting and comparing. If you know the two sets do not overlap (for example, the department conditions are mutually exclusive), UNION ALL gives the same result more cheaply.
- Older Oracle versions removed duplicates by sorting, so a UNION result sometimes looked sorted. This is not guaranteed behavior. If you need an order, use ORDER BY.

UNION ALL is also used to attach a total row beneath the detail rows. The constant `'Total'` goes into the ENAME position.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT 'Total', SUM(SAL) FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME             SAL
---------- ----------
CLARK            2450
KING             5000
MILLER           1300
Total            8750
```

- This result has no ORDER BY, so the order is not guaranteed. In the practice container it came out in the order above. Having SQL do this job of attaching subtotal and total rows for you is Day 4's ROLLUP.

## INTERSECT and MINUS

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 INTERSECT SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
CLERK
MANAGER
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
PRESIDENT
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 10 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
```

- INTERSECT keeps only the jobs that appear on both sides. Swapping the order gives the same result.
- MINUS **subtracts what is in the second result from the first result**. Swapping the order changes the result. 10 − 20 is PRESIDENT, and 20 − 10 is ANALYST.

Use MINUS to find "departments with no employees". It solves the same question as yesterday's `NOT EXISTS` using sets.

```sql
SELECT DEPTNO FROM DEPT MINUS SELECT DEPTNO FROM EMP;
```

```text
    DEPTNO
----------
        40
```

| DBMS | Difference keyword |
|------|------------|
| Oracle | `MINUS` |
| SQL Server | `EXCEPT` |

- SQLD distinguishes them: MINUS for Oracle and EXCEPT for SQL Server. The practice container used in this note (Oracle Database 23ai) also accepts `EXCEPT`, which arrived in 21c, and gives the same result as MINUS. On the exam, treat the Oracle difference as MINUS.

## Match the Number of Columns and the Data Types

To combine results vertically, the columns at the same position must pair up.

```sql
SELECT ENAME, SAL FROM EMP UNION SELECT DNAME FROM DEPT;
```

```text
SELECT ENAME, SAL FROM EMP UNION SELECT DNAME FROM DEPT
*
ERROR at line 1:
ORA-01789: query block has incorrect number of result columns
```

```sql
SELECT ENAME FROM EMP UNION SELECT DEPTNO FROM DEPT;
```

```text
SELECT ENAME FROM EMP UNION SELECT DEPTNO FROM DEPT
       *
ERROR at line 1:
ORA-01790: expression must have same datatype as corresponding expression
```

| Error | Cause |
|------|------|
| ORA-01789 | The SELECTs above and below have different numbers of columns |
| ORA-01790 | Columns at the same position have different data type families (character ↔ number) |

- Column names may differ. ENAME and DNAME are both character types, so they combine vertically.
- The side with fewer columns fills the gap with `NULL` or a constant. Write it like `SELECT DEPTNO, NULL FROM DEPT`.

## The First SELECT Decides the Result Column Names

```sql
SELECT EMPNO AS ID, ENAME AS NAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DEPTNO, DNAME FROM DEPT ORDER BY ID;
```

```text
        ID NAME
---------- --------------
        10 ACCOUNTING
        20 RESEARCH
        30 SALES
        40 OPERATIONS
      7782 CLARK
      7839 KING
      7934 MILLER
```

- The column headings are the first SELECT's aliases ID and NAME. The second SELECT's DEPTNO and DNAME are not used.
- The NAME column widened to 14 to fit DNAME (14 characters). The name follows the first SELECT, while the data type length is set so that it can hold both sides.

ORDER BY can also refer only to the first SELECT's names. Using the second SELECT's alias or column name is an error.

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY DNAME;
```

```text
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY DNAME
                                                                                                *
ERROR at line 1:
ORA-00904: "DNAME": invalid identifier
```

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME
--------------
ACCOUNTING
CLARK
KING
MILLER
```

- A position number works too. `ORDER BY 2` sorts by the second column.

### ORDER BY Goes Once, at the Very End

ORDER BY sorts the **final result** after the set operation is complete. Writing it after an intermediate SELECT is a syntax error.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 ORDER BY JOB UNION SELECT JOB FROM EMP WHERE DEPTNO = 20;
```

```text
SELECT JOB FROM EMP WHERE DEPTNO = 10 ORDER BY JOB UNION SELECT JOB FROM EMP WHERE DEPTNO = 20
                                                   *
ERROR at line 1:
ORA-03048: SQL reserved word 'UNION' is not syntactically valid following '...DEPTNO = 10 ORDER BY JOB '
```

- The practice container (23ai) tells you which word is the problem with ORA-03048. Earlier Oracle versions raise ORA-00933 (SQL command not properly ended) for the same statement. Either way, it is an error.

> ⚠️ **Pitfall**: In a set-operation statement, write ORDER BY only once, after the last SELECT. The sort key is a column name or alias of the **first SELECT**, or a position number. A name that exists only in the last SELECT cannot be used.

## Mixing Several Set Operators

Oracle's set operators have the same precedence. They are evaluated from top to bottom in order. The jobs in department 30 are CLERK, MANAGER, and SALESMAN.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 30 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
PRESIDENT
```

- It first builds (dept 10 ∪ dept 20) = {ANALYST, CLERK, MANAGER, PRESIDENT}, then subtracts the jobs of department 30.

If you use parentheses to make MINUS run first, the result changes.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION (SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 30) ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
```

- It first computes dept 20 − dept 30 = {ANALYST}, then combines it with the jobs of department 10, {CLERK, MANAGER, PRESIDENT}.
- Standard SQL evaluates INTERSECT before UNION and EXCEPT. Oracle's official documentation says it may follow this in the future, and recommends making the order explicit with parentheses.

> Tomorrow we cover ROLLUP and CUBE, which add subtotal and grand-total rows to GROUP BY.

## 📖 Glossary

- **Set operator**: An operator that combines, subtracts, or picks the overlap of two SELECT results, row by row.
- **UNION / UNION ALL**: Union. UNION removes duplicates, and UNION ALL leaves them as they are.
- **INTERSECT**: An intersection that keeps only the rows present in both results.
- **MINUS / EXCEPT**: A difference that removes from the first result the rows present in the second result. Oracle uses MINUS, and SQL Server uses EXCEPT.
- **ORA-01789**: The error when the SELECTs above and below a set operation have different numbers of columns.
- **ORA-01790**: The error when the data types of columns at the same position do not match.
- **Duplicate-removal cost**: The sort or hash work that UNION, INTERSECT, and MINUS do to find identical rows. UNION ALL has none.

## 📝 Practice Questions

**Question 1.** Department 10 of EMP has 3 employees and department 20 has 5, and the jobs found in both departments are CLERK and MANAGER. What is the result of the following SQL?

```sql
SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20);
```

A) 8  
B) 4  
C) 2  
D) 6  

**Answer: A**  
Explanation: UNION ALL does not remove duplicates and simply concatenates the two results. 3 + 5 = 8 rows. 4 is the result of UNION, which removes duplicates, and 2 is the result of INTERSECT, which keeps only the common jobs.

---

**Question 2.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY DNAME;
```

A) 4 rows sorted by DNAME are returned  
B) 4 rows with the column heading DNAME are returned  
C) ORA-00904 is raised  
D) ORA-01790 is raised  

**Answer: C**  
Explanation: The column name of a set-operation result follows the first SELECT, so it is ENAME. ORDER BY can refer only to that name, so DNAME gives ORA-00904 (invalid identifier). The column heading is also ENAME, not DNAME. ENAME and DNAME are both character types, so ORA-01790 is not raised.

---

**Question 3.** DEPT has departments 10, 20, 30, and 40, and EMP has employees only in departments 10, 20, and 30. You want only department number 40, the department with no employees. Which operator goes in the blank?

```sql
SELECT DEPTNO FROM DEPT ( blank ) SELECT DEPTNO FROM EMP;
```

A) UNION  
B) MINUS  
C) INTERSECT  
D) UNION ALL  

**Answer: B**  
Explanation: MINUS subtracts the rows in the second result from the first result. Subtracting EMP's {10, 20, 30} from DEPT's {10, 20, 30, 40} leaves 40. UNION returns 10, 20, 30, and 40, and INTERSECT returns 10, 20, and 30. UNION ALL concatenates the 4 DEPT rows and the 14 EMP rows, giving 18 rows.

---

**Question 4.** Which statement about set operators is NOT correct?

A) The SELECTs above and below must have the same number of columns  
B) The result's column names follow the first SELECT's column names or aliases  
C) ORDER BY can be written only once, after the last SELECT  
D) UNION ALL is slower than UNION because it sorts to check for duplicates  

**Answer: D**  
Explanation: It is UNION that sorts or hash-compares to remove duplicates. UNION ALL only concatenates the results, so it has no such cost and is faster. If the number of columns differs, ORA-01789 is raised; the result column names are based on the first SELECT; and ORDER BY is written once at the very end.

---

**Question 5.** The jobs in department 10 are CLERK, MANAGER, and PRESIDENT; in department 20, ANALYST, CLERK, and MANAGER; and in department 30, CLERK, MANAGER, and SALESMAN. What is the result of the following SQL?

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 30 ORDER BY JOB;
```

A) ANALYST, CLERK, MANAGER, PRESIDENT  
B) ANALYST, PRESIDENT  
C) PRESIDENT  
D) ANALYST  

**Answer: B**  
Explanation: Oracle's set operators have the same precedence and are evaluated from top to bottom. Subtracting department 30's jobs {CLERK, MANAGER, SALESMAN} from dept 10 ∪ dept 20 = {ANALYST, CLERK, MANAGER, PRESIDENT} leaves ANALYST and PRESIDENT. A is the result when MINUS is evaluated first using parentheses. C and D are the results of subtracting between only two departments.
