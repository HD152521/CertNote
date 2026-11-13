# Day 2 - HAVING and Execution Order

## 📌 Key Takeaways

- **WHERE filters rows, HAVING filters groups.** A condition on an aggregate function can only go in HAVING.
- If you use an aggregate function in WHERE, you get **ORA-00934** (group function is not allowed here).
- The logical processing order is **FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY**.
- SELECT is processed after WHERE, so **you cannot use a SELECT alias in WHERE** (ORA-00904). You can use it in ORDER BY.
- HAVING can be used without GROUP BY. In that case the whole table is a single group.

## HAVING Filters Groups

If you put a condition in WHERE to find "departments whose average salary is over 2000", the query will not even run.

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO;
```

```text
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO
                                       *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

- When WHERE is processed, there are no groups yet. A department average can only be calculated after GROUP BY is done.
- Conditions that apply after the groups are made go in HAVING.

```sql
SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL
FROM EMP
GROUP BY DEPTNO
HAVING AVG(SAL) > 2000
ORDER BY DEPTNO;
```

```text
    DEPTNO    AVG_SAL
---------- ----------
        10       2917
        20       2175
```

- Department 30 has an average of 1566.67, so it was dropped by HAVING.
- The aggregate function in a HAVING condition does not have to appear in SELECT. You can use a different aggregate from SELECT, as in `HAVING MIN(SAL) > 1000`.

```sql
SELECT DEPTNO, MAX(SAL) FROM EMP GROUP BY DEPTNO HAVING MIN(SAL) > 1000 ORDER BY DEPTNO;
```

```text
    DEPTNO   MAX(SAL)
---------- ----------
        10       5000
```

- Departments 20 (SMITH 800) and 30 (JAMES 950) were dropped because their lowest salary is 1000 or less.

## WHERE and HAVING Together

The two clauses differ in what they filter and when.

| Aspect | WHERE | HAVING |
|------|-------|--------|
| What it filters | **Rows** | **Groups** |
| When it is processed | **Before** GROUP BY | **After** GROUP BY |
| Aggregate functions | Not allowed (ORA-00934) | Allowed |
| Plain columns allowed | Every column of the table | GROUP BY columns |

When you use both in one query, WHERE trims the rows first, the groups are made from the remaining rows, and then HAVING filters the groups. Looking at the result at each step makes the difference clear.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING COUNT(*) >= 5 ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          5
        30          6
```

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP WHERE SAL >= 1500 GROUP BY DEPTNO ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        10          2
        20          3
        30          3
```

```sql
SELECT DEPTNO, COUNT(*) AS CNT
FROM EMP
WHERE SAL >= 1500
GROUP BY DEPTNO
HAVING COUNT(*) >= 3
ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          3
        30          3
```

- WHERE `SAL >= 1500`: 8 of the 14 employees remain (KING, CLARK / JONES, SCOTT, FORD / ALLEN, BLAKE, TURNER).
- GROUP BY: the remaining 8 form groups of 2 for department 10, 3 for department 20, and 3 for department 30.
- HAVING `COUNT(*) >= 3`: department 10, with 2 people, drops out.
- The `COUNT(*)` in HAVING is not the original department headcount but **the number of rows that passed WHERE**. Department 30 originally has 6 people, but here it is 3.

### Where Should the Same Condition Go?

A condition on a GROUP BY column gives the same result whether you put it in WHERE or in HAVING.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP WHERE DEPTNO <> 20 GROUP BY DEPTNO ORDER BY DEPTNO;
```

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING DEPTNO <> 20 ORDER BY DEPTNO;
```

```text
    DEPTNO   COUNT(*)
---------- ----------
        10          3
        30          6
```

- Both queries give the same result. The difference is that WHERE discards the 5 rows of department 20 before making groups, while HAVING discards after all the groups are made.
- The WHERE version, which cuts down the rows to process early, is generally more efficient.

A plain column that is not in GROUP BY cannot be used in HAVING. HAVING is the clause that looks at groups, so it cannot pick individual row values inside a group.

```sql
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING ENAME = 'KING';
```

```text
SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING ENAME = 'KING'
                                                        *
ERROR at line 1:
ORA-00979: "ENAME": must appear in the GROUP BY clause or be used in an aggregate function
```

- Move a condition on individual rows to WHERE: `WHERE ENAME = 'KING'`.

### HAVING and NULL

In HAVING too, aggregate functions skip NULL. If you look for departments whose commission total is NULL, you find the departments with no commission at all.

