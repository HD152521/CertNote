# Day 5 - Null Attributes and Natural vs Surrogate Identifiers

## 📌 Key Takeaways

- NULL is a value that is **not yet decided or is unknown**. It is different from 0 or a blank.
- The **result of an arithmetic operation involving NULL is NULL**. The result of a `=` or `<>` comparison is neither true nor false but **UNKNOWN**, so the row is filtered out.
- Check for NULL only with **`IS NULL` / `IS NOT NULL`**.
- Aggregate functions calculate **excluding NULL**. Only `COUNT(*)` counts the rows themselves. That is why `AVG(COMM)` and `AVG(NVL(COMM, 0))` give different values.
- A surrogate identifier makes the key simpler, but if you do not put a separate unique constraint on the natural identifier, **duplicate data** appears, and if you do, you need **one more index**.

## What Is NULL?

At the modeling stage, you decide for each attribute "whether the value may be empty." This is the **nullability** setting.

- A primary identifier does not allow NULL because of existence (Day 1).
- For regular attributes it depends on the business. `COMM` (commission) in EMP exists only for sales jobs, so it is NULL for other jobs.
- NULL does not mean "the value is 0." It is **the state of having no value**. 0 is a numeric value, and a blank `' '` is a character value.

| Value | Meaning | Example |
|----|-----|-----|
| `0` | The commission was **set to 0** | TURNER |
| `NULL` | The commission was **not set** | BLAKE, JAMES |

- Oracle treats the zero-length string `''` as NULL. SQL Server distinguishes `''` from NULL. This comes up again in the DBMS differences in Subject 2.

## NULL and Arithmetic Operations

Whatever you add to or multiply with NULL, the result is NULL. We checked with department 30.

```sql
SELECT ENAME, SAL, COMM, SAL + COMM AS TOTAL, SAL + NVL(COMM, 0) AS TOTAL2
FROM EMP WHERE DEPTNO = 30 ORDER BY EMPNO;
```

```text
ENAME             SAL       COMM      TOTAL     TOTAL2
---------- ---------- ---------- ---------- ----------
ALLEN            1600        300       1900       1900
WARD             1250        500       1750       1750
MARTIN           1250       1400       2650       2650
BLAKE            2850                             2850
TURNER           1500          0       1500       1500
JAMES             950                              950
```

- For BLAKE and JAMES, `COMM` is NULL, so `SAL + COMM` also became NULL.
- For TURNER, `COMM` is 0, so 1500 came out normally. The difference between 0 and NULL shows up directly in the result.
- To calculate with NULL turned into 0, use `NVL(COMM, 0)`. NULL-related functions are covered in Week 3.

## NULL and Comparison Operations

You cannot say NULL is equal to or different from any value. The comparison result is **UNKNOWN**, and since the WHERE clause keeps only the rows that are true, UNKNOWN rows drop out.

```sql
SELECT COUNT(*) FROM EMP WHERE COMM = NULL;
SELECT COUNT(*) FROM EMP WHERE COMM IS NULL;
```

```text
  COUNT(*)
----------
         0

  COUNT(*)
----------
        10
```

- `COMM = NULL` runs without an error, but the result is **0 rows**, because the comparison is UNKNOWN for every row.
- To find the 10 employees with NULL, you must use `IS NULL`.

`<>` works the same way. If you look for "employees whose commission is not 0," the employees with NULL drop out.

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM <> 0 ORDER BY EMPNO;
```

```text
ENAME            COMM
---------- ----------
ALLEN             300
WARD              500
MARTIN           1400
```

> ⚠️ **Trap**: `WHERE column = NULL` is not a syntax error. It runs and **returns 0 rows**. Both the choice "an error occurs" and the choice "rows with NULL are returned" are wrong.

## NULL and Aggregate Functions

Aggregate functions (`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`) **exclude NULL from the calculation**.

```sql
SELECT COUNT(*) AS CNT, COUNT(COMM) AS COMM_CNT, SUM(COMM) AS COMM_SUM,
       AVG(COMM) AS COMM_AVG, AVG(NVL(COMM, 0)) AS COMM_AVG2
FROM EMP;
```

```text
       CNT   COMM_CNT   COMM_SUM   COMM_AVG  COMM_AVG2
---------- ---------- ---------- ---------- ----------
        14          4       2200        550 157.142857
