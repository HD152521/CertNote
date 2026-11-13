# Day 4 - Hierarchical Queries

## 📌 Key Takeaways

- `START WITH` sets the starting point (root) rows, and `CONNECT BY` sets the condition that links parents and children. In EMP, the root is KING, the row with `MGR IS NULL`.
- The side with `PRIOR` is the row already found. `PRIOR EMPNO = MGR` is parent → child (forward direction, top to bottom), and `PRIOR MGR = EMPNO` is child → parent (reverse direction, bottom to top).
- `LEVEL` is the depth, with the root at 1. If you indent with `LPAD(' ', 2 * (LEVEL - 1))`, the tree shape becomes visible.
- To sort siblings among themselves, use `ORDER SIBLINGS BY`. A regular ORDER BY destroys the tree order.
- A WHERE condition removes **only that row** after the whole tree is built. A CONNECT BY condition cuts off that row and **the entire branch below it**.

## A Tree Structure Inside a Single Table

The MGR column of EMP holds the manager's EMPNO. Since rows in the same table point to other rows, following them gives you an org chart.

```text
KING (7839, no MGR)
├─ BLAKE (7698) ── ALLEN · JAMES · MARTIN · TURNER · WARD
├─ CLARK (7782) ── MILLER
└─ JONES (7566) ─┬ FORD (7902) ── SMITH
                 └ SCOTT (7788) ── ADAMS
```

- The syntax that sweeps through this structure from top to bottom in a single SELECT is the hierarchical query. It is Oracle-specific syntax.
- The self join we'll see tomorrow links only one level at a time. A hierarchical query follows the links all the way down, regardless of depth.

## Basic Syntax

```text
SELECT LEVEL, columns …
FROM table
[WHERE condition to filter the result]
START WITH root condition
CONNECT BY [NOCYCLE] PRIOR parent-side column = child-side column [AND pruning condition]
[ORDER SIBLINGS BY column];
```

| Element | What it does |
|------|-------|
| `START WITH` | The rows that become roots. If several rows match the condition, there are several trees |
| `CONNECT BY` | The condition that links the row already found (PRIOR) to the next row |
| `PRIOR` | An operator meaning "of the row found just before" |
| `LEVEL` | A pseudo column: root 1, child 2, grandchild 3 … |
| `ORDER SIBLINGS BY` | Sorts only the siblings under the same parent |

- The execution order is START WITH → CONNECT BY → WHERE. Even if WHERE is written first, it is applied after the tree is built.
- If you omit `START WITH`, every row becomes its own root. `SELECT COUNT(*) FROM EMP CONNECT BY PRIOR EMPNO = MGR` returned 39 in the practice container. That is the total of the branches below each of the 14 employees.

## Forward Direction — Top to Bottom

Start at KING and go down toward the subordinates. `PRIOR EMPNO = MGR` means "the next rows are those whose MGR equals the EMPNO of the previous row".

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE, EMPNO, MGR FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE                                                                  EMPNO        MGR
---------- ---------------------------------------------------------------- ---------- ----------
         1 KING                                                                   7839
         2   BLAKE                                                                7698       7839
         3     ALLEN                                                              7499       7698
         3     JAMES                                                              7900       7698
         3     MARTIN                                                             7654       7698
         3     TURNER                                                             7844       7698
         3     WARD                                                               7521       7698
         2   CLARK                                                                7782       7839
         3     MILLER                                                             7934       7782
         2   JONES                                                                7566       7839
         3     FORD                                                               7902       7566
         4       SMITH                                                            7369       7902
         3     SCOTT                                                              7788       7566
         4       ADAMS                                                            7876       7788
