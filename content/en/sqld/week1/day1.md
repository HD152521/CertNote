# Day 1 - Data Modeling Overview

## 📌 Key Takeaways

- Data modeling is the work of **abstracting, simplifying, and clarifying** real-world business operations and drawing them in an agreed-upon notation.
- Modeling looks at a business from three perspectives: **data (What), process (How), and the interaction between data and process (Interaction)**.
- Modeling matters for three reasons: **Leverage, Conciseness, and Data Quality**.
- Three things to avoid when modeling: **Duplication, Inflexibility, and Inconsistency**.
- The three elements of a data model are **entities (Things), attributes (Attributes), and relationships (Relationships)**.

## If You Were to Turn an Online Store into a Model

An online store has customers and products, and customers order products. To move that sentence into a database, you first have to decide "what to store" in a diagram. Drawing that diagram is data modeling.

- We'll use the same online store as the running example all week. The things that appear are **Customer, Product, Order, Order Item, and Shipment**.
- Modeling comes before writing SQL. Before creating tables, you decide which candidates will become tables and how they connect.

### Definition

| Perspective | Definition |
|------|------|
| Business analysis | A technique for **analyzing the business from a data perspective** in order to build an information system |
| Representation | The process of representing real-world data (What) in an **agreed-upon notation** |
| Design | The **analysis and design process** for building a database |

- The three definitions are not different statements. They describe the same work from different angles.
- Modeling is not only design; it is also a **means of analyzing the business**. As you draw the model, business rules come to light.

## Three Characteristics of Modeling

| Characteristic | Meaning | Online store example |
|------|-----|----------|
| **Abstraction** | Extract the commonalities among many real-world phenomena and fit them into a fixed format | Group countless individual shoppers into a single frame called "Customer" |
| **Simplification** | Express complex reality easily using agreed-upon conventions (notation, language) | Draw the link between a customer and an order as a single line |
| **Clarification** | Remove ambiguity and describe things so they can be read in **only one way** | Decide whether "order date" means the payment time or the time the order was received |

- Abstraction means "keep only what's common." Even if customers differ in height and hobbies, you keep only the name, contact information, and address the store needs.
- Clarification means preventing differing interpretations. It's easy to confuse with simplification, but simplification is about expressing things **easily**, while clarification is about expressing them **precisely**.

## Three Perspectives

Modeling looks at a business from three directions.

| Perspective | Question it asks | Online store example |
|------|----------|----------|
| **Data perspective** | **What data** is the business related to? (What, Data) | What do we store for customers, products, and orders? |
| **Process perspective** | What does the business **actually do**? (How, Process) | Receiving orders, payment, shipping |
| **Interaction perspective (data and process)** | **How is the data affected** by the way the business is processed? (Interaction) | How does the stock quantity change when an order is canceled? |

- SQLD Subject 1 mainly deals with the **data perspective**.
- The English term for the interaction perspective is Interaction. An exam might ask you to match the "Data / Process / Interaction" pairs in the answer choices.

## Why Modeling Matters

| Importance | Meaning |
|--------|-----|
| **Leverage** | If the data model changes during system construction, the programs and tables that depend on it change too. The later you change it, the higher the cost |
| **Conciseness** | Shows complex information requirements concisely in a single model. Developers and business users talk while looking at the same diagram |
| **Data Quality** | Prevents the problem of the same data being scattered in multiple places with mismatched values, right at the model stage |

- Leverage means "fixing one model triggers a chain of other fixes." That is why the model should be settled carefully at the start.
- Data quality problems often surface only after they have built up for a long time, making them hard to fix later. Getting the model right from the beginning is the cheapest solution.

## Three Things to Avoid When Modeling

