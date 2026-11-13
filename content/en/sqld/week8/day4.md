# Day 4 - Subject 1 Wrap-Up

## 📌 Key Takeaways

- Subject 1 is 10 questions worth 20 points, and scoring below 8 points (4 questions) is a subject failure even if the total exceeds 60 points.
- The modeling stages are **conceptual, logical, physical**, and the three-level schema is **external, conceptual, internal**. Logical independence withstands changes to the conceptual schema, and physical independence withstands changes to the internal schema.
- By tangibility, entities are divided into **tangible, conceptual, event**, and by time of occurrence into **fundamental, main, transaction**. The two axes do not correspond to each other.
- Normalization checks ask in this order: "Is it an atomic value → Does it depend on part of the key → Do ordinary attributes depend on each other → Is there a determinant that is not a candidate key?"
- Denormalization follows the order **investigate → consider other methods → apply**, and a surrogate identifier simplifies the key at the cost of duplicates and an extra index.

## How Subject 1 Decides Pass or Fail

In SQLD, Subject 1 is 10 of the 50 questions (20 points). Its weight is small, but scoring below 40% in any subject is a failure, so if you cannot get 8 points (4 questions) in Subject 1, you fail regardless of your Subject 2 score (source: the exam information in this track's README, confirmed at dataq.or.kr on 2026-11-03).

| Subject | Questions | Points | Failing line (below 40%) |
|------|-----:|-----:|----------------|
| Subject 1: Understanding Data Modeling | 10 | 20 | Below 8 points (fewer than 4 questions) |
| Subject 2: SQL Basics and Applications | 40 | 80 | Below 32 points (fewer than 16 questions) |

- The scope of Subject 1 is the ten notes of W1 (modeling, entities, attributes, relationships) and W2 (identifiers, normalization, denormalization, joins and transactions, NULL, surrogate identifiers).
- Below, rather than listing that content again, we organize it by the pairs that are easily swapped in answer choices and by the order of judgment.

## The Nature of Modeling: Four Lists Grouped in Threes

W1 Day 1 has four lists that are grouped into "three things." Answer choices that mix up the group name and the elements are wrong.

| Group | Elements | Where they get mixed up |
|------|------|---------------|
| Characteristics | Abstraction · Simplification · Clarification | Simplification means expressing **easily**, and clarification means expressing with **one meaning** |
| Perspectives | Data (What) · Process (How) · Interaction | The English for the interaction perspective is Interaction |
| Importance | Leverage · Conciseness · Data Quality | What to uphold |
| Cautions | Duplication · Inflexibility · Inconsistency | What to avoid |

- The three elements of a data model are entities (Things), attributes (Attributes), and relationships (Relationships).
- The names for an individual unit are also asked as pairs. The individual of an entity is an instance (occurrence), the individual of an attribute is an attribute value, and the individual of a relationship is a **pairing**.

## The Three Modeling Stages and the Three-Level Schema

Both concepts are three boxes going "from abstract to concrete," so they work well together in one question. They differ from the start in what they divide.

| Comparison | Modeling stages (W1 Day 2) | Three-level schema (W1 Day 2) |
|------|--------------------|---------------------|
| What it divides | The design **process** | The **layers** for viewing a finished DB |
| Names | Conceptual → Logical → Physical | External · Conceptual · Internal |
| Purpose of dividing | Stepwise concretization | Data independence |
| Count | One deliverable per stage | Several external, one conceptual and one internal |

```text
Modeling stages                     Three-level schema
Conceptual  core entities,          External  per-user/application
            relationships, EA                 views (several)
  ↓                                   │  external/conceptual mapping → logical independence
Logical     keys, attributes,       Conceptual  organization-wide
            relationships fixed,                integrated structure (one)
            normalization             │  conceptual/internal mapping → physical independence
  ↓
Physical    tables, types,          Internal  storage structure,
            indexes, performance              indexes (one)
```

- "Logical schema" and "external modeling" are phrases made by mixing the two lists. The modeling stages have no external, and the schema has no logical.
- Normalization is the work of logical modeling, while performance, storage methods, and denormalization review are the work of physical modeling.

Independence is judged by "what changes, and what is protected."

| Independence | What changes | What is protected | Shopping mall example |
|--------|---------|----------|---------|
| Logical | Conceptual schema | External schema | Even if you add a column to the customer table, the delivery screen stays the same |
| Physical | Internal schema | Conceptual schema | Even if you create an index and move the disk, the table structure and SQL stay the same |

> ⚠️ **Pitfall**: An answer choice that begins "Logical independence = even if the external schema changes…" is wrong. What changes in logical independence is the **conceptual** schema, and the external schema is the side that is protected.

## Entities: Six Conditions and Two Classification Axes

### Conditions for Being an Entity

Flipping the six characteristics of W1 Day 3 into "if even one is missing, it is not an entity" makes judging fast.

| Condition | Case where it fails |
|------|------------|
| Information needed by the business | A set unrelated to the business |
| Identified by a unique identifier | There is no way to tell instances apart |
| Two or more instances | Only one record, like company information |
| Used by business processes | No business creates, reads, updates, or deletes it |
| Contains attributes | There are no attributes to describe it |
| At least one relationship | It is not connected to any entity |

- Exceptions to the relationship condition are statistical or code-like entities and internal entities for system processing (such as transaction logs). The relationships are sometimes omitted from the drawing.
- An entity that no process uses is read as a sign that processes were left out of the business analysis.

### Two Classification Axes

It is often shortened to "tangible/intangible," but this track (W1 Day 3) divides into three, **tangible, conceptual, event**, as in the textbook. What falls under intangible is conceptual and event.

| Axis | Classification | Judging question | Shopping mall example |
|----|------|---------|---------|
| Tangibility | Tangible | Does it have a physical form? | Customer, product, warehouse |
| | Conceptual | Is it information that is defined and used without a form? | Membership grade, product category, insurance product |
| | Event | Does it occur while carrying out business? | Order, payment, delivery |
| Time of occurrence | Fundamental (key) | Does it arise **independently** without other entities? | Customer, product, employee, department |
| | Main | Does it arise from a fundamental entity and become the **center** of the business? | Order, payment |
| | Transaction | Does it arise from **two or more parents**? | Order item, order change history |

- One entity gets a name on each of the two axes. Order item is an event and also a transaction entity, and membership grade is conceptual and also fundamental.
- An answer choice that chains the axes, such as "event entity = main entity," is wrong.
- Transaction entities often reveal themselves at the detailed design stage or at the stage of interaction modeling with processes.
- Names should use business terms, no abbreviations, and a **singular noun**, and be unique across the whole model.

## Attributes: Three Classification Axes and Domains

An attribute is the smallest unit that cannot be divided further in meaning, and it holds only one attribute value per instance (W1 Day 4).

| Axis | Classification | Judging question | Example |
|----|------|---------|-----|
| Characteristic | Basic | Is it an original attribute that comes directly from the business? | Product name, order quantity |
| | Designed | Is it a code or serial number newly created during design? | Order status code, order item serial number |
| | Derived | Is it calculated from other attributes? | Order total amount, cumulative purchase amount |
| Entity composition | PK | Does it identify the instance? | Order number of an order |
| | FK | Did it come in through a relationship with another entity? | Customer number of an order |
| | Regular | Is it neither PK nor FK? | Order date, payment amount |
| Can it be divided? | Simple (single) | Can it not be divided further? | Order quantity |
| | Composite | Can it be split into several units of meaning? | Address (city, district, neighborhood), customer name (surname, given name) |
| How many values? | Single-valued | Is there one per instance? | Date of birth |
| | Multivalued | Can there be several? | A customer's multiple delivery addresses |

- "Single attribute" and "single-valued attribute" are on different axes. The former asks whether it can be divided, and the latter asks how many values it has.
- A multivalued attribute is separated into its own entity. This judgment leads to 1NF.
- A derived attribute gets out of sync if it is not updated together when its source changes. So define **as few as possible**.
- The same customer number is a PK in the customer entity and an FK attribute in the order entity. Which entity you view it from decides the classification.

A **domain** is the range of values an attribute can have, and it contains the data type, size, and constraints together. For example, order date, delivery date, and payment date share one "date" domain, and in the physical model it is implemented with the column type and `CHECK` and `NOT NULL`.

## Relationships: Types, Notation Elements, and Two Notations

| Pair | Distinction | Example |
|----|------|-----|
| Existence / Action | Is it connected by existence alone, or does it arise only when some action is performed? | An employee belongs to a department / a customer places an order |
| ERD / UML | ERD does not distinguish the two. UML distinguishes them with association (solid line) and dependency (dashed line) | |
| Cardinality / Optionality | How many instances of the counterpart (1:1, 1:M, M:N) / must it participate? | Customer–order 1:M, optional on the customer side |

- The three notation elements are the relationship name (Membership), the relationship cardinality (Cardinality), and the relationship optionality (Optionality).
- Relationship names avoid vague verbs ("is related") and are written in the present tense. One is attached at each end.
- M:N cannot be implemented directly in a relational DB, so it is resolved into two 1:M relationships with an intersection entity (order item).
- The reading order is the reference entity ("each") → the counterpart count → optionality ("always/sometimes") → the relationship name.

```text
IE      Customer ┼──────────O< Order    The optionality symbols (O, |) are attached to the opposite end
Barker  Customer - - - -─────< Order    Optionality is a solid (mandatory) or dashed (optional) line on one's own half
```

- Even for the same relationship, the circle `O` in IE is at the **target-side end**, while the dashed line in Barker is on the **reference-side half**.
- Barker puts `#` (identifier), `*` (mandatory), and `o` (optional) in front of attributes.

## Identifiers: Four Classification Criteria and Primary Identifier Properties

| Criterion | Pair | Distinguishing question |
|------|-----|----------|
| Representativeness | Primary / Secondary | Is it used to form a **reference relationship** with other entities? |
| Whether generated | Internal / External | Did it create itself, or was it **brought in** through a relationship? |
| Number of attributes | Single / Composite | Is it one attribute or two or more? |
| Whether substituted | Natural / Surrogate | Did the business make it, or was it made **artificially**? |

Using the EMP example from W2 Day 1 as is, `EMP.EMPNO` is a primary, internal, single, natural identifier, and `EMP.DEPTNO` is an external identifier brought in from DEPT. The national ID number in the employee entity is a secondary identifier that distinguishes rows but is not used for references.

The four properties of a primary identifier are easy to use for separating answer choices if you remember them through violation examples.

| Property | What to uphold | Violation example |
|------|-----------|-------|
| Uniqueness | Distinguishes every instance uniquely | Choosing ENAME because names do not overlap right now |
| Minimality | Uses only as many attributes as uniqueness needs | `(EMPNO, ENAME)` |
| Immutability | The value does not change often | Using a value that changes on department transfer as the key |
| Existence | A value must always be present (NOT NULL) | An employee row with no employee number |

- Minimality does not mean "one attribute." For order item, `(order number, product number)` is the minimum with two.
- When choosing, pick attributes heavily used in lookups, and avoid name attributes such as names and descriptions.

### Identifying and Non-Identifying Relationships

| Comparison | Identifying relationship | Non-identifying relationship |
|------|---------|----------|
| Parent PK in the child | **Part** of the primary identifier | A **regular attribute** |
| Child without parent | Cannot exist | Can exist (when the relationship is optional) |
| IE notation | Solid line | Dashed line |
| Example | Order → order item | DEPT → EMP |
| If you insist on only one | The child's key keeps getting longer | Joins increase to obtain upper-level values |

- If the parent PK becomes **all** of the child PK, it is a 1:1 relationship.
- If the relationship is weak, the child key can be made independently, or the child can arise before the parent, consider a non-identifying relationship.

## Normalization Judgment Order

Normal forms are decided by the shape of functional dependencies (`X → Y`, where X is the determinant) (W2 Day 2). Ask the questions below from the top, and the first place a "yes" appears is the violated normal form.

```text
① Does one cell hold several values (multivalued, repeating group)?   Yes → violates 1NF
② Does a regular attribute depend on only "part" of a composite primary identifier?   Yes → violates 2NF (partial functional dependency)
③ Does a regular attribute depend on another regular attribute?   Yes → violates 3NF (transitive functional dependency)
④ Is there a determinant that is not a candidate key?   Yes → violates BCNF
   All no → satisfies BCNF (for 4NF multivalued dependency and 5NF join dependency, only the names and targets)
```

| Entity (primary identifier) | Functional dependency | Judgment |
|----------------|---------|------|
| Order item `(ORDER_NO, PROD_NO)` + PROD_NAME | `PROD_NO → PROD_NAME` | Depends on part of the key → violates 2NF, split out into product |
| Combined EMP and DEPT table `(EMPNO)` | `EMPNO → DEPTNO`, `DEPTNO → DNAME, LOC` | Transitive dependency → violates 3NF, split out into DEPT |
| Enrollment `(student_id, course)` + professor | `(student_id, course) → professor`, `professor → course` | In 3NF, but the determinant professor is not a candidate key → violates BCNF |

- If the primary identifier is a single attribute, ② cannot hold. A 2NF violation arises only with a composite primary identifier.
- The BCNF example is solved by splitting into `(professor, course)` and `(student_id, professor)`.
- Without normalization, insertion, update, and deletion anomalies arise. You cannot insert a product without an order (insertion), fixing only one row makes the names diverge (update), and deleting an order makes the product information disappear (deletion).
- After normalization, insert, update, and delete get better, but queries may get slower because joins increase, or faster because tables get smaller. "Queries necessarily get slower" is an incorrect statement.

## Denormalization: Order and Techniques

Denormalization is **deliberately introducing duplication** into a model that has finished normalization for the sake of query performance (W2 Day 3). Its price is the risk to integrity.

| Order | Step | Content |
|-----|------|------|
| ① | Investigate targets | Range-processing frequency, bulk range processing, statistical processes, number of joins |
| ② | Consider other approaches | Views, clustering, index tuning, application processing |
| ③ | Apply denormalization | Table · column · relationship |

| Branch | Technique | Distinguished by purpose |
|------|------|-----------|
| Table merging | 1:1, 1:M, supertype/subtype merge | Remove the join of tables always viewed together |
| Table splitting | Vertical split (by column), horizontal split (by row) | Split to match the access range |
| Table addition | Duplicate, statistics, history, partial tables | Replication, pre-aggregation, keeping history |
| Column | Duplicate column, derived column, history table column addition, column by PK, column to guard against malfunction | A duplicate column reduces joins, a derived column reduces calculation |
| Relationship | Add a duplicate relationship | Shorten the join path |

- The two tables produced by a vertical split are in a 1:1 relationship sharing the same primary identifier. A horizontal split is often implemented with partitioning.
- The alternatives in ② create no duplication in the model. That is why we look at them before applying.

## Data Model and SQL: Relationships, Transactions, NULL

| In the model | In SQL | Source note |
|--------|---------|--------|
| Relationship (1:M) | FK, join condition `E.DEPTNO = D.DEPTNO` | W2 Day 4 |
| Optional relationship (department with no employees) | To see all departments, OUTER JOIN | W2 Day 4 |
| Hierarchical data model (self-reference) | Self join, hierarchical query | W2 Day 4 |
| Mutually exclusive (arc) relationship | The join target differs depending on the discriminator column value | W2 Day 4 |
| Mandatory on both sides | Bundle the two INSERTs into one transaction and COMMIT together | W2 Day 4 |
| Nullable attribute | Operation result is NULL, comparison result is UNKNOWN | W2 Day 5 |

- A hierarchical data model is a superior-subordinate relationship **within one entity**. EMP's `MGR → EMPNO` is an example, and the MGR of the top-level KING is NULL.
- Joins work even without a relationship. EMP and SALGRADE are connected by the salary range (non-equi).
- Entities that are meaningless without each other, like order and order item, are drawn with a mandatory relationship. If wrongly drawn as optional, data with only an order may remain.

NULL is "not determined," so it differs from 0 and blank. The behaviors asked about in Subject 1 are summarized in five.

| Situation | Result | Value seen with EMP |
|------|------|-----------|
| `SAL + COMM` (COMM is NULL) | NULL | The totals of BLAKE and JAMES are empty |
| `WHERE COMM = NULL` | 0 rows with no error | NULL employees are 10 with `IS NULL` |
| `COUNT(*)` / `COUNT(COMM)` | All rows / excluding NULL | 14 / 4 |
| `AVG(COMM)` / `AVG(NVL(COMM, 0))` | The denominators differ | 550 / 157.142857 |
| SUM, AVG when all target values are NULL | NULL (not 0) | SUM(COMM) of departments 10 and 20 |

- Oracle treats NULL as the largest value in sorting and places it last in ascending order.

### Natural Identifier vs Surrogate Identifier

| Comparison | Natural identifier | Surrogate identifier |
|------|---------|----------|
| Who made it | The business (also called the original identifier) | The designer, artificially (serial number, etc.) |
| Key shape | Tends to be composite | A single column |
| Duplicate prevention | The PK blocks it directly | **Duplicates allowed** unless the natural columns have a separate constraint |
| Index | One for the PK | PK + UNIQUE on the natural columns, **two** |
| Inheritance by children | Several columns are passed down | Only one column is passed down |

- In W2 Day 5, the table with only the `ITEM_ID` PK accepted the same `(1001, 'P1')` row twice, while the table with the natural identifier as PK rejected it with ORA-00001.
- To sum up, use the natural identifier as is if it is not complicated, and consider a surrogate identifier when there are too many attributes.

> Tomorrow we will organize Subject 2, SQL Basics and Applications, in the same way.

## 📖 Glossary

- **Subject failure** : Failing regardless of the total because a subject score is below 40% of its allotted points. For Subject 1, it is below 8 points.
- **Data independence** : The property that when the schema of one layer changes, the other layers are not affected. There are two kinds, logical and physical.
- **Pairing** : The connection of one pair of instances participating in a relationship. It is the individual unit of a relationship.
- **Transaction entity** : An entity that arises from two or more parent entities. Order item is an example.
- **Domain** : The range of values an attribute can have. It includes type, size, and constraints.
- **Determinant** : The side X that determines the value in a functional dependency `X → Y`. BCNF requires every determinant to be a candidate key.
- **Vertical split / horizontal split** : Denormalization techniques that split a table by column / by row.
- **Surrogate identifier** : An identifier that does not exist in the business but was created to simplify the key. The natural columns need a separate constraint.

## 📝 Practice Questions

**Question 1.** Which statement about the three-level schema and data independence is correct?

A) Logical independence is the property that the conceptual schema is not affected even if the internal schema changes  
B) The external schema is an integrated structure of the whole organization, so there is only one per database  
C) Normalization is work done when designing the internal schema among the three-level schema  
D) Physical independence is the property that the conceptual schema is not affected even if the internal schema changes  

