# Day 3 - Entities

## 📌 Key Takeaways

- An entity is a **collective thing** for storing and managing information that is needed and useful to the business. It becomes a candidate for a table.
- Six characteristics of an entity: needed by the business, **uniquely identified by an identifier**, **two or more instances**, used by business processes, **contains attributes**, and **has at least one relationship**.
- By tangibility, entities are divided into **tangible, conceptual, and event** entities.
- By time of occurrence, entities are divided into **basic (key), main, and transaction (action)** entities. For an online store, that is Customer/Product, then Order, then Order Item/Order History.
- Entity names should use **business terminology, as singular nouns**, and be **unique** within the model.

## What Becomes an Entity

The online store's planning meeting notes contain the sentence "When a customer orders the products in their cart, we pay and then ship." Pulling out the nouns gives customer, cart, product, order, payment, and shipment. These nouns are entity candidates. But not every noun becomes an entity. It must meet all of the characteristics below.

### Definition

- It is a **collective thing** (Thing) for **storing and managing** information that is needed and useful to the business.
- It is a **real thing** or a **concept** that is the target of business activity. A visible product and an invisible order can both be entities.
- An entity is a **set of instances**. The "Customer" entity holds instances such as C001 Gildong Hong and C002 Younghee Kim.

## Characteristics of an Entity

| Characteristic | Meaning | Example of what is not an entity |
|------|-----|---------------|
| **Information needed by the business** | It is information the business must manage | A set of "customer blood types," unrelated to the online store's business |
| **Identifiable by a unique identifier** | There is an identifier to tell each instance apart | A value like "number of visitors," with no way to distinguish items |
| **Two or more instances** | It is a **set** of persistently existing instances | Something with only one instance, such as company information |
| **Used by business processes** | Business processes create, read, update, or delete that entity | Something that was created and never used by any business process |
| **Contains attributes** | It has attributes that describe the entity | Something with no attributes other than a name |
| **At least one relationship** | It has at least one relationship with another entity | Something not connected to any entity |

- If there is **only one instance**, it is not a set, so it is not treated as an entity. If the online store company's own information (business name, business registration number) is just one record, you don't make it an entity.
- If there is an entity that no business process uses, that is a sign the business analysis is incomplete or the entity is unnecessary. It serves as a criterion for checking, during modeling, **whether a process has been left out**.
- An entity whose only attribute is the primary identifier is also not treated as an ordinary business entity. However, exceptions are sometimes allowed, as with code entities.

> ⚠️ The "at least one relationship" rule has exceptions. **Statistical entities, code entities, and internal entities for system processing** (such as transaction logs) are sometimes drawn without relationships. This is because a code entity is referenced by many entities, which would make the relationship lines excessive.

## Classification by Tangibility

| Classification | Meaning | Online store example | Textbook example |
|------|-----|----------|--------|
| **Tangible entity** | Has a physical form. Stable and used continuously | Customer, Product, Warehouse | Employee, Goods, Instructor |
| **Conceptual entity** | Has no physical form but is **conceptual information** that must be managed | Membership Tier, Product Category | Organization, Insurance Product |
| **Event entity** | **Occurs** while the business is being carried out. High volume, used as statistical data | Order, Payment, Shipment | Order, Billing, Delinquency |

- It is sometimes shortened to two kinds, "tangible/intangible," but the SQLD textbook's classification has three: **tangible, conceptual, and event**. The intangible ones are conceptual and event.
- Conceptual and event entities both have no form. The difference is **whether they occur during business operations**. The "Gold tier" is a concept that is set up in advance and used, while an "order" is an event that arises each time a customer acts.
- An insurance product looks tangible, but it is not a physical object, so it is classified as a conceptual entity. Don't assume something is tangible just because its name contains "product."

## Classification by Time of Occurrence

Classification by time of occurrence looks at "can it come into being on its own without other entities?"

| Classification | Meaning | Online store example |
|------|-----|----------|
| **Basic entity** (key entity) | Information that naturally exists in the business. It is created independently, **without depending on other entities**. It has its own primary identifier and acts as a parent of other entities | Customer, Product, Employee, Department |
| **Main entity** | Arises from basic entities and plays the **central role in the business**. Large data volume, and forms relationships with other entities to create transaction entities | Order, Payment |
| **Transaction entity** (action entity) | Arises from **two or more parent entities**. Its contents change often or its data volume keeps growing | Order Item, Order Change History |

```text
  Basic entity           Main entity             Transaction entity
  ┌──────────┐
  │ Customer │ ─────────▶ ┌───────┐
  └──────────┘            │ Order │ ──────────▶ ┌────────────┐
                          └───────┘             │ Order Item │
  ┌──────────┐                                  └────────────┘
  │ Product  │ ───────────────────────────────────────▲
  └──────────┘
```

