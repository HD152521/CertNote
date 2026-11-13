# Day 3 - Denormalization

## 📌 Key Takeaways

- Denormalization is a technique that **deliberately allows redundancy** in a normalized model for **query performance** or development convenience.
- The price is a risk to **data integrity**. If redundant values are not fixed together, inconsistency arises.
- The procedure is **investigate targets → review other methods → apply denormalization**, in that order. If indexes, views, or clustering can solve it, do not denormalize.
- Techniques fall into three branches: tables (merge, split, add), columns (redundant, derived, history, etc.), and relationships (add a redundant relationship).
- A horizontal split divides by **rows**, and a vertical split divides by **columns**.

## When Denormalization Is Needed

Yesterday we split EMP and DEPT to eliminate redundant department names. But if every employee list screen has to show the department name, a join is needed each time. When that join actually becomes a performance bottleneck, we consider denormalization.

- Denormalization is also called **reverse normalization**.
- The purpose is performance. You reduce the number of joins, precompute large aggregations, or split a big table to match its access range.
- It is not skipping normalization. It is the work of **finishing normalization first** and then reverting only where needed.

## Denormalization Procedure

| Step | What you do | Details |
|------|--------|------|
| ① **Investigate denormalization targets** | Find out whether there is really a performance problem | Check range-processing frequency, large range processing, statistical processes, and the number of table joins |
| ② **Review other ways to resolve it** | First see whether it can be solved without redundancy | Use a **view**, apply **clustering**, tune **indexes**, handle it in the application |
| ③ **Apply denormalization** | Apply it if nothing else works | Table, column, and relationship denormalization |

- If the order comes up as a question, it is "investigate → review alternatives → apply." Choices that put applying first are wrong.
- The alternatives in step ② do not create redundancy in the model. That is why they are reviewed before denormalization.
- Some textbooks also list partitioning, which divides large data by rows, as an alternative in step ②.

## Table Denormalization

| Category | Technique | When |
|------|------|------|
| **Merge** | Merge 1:1 relationship tables | When two tables in a 1:1 relationship are always queried together |
| | Merge 1:M relationship tables | When you combine the 1-side information into the M-side to eliminate a join |
| | Merge supertype/subtype tables | When the supertype and subtype are always viewed together |
| **Split** | **Vertical split** | When only some of the columns are queried intensively. Divides by **columns** |
| | **Horizontal split** | When rows are queried only by a certain range (month, region). Divides by **rows** |
| **Add** | Add a redundant table | When you replicate a table from another business area or server |
| | Add a statistics table | When you precompute aggregations such as SUM and AVG |
| | Add a history table | When you duplicate records from the master table into a history table |
| | Add a partial table | When you keep a separate table holding only the columns that get heavy use |

### The Two Kinds of Split in a Picture

```text
Original order table (many columns, many rows)

[Vertical split - cut by columns]      [Horizontal split - cut by rows]
┌──────────┬──────────────┐            ┌──────────────────────┐
│ OrderNo  │ OrderNo       │            │ 2026-01 order rows    │
│ OrderDate│ DeliveryMemo  │            ├──────────────────────┤
│ Amount   │ PackingRequest│            │ 2026-02 order rows    │
│ (often   │ (long columns │            ├──────────────────────┤
│  viewed) │  seldom seen) │            │ 2026-03 order rows    │
└──────────┴──────────────┘            └──────────────────────┘
 Two 1:1 tables with the same PK         Same structure, only row ranges differ
```

- With a vertical split, the two tables share the same primary identifier and form a **1:1 relationship**.
- A horizontal split is often implemented with database **partitioning**.

> ⚠️ **Trap**: It is easy to mix up the directions of "horizontal" and "vertical." Think of cutting a table with a knife. Drawing a horizontal line separates rows, which is a **horizontal split**; drawing a vertical line separates columns, which is a **vertical split**.

### Statistics Table - Aggregations Computed in Advance

Several screens show the headcount and salary total per department. Instead of running the query below every time, you can store the result in a statistics table.

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

- With 14 rows in EMP, this query is light. Denormalization is needed when the source data is so large that the aggregation is actually slow.
- A statistics table must be **updated whenever the source changes**. When one employee is hired, both EMP and the statistics table must be fixed.
- The `SAL_SUM` for department 40 is blank because there are no employees, so the sum is NULL. NULL and aggregation are covered on Day 5.

## Column Denormalization

| Technique | Description | Example |
|------|------|-----|
| **Add a redundant column** | Copy a column from another table to reduce joins | Store `DNAME` in EMP as well |
| **Add a derived column** | Store a calculation result in advance | "Total order amount" on Order, "headcount" on Department |
| **Add a history-table column** | Put function columns such as latest flag, start date, and end date in a history table | A `LatestFlag` column in the salary history |
| **Add a column based on the PK** | Keep a meaningful value inside a composite PK also as a separate regular column | Keep a date that is part of the PK as a separate column for lookups |
| **Add a column for application malfunction** | Keep the previous value so you can roll back if processing goes wrong | A `PreviousAddress` column |