| Caution | Meaning | Online store example |
|--------|-----|----------|
| **Duplication** | The same information is stored in multiple places | A customer's address is stored separately in both the customer table and the order table |
| **Inflexibility** | The model is weak against business change, so even small changes require major model changes | Payment methods are hard-coded as columns `is_card` and `is_bank_transfer`, so a new column is added every time a new payment method appears |
| **Inconsistency** | Relationships between data are not defined, so contradictory values arise | A customer's tier was changed, but the tier discount rate stored in the order is still the old value |

- To reduce inflexibility, **separate data definitions from processes**. If you keep payment methods as separate data (a code) instead of columns, a new method needs only one added row.
- Duplication easily leads to inconsistency. If you fix only one of two duplicated values, differing values remain.

> ⚠️ Watch out for answer choices that mix up the 3 importance points (Leverage, Conciseness, Data Quality) and the 3 cautions (Duplication, Inflexibility, Inconsistency). "Inconsistency" is something to **avoid**, while "Data Quality" is something to **protect**.

## The 3 Elements of a Data Model

| Element | English | Online store example |
|------|------|----------|
| The **thing** the business is involved with | Things | Customer, Product, Order |
| The **characteristics** that thing has | Attributes | Customer name, product price, order date |
| The **relationship** between the things the business is involved with | Relationships | A customer places an order, an order contains products |

These three elements are the topics of Day 3 (entities), Day 4 (attributes), and Day 5 (relationships), respectively.

### Terms for the Set and the Individual

In modeling, we distinguish between the frame called "Customer" and one individual such as "customer Gildong Hong."

| Category | Set (plural, type) | Individual (singular, value) |
|------|-----------------|---------------|
| Thing | Entity Type, Entity | Entity Instance, Occurrence |
| Characteristic | Attribute | Attribute Value |
| Relationship | Relationship | Pairing |

```text
Entity : Customer
  ├─ Instance 1 : Customer ID C001, Customer name Gildong Hong
  └─ Instance 2 : Customer ID C002, Customer name Younghee Kim

Attribute       : Customer name
Attribute value : Gildong Hong, Younghee Kim
```

- Mapped to a table, an entity corresponds to a table, an instance to a row, an attribute to a column, and an attribute value to the value in a single cell.
- The individual unit of a relationship is called a **pairing**. "Gildong Hong placed order O1001" is one pairing of the customer-order relationship.

## ERD and the Drawing Order

An ERD (Entity Relationship Diagram) is a diagram that shows entities and relationships. It originated from the E-R model proposed by Peter Chen in 1976.

- Entities are drawn as rectangles, and relationship lines connect the entities.
- There are several notations. The ones used in practice are the IE (Information Engineering) notation and the Barker notation, which we compare on Day 5.

An ERD is usually drawn in the following order.

| Order | What you do |
|------|--------|
| 1 | Draw the **entities** |
| 2 | **Place** the entities appropriately |
| 3 | **Set up relationships** between entities |
| 4 | Write the **relationship names** |
| 5 | Specify the relationship's **participation** (cardinality) |
| 6 | Specify whether the relationship is **required** (optionality) |

- When placing entities, put the **important entity at the upper left**. This is because the human eye moves from the upper left to the lower right.
- For an online store, you would place Order, the center of the business, near the middle, with Customer and Product around it. The wording of placement rules varies a little from textbook to textbook, but the intent, "put the important things where they are easiest to read," is the same.

```text
  ┌──────────┐   places     ┌───────┐   contains   ┌────────────┐   refers to   ┌─────────┐
  │ Customer │ ──────────── │ Order │ ──────────── │ Order Item │ ───────────── │ Product │
  └──────────┘              └───────┘              └────────────┘               └─────────┘
```

## Elements of a Good Data Model

| Element | Meaning |
|------|-----|
| **Completeness** | All the data the business needs is defined in the model **without omission** |
| **Elimination of duplication** | Record the same fact **only once** |
| **Business rules** | Express rules such as "an order must have at least one product" in the model |
| **Data reuse** | Integrate data so it is not tied to a specific program and can be used across multiple business functions |
| **Communication** | Business users and developers can understand the business by looking at the model |
| **Integration** | The same data is **defined only once** across the whole organization and referenced from many places |

