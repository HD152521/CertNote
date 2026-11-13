# Day 5 - Relationships

## 📌 Key Takeaways

- A relationship is a logical association between instances of entities, formed through **existence or action**. A single individual connection is called a **pairing**.
- Relationships are divided into **relationships by existence** (a product belongs to a category) and **relationships by action** (a customer places an order). An ERD does not distinguish the two, while UML distinguishes them as association and dependency.
- The three elements of relationship notation: **relationship name, cardinality (1:1, 1:M, M:N), and optionality (mandatory/optional)**.
- Reading order for a relationship: **base entity (each) → number of target entities → optionality (always/sometimes) → relationship name**.
- The **IE** notation draws relationships with crow's feet, circles, and bars; the **Barker** notation draws them with crow's feet and solid/dashed lines.

## A Sentence Packed into a Single Line

In an ERD, a single line is drawn between Customer and Order. That line carries three pieces of information at once: "a customer places orders," "one customer can place many orders," and "there are customers who have not placed any order." Reading a relationship means pulling that information out of the shape of the line.

### Definition

- It is a logical association **between instances** of entities.
- It refers to a state in which an association is given to each other in the form of existence or action.
- A relationship is drawn between entities, but what is actually connected are instances. The single connection "customer C001 placed order O1001" is a **pairing**.
- Instances within an entity can each form different pairings. C001 may have three orders while C002 has none. The set of these pairings is bundled together and expressed as a relationship.

## Relationships by Existence and Relationships by Action

| Classification | Meaning | Online store example | Textbook example |
|------|-----|----------|--------|
| **Relationship by existence** | One entity is connected to another entity **by its very existence**. The relationship holds even without any action | A product **belongs to** a product category | An employee **belongs to** a department |
| **Relationship by action** | The relationship arises only when one entity **performs some action** | A customer **places** an order | A customer **places** an order |

- From the moment a product is registered, it belongs to some category. It is not a relationship that arose because something was done.
- The relationship between a customer and an order arises when the customer performs the action of ordering. A customer who has only signed up and not ordered has no pairing in this relationship.

### Difference Between ERD and UML

| Notation | Existence relationship | Action relationship |
|------|----------|----------|
| ERD | Not distinguished (same relationship line) | Not distinguished (same relationship line) |
| UML class diagram | **Association** — solid line | **Dependency** — dashed line |

- An association is a relationship in which a class **references another class as a member variable**, and a dependency is a relationship in which a class uses the other class **only when performing an action (method)**.
- In an ERD, solid and dashed lines can mean identifying/non-identifying relationships or optionality. This differs from the meaning of solid and dashed lines in UML.

## The Three Elements of Relationship Notation

| Element | English | Question it asks |
|------|------|----------|
| **Relationship name** | Membership | **What kind of relationship** do the two entities have? |
| **Cardinality** | Cardinality | With **how many** instances on the other side is one instance connected? |
| **Optionality** | Optionality | Does it **necessarily** participate in the relationship, or **optionally**? |

### Relationship Name

- A relationship gets two names. They are the names seen from the side where the relationship begins (The Beginning) and the side where it ends (The End).
- The Customer → Order direction is "places," and the Order → Customer direction is "is placed by" (or "is requested by"); each perspective is named separately.

| Naming rule | Good example | Bad example |
|----------|--------|--------|
| **Avoid vague verbs** | places, contains, belongs to | is related to, has to do with, is, does |
| **Use the present tense** | places | placed, will place |

### Cardinality

| Cardinality | Meaning | Online store example |
|------|-----|----------|
| **1:1** | One instance is connected to only **one** instance on the other side | Order - Payment (if the business allows only one payment per order) |
| **1:M** | One instance is connected to **many** instances on the other side | Customer - Order |
| **M:N** | Both sides are connected to many instances on the other side | Order - Product |

- Cardinality is determined by **business rules**. For an online store that allows split payments, Order - Payment becomes 1:M.
- A relational database cannot implement M:N directly. So an **intersection entity** (associative entity) is placed between the two to resolve it into two 1:M relationships.