```

- `LPAD(' ', 2 * (LEVEL - 1))` makes 0 spaces at LEVEL 1, 2 spaces at 2, and 4 spaces at 3. Putting it before the name makes the indentation.
- The outer `RPAD(…, 16)` was added to shrink the width of the result column. The content is the same without it. The long divider line under the TREE column is drawn by SQL*Plus to the column's maximum byte width.
- The result comes out **depth first**. Only after showing all of BLAKE's subordinates does it move on to CLARK.
- Each row's MGR equals the EMPNO of the parent row just above it. That is the link created by `PRIOR EMPNO = MGR`.

| LEVEL | Number of employees | Employees |
|------:|------:|-----|
| 1 | 1 | KING |
| 2 | 3 | BLAKE, CLARK, JONES |
| 3 | 8 | ALLEN, JAMES, MARTIN, TURNER, WARD, MILLER, FORD, SCOTT |
| 4 | 2 | SMITH, ADAMS |

- Counting with `GROUP BY LEVEL` also gives 1, 3, 8, 2. The deepest LEVEL is 4.

If you change the root, you see only what's below it. This is JONES's organization.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE FROM EMP START WITH ENAME = 'JONES' CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE
---------- ----------------------------------------------------------------
         1 JONES
         2   FORD
         3     SMITH
         2   SCOTT
         3     ADAMS
```

- LEVEL is based not on the whole table but on **the root set by START WITH**. JONES becomes 1.

## Reverse Direction — Bottom to Top

Changing the position of PRIOR flips the direction. `PRIOR MGR = EMPNO` means "the row whose EMPNO equals the MGR of the previous row", that is, the manager comes next.

```sql
SELECT LEVEL, ENAME, MGR FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO;
```

```text
     LEVEL ENAME             MGR
---------- ---------- ----------
         1 SMITH            7902
         2 FORD             7566
         3 JONES            7839
         4 KING
```

- There is only a single path going up, so the row order is uniquely determined.
- The starting point SMITH is LEVEL 1. In the reverse direction, the higher the LEVEL, the higher up the person is.

| How it's written | PRIOR side | Direction | How to read it |
|--------|---------|-----|-------|
| `PRIOR EMPNO = MGR` | The parent's EMPNO | Forward (parent → child) | Find the people who have my number as their manager |
| `MGR = PRIOR EMPNO` | Same as above | Forward | Swapping the two sides of the equals sign doesn't change the meaning |
| `PRIOR MGR = EMPNO` | The child's MGR | Reverse (child → parent) | Find my manager |
| `EMPNO = PRIOR MGR` | Same as above | Reverse | |

- What decides the direction is not the left or right of the equals sign but **which column PRIOR is attached to**. "PRIOR child column = parent column" is reverse, and "PRIOR parent column = child column" is forward.
- If the direction doesn't match START WITH, the tree doesn't grow. `START WITH MGR IS NULL CONNECT BY PRIOR MGR = EMPNO` returns only the single row KING, because KING's MGR is NULL.

> ⚠️ **Pitfall**: In `PRIOR EMPNO = MGR` and `EMPNO = PRIOR MGR`, the left side of the equals sign looks like EMPNO in both, but the directions are opposite. If the column with PRIOR is EMPNO, it is forward; if it is MGR, it is reverse.

## ORDER SIBLINGS BY

If you use a regular ORDER BY in a hierarchical query, it does sort, but the shape where children come under their parent is broken.

```sql
SELECT ENAME, LEVEL FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER BY ENAME FETCH FIRST 3 ROWS ONLY;
```

```text
ENAME           LEVEL
---------- ----------
ADAMS               4
ALLEN               3
BLAKE               2
```

- Sorted by name, ADAMS at LEVEL 4 came first. You can't tell from the screen who is whose subordinate.
- `ORDER SIBLINGS BY ENAME` preserves the tree shape and sorts **only siblings that share the same parent**. That is why, in the forward example above, BLAKE·CLARK·JONES and ALLEN·JAMES·MARTIN·TURNER·WARD are each in name order.
- Without ORDER SIBLINGS BY, the order of siblings is not guaranteed. That is why it is attached to all the tree examples in this note.

## Path, Root, and Leaf Nodes

| Name | Value it returns |
|------|----------|
| `SYS_CONNECT_BY_PATH(column, 'separator')` | A string joining the values from the root to the current row with the separator |
| `CONNECT_BY_ROOT column` | The value from the root row of the tree the current row belongs to (it is an operator, not a function, so no parentheses are needed) |
| `CONNECT_BY_ISLEAF` | 1 if there are no children, 0 if there are |