- Elimination of duplication and integration look similar. Elimination of duplication means not storing the same fact twice, while integration means defining the same data as one thing from the perspective of the whole organization.
- To increase data reuse, don't split data to fit a specific screen or program. The sign-up screen and the order screen look at the same customer data.

Tomorrow we'll cover how to divide modeling into three stages (conceptual, logical, physical) and the three-level schema, which views a database in three layers.

## 📖 Glossary

- **Abstraction** : Extracting only the commonalities from many real-world objects and grouping them into a single frame.
- **Clarification** : Removing ambiguity so something can be read in only one way.
- **Leverage** : The property that changing one model causes the programs and tables that depend on it to change one after another.
- **Inflexibility** : A state in which even a small change in the business requires major changes to the model.
- **Inconsistency** : A state in which related data hold values that do not match.
- **Instance (occurrence)** : Each individual set of values actually held in the frame called an entity. It corresponds to a row in a table.
- **Pairing** : A pair of instances participating in a relationship. A single connection such as "Gildong Hong - order O1001."
- **ERD** : A diagram that shows entities and relationships.

## 📝 Practice Questions

**Question 1.** Which of the following is the LEAST related to the characteristics of data modeling?

A) Abstraction  
B) Concretization  
C) Simplification  
D) Clarification  

**Answer: B**  
Explanation: The three characteristics of data modeling are abstraction, simplification, and clarification. Modeling extracts commonalities from complex real-world objects and expresses them simply and clearly, so concretization, which adds more detail, is not one of its characteristics.

---

**Question 2.** Which is the most appropriate statement about points to watch out for in data modeling?

A) It is desirable to store the same information in multiple entities to increase lookup paths.  
B) Tying data definitions to processes allows flexible response to business change.  
C) Data quality is managed only at the operations stage, not the modeling stage.  
D) If the relationships between data are not clearly defined, inconsistency can arise.  

**Answer: D**  
Explanation: Inconsistency is the problem of contradictory values arising because relationships between data were not defined. A is duplication, which is one of the cautions; for B, on the contrary, data definitions must be separated from processes to reduce inflexibility. In C, data quality is one of the reasons modeling matters, and it is managed from the modeling stage onward.

---

**Question 3.** Which correctly matches the three perspectives of data modeling with their descriptions?

A) Data perspective - analyzes what data the business is related to.  
B) Process perspective - analyzes the relationships between data.  
C) Interaction perspective - analyzes what the business actually does.  
D) Data perspective - analyzes how data is affected by the way the business is processed.  

**Answer: A**  
Explanation: The data perspective (What) looks at the data related to the business and the relationships between data, the process perspective (How) looks at what the business actually does, and the interaction perspective (Interaction) looks at how data is affected by the way the business is processed. B, C, and D swap the perspectives and descriptions.

---

**Question 4.** Which of the following correctly matches a component of a data model with the term for its individual unit?

A) Attribute - Pairing  
B) Entity - Attribute value  
C) Relationship - Pairing  
D) Entity - Domain  

**Answer: C**  
Explanation: The set-and-individual pairs are entity - instance (occurrence), attribute - attribute value, and relationship - pairing. A domain is the range of values an attribute can take and is not a term for an individual unit.

---

**Question 5.** If the data model is changed during system construction, the related programs and tables must also be changed, which is very costly. Which importance of data modeling relates to this phenomenon?

A) Leverage  
B) Conciseness  
C) Data Quality  
D) Integration  

**Answer: A**  
Explanation: The property by which a small change in the model spreads across programs and tables is Leverage. Conciseness is showing complex requirements concisely in a model, and data quality is preventing data duplication and inconsistency. Integration is an element of a good data model and is not one of the three reasons modeling matters.