**Answer: D**  
Explanation: Physical independence is the property by which the conceptual/internal mapping absorbs changes to the storage structure (internal schema) and protects the conceptual schema. A attaches the name of logical independence to the description of physical independence. Logical independence is the property that the external schema is not affected even if the conceptual schema changes. B is a description of the conceptual schema, and external schemas exist per user, so there are several. C mixes normalization with the schema layers. Normalization is done in logical modeling among the modeling stages.

---

**Question 2.** In a shopping mall model, the order item entity arises from two parents, order and product. If you classify order item by **time of occurrence**, it is?

A) Fundamental entity  
B) Transaction entity  
C) Main entity  
D) Event entity  

**Answer: B**  
Explanation: In the time-of-occurrence classification, an entity that arises from two or more parent entities is a transaction entity. The fundamental entity in A is something like customer or product that arises independently without other entities. The main entity in C is something like order that arises from a fundamental entity and becomes the center of the business. The event entity in D is a classification by tangibility, so it is a different axis from the one asked. Order item is an event by tangibility but a transaction entity by time of occurrence.

---

**Question 3.** The primary identifier of the course grade entity is `(student_id, course_code)`, and every attribute is an atomic value. When the functional dependencies are `(student_id, course_code) → grade` and `course_code → course_name`, what is the lowest normal form this entity fails to satisfy?

