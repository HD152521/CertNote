# Day 4 - Attributes

## 📌 Key Takeaways

- An attribute is the **smallest unit of data, no longer divisible in meaning**, that the business needs. It describes an entity and makes up an instance.
- An attribute holds only **one attribute value** per instance. If there are multiple values, split them out into a separate entity.
- By nature, attributes are divided into **basic, designed, and derived** attributes; by how they compose an entity, into **PK, FK, and regular** attributes.
- A **derived attribute** is a value computed from other attributes, so it easily harms consistency. Define as few as possible.
- A **domain** is the range of values an attribute can take (type, size, constraints).

## What Describes a Single Order?

To describe order O1001, you need the order number, order date, customer ID, shipping address, and payment amount. Each of these is an attribute. If an entity answers "what do we manage?", an attribute answers "what do we record about it?"

### Definition

- It is information the business needs.
- It is the smallest unit of data that is **no longer divisible in meaning**.
- It describes an entity and becomes a **component of an instance**.

The phrase "in meaning" is important. The order date `2026-11-03` can be split into year, month, and day as characters. But if the business uses the order date as a single meaning, it is one attribute that is not split.

## Relationships Among Entities, Instances, Attributes, and Attribute Values

| Relationship | Rule | Online store example |
|------|------|----------|
| Entity - Instance | An entity has **two or more instances** | The Order entity has O1001, O1002 ... |
| Entity - Attribute | An entity has **two or more attributes** | Order number, order date, payment amount ... |
| Attribute - Attribute value | An attribute has only **one attribute value** per instance | O1001 has exactly one payment amount: 35,000 |

```text
                  Order No.  Order Date   Customer ID  Payment Amt  ← Attributes
  Instance 1 →    O1001      2026-11-03   C001         35,000
  Instance 2 →    O1002      2026-11-03   C002         12,000
                                                       ↑ Attribute value
```

- The last rule is the **atomic value** principle. Only one value goes into a cell.
- If a customer has three contact numbers (home, mobile, work), you don't put all three into a single `contact` cell. Either split contacts out into a separate entity, or, if their meanings differ, split them into three attributes. This judgment leads into first normal form (Week 2).

## Classification by Nature

| Classification | Meaning | Online store example |
|------|-----|----------|
| **Basic attribute** | An attribute that **originally exists**, pulled directly from business analysis. The most common | Product name, product price, order date, order quantity |
| **Designed attribute** | An attribute that **does not originally exist** in the business but was **newly created during design**. Codes and serial numbers fall here | Order status code, order item serial number |
| **Derived attribute** | An attribute obtained by **calculating or transforming** other attributes | Order total (sum of quantity × unit price), customer cumulative purchase amount |

- Designed attributes are created "to express business rules simply." Defining "preparing for shipment, shipping, delivered" as codes `10, 20, 30` makes it a designed attribute.
- Even if it looks like a basic attribute, if it was redefined as a code or assigned by the system like a serial number, it is treated as a designed attribute.

### Why Be Careful with Derived Attributes

```text
[Order Item]
  Order No.  Product   Qty  Unit Price
  O1001      Pen       2    1,000
  O1001      Notebook  1    3,000
                 │  2 × 1,000 + 1 × 3,000
                 ▼
[Order]
  Order No.  Order Total (derived)
  O1001      5,000
```

- The order total is the sum of `quantity × unit price` from the order items. If you change an order item's quantity to 3 without also updating the order total, the two values no longer match.
- That is why derived attributes easily harm **data integrity**. Define them only when truly necessary, and once defined, set up rules so they are updated whenever the source attributes change.
- Deliberately keeping a derived attribute for query performance is a form of denormalization.

> ⚠️ The principle is to define derived attributes "as **few** as possible." An answer choice saying "define as many as possible for performance" is a wrong statement. The more computed values you store, the more places there are where you can forget to update.

## Classification by How They Compose an Entity

| Classification | Meaning | Order entity example |
|------|-----|--------------|
| **PK attribute** (Primary Key) | An attribute that can **identify** an entity's instances | Order number |
| **FK attribute** (Foreign Key) | An attribute included because of a **relationship** with another entity | Customer ID (comes from the Customer entity) |
| **Regular attribute** | All the remaining attributes that are neither PK nor FK | Order date, shipping address, payment amount |

- The same customer ID is a PK attribute in the Customer entity and an FK attribute in the Order entity. The classification depends on **which entity you are looking at it from**.
- The detailed classification of PKs, FKs, and identifiers is covered in Week 2 Day 1.

## Classification by Composition and Number of Values

Depending on the textbook, this classification is explained along two axes. The names are similar, so we organize them together.

| Criterion | Classification | Meaning | Online store example |
|------|------|-----|----------|
| Can it be split? | **Simple (single) attribute** | Cannot be divided into smaller units | Order quantity, product price |
| | **Composite attribute** | Can be divided into multiple units of meaning | Address (city, district, neighborhood, detailed address), customer name (first name, last name) |
| How many values? | **Single-valued attribute** | One value per instance | Date of birth |
| | **Multi-valued attribute** | May have multiple values per instance | A customer's multiple shipping addresses, a product's multiple colors |

