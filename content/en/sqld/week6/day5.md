# Day 5 - Self Join

## 📌 Key Takeaways

- A self join puts one table in FROM under **two aliases** and joins them. Without aliases, the column names collide and you get ORA-00918.
- In EMP, the employee-manager link is `E.MGR = M.EMPNO`. E is EMP in the employee role, and M is the same EMP in the manager role.
- With an inner join, KING, whose MGR is NULL, drops out, leaving 13 rows. To keep KING, use an outer join based on the employee side (`M.EMPNO(+)` or `E LEFT OUTER JOIN M`).
- A manager's manager uses the same EMP three times. Each time you add a level, one more alias and one more join condition are added.
- A hierarchical query follows the links all the way down regardless of depth, while a self join links only as many levels as you write.

## Why Read the Same Table Twice

We want to put the manager's name next to each employee's name. The manager is also a row in EMP, so the information is already in the same table. The problem is that within a single row, you can't see your own manager's name. So we write EMP in FROM twice, as if there were two of them.

```text
EMP E (employee role)                EMP M (manager role)
EMPNO  ENAME  MGR                   EMPNO  ENAME
7369   SMITH  7902  ── E.MGR = M.EMPNO ──▶ 7902   FORD
7902   FORD   7566  ─────────────────────▶ 7566   JONES
7839   KING   NULL  ── no match (dropped in an inner join)
```

- Physically, it is a single table. Each alias just takes a different **role**.
- The direction of the join condition decides the role. With `E.MGR = M.EMPNO`, M is E's manager.

## Employees and Managers

We write it using Oracle join syntax.

```sql
SELECT E.EMPNO, E.ENAME, E.MGR, M.ENAME AS MGR_NAME FROM EMP E, EMP M WHERE E.MGR = M.EMPNO ORDER BY E.EMPNO;
```

```text
     EMPNO ENAME             MGR MGR_NAME
---------- ---------- ---------- ----------
      7369 SMITH            7902 FORD
      7499 ALLEN            7698 BLAKE
      7521 WARD             7698 BLAKE
      7566 JONES            7839 KING
      7654 MARTIN           7698 BLAKE
      7698 BLAKE            7839 KING
      7782 CLARK            7839 KING
      7788 SCOTT            7566 JONES
      7844 TURNER           7698 BLAKE
      7876 ADAMS            7788 SCOTT
      7900 JAMES            7698 BLAKE
      7902 FORD             7566 JONES
      7934 MILLER           7782 CLARK
```

- That is 13 rows. KING dropped out because his MGR is NULL, so `NULL = M.EMPNO` is never true.
- If you write only `FROM EMP E, EMP M` with no join condition, you get a Cartesian product of 14 × 14 = 196 rows.
- In ANSI syntax, it is `FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO`. The result is the same.

### Changing the Condition Direction Changes the Roles

If you write `M.MGR = E.EMPNO`, this time M is E's subordinate. This finds JONES's subordinates.

```sql
SELECT E.ENAME, M.ENAME AS SUB_NAME FROM EMP E JOIN EMP M ON M.MGR = E.EMPNO WHERE E.ENAME = 'JONES' ORDER BY M.ENAME;
```

```text
ENAME      SUB_NAME
---------- ----------
JONES      FORD
JONES      SCOTT
```

- The alias names E and M have no meaning in themselves. What defines the relationship is which side's MGR is matched to which side's EMPNO.

### Without Aliases

```sql
SELECT ENAME FROM EMP, EMP WHERE MGR = EMPNO;
```

```text
SELECT ENAME FROM EMP, EMP WHERE MGR = EMPNO
                                       *
ERROR at line 1:
ORA-00918: EMPNO: column ambiguously specified - appears in EMP and EMP
```

- Both EMPs have the same column names, so there is no way to tell which one's EMPNO is meant.
- The older-version message printed in textbooks is `ORA-00918: column ambiguously defined`. The practice container (23ai) changed to a message that tells you both the column name and the table. The error number is the same.
- Using an alias you haven't defined gives ORA-00904. If you have only `FROM EMP E` and use `M.EMPNO`, you get `"M"."EMPNO": invalid identifier`.

