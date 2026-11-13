# Day 1 - Identifiers

## 📌 Key Takeaways

- An identifier is an attribute (or a group of attributes) that **tells one instance apart from the others** within an entity.
- The four characteristics of a primary identifier are **uniqueness · minimality · immutability · existence**.
- There are four classification criteria: **representativeness** (primary/secondary) · **origin** (internal/foreign) · **number of attributes** (single/composite) · **substitution** (natural/surrogate).
- If the parent's primary identifier becomes **part of the child's primary identifier**, it is an identifying relationship. If it goes down only as a **regular attribute**, it is a non-identifying relationship.
- If you insist on identifying relationships only, the child's key keeps growing longer. If you insist on non-identifying relationships only, you need more joins just to get at parent information.

## What Is an Identifier?

If the name "SMITH" appears twice in an employee table, you cannot decide which SMITH's salary to change. That is why every entity needs a label that can pinpoint a single row. That label is the identifier.

- "Identifier" is a term from the **logical model**. In the physical model it becomes a **key**, especially the primary key (PK).
- An entity can have several identifier candidates. The one chosen as the representative is the **primary identifier**.
- In EMP, `EMPNO` is the primary identifier. `ENAME` does not repeat in the current data, but business rules cannot prevent two employees from having the same name.

Counting the overlapping values in EMP of the SCOTT schema gives the following.

```sql
SELECT COUNT(*) AS CNT, COUNT(DISTINCT EMPNO) AS EMPNO_CNT,
       COUNT(DISTINCT ENAME) AS ENAME_CNT, COUNT(DISTINCT JOB) AS JOB_CNT
FROM EMP;
```

```text
       CNT  EMPNO_CNT  ENAME_CNT    JOB_CNT
---------- ---------- ---------- ----------
        14         14         14          5
```

- `JOB` has only 5 distinct values across 14 rows, so it cannot be an identifier.
- `ENAME` is also not repeated right now, with 14 distinct values. But **being unique in the current data by chance** is different from **being unique by business rule**. Choose identifiers by the latter.

## The Four Characteristics of a Primary Identifier

| Characteristic | Meaning | Example from EMP |
|------|-----|------------|
| **Uniqueness** | The primary identifier **uniquely distinguishes** every instance in the entity | Two employees cannot have the same `EMPNO` |
| **Minimality** | The number of attributes in the primary identifier is **the minimum needed to keep it unique** | `EMPNO` alone is enough, so `(EMPNO, ENAME)` violates minimality |
| **Immutability** | Once set, the primary identifier value **should not change often** | The employee number stays the same even when the employee moves departments |
| **Existence** | A primary identifier value **must always exist** (NULL not allowed) | You cannot create an employee row without an employee number |

- Minimality does not mean "there must be exactly one attribute." If a line item in an order needs both `(order number, product number)` to be unique, then two is the minimum.
- In the physical model, existence shows up as a **NOT NULL** constraint on the PK column.

> ⚠️ **Trap**: A choice saying "names don't overlap right now, so uniqueness is satisfied" is wrong. Uniqueness must be guaranteed by business rules. Also, "a primary identifier must be a single attribute" is a wrong statement. A composite primary identifier can satisfy minimality too.

### Criteria for Choosing a Primary Identifier

When there are several candidates, pick one using these criteria.

- Pick the attribute that is **used most for lookups and searches** in that business area. For employees it is the employee number; for orders it is the order number.
- **Avoid attributes described by a name or a description.** Department names and product names change and can repeat.
- **Keep the number of attributes small.** If a composite identifier grows to five or six attributes, consider a surrogate identifier (Day 5).

## Classification of Identifiers

The same identifier gets four different names depending on the criterion. You need to remember each criterion together with its pair of types to tell the answer choices apart.

| Classification criterion | Type | Meaning |
|----------|------|-----|
| **Representativeness** | Primary identifier | Represents the entity and **can form reference relationships with other entities** |
| | Secondary identifier (alternate identifier) | Can distinguish instances but lacks representativeness, so it is **not used to connect reference relationships** |
| **Origin** | Internal identifier | An identifier created **on its own inside** the entity |
| | Foreign identifier | An identifier **received through a relationship** with another entity |
| **Number of attributes** | Single identifier | Made up of **one** attribute |
| | Composite identifier | Made up of **two or more** attributes |
| **Substitution** | Natural identifier | An identifier created **by the business itself** |
| | Surrogate identifier | An identifier that does not exist in the business but is **created artificially** (a serial number, etc.) |

