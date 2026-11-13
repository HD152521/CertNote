# Day 2 - Three-Level Schema and Modeling Stages

## 📌 Key Takeaways

- The ANSI/SPARC three-level schema divides a database into three layers, **external, conceptual, and internal**, to achieve **data independence**.
- **Logical independence**: even if the conceptual schema changes, the external schema (application programs) is not affected.
- **Physical independence**: even if the internal schema (storage structure) changes, the conceptual schema is not affected.
- Modeling proceeds in the order **conceptual → logical → physical**, and the further along you go, the lower the level of abstraction and the more concrete it becomes.
- Normalization is done in **logical** modeling, and decisions about performance and storage method are made in **physical** modeling.

## The Same Store Data, Looking Different to Each Person

A shipping clerk at the online store sees only the order number, recipient, and address. An accounting clerk sees only the order number, payment amount, and payment date. A DBA looks at which disk this data is stored on and with which indexes. In other words, the same data is viewed from three layers.

- The reason for separating layers is to **keep a change in one layer from spreading to another**.
- This structure was proposed by the SPARC committee of the American National Standards Institute (ANSI). That is why it is called the "ANSI/SPARC three-level schema architecture."

## The Three-Level Schema

| Schema | Perspective | What it does | Count |
|--------|------|--------|------|
| **External schema** | **User** perspective | Defines the database as each user or application program sees it. Also called the view level | Many |
| **Conceptual schema** | **Integrated** perspective | Defines the database of the **entire organization**, integrating all users' perspectives. Entities, relationships, and constraints are held here | One |
| **Internal schema** | **Physical storage** perspective | Defines how data is actually stored (record structure, indexes, storage location) | One |

```text
  Shipping screen    Accounting screen    Customer My Page
  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │ External 1│      │ External 2│      │ External 3│     ← External schemas (many)
  └────┬─────┘      └────┬─────┘      └────┬─────┘
       └──────────────┬──┴─────────────────┘
                      │  External/conceptual mapping  → logical independence
               ┌──────┴───────┐
               │  Conceptual   │                          ← Overall structure of customers, products, orders
               │  schema       │
               └──────┬───────┘
                      │  Conceptual/internal mapping  → physical independence
               ┌──────┴───────┐
               │  Internal     │                          ← Files, indexes, blocks
               │  schema       │
               └──────────────┘
```

- External schemas differ per user, so there are many. There is one conceptual schema and one internal schema per database.
- The conceptual schema holds "what the entire organization stores." How it is stored (indexes, files) is the job of the internal schema.
- In terms of SQL, the external schema is closest to a view created with `CREATE VIEW`, the conceptual schema to table definitions, and the internal schema to storage structures such as tablespaces and indexes. It isn't an exact one-to-one correspondence; it's an analogy to aid understanding.

## Two Kinds of Data Independence

The connection between schemas is called a **mapping**. Independence arises because the mapping absorbs the change.

| Independence | Even if this changes | What is not affected | Responsible mapping |
|--------|----------------|----------------------|----------|
| **Logical independence** | Conceptual schema | External schema (application programs) | External/conceptual mapping (application interface) |
| **Physical independence** | Internal schema | Conceptual schema (and external schema) | Conceptual/internal mapping (storage interface) |

In the online store example, it looks like this.

- **Logical independence**: A `marketing_opt_in` column was added to the customer table. The shipping screen doesn't use that column, so there is nothing to change.
- **Physical independence**: The DBA created a new index on the order table and moved it to another disk. The table structure (the conceptual schema) is unchanged, so the SQL keeps running as is.

> ⚠️ It's easy to mix up the name pairs. **Logical** independence is the ability to withstand changes to the **conceptual** schema, and **physical** independence is the ability to withstand changes to the **internal** schema. If you memorize "logical" as paired with "external," you'll get it wrong. The side that changes is the conceptual schema, and the side that is protected is the external schema.

### Without Data Independence

- Every time the storage structure changes, application programs have to be rewritten.
- Even though each user needs a different view of the data, everyone is forced to share one structure.
- In the end, maintenance costs rise and data complexity increases. The three-level schema is a structure designed to reduce this problem.

## The Three Stages of Modeling

If a schema is "the layers for viewing a finished database," then the modeling stages are "the order in which you build the database." The two are different concepts.

| Stage | Level of abstraction | What it does | Online store deliverable |
|------|-----------|--------|-------------|
| **Conceptual modeling** | Highest | Draws the **core entities and relationships** comprehensively, centered on the business. Used for enterprise-wide modeling and establishing EA (Enterprise Architecture) | The big picture of Customer — Order — Product |
| **Logical modeling** | Medium | **Accurately defines keys, attributes, and relationships** for system construction. Performs **normalization**. High reusability | The primary identifier of the Order entity, resolving M:N with Order Item, definition of each attribute |
| **Physical modeling** | Lowest | Decides **tables, column types, indexes, performance, and storage method** to fit the actual DBMS | The `ORDERS` table, `ORDER_DT DATE`, index and partition design |

```text
  High abstraction                                 Low abstraction
  ───────────────────────────────────────────────────────────▶
  Conceptual modeling   Logical modeling        Physical modeling
  (what exists)         (exactly what it        (how to put it on
                         looks like)             the DBMS)
```