## A Manager's Manager — Three Levels

Employee → manager → manager's manager uses EMP three times. Alias T is the third role.

```sql
SELECT E.ENAME, M.ENAME AS MGR_NAME, T.ENAME AS TOP_NAME FROM EMP E, EMP M, EMP T WHERE E.MGR = M.EMPNO AND M.MGR = T.EMPNO ORDER BY E.EMPNO;
```

```text
ENAME      MGR_NAME   TOP_NAME
---------- ---------- ----------
SMITH      FORD       JONES
ALLEN      BLAKE      KING
WARD       BLAKE      KING
MARTIN     BLAKE      KING
SCOTT      JONES      KING
TURNER     BLAKE      KING
ADAMS      SCOTT      JONES
JAMES      BLAKE      KING
FORD       JONES      KING
MILLER     CLARK      KING
```

- That is 10 rows. Only those who have a manager's manager remain.
- The 4 who dropped out are KING (no manager) and BLAKE, CLARK, JONES (their manager is KING, and KING has no manager).
- The second condition `M.MGR = T.EMPNO` finds **M**'s manager. If you write `E.MGR = T.EMPNO`, T ends up being the same person as M.

| Level | Number of EMPs in FROM | Number of join conditions | Inner join result |
|------|------------:|---------:|------------:|
| Employee – manager | 2 | 1 | 13 |
| Employee – manager – manager's manager | 3 | 2 | 10 |

- To link n tables, you need at least n − 1 join conditions. The W4 join rule applies to self joins unchanged.

## Self Outer Join — Keeping KING

To show all 14 employees and leave the manager blank when there is none, outer join with the employee side (E) as the base. The `(+)` goes on **the side that may be missing**, that is, the manager M side.

```sql
SELECT E.ENAME, M.ENAME AS MGR_NAME FROM EMP E, EMP M WHERE E.MGR = M.EMPNO(+) ORDER BY E.EMPNO;
```

```text
ENAME      MGR_NAME
---------- ----------
SMITH      FORD
ALLEN      BLAKE
WARD       BLAKE
JONES      KING
MARTIN     BLAKE
BLAKE      KING
CLARK      KING
SCOTT      JONES
KING
TURNER     BLAKE
ADAMS      SCOTT
JAMES      BLAKE
FORD       JONES
MILLER     CLARK
```

- That is 14 rows. KING's MGR_NAME is NULL.
- In ANSI syntax, it is `FROM EMP E LEFT OUTER JOIN EMP M ON E.MGR = M.EMPNO`. The same 14 rows came out in the practice container.

If you switch the three-level version to outer joins too, all 14 employees remain.

```sql
SELECT E.ENAME, M.ENAME AS MGR_NAME, T.ENAME AS TOP_NAME FROM EMP E LEFT OUTER JOIN EMP M ON E.MGR = M.EMPNO LEFT OUTER JOIN EMP T ON M.MGR = T.EMPNO ORDER BY E.EMPNO;
```

```text
ENAME      MGR_NAME   TOP_NAME
---------- ---------- ----------
SMITH      FORD       JONES
ALLEN      BLAKE      KING
WARD       BLAKE      KING
JONES      KING
MARTIN     BLAKE      KING
BLAKE      KING
CLARK      KING
SCOTT      JONES      KING
KING
TURNER     BLAKE      KING
ADAMS      SCOTT      JONES
JAMES      BLAKE      KING
FORD       JONES      KING
MILLER     CLARK      KING
```

- The second join must also be LEFT. If you leave only the first as LEFT and use an inner join for the second, KING (whose M is NULL) and BLAKE, CLARK, JONES (who have no T) drop out again.

### If You Put (+) on the Opposite Side

`E.MGR(+) = M.EMPNO` keeps all 14 on the manager side (M). Employees with no subordinates also show up in the M position.

