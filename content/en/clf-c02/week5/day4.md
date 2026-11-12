# Day 4 - Billing Structure: Pay for Many Accounts as One, and Gauge Costs in Advance

## 📌 Key Takeaways

- **AWS Organizations** = **a company org chart**. A **governance** tool that groups many accounts into OUs and applies guardrails across them with SCPs.
- **Consolidated billing** = **a family bundle plan**. It merges the bills of many accounts into one for the management account, **growing discounts and simplifying accounting**.
- The relationship: Organizations is the big container, and consolidated billing is **one benefit** inside it.
- **Pricing Calculator** = **a moving quote**. It calculates the expected cost of a configuration you have not used yet, **in advance** (before).
- **TCO (total cost of ownership)** = **not the car price, but the upkeep too**. It adds up hidden costs such as power, cooling, and staff to compare on-premises with the cloud.

As an organization grows, one account is no longer enough. It is common to split accounts by team, by environment, and by project. Then billing and governance get complicated. Today we sort out **AWS Organizations and consolidated billing**, which group multiple accounts for management and payment; the **Pricing Calculator**, which calculates costs in advance before moving to the cloud; and the **TCO concept**, which compares total cost of ownership against on-premises.

There are two core questions: "How do we govern the costs and permissions of many accounts from one place?" and "How do we gauge costs before using anything?"

## But Why Split into Multiple Accounts?

The first question beginners have is this: **"Wouldn't it be easier to use everything in one account? Why bother splitting?"**

Starting with one account is natural. The problem arises as the number of people grows. If development servers and servers used by real customers sit side by side in one account, an accident can happen at any time in which someone tidying up resources **deletes the production database along with them**. You can guard against it with permission settings, but putting a partition in the same room and splitting the room entirely are different levels of safety.

There are broadly three reasons to split accounts.

1. **It confines the blast radius**: whatever happens in the development account does not reach the production account. That holds for mistakes and for breaches alike.
2. **Costs separate on their own**: because an account is a boundary, "the money this account spent" is clear even without attaching tags.
3. **Permission design gets simpler**: if you say "this team only within this account," you need fewer complicated rules.

**To use an analogy, it is a company's corporate cards.** If a whole department passes one card around, the statement is tangled, but if you issue one per department, the usage separates naturally. Splitting accounts is the same idea. The problem comes next. If you make ten cards, you get **ten payments and ten sets of management**.

```
[If you only split accounts]
Dev account   Prod account   Data account   Security account
    │             │              │               │
  Bill          Bill           Bill            Bill   ← payment and management are all separate

[If you bundle them with Organizations]
          Management (payer) account
      ┌─────┬─────┬─────┬─────┐
     Dev   Prod  Data  Security   ← policies applied from above, one bill
```

Organizations and consolidated billing, which we learn today, are exactly the devices that build the lower half of this picture. **They keep the benefits of splitting while removing only the hassle that splitting created.**

This approach of deliberately splitting and using multiple accounts is called a **multi-account strategy**. In sizable organizations these days, doing everything in one account is closer to the exception. So "how to bundle and govern accounts" has become a basic subject of cloud operations.

## AWS Organizations: Bundle Many Accounts and Govern Them

**AWS Organizations** is a service that **groups multiple AWS accounts into one organization and manages them centrally**. You group accounts into organizational units (OUs, Organizational Units), and with **service control policies (SCPs)** you can apply guardrails across them all at once, such as "these accounts cannot use certain Regions or services."

Why split accounts? Because it makes environment isolation (separating production and development), separation of permissions and costs by team, and security boundaries easier. Organizations gathers those scattered accounts into **a single control point**.

**To use an analogy, it is a company org chart.** With an org chart, you can send one announcement to "every department under the Sales division." You do not have to contact each person separately. The OU (organizational unit) corresponds to that "division," and the SCP corresponds to the **company rules** handed down to that whole division.

Let us sort out just four terms before moving on. These are the skeleton of Organizations questions.

