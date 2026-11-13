# Day 4 - Relationships and Joins, and the Transactions a Model Expresses

## 📌 Key Takeaways

- A **relationship** in the model becomes an **FK** in the physical model and a **join condition** in SQL. If you look at the relationships, you can see the join paths.
- A **hierarchical data model** is a structure where an entity has a **relationship with itself**. In SQL it is read with a self join or a hierarchical query.
- A **mutually exclusive relationship** is a structure where one entity relates to **only one of** two entities (an arc relationship).
- A transaction unit that must be saved together is expressed in the model as a **mandatory relationship** (mandatory on both sides).

## A Relationship Becomes a Join Condition

A model with its relationships drawn already tells you "which tables should be joined with which columns."

| Stage | The relationship between DEPT and EMP |
|------|-----------------|
| Logical model | A department contains many employees (1:M) |
| Physical model | `EMP.DEPTNO` is an **FK** referencing `DEPT.DEPTNO` |
| SQL | A **join condition**: `ON E.DEPTNO = D.DEPTNO` |

- When you split entities through normalization, relationships appear to the same extent, and those relationships are the joins at query time.
- A join is an operation that **connects rows where the values of the related PK and FK are equal**.

Translating one relationship into SQL looks like this.

```sql
SELECT D.DEPTNO, D.DNAME, COUNT(E.EMPNO) AS EMP_CNT, SUM(E.SAL) AS SAL_SUM
FROM DEPT D LEFT OUTER JOIN EMP E ON D.DEPTNO = E.DEPTNO
GROUP BY D.DEPTNO, D.DNAME ORDER BY D.DEPTNO;
```

```text
    DEPTNO DNAME             EMP_CNT    SAL_SUM
---------- -------------- ---------- ----------
        10 ACCOUNTING              3       8750
        20 RESEARCH                5      10875
        30 SALES                   6       9400
        40 OPERATIONS              0
```

- Department 40 has no employees. In the model, this means "a department has zero or more employees," an **optional relationship**.
- To see all departments while preserving this optionality, you need an OUTER JOIN. With a regular join, department 40 would drop out of the result.
- In other words, the **optional/mandatory notation** of a relationship is the basis for deciding whether to use an INNER or an OUTER join.

### Some Joins Have No Relationship

Not every join follows an FK. SALGRADE has no relationship line to EMP, but they are connected by salary range.

```sql
SELECT E.ENAME, E.SAL, S.GRADE
FROM EMP E JOIN SALGRADE S ON E.SAL BETWEEN S.LOSAL AND S.HISAL
WHERE E.DEPTNO = 10 ORDER BY E.EMPNO;
```

```text
ENAME             SAL      GRADE
---------- ---------- ----------
CLARK            2450          4
KING             5000          5
MILLER           1300          2
```

- A join that connects with a condition other than equality is called a Non-EQUI join. We cover it in detail in Week 4.
- What to note for Subject 1 is that "relationship = join path" is the default, and that joins are also possible without a relationship.

## Hierarchical Data Model

`MGR` in EMP points to `EMPNO` of the same EMP. This is a structure where an entity has a **relationship with itself**.

```text
           EMP
        ┌────────────┐
        │ EMPNO  PK  │◄──┐
        │ ENAME      │   │  Manager-subordinate relationship
        │ MGR    FK  │───┘  (self-referencing, recursive)
        └────────────┘
```

- Such a model is called a **hierarchical data model**, and such a relationship is called a **recursive relationship (also called a self-referencing relationship)**.
- It is used when **data of the same kind is linked up and down**, such as an org chart, a bill of materials (BOM), or parent and child menus.
- The top-level row has no parent, so its FK value is NULL. In EMP, that is KING.

Reading the same table twice to attach the manager's name is a **self join**.

```sql
SELECT E.EMPNO, E.ENAME, E.MGR, M.ENAME AS MGR_NAME
FROM EMP E LEFT OUTER JOIN EMP M ON E.MGR = M.EMPNO
WHERE E.DEPTNO = 10 ORDER BY E.EMPNO;
```

```text
     EMPNO ENAME             MGR MGR_NAME
---------- ---------- ---------- ----------
      7782 CLARK            7839 KING
      7839 KING
      7934 MILLER           7782 CLARK
```

- `E` plays the employee role and `M` plays the manager role. You give the same EMP two aliases and use them like different tables.
- KING has NULL in `MGR`, so a regular join would drop him. Here too, we kept him with an OUTER JOIN.
- To walk down several levels at once, use a `START WITH … CONNECT BY` hierarchical query. That is in Week 6's scope.

> ⚠️ **Trap**: A hierarchical data model is a structure where a parent-child relationship arises **within a single entity**. Choices saying "two entities form a hierarchy" or "a self join cannot be used in a hierarchical model" are wrong.

## Mutually Exclusive Relationship

The party placing an order can be either an individual customer or a corporate customer. One order relates to **only one of** the two.

```text
  Individual Customer ─┐
                       ├── (one of the two) ──< Order
  Corporate Customer  ─┘
```

- This is called a **mutually exclusive (Exclusive OR) relationship**, and depending on the notation, an **arc relationship**.
- In Barker notation, it is shown with an arc crossing the two relationship lines.
- There are several ways to carry it into the physical model. You can have one customer number column together with a "customer type" column, or have separate individual and corporate FKs and fill in only one.
- If you use a customer type column, **which table you join with depends on that value** at join time. That is why the SQL gets complicated.