```

| Expression | Result | Calculation |
|----|------|------|
| `COUNT(*)` | 14 | Total number of rows. Unrelated to NULL |
| `COUNT(COMM)` | 4 | Only non-NULL values. TURNER with 0 is included |
| `SUM(COMM)` | 2200 | 300 + 500 + 1400 + 0 |
| `AVG(COMM)` | 550 | 2200 ÷ **4** |
| `AVG(NVL(COMM, 0))` | 157.142857 | 2200 ÷ **14** |

- The denominator of `AVG` is the number of non-NULL rows. If the goal is "the average commission over all employees," you must convert with NVL first and then take the average.
- If the target values are **all NULL**, the result of `SUM` and `AVG` is NULL. It is not 0.

Grouping by department reveals the last rule.

```sql
SELECT DEPTNO, COUNT(*), COUNT(COMM), SUM(COMM), AVG(COMM)
FROM EMP GROUP BY DEPTNO ORDER BY DEPTNO;
```

```text
    DEPTNO   COUNT(*) COUNT(COMM)  SUM(COMM)  AVG(COMM)
---------- ---------- ----------- ---------- ----------
        10          3           0
        20          5           0
        30          6           4       2200        550
```

- In departments 10 and 20, `COMM` is entirely NULL. `COUNT(COMM)` is 0, but `SUM` and `AVG` are blank as NULL.
- This is why modeling decides whether to put a default value of 0 on such a column. With a default value, you can no longer tell "not set" from "0," so choose by the business meaning.

### NULL in Sorting

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM, ENAME;
```

```text
ENAME            COMM
---------- ----------
TURNER              0
ALLEN             300
WARD              500
MARTIN           1400
BLAKE
JAMES
```

- Oracle treats NULL as **the largest value**, so it goes last in ascending order. SQL Server treats it as the smallest value, so it goes first.

## Natural Identifiers vs Surrogate Identifiers

Let us look closely at the "substitution" classification from Day 1.

| Category | Meaning | Example |
|------|-----|-----|
| **Natural identifier** | An identifier created by the business. Depending on the textbook, also called the **original identifier** | `(order number, product number)` of an order line item |
| **Surrogate identifier** | An identifier that does not exist in the business but is **created artificially** because the natural identifier is complex | `OrderItemID` (a serial number) of an order line item |

### Advantages of a Surrogate Identifier

- It replaces several columns of a composite identifier with **a single column**. The key becomes simpler.
- Fewer columns are inherited by child entities, so **join conditions get shorter**.
- Even if the natural identifier's values change, the surrogate identifier stays the same, so references are stable.

### Disadvantages of a Surrogate Identifier - Duplicate Data

We created a table that uses a serial number as the PK with no constraint at all on `(ORDER_NO, PROD_NO)`, and inserted the same row twice.

```sql
CREATE TABLE T_ITEM_SURR (ITEM_ID NUMBER(6) PRIMARY KEY, ORDER_NO NUMBER(4), PROD_NO VARCHAR2(4), QTY NUMBER(3));
INSERT INTO T_ITEM_SURR VALUES (1, 1001, 'P1', 2);
INSERT INTO T_ITEM_SURR VALUES (2, 1001, 'P1', 2);
SELECT * FROM T_ITEM_SURR ORDER BY ITEM_ID;
```

```text
   ITEM_ID   ORDER_NO PROD        QTY
---------- ---------- ---- ----------
         1       1001 P1            2
         2       1001 P1            2
```

- The same product in the same order went in as two rows. Since the PK `ITEM_ID` is different, the DBMS does not stop it.
- If you insert the same data into a table that has the natural identifier `(ORDER_NO, PROD_NO)` as its PK, the second INSERT is rejected.

```sql
CREATE TABLE T_ITEM_NAT (ORDER_NO NUMBER(4), PROD_NO VARCHAR2(4), QTY NUMBER(3),
  CONSTRAINT T_ITEM_NAT_PK PRIMARY KEY (ORDER_NO, PROD_NO));
INSERT INTO T_ITEM_NAT VALUES (1001, 'P1', 2);
INSERT INTO T_ITEM_NAT VALUES (1001, 'P1', 2);
```

```text
ERROR at line 1:
ORA-00001: unique constraint (SCOTT.T_ITEM_NAT_PK) violated on table SCOTT.T_ITEM_NAT columns (ORDER_NO, PROD_NO)
```

After the exercise, we dropped both tables with `DROP TABLE … PURGE`.

### Disadvantages of a Surrogate Identifier - An Unnecessary Index

- To prevent duplicates, you must create one more **UNIQUE index** on `(ORDER_NO, PROD_NO)` in addition to the surrogate identifier PK.
- A table that would have been fine with one PK index now has two. Storage grows, and **two indexes must be updated on every insert, update, and delete**.
- Actual queries are usually by order number, so the `ITEM_ID` PK index can end up being a rarely used index.

