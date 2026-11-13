# Day 1 - Savings Plans and RI Strategy — The Math of Commitment Discounts, the Internals of Application Order, and Organization Sharing

A finance team looking at cloud costs for the first time always asks the same question: "Why are we paying 30% more than the company next door for the same servers?" The answer is usually not that the workload is inefficient, but that the company next door bought a **commitment**. AWS's On-Demand price is the premium charged for the freedom to "turn things on and off any time with no promises," and if you give up some of that freedom, AWS will cut up to 72% off. If you don't understand the essence of this deal, you will never solve the cost scenarios on the SAP-C02 exam.

In SAP-C02, Savings Plans and RIs are tested as architecture decisions such as "which commitment model should you choose," "the trade-off between Compute SP and EC2 Instance SP," "how does application priority work," and "how do you share and control commitments across an entire Organization." Today we break down the economics of commitment discounts, the internal behavior of the Billing engine's application order, and the pitfalls of multi-account sharing.

## The Essence of Commitment Discounts — Who Takes On Which Risk

If you understand commitment discounts simply as "use it for a long time and get a discount," you'll get stuck on the exam. A more accurate model is **risk transfer**. AWS has to buy physical servers and put them in data centers in advance — that is capital expenditure, and if customers don't use them, it's a pure loss. When a customer promises "I will definitely use $X worth per hour for 1 or 3 years," AWS's capacity planning risk and inventory risk shrink. In return, it gives a discount.