- A redundant column aims at **fewer joins**, and a derived column aims at **fewer calculations**. Even though both are "adding a column," their purposes differ.
- The risk of a derived column is the source and the result drifting apart. If an employee moves departments and the "headcount" is not updated, the value becomes wrong.

## Relationship Denormalization

This is a method of leaving tables and columns as they are and **adding just one more relationship**.

```text
Normalized state                    After adding a redundant relationship

Customer ──< Order ──< Order Item   Customer ──< Order ──< Order Item
                                     │                  ▲
                                     └──────────────────┘
                                     (put CustomerNo directly in Order Item)
```

- To see customer information from Order Item, you originally have to go through Order. Putting the customer number directly in Order Item as an FK **shortens the join path**.
- Textbooks call this **adding a redundant relationship**. Like table and column denormalization, it can harm integrity.

## The Price of Denormalization

| What you gain | What you lose |
|--------|--------|
| **Better query performance** from fewer joins and aggregations | **Risk of damaging integrity**, since redundant values must be fixed together |
| SQL becomes simpler | More places to handle on insert, update, and delete, so **DML performance can drop** |
| | Storage space increases |

- Triggers, application logic, and batch updates are used to keep redundant values in sync.
- In conclusion, denormalization is the last step, used "when queries overwhelmingly dominate and nothing else solves it."

> Tomorrow we cover how relationships turn into SQL join conditions, and how to express transaction units in the model.

## 📖 Glossary

- **Denormalization**: A technique that intentionally allows redundancy in a normalized model for performance. Also called reverse normalization.
- **Integrity**: A state where data is accurate and free of contradictions. Denormalization can break it.
- **Vertical split**: Dividing a table by columns. The resulting tables have a 1:1 relationship.
- **Horizontal split**: Dividing a table by rows. Often implemented with partitioning.
- **Statistics table**: A table that stores precomputed aggregation results.
- **Derived column**: A column that stores in advance a value that could be calculated from other columns.
- **Redundant relationship**: A relationship added between entities that are already connected through another path, to shorten the join path.
- **Clustering**: A method of physically storing data that is often read together close to each other. Something to consider before denormalizing.

## 📝 Practice Questions

**Question 1.** Which lists the denormalization procedure in the correct order?

A) Investigate denormalization targets → Review other ways to resolve it → Apply denormalization  
B) Review other ways to resolve it → Investigate denormalization targets → Apply denormalization  
C) Apply denormalization → Investigate denormalization targets → Review other ways to resolve it  
D) Investigate denormalization targets → Apply denormalization → Review other ways to resolve it  

**Answer: A**  
Explanation: First, find the targets by investigating range-processing frequency, large-volume processing, statistical processes, and the number of joins. Next, review alternatives such as views, clustering, index tuning, and application handling, and apply denormalization only if the problem is still not solved.

---

**Question 2.** Which of the following is NOT one of the "other ways" reviewed before applying denormalization?

A) Using a view  
B) Tuning indexes  
C) Adding a redundant column  
D) Applying clustering  

**Answer: C**  
Explanation: Views, clustering, index tuning, and application handling are alternatives that do not create redundancy in the model. Adding a redundant column is itself a column denormalization technique, so it is not an alternative.

---

**Question 3.** The order table is very large and is queried only by month. To match this, the table was divided into monthly row ranges with the same structure. What is this technique?

A) Vertical split  
B) Horizontal split  
C) Merging 1:1 relationship tables  
D) Adding a partial table  

**Answer: B**  
Explanation: Dividing rows by range while leaving the column structure untouched is a horizontal split. A vertical split divides by columns and creates 1:1 tables that share the same primary identifier.

---

**Question 4.** Which of the following is NOT a column denormalization technique?

A) Add a redundant column  
B) Add a derived column  
C) Add a history-table column  
D) Add a statistics table  

**Answer: D**  
Explanation: Adding a statistics table belongs to "adding a table" under table denormalization. Column denormalization includes adding a redundant column, a derived column, a history-table column, a column based on the PK, and a column for application malfunction.

---

**Question 5.** Which of the following statements about denormalization is LEAST appropriate?

A) It allows redundancy to improve query performance  
B) Denormalization strengthens data integrity  
C) It is applied to a model that has finished normalization  
D) Triggers or application logic can be used to keep redundant values in sync  

**Answer: B**  
Explanation: Denormalization increases redundancy, so inconsistency arises unless the values in several places are fixed together. Integrity is not strengthened; the risk of damaging it grows. The gain in return is query performance.