- Going from conceptual → logical → physical, things become **more concrete** and closer to a specific DBMS.
- A logical model is not yet tied to a specific DBMS. That is why you can build a physical model from the same logical model, whether for Oracle or another DBMS.
- Normalization is the work of the logical modeling stage. **Denormalization**, which deliberately allows duplication for performance, is mainly considered in the physical modeling stage (covered in Week 2).

### Putting Stages and Schemas Side by Side

The two concepts share a similar direction, "from abstract to concrete," which makes them good to ask about together.

| Comparison | Modeling stages | Three-level schema |
|------|-----------|-------------|
| What is divided | Design **process** | The **layers** for viewing a database |
| Why it is divided | Design while making things more concrete stage by stage | To achieve **data independence** |
| Stage names | Conceptual, logical, physical | External, conceptual, internal |

- Both include the word "conceptual," which causes confusion. Conceptual **modeling** is the first stage of design, while the conceptual **schema** is the integrated data structure of the whole organization.
- There is no "external" among the modeling stages, and no "logical" in the three-level schema. If "logical schema" or "external modeling stage" shows up in an answer choice, the terms have been mixed up.

## Where Modeling Fits in a Project

An information system construction project proceeds roughly in the order planning → analysis → design → development → testing → transition. The modeling stages overlap with this flow.

| Project phase | Modeling mainly done |
|-------------|---------------|
| Planning and analysis | Conceptual modeling, logical modeling |
| Design | Physical modeling |
| After development | Build the DB based on the model, and when changes arise, fix the model first |

- The data model and the process model (business flow) are created together. For example, as you organize the online store's "receive order" process, the attributes of the Order entity come to light.
- This mapping varies a little from textbook to textbook. Some textbooks say the logical model is finished in the analysis phase, while others place the logical model in the design phase. The order (conceptual → logical → physical) is the same.

Tomorrow we'll look at the characteristics and classification of entities, the first element of the model.

## 📖 Glossary

- **Schema** : A definition describing the structure and constraints of a database.
- **External schema** : The database as seen by a single user or application program. There can be as many as there are users.
- **Conceptual schema** : The data structure of the entire organization, combining all users' perspectives into one.
- **Internal schema** : The definition of how data is actually stored on disk.
- **Mapping** : A link that corresponds two schemas so that a change on one side does not spread to the other.
- **Data independence** : The property that changing the schema of one layer does not affect the other layers.
- **Normalization** : The work of splitting entities to reduce duplication. Done in the logical modeling stage.
- **EA (Enterprise Architecture)** : A blueprint that organizes the business, data, and system structure of the entire organization at a glance.

## 📝 Practice Questions

**Question 1.** In the ANSI/SPARC three-level schema architecture, which schema defines the data structure of the entire organization's database, integrating the perspectives of all users?

A) External schema  
B) Internal schema  
C) Conceptual schema  
D) Subschema  

**Answer: C**  
Explanation: The conceptual schema integrates multiple user perspectives and describes the entire organization's database as a whole. The external schema is what a single user or application program sees, and a subschema is another name for the external schema. The internal schema defines the physical storage structure.

---

**Question 2.** An online store DBA rebuilt the indexes on the order table and moved their storage location, but did not modify the table structure or the application programs. Which concept is most closely related to this situation?

A) Physical independence  
B) Logical independence  
C) External/conceptual mapping  
D) Conceptual modeling  

**Answer: A**  
Explanation: Physical independence is the property that the conceptual schema is not affected even if the internal schema (indexes, storage location) changes. Logical independence is the property that a change to the conceptual schema does not spread to the external schema, and the external/conceptual mapping is what handles that. Conceptual modeling is the name of a design stage.

---

**Question 3.** Which is the LEAST appropriate statement about the data modeling stages?

A) Conceptual modeling has the highest level of abstraction and is business-centered.  
B) In logical modeling, keys, attributes, and relationships are expressed accurately and normalization is performed.  
C) In physical modeling, physical characteristics such as performance and storage method are considered.  
D) Logical modeling is the stage where the data types and indexes of a specific DBMS are finalized.  

**Answer: D**  
Explanation: Decisions tailored to a specific DBMS, such as data types and indexes, are the job of physical modeling. Logical modeling is not yet tied to a specific DBMS; it accurately defines keys, attributes, and relationships and performs normalization. A, B, and C describe each stage correctly.

---

**Question 4.** Which is a correct statement about the three-level schema architecture?

A) There is only one external schema per database.  
B) Logical independence means that the external schema is not affected even if the conceptual schema changes.  
C) The internal schema is the view level, defined differently for each user.  
D) The main purpose of the three-level schema is to increase data duplication to speed up queries.  

**Answer: B**  
Explanation: Logical independence is the property that the external schema withstands changes to the conceptual schema. There is an external schema for each user, so there are many, and the view level refers to the external schema. The purpose of the three-level schema is to achieve data independence and has nothing to do with increasing duplication.

---

**Question 5.** Which of the following is the most appropriate match between a modeling stage and its main deliverable?

A) Conceptual modeling - a list of data types and indexes per column  
B) Physical modeling - a big picture of the enterprise's core entities and their relationships  
C) Conceptual modeling - an attribute definition document with normalization completed  
D) Logical modeling - a model in which primary identifiers, attributes, and relationships are accurately defined  

**Answer: D**  
Explanation: The deliverable of logical modeling is a normalized model in which keys, attributes, and relationships are accurately defined. The list of data types and indexes is a deliverable of physical modeling, and the big picture of the enterprise's core entities is a deliverable of conceptual modeling. A normalized attribute definition document comes out of the logical stage, not the conceptual one.