This view matters because it explains the discount differences among the three commitment models in one stroke. **The more specific the commitment (= the more it removes AWS's forecasting uncertainty), the bigger the discount.** EC2 Instance SP pins down "I will use this Region, this family," so AWS knows exactly which hardware to prepare → up to 72%. Compute SP is a loose promise of "$X per hour, whether EC2, Fargate, or Lambda, in any Region or family," so AWS's forecasting becomes harder → up to 66%. This 6 percentage point gap is the **flexibility premium**.

This structure follows exactly the same economics as a financial **forward contract**. One side takes on the risk of future price fluctuation in exchange for a fixed price. Spot Instances are the opposite extreme — AWS releases its spare capacity by auction (market price), and in exchange for the customer taking on all of the reclaim risk, it gives up to a 90% discount. In other words, AWS's cost model is a continuous spectrum of "who takes on how much risk": On-Demand (AWS takes on all of it, 0% discount) → Convertible RI → Compute SP → EC2 Instance SP / Standard RI (the customer takes on significant commitment risk, ~72%) → Spot (the customer takes on even reclaim risk, ~90%). The "flexibility vs. discount" trade-offs in exam scenarios are all about where on this spectrum to place the workload.

The discount differences among payment options (All/Partial/No Upfront) follow the same risk logic. All Upfront gives the biggest discount because AWS receives cash in advance (eliminating customer credit risk + the time value of money). For a 3-year m5.xlarge Standard RI, roughly: compared with On-Demand, All Upfront ~60%, Partial ~58%, No Upfront ~56% savings, so even within the same commitment, the payment method alone shifts the result by several percentage points. On the SAP exam, "maximum discount with no cash-flow constraints" is the signal for All Upfront, and "minimize upfront cash burden + commitment discount" is the signal for No Upfront.

## The Three Savings Plans — The Unit Is "Dollars per Hour"

The biggest reason people confuse SP with RI is that the **commitment unit** is different. An RI commits to instances, like "N m5.large instances." An SP commits to an **amount**, like "$10 per hour of compute." This difference makes SP far more flexible — even if you change instance types, as long as the hourly spend is at or below the committed amount, the discount is applied automatically.

| Type | Scope of application | Maximum discount | Commitment unit | Key characteristics |
|------|----------|----------|----------|----------|
| **Compute SP** | EC2 + Fargate + Lambda (regardless of Region, OS, family, tenancy) | ~66% | $/hour | Most flexible, freedom for workloads |
| **EC2 Instance SP** | Limited to a specific Region + specific family | ~72% | $/hour | Free to change size, OS, AZ within the same family |
| **SageMaker SP** | SageMaker Training, Inference, Notebook, Processing, etc. | ~64% | $/hour | Dedicated to ML workloads |

What makes EC2 Instance SP subtly powerful is that it is "fixed to the family but free within it." If you commit to the m5 family in us-east-1, all usage within that family — whether m5.large or m5.4xlarge, Linux or Windows, any AZ — is eligible for the discount. It is one step more flexible than Standard RI while getting the same ~72% discount.

SP's design of committing to an "amount" rather than "instances" is the same kind of thinking as the CS **abstraction layer**. An RI is a commitment directly coupled to a physical resource (the instance type), so when the resource changes, the commitment breaks. SP puts an abstract layer called "normalized hourly cost" on top of the resources so that the commitment matches whatever actual instances are underneath. Thanks to this, even if you modernize a workload from m5 to m6i, the SP commitment remains valid. It's a classic pattern in which abstraction lowers coupling and reduces the cost of change.

## The Two RI Types and Capacity Reservation — Discount and Capacity Are Separate

| Type | Discount | Range of changes | Capacity guarantee |
|------|------|--------------|----------|
| **Standard RI** | ~72% | Only some size changes (within the same family and normalization unit) | Only when Zonal |
| **Convertible RI** | ~54% | Family, OS, tenancy, and platform can change (exchange) | Only when Zonal |
| **Zonal RI** | ~72% | Fixed to a specific AZ | **Includes capacity reservation** |
| **Regional RI** | ~72% | AZ-flexible within the Region | No capacity guarantee |

The easy place to go wrong here is the **misconception that "RI = capacity guarantee."** A Regional-scope RI gives only a discount and does not guarantee capacity. To get a capacity guarantee as well, you need a **Zonal RI** (capacity reserved in a specific AZ) or an **On-Demand Capacity Reservation (ODCR)**. ODCR is a pure capacity reservation with no discount at all, and layering Savings Plans on top of it gives the standard combination that delivers "capacity guarantee + discount" at the same time.

The "exchange" of a Convertible RI is not a refund but a **reconstitution to equal or greater value**. To change an m5 Convertible RI to c5, the remaining commitment value must be at least the value of the new RI for the exchange to go through (you don't get money back). So Convertible is the tool for "when the family may change but you want to keep the commitment." That said, the modern best practice is "if you'd use a Convertible RI anyway, use Compute SP" — because Compute SP matches all families automatically without an exchange procedure and is far simpler to manage. On the exam, when both Convertible RI and Compute SP are among the choices and "operational simplicity" is emphasized, Compute SP is often the better answer.

(Hypothetical example) A media company, during its 2019 workload modernization, got stuck trying to migrate to m5/m6i while holding a large number of m4 family Standard RIs. Since a Standard RI can't change family, the m4 RIs increasingly sat idle, and the new m5 instances were billed On-Demand. In the end they sold the remaining m4 RIs on the Marketplace at a loss (cause: a commitment coupled to the family). The lesson was clear — committing to a 3-year Standard RI on a workload where modernization or technology change is expected is an anti-pattern, and if the same situation had been committed with Compute SP, the commitment would have stayed valid even as the family changed freely. After 2020, this company largely stopped RIs and shifted to a Compute SP-centered approach.

## Application Priority — How the Billing Engine Matches Discounts

To solve scenarios like "we bought RIs and our SP utilization dropped," you need to know the Billing engine's **application order**. AWS deducts discounts against each hour's usage in a fixed order.

```
Compute usage occurs each hour
   ↓
1. Zonal RI deduction (most specific — specific AZ and instance)
   ↓
2. Regional RI deduction (Standard → Convertible)
   ↓
3. Savings Plans deduction (EC2 Instance SP → Compute SP → SageMaker SP)
   - Within the same SP, usage with the highest discount rate is matched first (maximizing the benefit)
   ↓
4. On-Demand billing (the remaining usage)
```

The core principle is that **"the most specific and narrowest commitment is consumed first."** An RI is tied to a specific instance and can't be used elsewhere, so it is applied first, and SP, being more flexible, is applied later to prevent waste. Even within SP, it matches "usage with the highest discount rate first" to maximize the customer's benefit (for example, spending the hourly committed amount first on savings for the most expensive On-Demand usage).

> ⚠️ **Trap**: The scenario "we bought plenty of both RIs and SPs, but SP utilization isn't reaching 100%." The cause is that RIs absorbed the usage first, leaving too little usage for SP to match. If you buy too many RIs, they collide with SP and the SP sits idle. The right direction is "reduce RIs, or standardize new commitments on SP instead of RI." Suspecting "existing RIs are preempting usage" rather than "we need to bring more workloads under commitment because SP utilization is low" is professional-level thinking on the exam.

To reduce this conflict, AWS provides **Cost Explorer's Savings Plans / RI Recommendation**. This recommendation engine analyzes past 7/30/60-day usage (the lookback period) and calculates the hourly commitment amount that gives "maximum savings without waste." Internally, it is an optimization problem of finding the **baseline** (lower bound) of usage — if you commit even to spikes, the commitment sits idle during the quiet hours, and if you commit too little, you miss savings opportunities. That's why the recommendation usually comes out as committing only to the "steady, always-on baseline usage" and leaving the variable portion to On-Demand/Spot.

## Sharing at the Organization Level — Commitments Across Account Boundaries

In a multi-account environment (the usual premise of the SAP exam), commitment discounts are shared across account boundaries thanks to **Consolidated Billing**. If the committed amount of a Compute SP bought in account A isn't fully used in A, it is automatically applied to the usage of accounts B and C in the same Organization.

This sharing works only when **Sharing is enabled in the management account** (enabled by default). If you don't want a particular account's commitments shared with other accounts (for example, to separate costs by department), you can turn off RI/SP sharing for that account from the management account.

This sharing model delivers the same efficiency as **resource pooling** in distributed systems. If each account buys its own commitments, each account over-commits to fit its own spikes and idle commitments appear. Conversely, if you view the whole Organization as one pool, the leftover commitment while one account is quiet is absorbed by a busy account, raising overall utilization. Statistically, combining multiple workloads cancels out variability (the law of large numbers), so the larger the pool, the more tightly you can safely fit the commitment to the usage baseline. That's why for a large Org, the best practice is to **manage commitment purchasing centrally and in bulk (in the management account or a dedicated billing account)**.

> ⚠️ **Trap**: Choosing "each member account should buy its own SP" is almost always wrong on the Pro exam. Because commitments are shared across the whole Org, central consolidated purchasing is superior on both utilization and management. One more thing — RI/SP discount sharing and **volume tiering** are different concepts. Consolidated billing sums usage and also applies volume tier discounts, so splitting accounts apart is a loss. "Split accounts for cost separation but share the discounts" is the core of multi-account cost design.

## Summary

The core of Savings Plans and RIs is the economics of risk transfer: "commitment specificity and discount rate are proportional." Where you place the workload on the spectrum **Compute SP (maximum flexibility, ~66%) ↔ EC2 Instance SP / Standard RI (family fixed, ~72%) ↔ Spot (reclaim risk, ~90%)** is the backbone of every scenario. The Billing engine deducts in the order "from specific commitments (Zonal RI) to flexible commitments (Compute SP)," and the Organization shares commitments across accounts through consolidated billing.

SAP exam mapping: (1) "unified discount across EC2+Fargate+Lambda" → **Compute SP**, (2) "maximum discount for a specific family and Region over 3 years" → **EC2 Instance SP / Standard RI**, (3) "family change expected + keep the commitment" → **Convertible RI** (or the simpler Compute SP), (4) "capacity guarantee + discount" → **Zonal RI** or **ODCR + SP**, (5) "cash-flow headroom + maximum discount" → **All Upfront**, (6) "buy SPs per member account" → wrong answer (central consolidated purchasing and sharing), (7) "low SP utilization" → suspect RI over-commitment preempting usage. The next day covers Compute Optimizer and rightsizing.

---

## 📝 Practice Questions

**Question 1.** A company uses EC2, Fargate, and Lambda and frequently changes instance families depending on the workload. It wants to apply discounts as broadly as possible with a 1-year commitment. What is the most suitable choice?

A) Standard RI (m5 family)

B) EC2 Instance Savings Plans