```sql
SELECT ENAME, CONNECT_BY_ROOT ENAME AS ROOT, CONNECT_BY_ISLEAF AS LEAF, SUBSTR(SYS_CONNECT_BY_PATH(ENAME, '/'), 1, 25) AS PATH FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
ENAME      ROOT             LEAF PATH
---------- ---------- ---------- ----------------------------------------------------------------------------------------------------
KING       KING                0 /KING
BLAKE      KING                0 /KING/BLAKE
ALLEN      KING                1 /KING/BLAKE/ALLEN
JAMES      KING                1 /KING/BLAKE/JAMES
MARTIN     KING                1 /KING/BLAKE/MARTIN
TURNER     KING                1 /KING/BLAKE/TURNER
WARD       KING                1 /KING/BLAKE/WARD
CLARK      KING                0 /KING/CLARK
MILLER     KING                1 /KING/CLARK/MILLER
JONES      KING                0 /KING/JONES
FORD       KING                0 /KING/JONES/FORD
SMITH      KING                1 /KING/JONES/FORD/SMITH
SCOTT      KING                0 /KING/JONES/SCOTT
ADAMS      KING                1 /KING/JONES/SCOTT/ADAMS
```

- The path **starts** with the separator. It is `/KING/JONES/SCOTT/ADAMS`, not `KING/JONES/…`.
- SUBSTR was added to shrink the column width. The path content is unchanged.
- There are 8 employees with LEAF = 1. They are the employees with no subordinates.

When there are several roots, CONNECT_BY_ROOT becomes useful. Take the three managers (MANAGER) as roots and keep only the leaf nodes.

```sql
SELECT ENAME, CONNECT_BY_ROOT ENAME AS ROOT FROM EMP WHERE CONNECT_BY_ISLEAF = 1 START WITH JOB = 'MANAGER' CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
ENAME      ROOT
---------- ----------
ALLEN      BLAKE
JAMES      BLAKE
MARTIN     BLAKE
TURNER     BLAKE
WARD       BLAKE
MILLER     CLARK
SMITH      JONES
ADAMS      JONES
```

- The order of the roots of the three trees is also decided by ORDER SIBLINGS BY. Roots are treated as siblings of each other too.

## WHERE vs CONNECT BY — The Position of the Condition Changes the Result

We'll compare putting the condition that removes JONES in two places. First, put it in WHERE.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE FROM EMP WHERE ENAME <> 'JONES' START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE
---------- ----------------------------------------------------------------
         1 KING
         2   BLAKE
         3     ALLEN
         3     JAMES
         3     MARTIN
         3     TURNER
         3     WARD
         2   CLARK
         3     MILLER
         3     FORD
         4       SMITH
         3     SCOTT
         4       ADAMS
```

This time, attach it to CONNECT BY with AND.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR AND ENAME <> 'JONES' ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE
---------- ----------------------------------------------------------------
         1 KING
         2   BLAKE
         3     ALLEN
         3     JAMES
         3     MARTIN
         3     TURNER
         3     WARD
         2   CLARK
         3     MILLER
```

| Condition position | When it is processed | JONES's subordinates FORD·SCOTT·SMITH·ADAMS | Result rows |
|---------|---------|------------------------------|--------:|
| WHERE | After the whole tree is built | They remain (LEVEL stays 3, 4) | 13 |
| CONNECT BY | While the tree is being built | The path down through JONES is cut, so they drop out too | 9 |

- WHERE is **result filtering**. Only the single JONES row disappears from the screen, and the LEVEL of his subordinates doesn't change.
- A CONNECT BY condition is **pruning**. Since the link to JONES is not made, the entire branch below it disappears.
- It's the same when limiting depth, like `LEVEL <= 2`. Put it in WHERE and it filters after building all the way down; put it in CONNECT BY and it doesn't descend to level 3. The result is the same 4 rows either way: KING·BLAKE·CLARK·JONES.
- The START WITH condition is used only to pick the roots. It is not applied to child rows.

## Cycles — NOCYCLE · CONNECT_BY_ISCYCLE

EMP doesn't have this, but if we suppose KING's MGR held SMITH's number, it would loop forever: SMITH → FORD → JONES → KING → SMITH …

- When it meets such a cycle, Oracle raises the error ORA-01436 (CONNECT BY loop in user data).
- If you use NOCYCLE, as in `CONNECT BY NOCYCLE PRIOR EMPNO = MGR`, it cuts the link that goes back to a row already passed and produces a result.
- `CONNECT_BY_ISCYCLE` is a pseudo column used together with NOCYCLE. It is 1 if a child of the current row is also an ancestor, and 0 otherwise.