A) 1NF  
B) 3NF  
C) 2NF  
D) BCNF  

**Answer: C**  
Explanation: The course name depends only on the course code, which is part of the composite primary identifier. It is a partial functional dependency, so 2NF is not satisfied, and the course code and course name must be split out into a course entity. Every attribute is an atomic value, so 1NF is satisfied, making A wrong. 3NF and BCNF are also not satisfied, but 2NF breaks first, so they are not the "lowest" normal form. B is the stage that examines transitive dependency, and D is the stage that examines a determinant that is not a candidate key.

---

**Question 4.** Which statement about surrogate identifiers is NOT correct?

A) If a surrogate identifier is made the PK, duplicate entry of the same data is blocked even if the natural columns have no constraint  
B) Because a single column replaces the composite natural identifier, fewer columns are inherited by children  
C) If you put a UNIQUE index on the natural columns to prevent duplicates, the table has two indexes  
D) It is an identifier that does not exist in the business but is made artificially, like a serial number  

**Answer: A**  
Explanation: A surrogate identifier gets a new value for every row, so even for the same combination of order number and product number, the PK differs and the DBMS does not block it. In the W2 Day 5 exercise, the same `(1001, 'P1')` row went in twice. B is a correct description of an advantage of surrogate identifiers. C correctly states a disadvantage of surrogate identifiers, the increase in unnecessary indexes. D is exactly the definition of a surrogate identifier.

---

**Question 5.** Which statement about denormalization is correct?

A) A horizontal split divides a table by column, separating frequently used columns from rarely used ones  
B) Apply denormalization first, and if performance is insufficient, consider alternatives such as index tuning and views  
C) The two tables divided by a vertical split are in a 1:1 relationship sharing the same primary identifier  
D) It is a technique of skipping the normalization stage and designing to allow duplication from the start  

**Answer: C**  
Explanation: A vertical split divides by column, so the two tables have the same primary identifier and are connected 1:1. A is a description of a vertical split. A horizontal split divides by row ranges such as month or region. B has the order reversed. The procedure is investigate targets → consider other approaches → apply denormalization. D is wrong. Denormalization is the work of reverting only where needed after normalization is finished.