| How it's written | Base (the side that is fully kept) | Result rows | Meaning |
|--------|---------------|--------:|----|
| `E.MGR = M.EMPNO` | None | 13 | Employees who have a manager |
| `E.MGR = M.EMPNO(+)` | E (employee) | 14 | All employees + manager (NULL if none) |
| `E.MGR(+) = M.EMPNO` | M (manager role) | 21 | Puts every employee in the manager position and attaches subordinates |

- 21 is the 13 subordinate rows of the 6 employees who have subordinates, plus one row each for the 8 who have none.
- To pick only the 8 with no subordinates, apply `E.EMPNO IS NULL` to this outer join. ADAMS, ALLEN, JAMES, MARTIN, MILLER, SMITH, TURNER, and WARD come out. They are the same 8 as `CONNECT_BY_ISLEAF = 1` in Day 4.

> ⚠️ **Pitfall**: `(+)` goes not on the base table but on **the side that gets filled with NULL**. "Keep KING" means employee E is the base, so you put `(+)` on the column of the opposite side, M, giving `E.MGR = M.EMPNO(+)`.

## Comparing with the Manager

Since a self join puts the employee and manager side by side in one row, you can compare their values directly. These are employees who earn more than their manager.

```sql
SELECT E.ENAME, E.SAL, M.ENAME AS MGR_NAME, M.SAL AS MGR_SAL FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO WHERE E.SAL > M.SAL ORDER BY E.ENAME;
```

```text
ENAME             SAL MGR_NAME      MGR_SAL
---------- ---------- ---------- ----------
FORD             3000 JONES            2975
SCOTT            3000 JONES            2975
```

Grouping by the manager gives the number of subordinates per manager.

```sql
SELECT M.ENAME, COUNT(*) AS CNT FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO GROUP BY M.ENAME ORDER BY CNT DESC, M.ENAME;
```

```text
ENAME             CNT
---------- ----------
BLAKE               5
KING                3
JONES               2
CLARK               1
FORD                1
SCOTT               1
```

- It counts only direct subordinates. The total headcount under KING (13 people) can't be obtained with a single self join. That job belongs to hierarchical queries.

## Hierarchical Queries and Self Joins

In a hierarchical query too, using `PRIOR ENAME` in SELECT lets you attach the parent's name beside each row. The result is the same 14 pairs as the self outer join, with LEVEL added.

```sql
SELECT LEVEL, ENAME, PRIOR ENAME AS MGR_NAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL ENAME      MGR_NAME
---------- ---------- ----------
         1 KING
         2 BLAKE      KING
         3 ALLEN      BLAKE
         3 JAMES      BLAKE
         3 MARTIN     BLAKE
         3 TURNER     BLAKE
         3 WARD       BLAKE
         2 CLARK      KING
         3 MILLER     CLARK
         2 JONES      KING
         3 FORD       JONES
         4 SMITH      FORD
         3 SCOTT      JONES
         4 ADAMS      SCOTT
```

| Aspect | Self join | Hierarchical query |
|------|--------|----------|
| Syntax | Two or more aliases on the same table + join conditions | START WITH + CONNECT BY PRIOR |
| Standard? | Can also be written with ANSI joins | Oracle-specific (SQL Server uses a recursive CTE) |
| Depth followed | Fixed to the number of aliases (2 for two levels, 3 for three levels) | All the way down, one statement even if depths differ |
| What one row shows | Values from several levels **side by side** | Rows grow **downward**, one level at a time |
| Depth information | You have to count it yourself | Directly via LEVEL, SYS_CONNECT_BY_PATH |
| Questions it suits | "Compare employee and manager salaries" | "The whole org chart under KING" |

- Both use the same MGR → EMPNO relationship of EMP. When you want values from a fixed number of levels in one row, a self join fits; when you want to unfold a tree of unknown depth, a hierarchical query fits.

> Next week begins with PIVOT and UNPIVOT, which swap rows and columns.