C) Compute Savings Plans

D) Zonal RI

**Answer: C**
Explanation: Compute SP covers EC2, Fargate, and Lambda, and automatically applies the discount to usage within the hourly committed amount regardless of Region, OS, family, or tenancy. It fits a workload that frequently changes families exactly. A is tied to the family, so the commitment sits idle when the family changes, and it can't cover Fargate or Lambda. B is fixed to a specific Region and family, which conflicts with the requirement "frequently changes families." D is for reserving capacity in a specific AZ, not a unified discount across varied compute. Trap: "including Fargate and Lambda" is possible only with Compute SP.

---

**Question 2.** You plan to run the same m6i family in us-east-1 24 hours a day for 3 years and have no plans at all to change families. You want the maximum discount. What is the most suitable choice?

A) Compute Savings Plans

B) EC2 Instance Savings Plans (or Standard RI)

C) Convertible RI

D) On-Demand

**Answer: B**
Explanation: When the family and Region are fixed, EC2 Instance SP or Standard RI gives the largest discount at ~72%. EC2 Instance SP allows even size, OS, and AZ changes within the same family, so it is one step more flexible than Standard RI at the same discount. A (Compute SP) has a lower ~66% discount in exchange for flexibility. C (Convertible) buys freedom of change at the cost of the lowest ~54%, so it doesn't fit the requirement "no change plans + maximum discount." D is the list price. Trap: with "family fixed + maximum discount," there's no reason to buy flexibility, so pick the most specific commitment.