| Comparison | Natural identifier | Surrogate identifier |
|------|----------|----------|
| Key composition | A combination of business attributes, easily composite | A single column (serial number, etc.) |
| Duplicate prevention | The PK blocks it directly | **Duplicates are allowed unless there is a separate constraint** on the natural columns |
| Indexes | One PK index | PK + UNIQUE on natural columns, so **there can be two** |
| Inheritance to children | Several columns go down | Only one column goes down |

- That is why textbooks conclude that you should use the natural identifier if it is not complicated, and consider a surrogate identifier when it has too many attributes.

> Starting next week, we move on to Subject 2, SQL, and cover the SELECT statement and functions.

## 📖 Glossary

- **NULL**: A state where the value is not decided or is unknown. Different from 0 or a blank character.
- **UNKNOWN**: The result of comparing NULL with `=` or `<>`. In a WHERE clause it is filtered out like false.
- **IS NULL**: A comparison operator that checks for NULL. The negated form is `IS NOT NULL`.
- **NVL**: An Oracle function that replaces NULL with a specified value.
- **Nullability**: The decision, made at the modeling stage, of whether an attribute's value may be empty.
- **Natural identifier**: An identifier created by the business. Also called the original identifier.
- **Surrogate identifier**: An identifier that does not exist in the business but is created to simplify the key. A serial number is the classic example.
- **UNIQUE index**: An index that prevents duplicate column values. It is additionally needed on the natural columns when using a surrogate identifier.

## 📝 Practice Questions

**Question 1.** The COMM values in the EMP table are `300, 500, 1400, 0`, and the remaining 10 employees have NULL. What is the result of `SELECT AVG(COMM) FROM EMP;`?

A) 550  
B) 157.142857  
C) NULL  
D) 0  

**Answer: A**  
Explanation: Aggregate functions calculate excluding NULL. The total 2200 is divided by the 4 non-NULL rows, so it is 550. 0 is not NULL, so it is included in the denominator. To divide by all 14 employees, you must first convert NULL to 0, as in `AVG(NVL(COMM, 0))`.

---

**Question 2.** Which statement about the result of running `SELECT COUNT(*) FROM EMP WHERE COMM = NULL;` is correct? (There are 10 rows where COMM is NULL.)

A) A syntax error occurs  
B) 10 is returned  
C) NULL is returned  
D) 0 is returned  

**Answer: D**  
Explanation: Comparing NULL with `=` gives UNKNOWN, so no row satisfies the condition. It is not a syntax error, so it runs, and `COUNT(*)` returns 0. To find rows with NULL, use `COMM IS NULL`.

---

**Question 3.** Which of the following statements about NULL is LEAST appropriate?

A) The result of an arithmetic operation between NULL and a number is NULL  
B) NULL is stored with the same meaning as the number 0  
C) `COUNT(*)` also counts rows that contain NULL  
D) If all target values are NULL, the result of `SUM` is NULL  

**Answer: B**  
Explanation: NULL is the state of a value not being set, while 0 is a set numeric value. In EMP, `SAL + COMM` is calculated normally for TURNER, whose COMM is 0, but the result is NULL for BLAKE, whose COMM is NULL.

---

**Question 4.** Instead of the natural identifier `(order number, product number)`, you decided to use a serial-number surrogate identifier as the primary identifier of the order line item. Which of the following best describes a problem that can arise?

A) The number of columns inherited by child entities increases  
B) The number of columns in join conditions increases  
C) If the natural columns have no separate constraint, the same order and product can be stored in duplicate  
D) The existence characteristic of the primary identifier cannot be satisfied  

**Answer: C**  
Explanation: The serial number differs for each row, so even if the same combination of order number and product number comes in twice, the PK cannot stop it. To prevent this, you must add a UNIQUE index on the natural columns, which creates one more index. Fewer inherited columns and shorter join conditions are advantages of the surrogate identifier.

---

**Question 5.** In Oracle, when you run `SELECT ENAME, COMM FROM EMP ORDER BY COMM;`, where do the rows with NULL in COMM appear?

A) At the end  
B) At the beginning  
C) Right before the rows with 0  
D) They are excluded from the result  

**Answer: A**  
Explanation: When sorting, Oracle treats NULL as the largest value, so it goes last in ascending order. SQL Server, on the other hand, treats it as the smallest value, so it goes first. ORDER BY does not filter out rows, so the rows with NULL remain in the result.