## Transactions Expressed by the Model

A transaction is **a group of operations that must succeed together or fail together**. What Subject 1 asks is how this grouping shows up in the model.

Take Order and Order Item as an example.

- An order must have at least one product. An order without products is meaningless.
- An order item also cannot exist alone without an order.
- So the order header and the order item rows must be saved **together as one transaction**.

| Relationship notation | What the model says | Transaction |
|----------|---------------|---------|
| Order ↔ Order Item **mandatory on both sides** | Neither can exist without the other | Bundle into **one transaction** and commit together |
| Department → Employee **optional** (from the department side) | A department without employees can exist | Registering the department first in a **separate transaction** is possible |

```text
  Order                Order Item
┌──────────┐        ┌────────────┐
│ OrderNo   │|──────<│ OrderNo     │   Mandatory on both sides (|)
│ OrderDate │        │ ProductNo   │   → Bundle the order INSERT and the order item INSERT
└──────────┘        │ Quantity    │     into one transaction
                    └────────────┘
```

- If you drew the relationship as **mandatory**, it is a signal that entering the two entities is one unit of work. The developer handles both INSERTs inside the same transaction and COMMITs them together.
- If you wrongly draw the relationship as **optional**, data can remain where the order went in but the order items are missing.
- Conversely, if you bind together things that the business saves separately as mandatory, you get an unnecessarily large transaction.
- The ACID properties of transactions and the COMMIT and ROLLBACK syntax are covered in Week 7 on TCL.

> Tomorrow we cover how NULL behaves in operations and aggregations, and the difference between natural and surrogate identifiers.

## 📖 Glossary

- **Join**: An operation that connects rows of two tables based on the values of related columns.
- **Join path**: The sequence of tables and join conditions you must pass through to reach the data you want.
- **Hierarchical data model**: A model where a parent-child relationship arises within one entity. An org chart is the classic example.
- **Recursive relationship**: A relationship where an entity references itself. Also called a self-referencing relationship.
- **Self join**: Giving the same table two aliases and joining it with itself.
- **Mutually exclusive relationship**: A structure where one entity relates to only one of several entities. Also called an arc relationship.
- **Transaction**: A group of operations that must succeed together or fail together.
- **Mandatory relationship**: A relationship where an instance of the other entity must exist. The opposite of an optional relationship.

## 📝 Practice Questions

**Question 1.** The "manager employee number" attribute of the employee entity references the "employee number" of the same employee entity. Which of the following best describes this model?

A) A mutually exclusive relationship between two entities  
B) The manager employee number cannot be NULL because of existence  
C) A self join cannot be used with this structure  
D) A hierarchical data model where an entity has a relationship with itself  

**Answer: D**  
Explanation: A structure where an entity references itself is a hierarchical data model, and this relationship is called a recursive relationship. Manager information is read with a self join, which gives the same table two aliases. The top-level employee has no manager, so the manager employee number can be NULL. Existence is a characteristic of primary identifiers, not of FKs.

---

**Question 2.** An order relates to only one of an individual customer or a corporate customer. What is this relationship called?

A) Identifying relationship  
B) Mutually exclusive relationship  
C) Recursive relationship  
D) Redundant relationship  

**Answer: B**  
Explanation: A structure where one entity relates to only one of several entities is a mutually exclusive (Exclusive OR) relationship. It is also called an arc relationship. A recursive relationship is one that references itself, and a redundant relationship is one added to shorten the join path.

---

**Question 3.** Which best expresses in the data model the business rule that an order and its order items must be saved together as one transaction?

A) Connect Order and Order Item with an optional non-identifying relationship  
B) Make Order Item an independent entity unrelated to Order  
C) Connect Order and Order Item with a relationship that is mandatory on both sides  
D) Connect Order and Order Item with a mutually exclusive relationship  

**Answer: C**  
Explanation: Expressing a relationship in which neither can exist without the other as a mandatory relationship makes it visible in the model that entering the two entities is one unit of work. If it is left optional, data can arise that has an order but no order items.

---

**Question 4.** DEPT and EMP are modeled with the relationship "a department has zero or more employees." Which is the right way to retrieve all departments, including those without employees, together with the headcount per department?

A) OUTER JOIN EMP with DEPT as the base  
B) INNER JOIN DEPT and EMP  
C) Query only EMP and GROUP BY DEPTNO  
D) CROSS JOIN DEPT and EMP without a join condition  

**Answer: A**  
Explanation: The relationship is optional on the department side, so departments without employees exist. An INNER JOIN or a GROUP BY on EMP alone would drop departments with no employees, like department 40. Only an OUTER JOIN based on DEPT keeps every department.

---

**Question 5.** Which of the following statements about relationships and joins in a data model is LEAST appropriate?

A) Relationships are often implemented as FKs in the physical model  
B) A related PK and FK become the join condition at query time  
C) A join can only be performed between tables that have a relationship defined by an FK  
D) Whether a relationship is optional or mandatory is the basis for choosing between INNER and OUTER joins  

**Answer: C**  
Explanation: A join can be done without an FK relationship as long as there is a condition on column values. EMP and SALGRADE have no relationship line, but they are joined by a Non-EQUI join on the salary range. Still, it is true that the model's relationships are the default join paths.