## 📖 Glossary

- **Self join**: Putting the same table in FROM under two or more aliases and joining it with itself.
- **Table alias**: A short name given to a table in the FROM clause. In a self join, it is essential for separating the roles of the same table.
- **Role**: The meaning an alias takes in a self join. Even for the same EMP, E is the employee role and M is the manager role.
- **Self outer join**: Using a self join as an outer join so that rows with no match (KING, who has no manager) are kept too.
- **ORA-00918**: The error raised when several tables have a column with the same name and you didn't say which one you mean.
- **Cartesian product**: The result of pairing every row of two tables with no join condition. For EMP with itself, it is 14 × 14 = 196 rows.

## 📝 Practice Questions

**Question 1.** Of the 14 employees in EMP, KING is the only one whose MGR is NULL. What is the result of `SELECT COUNT(*) FROM EMP E, EMP M WHERE E.MGR = M.EMPNO;`?

A) 14  
B) 13  
C) 12  
D) 196  

**Answer: B**  
Explanation: It is an inner self join, so KING, whose manager row can't be found, drops out. The other 13 each have one manager, so it is 13 rows. 14 is the result of an outer join based on the employee side. 196 is the Cartesian product with no join condition.

---

**Question 2.** Which Oracle condition shows employee names and manager names while keeping KING, who has no manager, in the result as an employee? (`FROM EMP E, EMP M`, E is the employee and M is the manager role.)

A) `WHERE E.MGR = M.EMPNO`  
B) `WHERE E.MGR(+) = M.EMPNO`  
C) `WHERE E.MGR = M.EMPNO AND E.MGR IS NULL`  
D) `WHERE E.MGR = M.EMPNO(+)`  

**Answer: D**  
Explanation: The base is employee E, and the side that may have no match is manager M, so `(+)` goes on the M side. A is an inner join, so KING drops out. B is the opposite direction: it keeps based on the manager role M, saving the employees with no subordinates. C returns 0 rows because `NULL = M.EMPNO` can never be true.

---

**Question 3.** How many rows does the following SQL return? (The employee with no manager is KING, and the employees whose manager is KING are BLAKE, CLARK, and JONES.)
`SELECT E.ENAME, T.ENAME FROM EMP E, EMP M, EMP T WHERE E.MGR = M.EMPNO AND M.MGR = T.EMPNO;`

A) 10  
B) 13  
C) 14  
D) 8  

**Answer: A**  
Explanation: Only those who have a manager's manager remain. KING has no manager, and BLAKE, CLARK, and JONES drop out because their manager, KING, has no manager. 14 − 4 = 10 rows. 13 is the result of the two-level inner join, and 14 is what you get when everyone is kept with outer joins. 8 is the number of employees with no subordinates.

---

**Question 4.** What is the result of running `SELECT ENAME FROM EMP, EMP WHERE MGR = EMPNO;` in Oracle?

A) 13 rows are returned  
B) 0 rows are returned  
C) An ORA-00918 error occurs  
D) An ORA-00904 error occurs  

**Answer: C**  
Explanation: The same EMP is used twice without aliases, so it is impossible to tell which one a column name refers to. That raises ORA-00918, meaning the column is ambiguous. You have to attach aliases and write `E.MGR = M.EMPNO` to get 13 rows. ORA-00904 is the error for using a nonexistent column or an undefined alias.

---

**Question 5.** What is the result of the following SQL? (SMITH's manager is FORD, FORD's manager is JONES, and JONES's manager is KING.)
`SELECT T.ENAME FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO JOIN EMP T ON M.MGR = T.EMPNO WHERE E.ENAME = 'SMITH';`

A) JONES  
B) FORD  
C) KING  
D) No result  

**Answer: A**  
Explanation: If E is SMITH, M is SMITH's manager FORD, and T is FORD's manager JONES. FORD is M's value. KING is JONES's manager, one level further up, so one more alias would be needed. Both joins have matches, so the result is not empty.