| Term | One-line identity | Analogy |
|------|-----------|------|
| Management account (payer) | The representative account that creates the organization and bears the billing | Head of household, CEO |
| Member account | The rest of the accounts belonging to the organization | Family members, each department |
| OU (organizational unit) | A folder that groups member accounts | Division, team |
| SCP (service control policy) | A "only up to here" guardrail applied to an OU or account | Company rules, access control |

Unpacking the SCP a little more: an SCP is **not a tool that grants permissions but a tool that sets a ceiling**. If you draw a line such as "accounts in this OU cannot create resources outside the designated Regions," then no matter how broad the permissions someone has been given inside that account, they cannot cross that line. It is like how no matter how much you widen an individual's authority, they cannot exceed company rules.

```
[The order in which permissions are determined]
The ceiling drawn by the SCP  ← can never be crossed
      ∩
Permissions granted in the individual account
      =
What can actually be done
```

Picture a company that, because of regulation, cannot send data outside a certain region. You could tell each person in charge, "please do not use that Region," but people forget. Instead, this company attached **an SCP that prevents creating resources anywhere except the designated Regions** to that OU. Remembering the rule moved from being the people's job to being the system's job. The goal of governance is not "asking people to comply well" but **"making it impossible to violate even if someone tries."**

If you see "manage many accounts centrally," "group with OUs," or "apply policies across all with SCPs," it is Organizations. Permission and policy governance is the key phrase.

## Consolidated Billing: One Bill

**Consolidated billing (Consolidated Billing)** is a core benefit of Organizations: a feature that **merges the bills of all accounts in the organization into the one management (payer) account**. The advantages are clear.

1. **A single bill**: even with dozens of accounts, you pay once. Accounting gets simpler.
2. **Combined volume discounts**: the usage of all accounts is added together, so you reach tiered discount brackets, such as S3's, sooner.
3. **Commitment sharing**: other accounts in the organization can use unused RI and Savings Plans commitments, reducing waste.

```
[Pay per account]        [Consolidated billing]
Account A bill            ┌─ Account A ─┐
Account B bill      →     │  Account B  │ → summed into 1 bill for the management account
Account C bill            └─ Account C ─┘   (combined discounts + shared commitments)
```

**To use an analogy, it is a family bundle plan.** If four family members each activate a phone on their own, there are four plans and four bills. Bundled together, there is one bill, and above all, **thanks to the combined usage you move up to a bracket that is better than when each used alone**. This is exactly what consolidated billing does.

Here is a picture of why the second benefit, combined volume discounts, arises. In tiered pricing where the unit price falls the more you use, if usage is scattered into small pieces, no one gets out of the lower bracket.

```
[Pay separately]                      [Consolidated billing]
Account A: a little ─ expensive tier    A+B+C combined ─ reach a cheaper tier
Account B: a little ─ expensive tier →  (the unit price drops for the same amount used)
Account C: a little ─ expensive tier
```

The third benefit, commitment sharing, is in the same vein. The Reserved Instances and Savings Plans we learned yesterday are a way of getting a discount by promising "we will definitely use this much." But if one account cannot use up everything it promised, the leftover is simply thrown away. When accounts are bundled under consolidated billing, **another account uses that leftover share in its place**, so waste shrinks.

Picture a corporate group that owns several startups as subsidiaries. In the days of separate accounts, each company's usage was small so none reached the favorable pricing brackets, and any commitment one company had bought simply vanished if left over. After the accounts were bundled into one organization, **the unit price dropped without changing anything.** This is why consolidated billing is called "the easiest cost saving."

If you see "merge the bills of multiple accounts into one," "larger volume discounts through combined usage," or "share commitments (RI/SP)," it is consolidated billing. Cost savings and simpler accounting are the core of its effect.

> ⚠️ **Trap**: Merging the bills does **not** mean the boundaries between accounts disappear. A user in account A does not become able to freely view resources in account B. What consolidated billing merges is **only what concerns money**; permissions and isolation remain as they were. If an exam option says something like "with consolidated billing, resources can be freely shared between accounts," it is wrong.

## How Do Organizations and Consolidated Billing Differ?