- An order comes into being only when a customer exists. That is why Customer is a basic entity and Order is a main entity.
- An order item arises from **two parents**: the order and the product. That is why it is a transaction entity.
- Transaction entities don't show up easily in the early stages of analysis. They are often derived during the **detailed design stage or during process-and-data interaction modeling**.
- The primary identifier of a basic entity is **its own**, not inherited from a parent. A customer has its own customer ID.

### Looking at the Two Classifications Together

Summarizing where the same entity falls under each of the two criteria reduces confusion.

| Entity | Tangibility | Time of occurrence |
|--------|-------|----------|
| Customer | Tangible | Basic |
| Product | Tangible | Basic |
| Membership Tier | Conceptual | Basic |
| Order | Event | Main |
| Order Item | Event | Transaction |

- The two criteria are separate axes. They do not correspond one-to-one, as in "event entity = main entity."
- Membership Tier has no physical form, so it is a conceptual entity, and since it can be set up without other entities, it is also a basic entity.
- How a particular entity is classified can differ by textbook and example depending on how the business is defined. On the exam, judge by the definition sentences (created independently / arises from basic entities / two or more parents).

## Naming Entities

| Principle | Good example | Bad example |
|------|--------|--------|
| **Terms used in the business** | Order | PurchaseRequestTransaction |
| **Don't use abbreviations** | Order Item | OrdIt |
| **Singular noun** | Customer | Customers, CustomerList |
| **Unique name across all entities** | Shipment, Return Shipment | Shipment (used with different meanings in two places) |
| **Name it by what it creates** | Order Change History | History |

- The reason for using singular nouns is that an entity is already a set. Writing "Customers" reads like a set of sets.
- Names must be unique so there is no misunderstanding in communication. If the same "Shipment" means dispatch on one side and return pickup on the other, each person reading the model will interpret it differently.

Tomorrow we'll cover the types of attributes that fill an entity, and domains.

## 📖 Glossary

- **Entity** : A set for storing and managing information needed by the business. It becomes a table candidate.
- **Instance** : Each individual set of actual values held in an entity. One customer, Gildong Hong, in the Customer entity.
- **Identifier** : An attribute that tells the instances in an entity apart one by one. Something like a customer ID.
- **Event entity** : An entity that arises while the business is being carried out. Like orders and payments, it has high volume.
- **Basic entity (key entity)** : An entity created independently without other entities. It becomes a parent of other entities.
- **Main entity** : An entity that arises from basic entities and plays the central role in the business.
- **Transaction entity** : An entity that arises from two or more parent entities. Data keeps accumulating.
- **Code entity** : An entity that manages a list of values, like tiers or statuses. Relationships are sometimes omitted when drawing it.

## 📝 Practice Questions

**Question 1.** Which of the following is NOT an appropriate characteristic of an entity?

A) It must consist of exactly one instance.  
B) It must be identifiable by a unique identifier.  
C) It must be used by business processes.  
D) An entity must contain attributes.  

**Answer: A**  
Explanation: An entity is a set of persistently existing instances, so it must have two or more instances. With only one instance, it cannot be regarded as a set. B, C, and D are all characteristics of an entity.

---

**Question 2.** Which of the following is the most appropriate example of a main entity in the classification of entities by time of occurrence? (Based on online store business)

A) Customer  
B) Product  
C) Order  
D) Order Item  

**Answer: C**  
Explanation: An order arises from the basic entity Customer and plays the central role in the online store's business, so it is a main entity. Customer and Product are basic entities created independently, and Order Item is a transaction entity that arises from two parents, Order and Product.

---

**Question 3.** Which is the most appropriate statement about the classification of entities by tangibility?

A) A tangible entity occurs during business operations and has high volume.  
B) A conceptual entity has no physical form but is classified as conceptual information that must be managed.  
C) An event entity has a physical form and is stable and used continuously.  
D) An insurance product has a physical form, so it is a tangible entity.  

**Answer: B**  
Explanation: A conceptual entity has no form but is conceptual information to be managed (organization, insurance product). A describes an event entity, and C describes a tangible entity. An insurance product is not a physical object, so it is classified as a conceptual entity.

---

**Question 4.** Which entity arises from two or more parent entities, has contents that change often or a data volume that keeps growing, and is derived during the detailed design stage or during process-and-data interaction modeling?

A) Basic entity  
B) Conceptual entity  
C) Main entity  
D) Transaction entity  

**Answer: D**  
Explanation: Arising from two or more parents and having continuously growing data are characteristics of a transaction entity. A basic entity is created independently, and a main entity arises from basic entities and plays the central role in the business. A conceptual entity belongs to the tangibility classification, so it is not part of the time-of-occurrence classification.

---

**Question 5.** Which is the LEAST appropriate statement about entity naming rules?

A) Use terms used in the business whenever possible.  
B) Avoid abbreviations as much as possible.  
C) To show it is a set, name it in the plural, like "Customers."  
D) Give every entity a name that is unique across all entities.  

**Answer: C**  
Explanation: Entity names are singular nouns. An entity is already a set of instances, so there is no need to add a plural form. Using business terminology, avoiding abbreviations, and giving unique names are all naming principles.
