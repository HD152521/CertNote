# Day 1 - Relational Databases and SELECT

## 📌 Key Takeaways

- A relational DB stores data in **tables (rows × columns)** and links tables with primary keys (PK) and foreign keys (FK).
- SQL is divided into DML, DDL, DCL, and TCL. `SELECT` is usually classified as DML, though it is sometimes called DQL separately.
- `AS` can be omitted in an alias, and to preserve spaces, case, or special characters you wrap the alias in **double quotes**.
- `DISTINCT` removes duplicates across the **whole combination** of the SELECT list. NULL also counts as a single value and is kept just once.
- **Arithmetic with NULL gives NULL.** But Oracle's concatenation operator `||` skips NULL as if it were an empty string.

## The Skeleton of a Relational Database

The model you drew with entities, attributes, and relationships in Subject 1 becomes tables, columns, and keys in a real DB.

| Modeling term | DB term | Other names | Example (EMP table) |
|------|------|------|------|
| Entity | **Table** | Relation | All employees |
| Instance | **Row** | Tuple, record | One employee (SMITH) |
| Attribute | **Column** | Field | Name (ENAME), salary (SAL) |
| Primary identifier | **Primary key (PK)** | Primary Key | Employee number (EMPNO) |
| Relationship | **Foreign key (FK)** | Foreign Key | Department number (DEPTNO) → DEPT |

- A **primary key** uniquely identifies a single row. Values cannot repeat, and NULL is not allowed.
- A **foreign key** references the primary key of another table. EMP.DEPTNO can only hold a department number that exists in DEPT (or NULL).
- **The order of rows inside a table has no meaning.** If you need sorted results, you must use `ORDER BY` (Week 4).

All examples in this note use the three tables below.

| Table | Contents | Rows | Main columns |
|------|------|------:|------|
| EMP | Employees | 14 | EMPNO, ENAME, JOB, MGR, HIREDATE, SAL, COMM, DEPTNO |
| DEPT | Departments | 4 | DEPTNO, DNAME, LOC |
| SALGRADE | Salary grades | 5 | GRADE, LOSAL, HISAL |

- Dates in the example results appear as **YYYY-MM-DD**. Oracle's default date display depends on the environment setting (NLS), so the notes were run with the session set to this format.

## Types of SQL Statements

| Category | Meaning | Commands |
|------|------|------|
| **DML** (Data Manipulation Language) | Query and change data | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE` |
| **DDL** (Data Definition Language) | Define structures (tables, etc.) | `CREATE`, `ALTER`, `DROP`, `RENAME`, `TRUNCATE` |
| **DCL** (Data Control Language) | Grant and revoke privileges | `GRANT`, `REVOKE` |
| **TCL** (Transaction Control Language) | Confirm or cancel transactions | `COMMIT`, `ROLLBACK`, `SAVEPOINT` |

- Some textbooks single out `SELECT` and call it **DQL** (Data Query Language). If DQL is not among the choices, treat it as DML.
- `TRUNCATE` deletes data but is **DDL**. It is easy to confuse with `DELETE`. The difference is covered in Week 7.
- This week covers `SELECT` only. The other statements are left for Week 7.

## The Basic Structure of SELECT

```text
SELECT  [DISTINCT] column, expression, ...     ← what to show
FROM    table                                   ← where to get it from
```

- `SELECT` and `FROM` are required. Conditions (`WHERE`) and sorting (`ORDER BY`) come after them.
- Keywords, table names, and column names are **case-insensitive.** `select ename from emp` is the same. String values inside single quotes are case-sensitive.
- The `;` at the end of a statement is a marker telling the SQL tool "this is where one statement ends."

`*` fetches all columns in the order defined in the table.

```sql
SELECT * FROM DEPT;
```

```text
    DEPTNO DNAME          LOC
---------- -------------- -------------
        10 ACCOUNTING     NEW YORK
        20 RESEARCH       DALLAS
        30 SALES          CHICAGO
        40 OPERATIONS     BOSTON
```

You can also list just the columns you need, separated by commas. A calculation can go in a column position too.

```sql
SELECT ENAME, SAL, SAL * 12 AS ANNUAL FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME             SAL     ANNUAL
---------- ---------- ----------
CLARK            2450      29400
KING             5000      60000
MILLER           1300      15600
```

- `WHERE DEPTNO = 10` is a condition that picks only department 10. It was added to keep the example short; details come in Day 5.
- A calculation does not change the data in the table. It is a value created only on the result screen.

## Aliases

If you don't name a calculation, the expression itself becomes the column heading. An alias changes the heading.

| How to write it | Example | Heading shown |
|------|------|------|
| `AS` + name | `SAL * 12 AS ANNUAL` | `ANNUAL` |
| `AS` omitted | `SAL * 12 ANNUAL` | `ANNUAL` |
| Double quotes | `SAL * 12 "Annual Pay"` | `Annual Pay` (exactly as written) |
| Lowercase without quotes | `ENAME name` | `NAME` (converted to uppercase) |

```sql
SELECT ENAME AS "Employee Name", SAL "Monthly", SAL * 12 Yearly FROM EMP WHERE DEPTNO = 10;
```

```text
Employee Name    Monthly     YEARLY
------------- ---------- ----------
CLARK               2450      29400
KING                5000      60000
MILLER              1300      15600
```

Using an alias that contains a space without quotes causes an error. `Employee` is read as the alias, and `FROM` is expected next, but `Name` shows up instead.

```sql
SELECT ENAME Employee Name FROM EMP WHERE DEPTNO = 10;
```

```text
SELECT ENAME Employee Name FROM EMP WHERE DEPTNO = 10
                      *