Because the two always appear together, many people have a blurry idea of the boundary. The relationship in one sentence: **Organizations is the big container, and consolidated billing is one representative benefit held in that container.**

| | AWS Organizations | Consolidated billing |
|---|---|---|
| What it is about | **Permissions and policy** (governance) | **Money** (billing) |
| Representative features | OU grouping, SCP guardrails | Bill merging, combined volume discounts, commitment sharing |
| Clues in questions | "Control centrally," "apply policy across all," "restrict Regions" | "One bill," "combined discounts," "simplified accounting" |
| Relationship | The higher-level concept | A benefit that comes along when you turn on Organizations |

If you separate them so that a question talking about **"control"** means Organizations and one talking about **"money"** means consolidated billing, you will almost never go wrong.

The goals of a billing structure are two: simpler management and cost savings. Organizations takes charge of governance, and consolidated billing takes charge of savings. You govern many accounts with Organizations, merge them into one bill with consolidated billing to grow discounts, estimate in advance with the Pricing Calculator before using anything, and compare against on-premises from a TCO perspective.

## AWS Pricing Calculator: Make an Estimate Before You Use

**AWS Pricing Calculator** is a free estimation tool that **calculates in advance the expected cost of an architecture that has not been deployed yet**. You enter something like "if I use 3 EC2 m5.large instances for one month together with RDS, roughly how much?" and get an estimated monthly or yearly cost. It is used for migration planning, budgeting, and comparing inside versus outside (cloud versus on-premises).

The important point is that its timing differs from Cost Explorer and CUR in Day 2. Cost Explorer looks at costs **already incurred** (after the fact), and Pricing Calculator estimates costs **before use** (beforehand).

| Timing | Tool | Purpose |
|------|------|------|
| Before (prior to use) | Pricing Calculator | Expected cost estimates, budget and migration planning |
| After (once used) | Cost Explorer / CUR | Actual cost analysis and forecasting |

**To use an analogy, it is a moving quote.** Before deciding to move, you call in a company and get "with this much stuff and this many floors, roughly how much." It is not the actual bill, but **you need that number to decide whether to move at all.** Pricing Calculator plays the same role. In a state where you have created nothing yet, it puts "roughly this much" in your hands.

In practice there are three moments when this estimate is needed. **When you request a budget** ("we'll find out once we try" does not get approval), **when you compare against on-premises** (it fills in the cloud-side column of the TCO comparison that comes later), and **when you choose among design alternatives** (if the same function can be built in two configurations, you gauge the price before building them).

If you see "estimate expected costs before deployment" or "estimate migration costs," it is Pricing Calculator. If it is "analyze costs already incurred," it is on the Cost Explorer side.

> ⚠️ **Trap**: An estimate is **an estimate, not a guarantee.** If the assumptions I entered (how many servers, how many hours, how much data) are wrong, the result is wrong too. So in practice, even after producing an estimate you set a limit with Budgets and compare against actuals with Cost Explorer. Remember that **upfront estimate (Pricing Calculator) → limit alert (Budgets) → after-the-fact check (Cost Explorer)** links together as one loop.

## TCO (Total Cost of Ownership): Compare On-Premises and Cloud Properly

**TCO (Total Cost of Ownership)** is the concept of **adding up all the costs** of owning and operating an asset. When comparing on-premises with the cloud, looking only at the "server price" leads to the wrong conclusion. A real comparison must include **the costs that are hard to see**.

- **On-premises TCO**: Beyond the purchase cost of servers and storage, the **hidden costs** are large: data center space, power, cooling, hardware maintenance, operations staff, and replacement of aging equipment.
- **Cloud TCO**: It converts capital expenditure (CapEx) into operating expenditure (OpEx), and AWS shoulders many of the hidden costs above, so it often **lowers the total cost**.

**To use an analogy, it is the relationship between a car's price and its upkeep.** When buying a car, what people compare is the vehicle price, but that is not the only money that actually leaves the wallet. Insurance, fuel, parking, regular maintenance, and the value lost when you sell it a few years later are the real cost. **Concluding "this one is cheaper" by looking only at the car price is usually wrong.** Servers are the same.

