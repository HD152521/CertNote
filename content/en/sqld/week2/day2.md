# Day 2 - Normalization

## 📌 Key Takeaways

- Normalization is the process of splitting entities based on **functional dependency** to eliminate **redundancy and anomalies**.
- There are three anomalies: **insertion anomaly · update anomaly · deletion anomaly**.
- 1NF requires **atomic values**, 2NF **removes partial functional dependencies**, 3NF **removes transitive functional dependencies**, and BCNF requires that **every determinant is a candidate key**.
- 4NF deals with multivalued dependencies and 5NF with join dependencies. For the exam, you only need to tell apart the names and what they target.
- Normalization improves insert, update, and delete performance. Queries may get slower because of more joins, or faster because tables get smaller.

## Functional Dependency

Every step of normalization can be explained by one question: "What determines the value of this attribute?"

- When fixing the value of attribute X fixes the value of attribute Y to exactly one value, we say **Y is functionally dependent on X**. The notation is `X → Y`.
- Here X is called the **determinant** and Y the **dependent**.

Writing out the functional dependencies in EMP and DEPT gives the following.

| Functional dependency | How to read it |
|----------|--------|
| `EMPNO → ENAME, JOB, SAL, DEPTNO` | Once the employee number is fixed, the name, job, salary, and department number are each fixed to one value |
| `DEPTNO → DNAME, LOC` | Once the department number is fixed, the department name and location are fixed |
| `ENAME → EMPNO` | Does not hold. Two employees can share a name |

Functional dependencies come in three shapes. Each shape is paired with one normal form.

| Type | Shape | Normal form that removes it |
|------|------|------------|
| **Full functional dependency** | Depends on the **entire** composite key | (target state) |
| **Partial functional dependency** | Depends on only **part** of the composite key | 2NF |
| **Transitive functional dependency** | `X → Y` and `Y → Z`, so `X → Z` | 3NF |

## Anomalies

We built a non-normalized table ourselves to see the anomalies. It is a case where the product name is put into the order line table as well. The primary identifier is `(ORDER_NO, PROD_NO)`.

```sql
CREATE TABLE T_ORD_LINE (
  ORDER_NO  NUMBER(4),
  PROD_NO   VARCHAR2(4),
  PROD_NAME VARCHAR2(20),
  QTY       NUMBER(3),
  CONSTRAINT T_ORD_LINE_PK PRIMARY KEY (ORDER_NO, PROD_NO)
);
INSERT INTO T_ORD_LINE VALUES (1001, 'P1', 'PEN', 2);
INSERT INTO T_ORD_LINE VALUES (1002, 'P1', 'PEN', 5);
INSERT INTO T_ORD_LINE VALUES (1002, 'P2', 'NOTE', 1);
SELECT * FROM T_ORD_LINE ORDER BY ORDER_NO, PROD_NO;
```

```text
  ORDER_NO PROD PROD_NAME                   QTY
---------- ---- -------------------- ----------
      1001 P1   PEN                           2
      1002 P1   PEN                           5
      1002 P2   NOTE                          1
```

- `PROD_NAME` is determined by `PROD_NO` alone. This is a **partial functional dependency**: it depends on only part of the primary identifier.
- As a result, the name `PEN` of `P1` is stored repeatedly, once per order.

### Update Anomaly

If you change the product name of `P1` but fix only one row, the same product ends up with two names.

```sql
UPDATE T_ORD_LINE SET PROD_NAME = 'GEL PEN' WHERE ORDER_NO = 1001 AND PROD_NO = 'P1';
SELECT * FROM T_ORD_LINE ORDER BY ORDER_NO, PROD_NO;
SELECT PROD_NO, COUNT(DISTINCT PROD_NAME) AS NAME_CNT FROM T_ORD_LINE GROUP BY PROD_NO ORDER BY PROD_NO;
```

```text
  ORDER_NO PROD PROD_NAME                   QTY
---------- ---- -------------------- ----------
      1001 P1   GEL PEN                       2
      1002 P1   PEN                           5
      1002 P2   NOTE                          1

PROD   NAME_CNT
---- ----------
P1            2
P2            1
```

### Insertion Anomaly