- Whether to split a composite attribute is decided by **whether the business uses that part separately**. If you produce shipping statistics by district, you split the address into city, district, and neighborhood.
- Since you can't put multiple values into one cell, a multi-valued attribute is split off into a **separate entity** in the relational model. A customer's multiple shipping addresses become a "Customer Shipping Address" entity.
- Some textbooks bundle these in a single line as "single attribute / composite attribute / multi-valued attribute." More than the terms, the criteria for judgment are distinguishing "can it be split?" from "are there multiple values?"

## Domain

A domain is **the range of values each attribute can take**.

| Attribute | Domain example |
|------|----------|
| Order quantity | An integer from 1 to 999 |
| Order status code | One of `10`, `20`, `30`, `40` |
| Customer name | A string of up to 50 characters, NULL not allowed |
| Order date | Date type |

- A domain includes the **data type, size, and constraints** together.
- In a physical model, it is implemented as the column's type (`NUMBER`, `VARCHAR2(50)`) and `CHECK` and `NOT NULL` constraints.
- Multiple attributes can share the same domain. Order date, shipping date, and payment date all use the "date" domain. Defining a domain once prevents the problem of types differing from attribute to attribute.

## Naming Attributes

| Principle | Good example | Bad example |
|------|--------|--------|
| **Names used in the business** | PaymentAmount | PayAmtVal |
| **Don't use descriptive names** | OrderDate | TheDateTheCustomerOrdered |
| **Limit abbreviations** | ShippingAddress | ShAddr |
| **Unique names across the whole model recommended** | OrderDate, ShipDate | Date, Date |

- Attribute names are written as **noun forms**. Avoid descriptive forms with modifiers or possessives attached.
- Unique names are "recommended." If different entities have the same name `Date`, it becomes confusing which is which in SQL join results, and they also collide when columns are merged through denormalization.

Tomorrow we'll look at relationships that connect entities, and their notations.

## 📖 Glossary

- **Attribute** : A unit of data that describes an entity and cannot be divided further in meaning. A candidate for a table column.
- **Attribute value** : The actual value an attribute holds in one instance. Only one goes in a cell.
- **Designed attribute** : An attribute that doesn't originally exist in the business but is newly created during design, like a code or serial number.
- **Derived attribute** : An attribute obtained by calculating or transforming other attributes. Things like sums and totals.
- **Composite attribute** : An attribute that can be divided into smaller units of meaning, like an address.
- **Multi-valued attribute** : An attribute for which one instance can have multiple values. It is split off into a separate entity.
- **Domain** : The range of values an attribute can take. Includes type, size, and constraints.
- **Integrity (consistency)** : The state in which related data match up without contradicting each other.

## 📝 Practice Questions

**Question 1.** Which is the LEAST appropriate statement about attributes?

A) It is information the business needs.  
B) It is the smallest unit of data that is no longer divisible in meaning.  
C) It describes an entity and becomes a component of an instance.  
D) In one instance, a single attribute can have multiple attribute values.  

**Answer: D**  
Explanation: An attribute holds only one attribute value per instance. If there are multiple values, they must be split into a separate entity. A, B, and C are the definition of an attribute.

---

**Question 2.** In the online store's Order entity, which attribute classification by nature does "the order total, computed by multiplying each order item's quantity and unit price and summing them" fall under?

A) Basic attribute  
B) Derived attribute  
C) Designed attribute  
D) FK attribute  

**Answer: B**  
Explanation: It is a value obtained by calculating other attributes, so it is a derived attribute. A basic attribute is one that originally exists, pulled directly from the business, and a designed attribute is one created during the design process, like a code or serial number. An FK attribute is a classification based on how an entity is composed, not on nature.

---

**Question 3.** Which of the following is the most appropriate statement about a domain?

A) It is the range of values each attribute can take, and includes data type, size, and constraints.  
B) It means the logical association between entities.  
C) It is an attribute that uniquely distinguishes instances within an entity.  
D) It is an attribute created by calculation from other attributes.  

**Answer: A**  
Explanation: A domain is the range of values an attribute can take. B describes a relationship, C describes an identifier (PK), and D describes a derived attribute.

---

**Question 4.** Which is the most appropriate statement about derived attributes?

A) They are extracted directly in the business analysis stage and account for the largest share of the model.  
B) The principle is to define as many as possible for data query performance.  
C) If they are not updated when the source attributes change, data integrity can be broken.  
D) They are code-type attributes created to express business rules simply.  

**Answer: C**  
Explanation: A derived attribute must change whenever the source data changes, so if an update is missed, the values no longer match. That is why you define as few as possible. A describes basic attributes, and D describes designed attributes.

---

**Question 5.** When a single customer can register multiple shipping addresses, which is the most appropriate way to express this in a relational data model?

A) Store multiple addresses joined by commas in a single shipping-address attribute of the Customer entity.  
B) Split the shipping address into a separate entity and establish a relationship with Customer.  
C) Define the shipping address as a derived attribute.  
D) Designate the shipping address as the customer's PK attribute.  

**Answer: B**  
Explanation: A shipping address is a multi-valued attribute, so instead of putting multiple values in one cell, it is split off into a separate entity (Customer Shipping Address). A violates the principle that an attribute holds only one value. A shipping address is not a value obtained by calculation, so it is not a derived attribute, and since there can be several, it cannot be a PK that uniquely identifies the customer.