Applying this to EMP and DEPT gives the following.

| Attribute | Classification |
|------|------|
| `EMP.EMPNO` | Primary identifier · internal identifier · single identifier · natural identifier |
| `EMP.DEPTNO` | A **foreign identifier** received from DEPT through the relationship (the FK in the physical model) |
| A national ID number placed in the employee entity | A **secondary identifier**: it can distinguish employees but is not used as the representative |
| `(order number, product number)` of an order line item | **Composite identifier** |

- A foreign identifier may not be part of its own entity's primary identifier. `EMP.DEPTNO` is a foreign identifier, but it is not part of EMP's primary identifier.
- Depending on the textbook, a foreign identifier is also called a "foreign key identifier." In the physical model it becomes a foreign key (FK).

### Why Keep a Secondary Identifier Separately

- In the employee entity, the national ID number also distinguishes people. Even so, the primary identifier is the employee number, because the employee number is the value referenced across all company business.
- A secondary identifier is used as a **search condition or a unique constraint (UNIQUE)**. Other entities do not take this value as an FK.

## Identifying and Non-Identifying Relationships

The parent entity's primary identifier travels down to the child through the relationship. The name of the relationship depends on **what role** the attribute that came down plays inside the child.

```text
[Identifying relationship]               [Non-identifying relationship]

 Order               Order Item           DEPT              EMP
┌──────────┐       ┌────────────┐       ┌──────────┐      ┌──────────┐
│ OrderNo PK│──────<│ OrderNo  PK│       │ DEPTNO PK│- - -<│ EMPNO  PK│
│ OrderDate │       │ ProductNoPK│       │ DNAME    │      │ ENAME    │
└──────────┘       │ Quantity   │       └──────────┘      │ DEPTNO FK│
                   └────────────┘                         └──────────┘
 Parent PK is part of the child PK      Parent PK is a regular child attribute
 (IE notation: solid line)               (IE notation: dotted line)
```

| Comparison | Identifying relationship | Non-identifying relationship |
|------|----------|-----------|
| Position of the parent PK | **Part of the child's primary identifier** | A **regular attribute** of the child |
| Existence of the child | **Cannot exist** without the parent | Can exist without the parent (when the relationship is optional) |
| Connection strength | Strong connection | Weak connection |
| IE notation | Solid line | Dotted line |
| Example | Order → Order Item | DEPT → EMP |

- If the parent's primary identifier becomes **all** of the child's primary identifier in an identifying relationship, the two entities have a 1:1 relationship.
- The FK column of a non-identifying relationship may allow NULL. To accept employees not yet assigned to a department, `EMP.DEPTNO` must allow NULL.
- Notation differs by textbook and tool. Barker notation shows an identifying relationship with a vertical bar at the end of the relationship line. The solid/dotted distinction is based on IE (ERwin) notation.

### When to Choose a Non-Identifying Relationship

In the following situations, consider a non-identifying relationship instead of an identifying one.

- When the **relationship between parent and child is weak**. An employee is the same employee even after moving departments.
- When it is better to **build the child's primary identifier independently**. The employee number alone makes an employee unique.
- When a child may come into existence before its parent. A newly hired employee not yet assigned to a department is such a case.

### Problems from Insisting on One Side Only

| Choice | Problem |
|------|------|
| Connect with **identifying relationships only** | The child's primary identifier attributes keep growing at each level down. Join conditions get longer and SQL gets more complicated |
| Connect with **non-identifying relationships only** | When a grandchild entity needs the grandparent's value, you must **join multiple times** through the intermediate entities |

For example, if you connect `Customer → Order → Order Item → Shipment` entirely with identifying relationships, the primary identifier of Shipment becomes `(customer number, order number, product number, shipment sequence)`. Conversely, if you connect them all as non-identifying, you must join Order Item and Order in turn just to see the customer name from Shipment.

You can also see in the actual data that `DEPTNO` in EMP is a foreign identifier received through a non-identifying relationship.

```sql
SELECT EMPNO, ENAME, JOB, MGR, DEPTNO FROM EMP WHERE DEPTNO = 10 ORDER BY EMPNO;
```