```text
  Leaving M:N as is               Resolved with an intersection entity

  ┌───────┐  M     N ┌─────────┐     ┌───────┐ 1   M ┌────────────┐ M   1 ┌─────────┐
  │ Order │ ──────── │ Product │     │ Order │ ───── │ Order Item │ ───── │ Product │
  └───────┘          └─────────┘     └───────┘       └────────────┘       └─────────┘
                                                     Order No. (FK)
                                                     Product No. (FK)
                                                     Order Quantity
```

- Order Item is the **transaction entity** we saw on Day 3. It arises from two parents (Order and Product) and has its own attributes such as order quantity.

### Optionality

| Specification | Meaning | Online store example |
|------|-----|----------|
| **Mandatory participation** | Every instance **necessarily** participates in the relationship | Every order **necessarily** has a customer who placed it |
| **Optional participation** | There **may be** instances that do **not** participate in the relationship | There **may be** customers who have never placed an order |

- The two sides of one relationship can have different optionality. The Customer side is optional, and the Order side is mandatory.
- Getting optionality wrong changes the business rule. If you draw the Customer side as mandatory, it becomes the rule "you must place an order to sign up."

## How to Read a Relationship

A relationship is read in a fixed order.

| Order | What you read | Expression |
|------|-----------|------|
| 1 | **Base entity** | "Each ~" or "One ~" |
| 2 | **Number of target entities** (cardinality) | "one," "one or more (many)" |
| 3 | **Optionality** | "always" if mandatory, "sometimes" if optional |
| 4 | **Relationship name** | "places," "belongs to" |

Reading the Customer - Order relationship (Customer side optional, Order side mandatory, 1:M) from both sides gives the following.

```text
  Each Customer      sometimes   places       many orders.
  (base entity)      (optional)  (rel. name)  (number)

  Each Order         is always   placed by    one customer.
  (base entity)      (mandatory) (rel. name)  (number)
```

- The base entity is always read as "each" one. The number is the number on the **opposite side**.
- Even for the same line, the sentence differs depending on which side you read from. When a question asks "which correctly reads the following relationship," check both directions.

### What to Check When Defining a Relationship

- Is there an **association rule of interest** between the two entities?
- Does a **combination of information** occur between the two entities?
- Does the business description or document state a **rule about connecting the relationship**?
- Does the business description or document contain a **verb** that makes the relationship connection possible?

The business sentence "a customer puts a product in the cart" has the verb "puts." It serves as grounds for considering a relationship between Customer and Product (or an intersection entity called Cart).

## IE Notation and Barker Notation

Both notations show cardinality and optionality through the shape of the line ends. The direction in which the symbols are read differs, which makes them easy to confuse.

| Item | IE (Information Engineering) | Barker |
|------|------------------------------|--------|
| Many (M) | **Crow's foot** at the line end | **Crow's foot** at the line end |
| One (1) | Short bar at the line end, no crow's foot | No crow's foot |
| Mandatory | Short bar | **Solid line** |
| Optional | Circle `O` | **Dashed line** |
| Entity shape | Rectangle (top compartment identifier, bottom compartment regular attributes) | Rectangle with rounded corners |
| Attribute marking | Separated by compartments | `#` identifier, `*` mandatory, `o` optional |

```text
 IE notation (Customer 1 — Order 0..M)

  ┌──────────┐                ┌───────┐
  │ Customer │ ┼────────────O< │ Order │
  └──────────┘                └───────┘
     ┼ : Customer as seen from the Order side = one, mandatory
    O< : Order as seen from the Customer side = many, optional

 Barker notation (same relationship)

  ╭──────────╮                ╭───────╮
  │ Customer │ - - - -───────< │ Order │
  ╰──────────╯                ╰───────╯
   Customer-side half dashed : Customer is optional participation
   Order-side half solid     : Order is mandatory participation
   Crow's foot on Order side : One customer, many orders
```

- In IE, the optionality symbol (circle or bar) is attached to the **opposite end**. The `O` at the Order end means "a customer may have no orders."
- In Barker, optionality is shown by the line shape of **your own side's half**. If the Customer-side half is dashed, the customer is an optional participant.