```sql
SELECT DEPTNO FROM EMP GROUP BY DEPTNO HAVING SUM(COMM) IS NULL ORDER BY DEPTNO;
```

```text
    DEPTNO
----------
        10
        20
```

- In departments 10 and 20 every COMM is NULL, so `SUM(COMM)` is also NULL. Department 30 has a total of 2200.

## HAVING Without GROUP BY

HAVING can be used without GROUP BY. In that case the whole table (all the rows that passed WHERE) is a single group.

```sql
SELECT COUNT(*) FROM EMP HAVING COUNT(*) > 10;
```

```text
  COUNT(*)
----------
        14
```

```sql
SELECT COUNT(*) FROM EMP HAVING COUNT(*) > 20;
```

```text
no rows selected
```

- In the first query the single group (14 rows) passes the condition, so one row comes out.
- In the second, that one and only group fails, so the result is **0 rows**. It is not "one row with a COUNT of 0"; there is no row at all.

## Logical Execution Order

SQL is not processed in the order it is written (with SELECT first). Even if Oracle changes the execution plan internally, the result must be the same as if it had been processed in the order below.

```text
  ⑤ SELECT    DEPTNO, COUNT(*) AS CNT     ← pick the columns to show and give them aliases
  ① FROM      EMP                         ← the source table
  ② WHERE     SAL >= 1500                 ← filter rows
  ③ GROUP BY  DEPTNO                      ← make groups
  ④ HAVING    COUNT(*) >= 3               ← filter groups
  ⑥ ORDER BY  CNT DESC                    ← sort
```

| Order | Clause | What is visible at this step |
|:---:|------|------|
| 1 | FROM | Every column of the table |
| 2 | WHERE | Every column of the table (no aggregate results yet) |
| 3 | GROUP BY | Groups |
| 4 | HAVING | GROUP BY columns, aggregate results |
| 5 | SELECT | Calculated expressions, **aliases are created here** |
| 6 | ORDER BY | Up to SELECT aliases and position numbers |

This one table explains most of the errors we saw today.

- WHERE (2) comes before GROUP BY (3), so it cannot use aggregate functions → ORA-00934.
- HAVING (4) comes after GROUP BY, so it can use aggregate functions.
- ORDER BY (6) comes after SELECT (5), so it can use aliases.

### Why You Cannot Use an Alias in WHERE

An alias is created in the SELECT step. WHERE, which is processed earlier, does not know that name.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

```text
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000
                                                *
ERROR at line 1:
ORA-00904: "ANNUAL": invalid identifier
```

- ORA-00904 means "there is no such column". Oracle looked for ANNUAL as a column name of EMP and could not find it.
- In WHERE, write the expression out again. In ORDER BY, the alias works.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL
FROM EMP
WHERE SAL * 12 > 30000
ORDER BY ANNUAL DESC, ENAME;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
FORD            36000
SCOTT           36000
JONES           35700
BLAKE           34200
```

- FORD and SCOTT have the same annual salary, so the second key ENAME decided their order. Without a second key, the order of the two is not guaranteed.

> ⚠️ **Note on the practice environment**: The textbook uses the execution order to explain that SELECT aliases cannot be used in GROUP BY or HAVING either. The practice container used for these notes (an Oracle Database 23ai-family release) has a newer feature that allows `GROUP BY alias` and `HAVING alias`, so those run without errors. For the exam, it is safer to judge by the traditional rule that aliases cannot be used in WHERE, GROUP BY, or HAVING.

Here is what actually happened when we ran it in the practice container.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING CNT > 3 ORDER BY DEPTNO;
```

```text
    DEPTNO        CNT
---------- ----------
        20          5
        30          6
```

- Even in the same 23ai, an alias in WHERE is still ORA-00904. The principle that WHERE comes before SELECT still holds.
- A GROUP BY position number (`GROUP BY 1`) is not allowed in the default settings. In the container it raised ORA-03162.

## Putting It All in One Query

Total the salaries by job, leave out PRESIDENT, keep only the jobs whose total is over 5000, and show them from the largest total.

```sql
SELECT JOB, SUM(SAL) AS TOTAL
FROM EMP
WHERE JOB <> 'PRESIDENT'
GROUP BY JOB
HAVING SUM(SAL) > 5000
ORDER BY TOTAL DESC;
```

```text
JOB            TOTAL
--------- ----------
MANAGER         8275
ANALYST         6000
SALESMAN        5600
```