Listing the costs that do not show up on a bill for on-premises looks like this.

| Visible costs | Hard-to-see costs |
|------------------|-------------------|
| Server and storage purchase cost | Data center space rent |
| Software licenses | Power and cooling |
| | Facilities such as uninterruptible power and fire suppression |
| | Labor costs of staff who manage the equipment |
| | Spare equipment bought in case of failure |
| | Replacing aging equipment years later |
| | Time spent waiting until the equipment arrives |

The last row is especially important. **Time is also a cost.** If you waited weeks for the equipment to arrive, the money that the service that could not launch in the meantime failed to earn is also a real loss.

Of course, a TCO comparison does not always side with the cloud. An organization whose load is steady for years and which already has data centers and staff may find owning its own hardware advantageous. So on the exam, an absolute statement such as **"the cloud is always cheaper"** is a wrong-answer signal. What TCO says is not "the cloud is cheaper" but **"to compare properly, count the hidden costs too."**

If you see "compare the total cost of the cloud against on-premises" or "including hidden costs such as power, cooling, and staff," it is the TCO perspective. It is a concept directly tied to the CapEx → OpEx shift from Week 1, and you can use Pricing Calculator to produce the cloud-side estimate for a TCO comparison.

## How Do Pricing Calculator and TCO Differ?

Both names mean "working out costs in advance," so they are easy to confuse. But they are on different levels.

| | Pricing Calculator | TCO |
|---|---|---|
| Identity | A **tool** provided by AWS | A **perspective (concept)** for counting costs |
| What it counts | Expected charges on the cloud side | **All costs on both sides**, on-premises and cloud |
| Output | Expected monthly or yearly amount | A judgment of "which side has the lower total cost" |
| Relationship | A **calculator that fills one column** of the TCO comparison | The **whole comparison table** that gathers those columns |

In one sentence: **TCO is the question, and Pricing Calculator is the tool that calculates half of that question.**

The Week 5 tools link together in one line. Before use you gauge with Pricing Calculator, during use Budgets guards, after use you check with Cost Explorer and CUR, and across all of it Organizations and tags divide things by account and team. If you just grasp "when is each tool used," you will not waver on the answer options.

## How It Appears on the Exam

| If the question contains this kind of wording | The answer is |
|---------------------------|--------|
| "Manage many accounts centrally," "OU," "restrict across all with SCPs" | AWS Organizations |
| "One bill," "discounts from combined usage," "commitment sharing" | Consolidated billing |
| "Expected cost before deployment," "migration budget planning" | Pricing Calculator |
| "Total cost comparison including power, cooling, and staff" | TCO |
| "Analyze costs already incurred" | Cost Explorer (Day 2) |
| "Alert before exceeding a limit" | AWS Budgets (Day 2) |

The easy pair to confuse is **swapping Pricing Calculator and Cost Explorer**. Look for the tense in the question: if it is "**what we will use going forward**," it is Pricing Calculator; if it is "**what we have already used**," it is Cost Explorer.

## Billing Structure Signal Keywords

| Signal (keyword) | Answer |
|--------------|----|
| Central management of many accounts, OU, SCP across all | AWS Organizations |
| Merge bills into one, combined volume discounts, commitment sharing | Consolidated billing |
| Expected cost estimate before deployment, migration planning | Pricing Calculator |
| On-premises vs cloud total cost including hidden costs | TCO |

In the next article, we will review all of Week 5 (pricing models, cost tools, support plans, and billing structure) in one go.

## 📖 Glossary