---

**Question 3.** An Organization runs 10 member accounts with consolidated billing. It wants to minimize total compute cost while maximizing commitment utilization. What is the most suitable commitment purchasing strategy?

A) Each member account buys SP individually to match its own usage

B) Purchase SP centrally in the management account (or a dedicated billing account) to match the baseline of Org-wide usage, with sharing enabled

C) Buy Standard RIs in each member account

D) Use only On-Demand and make no commitments

**Answer: B**
Explanation: In a consolidated billing environment, SP and RI discounts are shared across the whole Org when Sharing is enabled. Combining multiple workloads into one pool cancels out variability, so it is safe to commit more tightly to the usage baseline, and the leftover commitment while one account is quiet is absorbed by a busy account, raising utilization. A and C cause per-account over-commitment and idle commitments, lowering utilization. D gives up commitment discounts, contrary to the goal of minimizing cost. Trap: "buy individually per member account" is a typical wrong answer on the Pro exam.

---

**Question 4.** A mission-critical workload must secure capacity in a specific AZ (guaranteeing scale-out during an outage) and also wants a cost discount. What is the most suitable choice?

A) Regional Standard RI

B) Compute Savings Plans alone

C) Zonal RI, or ODCR + Savings Plans

D) Spot Instance

**Answer: C**
Explanation: If you need a capacity guarantee, the correct answer is Zonal RI (capacity reservation in a specific AZ + discount) or the combination of ODCR (pure capacity reservation, no discount) + SP (discount). A (Regional RI) gives only a discount and does not guarantee capacity. B (Compute SP) also gives only a discount with no capacity guarantee. D (Spot) can be reclaimed, which is the opposite of a mission-critical capacity guarantee. Trap: "Regional RI = capacity guarantee" is a common misconception; a capacity guarantee comes from Zonal RI or ODCR.

---

**Question 5.** A team holds m5 Standard RIs on a 3-year commitment, and the company has decided to modernize the workload to m6i. To avoid wasting the RIs while responding flexibly to future family changes, what should the new commitment be?

A) Buy additional m5 Standard RIs

B) Compute Savings Plans (or Convertible RI)

C) Zonal RI

D) Switch to On-Demand

**Answer: B**
Explanation: If a family change (m5→m6i) is expected, you need a commitment that isn't tied to the family. Compute SP matches automatically regardless of family, Region, and OS, so the commitment remains valid after modernization (Convertible RI is also possible through exchange, but the procedure is cumbersome, so Compute SP is operationally superior). A repeats the same trap, so the m5 RIs would sit idle again. C is for fixed-AZ capacity and has nothing to do with family flexibility. D gives up the discount. Trap: a family-coupled commitment (Standard RI) on a workload where modernization or technology change is expected is an anti-pattern.

---

**Question 6.** After the cost team newly bought a large amount of RIs and SPs at the same time, it found that SP utilization falls short of 100%. What is the most likely cause?

A) SP can't inherently reach 100% utilization

B) RIs absorbed (deducted against) the usage first, leaving too little usage for SP to match

C) Compute SP can't cover Fargate

D) SP isn't shared under consolidated billing

**Answer: B**
Explanation: The Billing engine applies "specific commitments (RI) first and flexible commitments (SP) later." If you buy too many RIs, they preempt each hour's usage and reduce the remaining usage SP can match, lowering SP utilization. The right direction is to reduce RIs or standardize new commitments on SP. A is wrong (100% is possible with an appropriate commitment). C is wrong (Compute SP includes Fargate). D is wrong (SP is shared under consolidated billing). Trap: for low SP utilization, first suspect "preemption by RI over-commitment," not "insufficient usage."

---

**Question 7.** A company wants to receive commitment-based discounts while minimizing upfront cash outlay. Which payment option is most suitable?

A) All Upfront

B) Partial Upfront

C) No Upfront

D) On-Demand with no commitment

**Answer: C**
Explanation: No Upfront gets the commitment discount while paying in monthly installments over the commitment term with no upfront payment. It fits the requirement to minimize the initial cash burden. A (All Upfront) has the biggest discount but the largest upfront cash outlay. B (Partial) is in between. D gets no discount at all. Trap: "minimize upfront cash + commitment discount" is No Upfront, and "cash-flow headroom + maximum discount" is All Upfront.