ERROR at line 1:
ORA-00923: FROM keyword not found where expected
```

- Double quotes are needed for: **spaces**, **preserving case**, **special characters**, and using a reserved word as an alias.
- **Single quotes** are for string values. Using them for an alias, like `SAL 'MONTHLY'`, is an error. Remember: single quotes = values, double quotes = names.

> ⚠️ **An alias created in SELECT cannot be used in WHERE.** `WHERE` is processed before `SELECT`, so the alias does not exist yet at that point. The execution order is covered in Week 4, Day 2.

```sql
SELECT EMPNO, ENAME, SAL AS PAY FROM EMP WHERE PAY > 3000;
```

```text
SELECT EMPNO, ENAME, SAL AS PAY FROM EMP WHERE PAY > 3000
                                               *
ERROR at line 1:
ORA-00904: "PAY": invalid identifier
```

## DISTINCT — Removing Duplicate Rows

`DISTINCT` is written once, right after `SELECT`. Looking at the 14 employees' jobs without duplicates gives five.

```sql
SELECT DISTINCT JOB FROM EMP ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
SALESMAN
```

- `ORDER BY` was added to fix the result order. Without it, the order of `DISTINCT` results is not defined.

With two or more columns, rows are merged into one only when the **entire combination** is the same. `DISTINCT` does not apply to just the first column.

```sql
SELECT DISTINCT DEPTNO, JOB FROM EMP ORDER BY DEPTNO, JOB;
```

```text
    DEPTNO JOB
---------- ---------
        10 CLERK
        10 MANAGER
        10 PRESIDENT
        20 ANALYST
        20 CLERK
        20 MANAGER
        30 CLERK
        30 MANAGER
        30 SALESMAN
```

- 14 rows became 9. The CLERKs in department 20 (SMITH, ADAMS) and the four SALESMEN in department 30 each collapsed into one row.
- There is no syntax like `SELECT DEPTNO, DISTINCT JOB` that puts it in the middle.

NULL means "no value," but `DISTINCT` treats NULLs as the same and keeps just one row.

```sql
SELECT DISTINCT COMM FROM EMP ORDER BY COMM DESC;
```

```text
      COMM
----------

      1400
       500
       300
         0