- **AWS Organizations**: A service that groups multiple AWS accounts into one organization for central management. Corresponds to a company org chart.
- **Management account (payer account)**: The representative account that creates the organization and bears the whole billing.
- **Member account**: The rest of the accounts belonging to the organization.
- **OU (organizational unit)**: A folder that groups member accounts. Policies are applied across it as a unit.
- **SCP (service control policy)**: A guardrail that draws a ceiling an OU or account cannot cross. It is a tool that **blocks**, not one that grants permissions.
- **Consolidated Billing**: A feature that merges the bills of all accounts in the organization into the one management account. Corresponds to a family bundle plan.
- **Combined volume discounts**: The effect of per-account usage adding up so that a cheaper pricing bracket is reached sooner.
- **Commitment sharing**: Other accounts in the organization using RI and Savings Plans commitments that one account could not use up.
- **Multi-account strategy**: An operating approach of deliberately splitting accounts along environment, team, and security boundaries.
- **AWS Pricing Calculator**: A free estimation tool that calculates in advance the expected cost of a configuration not yet deployed. Corresponds to a moving quote.
- **TCO (total cost of ownership)**: A perspective that compares by adding up not only the purchase cost but also hidden costs such as power, cooling, staff, and replacement.
- **CapEx / OpEx**: Capital expenditure that goes out in a large amount upfront / operating expenditure that goes out as much as you use. The cloud turns the former into the latter.

---

## 📝 Practice Questions

**Question 1.** A company running dozens of AWS accounts wants to combine payment into one bill and aggregate usage to grow volume discounts. Which feature is the best fit?

A) AWS Budgets  
B) AWS Organizations consolidated billing  
C) AWS Pricing Calculator  
D) Cost allocation tags  

**Answer: B**  
Explanation: Organizations consolidated billing combines all account bills into a single management account, aggregates usage to reach volume discount tiers sooner, and also shares RI/SP commitments. Budgets is budget alerts, Pricing Calculator is advance estimation, and tags are a cost-breakdown basis — none is a bill-combining feature.

---

**Question 2.** You want to group multiple accounts into Organizational Units (OUs) and apply bulk guardrails with Service Control Policies (SCPs) to govern centrally. Which service is the best fit?

A) AWS Organizations  
B) AWS Trusted Advisor  
C) Amazon CloudWatch  
D) AWS Cost Explorer  

**Answer: A**  
Explanation: AWS Organizations groups multiple accounts into OUs and applies policies in bulk with SCPs to manage and control centrally. Trusted Advisor is automatic checks, CloudWatch is monitoring, and Cost Explorer is cost analysis — none is a multi-account governance feature.

---

**Question 3.** You want to estimate in advance the expected monthly cost of moving a new, not-yet-deployed architecture to the cloud in order to plan a budget. Which tool is the best fit?

A) AWS Cost Explorer  
B) AWS Cost and Usage Report  
C) AWS Pricing Calculator  
D) AWS Budgets  

**Answer: C**  
Explanation: Pricing Calculator is an advance-estimation tool that calculates the expected cost of an architecture before deployment, well suited for migration and budget planning. Cost Explorer and CUR are after-the-fact tools for costs already incurred, and Budgets is a budget-exceeded alert feature.

---

**Question 4.** The cost of maintaining an on-premises data center includes hidden costs like power, cooling, and operations staff, on top of server purchase costs. What is the concept of summing all such costs to compare against the cloud?

A) Volume discount  
B) Total Cost of Ownership (TCO)  
C) Reserved Instances  
D) Savings Plans  

**Answer: B**  
Explanation: TCO (Total Cost of Ownership) is the concept of summing not just purchase costs but hidden costs like power, cooling, staff, and maintenance to compare on-premises and cloud honestly. Volume discounts are usage-based unit-price reductions, and RI/Savings Plans are commitment discount models — different from a total-cost comparison concept.

---

**Question 5.** Which of the following is LEAST related to the cost-side benefits of consolidated billing?

A) All account bills are combined into one, simplifying accounting  
B) Per-account usage is aggregated, reaching volume discount tiers sooner  
C) RI/Savings Plans commitments can be shared by other accounts in the organization  
D) Different SCPs are forcibly applied to each account to automatically reduce costs  

**Answer: D**  
Explanation: SCPs are not a cost benefit of consolidated billing but a permission/governance control of Organizations, and the policies themselves don't automatically reduce costs. Single bill, aggregated volume discounts, and commitment sharing are all genuine cost-side benefits of consolidated billing.

---