> ⚠️ The positions of the optionality symbols look reversed between the two notations. IE's `O` is drawn at the **target entity's** end, and Barker's dashed line is drawn on the **base entity's** half. For diagram questions, first check which end the symbol is on.

- Identifying and non-identifying relationships (solid and dashed lines in IE) are covered in Week 2 Day 1 on identifiers.

Next week we move on to identifiers and normalization to see how to refine a model.

## 📖 Glossary

- **Relationship** : A logical association formed between instances of entities.
- **Pairing** : A single connection of a pair of instances participating in a relationship.
- **Cardinality** : With how many instances of the other entity one instance is connected. 1:1, 1:M, M:N.
- **Optionality** : Whether an instance must participate in the relationship (mandatory) or may not participate (optional).
- **Intersection entity** : An entity placed in between to resolve an M:N relationship into two 1:M relationships. Something like Order Item.
- **Association / dependency** : The names UML uses for the relationship by existence and the relationship by action.
- **IE notation** : A notation that draws relationships with crow's feet, circles, and bars.
- **Barker notation** : A notation that draws relationships with crow's feet and solid/dashed lines, and prefixes attributes with `#`, `*`, and `o`.

## 📝 Practice Questions

**Question 1.** Which is the LEAST appropriate statement about relationships?

A) A relationship is a logical association between instances of entities.  
B) The connection of one pair of instances participating in a relationship is called a pairing.  
C) In an ERD, relationships by existence and relationships by action are distinguished with different lines.  
D) In a UML class diagram, association and dependency relationships are shown distinctly.  

**Answer: C**  
Explanation: An ERD does not distinguish relationships by existence from relationships by action and draws them with the same relationship line. It is the UML class diagram that distinguishes them with a solid line (association) and a dashed line (dependency). A, B, and D are correct statements.

---

**Question 2.** Which of the following is the LEAST related to the concepts used when notating a relationship?

A) Relationship domain  
B) Relationship name  
C) Cardinality  
D) Optionality  

**Answer: A**  
Explanation: The three elements of relationship notation are the relationship name (Membership), cardinality (Cardinality), and optionality (Optionality). A domain is the range of values an attribute can take, and is not an element of relationship notation.

---

**Question 3.** In an online store, one order can contain multiple products, and one product can be included in multiple orders. Which is the most appropriate way to implement this in a relational database?

A) Add multiple product-number attributes to the Order entity.  
B) Add a single order-number attribute to the Product entity and store the values joined by commas.  
C) Merge Order and Product into a single entity.  
D) Place an Order Item entity between Order and Product to resolve it into two 1:M relationships.  

**Answer: D**  
Explanation: Order and Product are in an M:N relationship, and a relational database cannot express this directly, so an intersection entity (Order Item) is placed between them to resolve it into two 1:M relationships. A is an inflexible structure in which attributes grow with the number of products, and B violates the principle that an attribute holds only one value. C mixes different entities and creates duplication.

---

**Question 4.** In the relationship between Customer and Order, the Customer side is optional participation, the Order side is mandatory participation, and the cardinality is 1:M. Which correctly reads the relationship from the Order's perspective?

A) Each order is sometimes placed by many customers.  
B) Each order is always placed by one customer.  
C) Each order is sometimes placed by one customer.  
D) Each order is always placed by many customers.  

**Answer: B**  
Explanation: Reading from Order as the base, the number of target customers is one, and since the Order side is mandatory participation, it is read as "always." A and D misread the number of customers as many, and C misread mandatory participation as "sometimes."

---

**Question 5.** Which is the most appropriate principle for naming a relationship?

A) Avoid vague verbs such as "is related to" and "has to do with."  
B) Since the relationship has already happened, write it in the past tense, like "placed."  
C) Attach only one relationship name, from one side's perspective, to each relationship.  
D) Write the cardinality as a number in place of the relationship name.  

**Answer: A**  
Explanation: Relationship names avoid vague verbs and are written in the present tense. A relationship gets a name from each of two perspectives, the start and the end, so C is wrong. Cardinality is a notation element separate from the relationship name, so D is also wrong.