```

- There are 10 employees whose COMM is NULL, but the result shows them only as a single blank line at the top. Oracle's descending sort puts NULL first.
- 0 and NULL are different values. TURNER's COMM of 0 takes its own line.

## Arithmetic Operations

| Operator | Meaning | Precedence |
|------|------|------|
| `*`, `/` | Multiply, divide | First |
| `+`, `-` | Add, subtract | Later |
| `( )` | Inside parentheses first | Highest |

```sql
SELECT ENAME, SAL + 100 * 2, (SAL + 100) * 2 FROM EMP WHERE EMPNO = 7369;
```

```text
ENAME       SAL+100*2 (SAL+100)*2
---------- ---------- -----------
SMITH            1000        1800
```

- `SAL + 100 * 2` is `800 + 200`, and `(SAL + 100) * 2` is `900 × 2`.
- Oracle computes through the decimal point even when dividing integers. `10 / 4` is 2.5, not 2.

## DUAL and the Concatenation Operator ||

Even for a calculation unrelated to any table, Oracle traditionally requires a `FROM`. That is what **DUAL** is for.

- DUAL is a table with a single column `DUMMY` and a single row with the value `'X'`. It is used to make sure exactly one row comes back.
- Oracle 23ai in the practice lab runs even without `FROM`, as in `SELECT 1 + 2;`. In versions before 23ai that is an error, so on the exam, assume the form with `FROM DUAL`.
- SQL Server natively uses `SELECT 1 + 2` without `FROM`.

`||` joins values into a single string. Numbers and dates are converted to text and joined.

```sql
SELECT ENAME || ' has the job ' || JOB || '.' AS INTRO FROM EMP WHERE DEPTNO = 10;
```

```text
INTRO
---------------------------------------
CLARK has the job MANAGER.
KING has the job PRESIDENT.
MILLER has the job CLERK.
```

- SQL Server joins strings with `+` instead of `||`. The `CONCAT` function works in both DBs (Day 2).

## When NULL Is Involved, the Result Is NULL Too

NULL is neither 0 nor blank; it is an **"unknown value."** Adding anything to an unknown value gives an unknown result.

```sql
SELECT ENAME, SAL, COMM, SAL + COMM, SAL * 12 + COMM AS ANNUAL FROM EMP WHERE DEPTNO = 30;
```

```text
ENAME             SAL       COMM   SAL+COMM     ANNUAL
---------- ---------- ---------- ---------- ----------
ALLEN            1600        300       1900      19500
WARD             1250        500       1750      15500
MARTIN           1250       1400       2650      16400
BLAKE            2850
TURNER           1500          0       1500      18000
JAMES             950
```

- BLAKE and JAMES have a NULL COMM, so both `SAL + COMM` and the annual figure become NULL (blank). Having a SAL value doesn't help.
- TURNER's COMM is 0, so it calculates normally. 0 is a value.
- To calculate with NULL turned into 0, use `NVL(COMM, 0)` (Day 4).

> ⚠️ **Oracle's `||` is an exception.** Unlike arithmetic, it skips NULL as if it were an empty string. `'A' || NULL || 'B'` is `'AB'`, not NULL. Standard SQL and SQL Server's `+` concatenation return NULL.

```sql
SELECT ENAME || NULL || JOB FROM EMP WHERE EMPNO = 7839;
```

```text
ENAME||NULL||JOB
-------------------
KINGPRESIDENT
```

Tomorrow covers character functions that cut and join strings, and numeric functions that round and truncate.

## 📖 Glossary

- **Table** : A set of data made of rows and columns. It is what a model's entity becomes in the DB.
- **Primary key (PK)** : A column that uniquely identifies a row. Duplicates and NULL are not allowed.
- **Foreign key (FK)** : A column that points to another table's primary key. It is the link that connects tables.
- **DML·DDL·DCL·TCL** : The categories of statements for data manipulation, structure definition, privilege control, and transaction control.
- **Alias** : A name given to a result column. `AS` can be omitted.
- **DISTINCT** : A keyword that keeps only one copy of completely identical rows in the SELECT result.
- **DUAL** : Oracle's default one-row, one-column table. Used for calculations without a table.
- **NULL** : A marker meaning no value or unknown. Different from 0 or a space character.

## 📝 Practice Questions

**Question 1.** Which of the following is a TCL (Transaction Control Language) command?

A) GRANT  
B) COMMIT  
C) ALTER  
D) MERGE  

**Answer: B**  
Explanation: TCL consists of `COMMIT`, `ROLLBACK`, and `SAVEPOINT`, which confirm or cancel transactions. `GRANT` is DCL, which grants privileges; `ALTER` is DDL, which changes structure; and `MERGE` is DML, which inserts or updates data.

---

**Question 2.** In the EMP table, BLAKE's SAL is 2850 and COMM is NULL. Which is the correct result of the following SQL?

```sql
SELECT SAL * 12 + COMM FROM EMP WHERE ENAME = 'BLAKE';
```

A) 34200  
B) 0  
C) An error occurs  
D) NULL  

**Answer: D**  
Explanation: The result of arithmetic that includes NULL is NULL. `2850 * 12` is 34200, but the moment NULL is added, the whole thing becomes NULL. To get 34200, you must first turn NULL into 0, as in `SAL * 12 + NVL(COMM, 0)`.

---

**Question 3.** Which of the following SQL statements causes an error when run in Oracle?

A) `SELECT ENAME Employee Name FROM EMP;`  
B) `SELECT ENAME AS "Employee Name" FROM EMP;`  
C) `SELECT ENAME EmpName FROM EMP;`  
D) `SELECT ENAME AS NAME FROM EMP;`  

**Answer: A**  
Explanation: An alias containing a space must be wrapped in double quotes. In A, `Employee` is read as the alias, and then `Name` appears where `FROM` should be, causing ORA-00923. B uses double quotes, and C and D are aliases without spaces, so they run normally.

---

**Question 4.** How many rows does the following SQL return for the EMP table (14 employees)? (Jobs by department: dept 10 CLERK·MANAGER·PRESIDENT, dept 20 ANALYST·CLERK·MANAGER, dept 30 CLERK·MANAGER·SALESMAN)

```sql
SELECT DISTINCT DEPTNO, JOB FROM EMP;
```

A) 3  
B) 5  
C) 9  
D) 14  

**Answer: C**  
Explanation: `DISTINCT` removes duplicates across the whole combination of the SELECT list. Each department has three jobs, so there are 9 (department, job) combinations. 3 is the row count if only DEPTNO were made DISTINCT, and 5 is the count if only JOB were.

---

**Question 5.** In Oracle, which is the correct result of the following SQL?

```sql
SELECT 'A' || NULL || 'B' FROM DUAL;
```

A) NULL  
B) AB  
C) A B  
D) An error occurs  

**Answer: B**  
Explanation: Oracle's concatenation operator `||` treats NULL as an empty string. So the result is `'AB'`. Arithmetic operations (`+`, `*`, etc.) give NULL when NULL is involved, but `||` does not. No space was inserted, so it is not `A B` either.