If you try to register product `P3`, which nobody has ordered yet, it is blocked because there is no order number.

```sql
INSERT INTO T_ORD_LINE (ORDER_NO, PROD_NO, PROD_NAME) VALUES (NULL, 'P3', 'ERASER');
```

```text
ERROR at line 1:
ORA-01400: cannot insert NULL into ("SCOTT"."T_ORD_LINE"."ORDER_NO")
```

### Deletion Anomaly

If you cancel order `1002` and delete its rows, the information that the product `P2` (NOTE) existed disappears too. This is because the product information rides along on the order row.

After the exercise, we dropped the table with `DROP TABLE T_ORD_LINE PURGE;`.

| Anomaly | Symptom | In the example above |
|---------|------|----------|
| **Insertion anomaly** | You must insert unwanted values as well before the data can be entered | A product cannot be registered without an order |
| **Update anomaly** | Only some rows get fixed and the data becomes **inconsistent** | The name of `P1` split into PEN and GEL PEN |
| **Deletion anomaly** | Information other than what you meant to delete disappears too | Deleting the order wipes out the product information |

The fix is to **separate the product name into a product table** together with its determinant `PROD_NO`. Only `(ORDER_NO, PROD_NO, QTY)` is left in the order line. This separation is 2NF.

## Normal Form Stages

| Normal form | Condition | What it removes | Example of splitting |
|--------|------|----------|--------|
| **1NF** | Every attribute holds an **atomic value** | Multivalued attributes, repeating groups | If an employee's "Certifications" holds `Information Processing, SQLD` in one cell, split it into rows or an entity |
| **2NF** | 1NF + every regular attribute depends on the **whole** primary identifier | Partial functional dependency | Separate the product name from the order line into Product |
| **3NF** | 2NF + no dependencies among regular attributes | Transitive functional dependency | Separate the department name and location that were in Employee into Department |
| **BCNF** | 3NF + **every determinant is a candidate key** | Determinants that are not candidate keys | See the example below |
| 4NF | BCNF + no multivalued dependencies | Multivalued dependency | Separate two independent multivalued attributes into their own entities |
| 5NF | 4NF + no join dependencies | Join dependency | Separate the join dependencies that do not go through a candidate key |

- A 2NF violation can occur **only with a composite primary identifier**. If the primary identifier is a single attribute, it cannot "depend on only part of it."
- An atomic value in 1NF is "a single value that needs no further splitting." What counts as atomic is decided by the business.

### 3NF - Why EMP and DEPT Are Split

Suppose EMP and DEPT were merged into one table. The join result looks like that.

```sql
SELECT E.EMPNO, E.ENAME, E.DEPTNO, D.DNAME, D.LOC
FROM EMP E JOIN DEPT D ON E.DEPTNO = D.DEPTNO
WHERE E.DEPTNO = 20 ORDER BY E.EMPNO;
```

```text
     EMPNO ENAME          DEPTNO DNAME          LOC
---------- ---------- ---------- -------------- -------------
      7369 SMITH              20 RESEARCH       DALLAS
      7566 JONES              20 RESEARCH       DALLAS
      7788 SCOTT              20 RESEARCH       DALLAS
      7876 ADAMS              20 RESEARCH       DALLAS
      7902 FORD               20 RESEARCH       DALLAS
```

- Since `EMPNO → DEPTNO` and `DEPTNO → DNAME, LOC`, `EMPNO → DNAME` is a **transitive functional dependency**.
- If kept as one table, `RESEARCH, DALLAS` repeats once per employee. If the department moves, all five rows must be fixed.
- Splitting the determinant `DEPTNO` and its dependents off into DEPT gives the current SCOTT schema. In other words, EMP and DEPT are a structure split to satisfy 3NF.

### BCNF - A Problem That Remains Even in 3NF

The example used in textbooks is the "Enrollment" entity.

- Attributes: `(StudentID, Subject, Professor)`. The rules are "one professor teaches only one subject" and "a student takes each subject from one professor."
- The primary identifier is `(StudentID, Subject)`, and the functional dependencies are `(StudentID, Subject) → Professor` and `Professor → Subject`.
- There is no transitive dependency among regular attributes, so it is in 3NF. But the determinant `Professor` is not a candidate key.
- To reach BCNF, split it into `(Professor, Subject)` and `(StudentID, Professor)`.