| Step | What it does | What remains |
|------|--------|--------|
| WHERE | Exclude KING | 13 rows |
| GROUP BY | Group by job | 4 groups: CLERK, SALESMAN, MANAGER, ANALYST |
| HAVING | Total over 5000 | CLERK (4150) is out, 3 groups |
| SELECT | JOB, and the alias TOTAL for the sum | |
| ORDER BY | TOTAL descending | 8275 → 6000 → 5600 |

- The `PRESIDENT` condition is about individual rows, so it goes in WHERE; the total condition is about groups, so it goes in HAVING.
- Only ORDER BY uses the alias TOTAL. In HAVING we wrote `SUM(SAL)` again.

> Tomorrow we cover ORDER BY, which sets the order of the results, and where NULL ends up when sorting.

## 📖 Glossary

- **HAVING**: The clause that filters the groups made by GROUP BY with a condition. You can use aggregate functions in the condition.
- **ORA-00934**: The error raised when an aggregate function is used where it is not allowed (such as WHERE).
- **ORA-00904**: The error raised when a column name that does not exist is used. Using a SELECT alias in WHERE causes this error.
- **Logical execution order**: The order in which the clauses are processed to determine the result. FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.
- **Alias**: A new name given to a column or expression in SELECT. Because it is created in the SELECT step, only ORDER BY can reliably use it.
- **Row condition and group condition**: A condition that looks at individual row values goes in WHERE; a condition that looks at a group's aggregate value goes in HAVING.

## 📝 Practice Questions

**Question 1.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP WHERE AVG(SAL) > 2000 GROUP BY DEPTNO;
```

A) Departments 10 and 20 appear  
B) An ORA-00937 error occurs  
C) An ORA-00934 error occurs  
D) There are no result rows  

**Answer: C**  
Explanation: WHERE is processed before GROUP BY, so at that point there are no groups and no aggregate results. That is why using an aggregate function in WHERE gives ORA-00934 (group function is not allowed here). A group condition must be written as `HAVING AVG(SAL) > 2000`.

---

**Question 2.** Which of the following is the correct logical execution order of a SELECT statement?

A) FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY  
B) SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY  
C) FROM → GROUP BY → WHERE → HAVING → SELECT → ORDER BY  
D) FROM → WHERE → GROUP BY → SELECT → HAVING → ORDER BY  

**Answer: A**  
Explanation: First the source table is set (FROM), rows are filtered (WHERE), groups are made (GROUP BY), groups are filtered (HAVING), the columns to show are chosen (SELECT), and finally the result is sorted (ORDER BY). Because SELECT comes right before ORDER BY, aliases can be used in ORDER BY.

---

**Question 3.** How many rows does the following SQL return? (The employees with SAL of 1500 or more are 2 in department 10, 3 in department 20, and 3 in department 30.)

```sql
SELECT DEPTNO, COUNT(*) FROM EMP WHERE SAL >= 1500 GROUP BY DEPTNO HAVING COUNT(*) >= 3;
```

A) 0  
B) 1  
C) 3  
D) 2  

**Answer: D**  
Explanation: WHERE first keeps only the 8 employees with SAL of 1500 or more, and the department groups are made from them. The `COUNT(*)` in HAVING is the number of rows that passed WHERE, so it is 2 for department 10 and 3 for departments 20 and 30. Departments 20 and 30, which are 3 or more, remain, giving two rows.

---

**Question 4.** Which is the correct result of running the following SQL in Oracle?

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

A) The 5 employees with an annual salary over 30000 appear  
B) An ORA-00904 error occurs  
C) An ORA-00934 error occurs  
D) All 14 employees appear  

**Answer: B**  
Explanation: The alias ANNUAL is created in the SELECT step, but WHERE is processed before SELECT. At the WHERE step there is no column called ANNUAL, so ORA-00904 (invalid identifier) occurs. In WHERE you must write the expression itself, as in `SAL * 12 > 30000`.

---

**Question 5.** EMP has 14 rows. Which is the correct result of the following SQL?

```sql
SELECT COUNT(*) FROM EMP HAVING COUNT(*) > 20;
```

A) There are no result rows  
B) One row: 0  
C) One row: 14  
D) An error occurs because there is no GROUP BY  

**Answer: A**  
Explanation: HAVING can be used without GROUP BY, and in that case the whole table is a single group. That group's `COUNT(*)` is 14, which does not pass the condition `> 20`, so the one and only group drops out and the result is 0 rows.