```text
     EMPNO ENAME      JOB              MGR     DEPTNO
---------- ---------- --------- ---------- ----------
      7782 CLARK      MANAGER         7839         10
      7839 KING       PRESIDENT                    10
      7934 MILLER     CLERK           7782         10
```

- The primary identifier `EMPNO` alone distinguishes each row. `DEPTNO` is a regular attribute that is not part of the key.
- `MGR` is also a foreign identifier received from EMP's own `EMPNO`. An employee with no higher-level manager, like KING, has NULL. We will revisit this self-referencing relationship on Day 4.

> 💡 **Summary table**: Identifying relationship = the parent PK goes into the child PK; non-identifying relationship = the parent PK goes into a regular child column. If you ask "can the child exist without the parent?", the answer points to the non-identifying relationship.

> Tomorrow we cover normalization, which splits entities based on functional dependency.

## 📖 Glossary

- **Identifier**: An attribute that distinguishes one instance within an entity. In the physical model it becomes a key.
- **Primary identifier**: The identifier chosen from several candidates to represent the entity. Other entities reference it.
- **Secondary identifier**: An identifier that can distinguish instances but is not used to connect reference relationships.
- **Foreign identifier**: An identifier received through a relationship with another entity. It is the FK in the physical model.
- **Composite identifier**: An identifier that becomes unique only when two or more attributes are combined.
- **Minimality**: The property of using only as many attributes as needed to keep uniqueness.
- **Existence**: The property that a primary identifier must always have a value. NULL is not allowed.
- **Identifying relationship**: A relationship where the parent's primary identifier becomes part of the child's primary identifier.
- **Non-identifying relationship**: A relationship where the parent's primary identifier goes down only as a regular attribute of the child.

## 📝 Practice Questions

**Question 1.** Which of the following is NOT a characteristic of a primary identifier?

A) Uniqueness  
B) Minimality  
C) Referentiality  
D) Existence  

**Answer: C**  
Explanation: The characteristics of a primary identifier are the four: uniqueness, minimality, immutability, and existence. "Referentiality" is not on this list. Being able to form reference relationships with other entities is something we mention when explaining the classification by representativeness (primary/secondary identifier).

---

**Question 2.** The primary identifier of the employee entity was set as `(employee number, employee name)`. If the employee number alone uniquely distinguishes every employee, which characteristic of a primary identifier is violated?

A) Minimality  
B) Existence  
C) Immutability  
D) Uniqueness  

**Answer: A**  
Explanation: Minimality means the number of attributes in the primary identifier must be the minimum that satisfies uniqueness. Since the employee number alone is unique, adding the employee name violates minimality. Uniqueness itself is still satisfied.

---

**Question 3.** Which of the following pairs of identifiers with their classification criteria is NOT correct?

A) Representativeness - primary identifier, secondary identifier  
B) Number of attributes - single identifier, composite identifier  
C) Substitution - natural identifier, surrogate identifier  
D) Origin - primary identifier, foreign identifier  

**Answer: D**  
Explanation: The classification by origin is the internal identifier, created on its own inside the entity, and the foreign identifier, received through a relationship with another entity. The primary identifier belongs to the classification by representativeness.

---

**Question 4.** Which relationship best fits the following description?

> The parent entity's primary identifier is inherited as a regular attribute of the child entity, and the child entity can be created even without the parent.

A) Identifying relationship  
B) Non-identifying relationship  
C) Mutually exclusive relationship  
D) 1:1 identifying relationship  

**Answer: B**  
Explanation: If the parent's primary identifier becomes part of the child's primary identifier, it is an identifying relationship; if it goes down only as a regular attribute, it is a non-identifying relationship. A non-identifying relationship is a weak connection, so the child can come into existence before the parent. `DEPTNO` in EMP is such an example.

---

**Question 5.** Which of the following best describes what happens when `Customer → Order → Order Item → Shipment` are all connected using identifying relationships only?

A) The number of primary identifier attributes grows toward the lower entities, making join conditions longer  
B) To get customer information from Shipment, you must always join through Order Item and Order  
C) The Order Item entity can be created without a parent  
D) The primary identifier of the Shipment entity becomes a single identifier  

**Answer: A**  
Explanation: An identifying relationship includes the parent's primary identifier in the child's primary identifier, so key attributes pile up at each level down. The key of Shipment becomes long, like `(customer number, order number, product number, shipment sequence)`. More joins through intermediate entities is the problem of using non-identifying relationships only.