> ⚠️ **Trap**: 2NF is "partial," 3NF is "transitive." Answer choices that swap the two are easy to use as wrong answers. When you see the word "determinant," think of BCNF.

## Normalization and Performance

| Operation | After normalization |
|------|----------|
| Insert, update, delete | Less redundancy means one place to fix. **Performance and consistency improve** |
| Query | More joins can make it slower. Conversely, tables get smaller and indexes get tidier, so it **can also get faster** |

- So the statement "normalization always lowers query performance" is wrong.
- Intentionally allowing redundancy when query performance actually becomes a problem is denormalization. We cover it tomorrow.

## 📖 Glossary

- **Functional dependency**: A relationship where fixing the value of X fixes the value of Y to one value. Written `X → Y`.
- **Determinant**: The attribute on the side that fixes the value in a functional dependency. The X in `X → Y`.
- **Partial functional dependency**: A state of depending on only some attributes of a composite primary identifier. Removed in 2NF.
- **Transitive functional dependency**: A state of depending through another regular attribute, as in `X → Y → Z`. Removed in 3NF.
- **Atomic value**: A single value that needs no further splitting. The condition of 1NF.
- **Anomaly**: A problem caused by redundancy that arises during insert, update, or delete. There are insertion, update, and deletion anomalies.
- **Candidate key**: A set of attributes that satisfies uniqueness and minimality and so can become the primary identifier.
- **BCNF**: A state where every determinant is a candidate key. A normal form that strengthens 3NF.

## 📝 Practice Questions

**Question 1.** The order line entity has the primary identifier `(order number, product number)` and also has a `product name` attribute. The product name is determined by the product number alone. Which normal form does this entity violate?

A) First normal form  
B) Second normal form  
C) Third normal form  
D) Fourth normal form  

**Answer: B**  
Explanation: The product name depends on only the product number, which is part of the composite primary identifier. This is a partial functional dependency, which is removed in second normal form. Splitting the product name out into a Product entity together with the product number solves it.

---

**Question 2.** Which of the following is NOT an anomaly?

A) Insertion anomaly  
B) Update anomaly  
C) Deletion anomaly  
D) Query anomaly  

**Answer: D**  
Explanation: The anomalies that normalization solves are the three: insertion, update, and deletion anomalies. A query does not change data, so it does not fall under the anomaly categories.

---

**Question 3.** The employee entity has the functional dependencies `employee number → department number` and `department number → department name`. Which of the following best describes this structure?

A) There is a transitive functional dependency between employee number and department name, so it violates third normal form  
B) There is a partial functional dependency, so it violates second normal form  
C) The department name is a multivalued attribute, so it violates first normal form  
D) Every determinant is a candidate key, so it satisfies BCNF  

**Answer: A**  
Explanation: The employee number determines the department number and the department number determines the department name, so employee number → department name is a transitive functional dependency. Third normal form removes transitive functional dependencies. Since the primary identifier is the single attribute employee number, a partial functional dependency cannot occur.

---

**Question 4.** Which of the following statements about normalization is LEAST appropriate?

A) Normalization reduces data redundancy, making it easier to maintain consistency on insert, update, and delete  
B) First normal form is the stage that makes every attribute hold an atomic value  
C) Normalization increases joins, so query performance always drops  
D) BCNF is the stage that makes every determinant a candidate key  

**Answer: C**  
Explanation: After normalization, more joins can slow down queries, but table sizes shrink and redundancy disappears, so queries can even get faster. The claim that it "always drops" is wrong.

---

**Question 5.** You tried to register a new product that has not been ordered yet, but the product information is stored together in the order table, so it could not be entered without an order number. What is this phenomenon called?

A) Update anomaly  
B) Deletion anomaly  
C) Join dependency  
D) Insertion anomaly  

**Answer: D**  
Explanation: The phenomenon where you can enter data only if another unwanted value (the order number) is present is the insertion anomaly. An update anomaly is when only some rows get modified and inconsistency arises, and a deletion anomaly is when information other than what you meant to delete disappears too.