> Tomorrow we cover the self join, which joins the same EMP with two aliases to put an employee and the manager on one row.

## 📖 Glossary

- **Hierarchical query**: Oracle syntax that follows parent-child relationships within one table, with `START WITH … CONNECT BY`, to pick rows.
- **Root node**: The starting point of the tree. It is a row matching the START WITH condition and has LEVEL 1.
- **Leaf node**: A row with no children. Its CONNECT_BY_ISLEAF is 1.
- **PRIOR**: In CONNECT BY, an operator pointing to the column "of the row found just before". Where it is attached decides the direction.
- **Forward / reverse direction**: Expansion going down from parent to child / expansion going up from child to parent.
- **LEVEL**: A pseudo column that gives the depth value in a hierarchical query, with the root as 1.
- **ORDER SIBLINGS BY**: A clause that keeps the tree shape and sorts only siblings of the same parent.
- **Pruning**: Removing a particular row and the branch below it from the tree through a CONNECT BY condition. It differs from the result filtering of WHERE.

## 📝 Practice Questions

**Question 1.** In `SELECT LEVEL, ENAME FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO;`, which employee has LEVEL 3? (SMITH's manager is FORD, FORD's manager is JONES, and JONES's manager is KING.)

A) JONES  
B) FORD  
C) KING  
D) SCOTT  

**Answer: A**  
Explanation: `PRIOR MGR = EMPNO` is a reverse expansion that finds the previous row's manager. SMITH is 1, FORD is 2, JONES is 3, and KING is 4. FORD is LEVEL 2 and KING is LEVEL 4. SCOTT is not on SMITH's manager line, so he doesn't appear in the result.

---

**Question 2.** How many rows does `SELECT ENAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR AND ENAME <> 'JONES';` return? (Below JONES are 4 people: FORD, SCOTT, SMITH, ADAMS, and EMP has 14 employees.)

A) 13  
B) 14  
C) 9  
D) 5  

**Answer: C**  
Explanation: A CONNECT BY condition is pruning, so JONES and the 4 people below him drop out together. 14 − 5 = 9 rows. 13 is the result when the same condition is put in WHERE and only the single JONES row is removed. 14 is the case with no condition, and 5 is the number of removed rows.

---

**Question 3.** What is the result of `SELECT COUNT(*) FROM EMP WHERE CONNECT_BY_ISLEAF = 1 START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR;`? (The employees with subordinates are the 6: KING, BLAKE, CLARK, JONES, FORD, SCOTT.)

A) 6  
B) 8  
C) 4  
D) 1  

**Answer: B**  
Explanation: CONNECT_BY_ISLEAF is 1 on rows with no children. Subtracting the 6 employees with subordinates from the 14 leaves 8. 6 is the number of rows that have children (LEAF = 0). 4 is the maximum LEVEL, and 1 is the single root, KING.

---

**Question 4.** Which statement about `ORDER SIBLINGS BY ENAME` in a hierarchical query is correct?

A) It sorts the entire result by ENAME regardless of the hierarchy  
B) It sorts only the root rows among themselves and leaves the rest of the order as is  
C) It sorts by LEVEL first and then by ENAME  
D) It keeps the parent-child order and sorts siblings with the same parent by ENAME  

**Answer: D**  
Explanation: ORDER SIBLINGS BY keeps the tree shape and decides only the order among siblings. A is the behavior of a regular ORDER BY, which breaks the tree shape. Roots are also treated as siblings, but it does not sort only the roots, so B is wrong. C is the behavior of `ORDER BY LEVEL, ENAME`.

---

**Question 5.** When expanding with `START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR`, what is the `SYS_CONNECT_BY_PATH(ENAME, '/')` value on ADAMS's row? (ADAMS's manager is SCOTT, SCOTT's manager is JONES, and JONES's manager is KING.)

A) /ADAMS/SCOTT/JONES/KING  
B) /KING/SCOTT/ADAMS  
C) /KING/JONES/SCOTT/ADAMS  
D) KING/JONES/SCOTT/ADAMS  

**Answer: C**  
Explanation: SYS_CONNECT_BY_PATH joins the values from the root to the current row with the separator, putting the separator before each value, so it starts with `/`. A is in reverse order, so it isn't a path from a forward expansion. B is missing JONES in the middle. D lacks the leading separator.
