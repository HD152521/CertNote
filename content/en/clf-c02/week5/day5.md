# Day 5 - Week 5 Wrap-Up: Reviewing Billing, Pricing, and Support in One Go

## 📌 Key Takeaways

- The skeleton of Week 5 is a four-beat rhythm: **estimate → purchase method → visibility and control → problem solving**. Bundling all of it across multiple accounts is what Organizations and consolidated billing do.
- Pricing models split along a single axis: **"how long and how certainly will you use it?"** If unsure, On-Demand; if certain, RI/SP; if interruption is acceptable, Spot.
- Cost tools split by **timing**. Before use, Pricing Calculator; after use, Cost Explorer; before exceeding, Budgets; and the most detailed is CUR.
- For support plans, **response speed and depth of help** are the tier. Never mix the "person" (TAM) with the "tool" (Trusted Advisor).
- For multiple accounts the roles split: **Organizations = governance**, **consolidated billing = savings**.
- Today is not a day for piling on new knowledge but for **practicing translating the language of questions into answers**.

This week was the week of "money and help." We learned how to buy the same resource (pricing models), how to see how much you have spent (cost tools), who helps when a problem arises (support plans), and how to pay for and manage multiple accounts (billing structure). Today we tie the four strands into one picture for review and sort out the pairs that are often confused on the exam.

One key sentence: **estimate before buying (Pricing Calculator/TCO) → buy the right way (pricing models) → watch and control what you spent (cost tools) → solve problems with appropriate support (support plans) → and tie all of this together at the multi-account level (Organizations/consolidated billing).**

## Why Did We Learn These Four Separately? Comparing with the Pre-Cloud Era

Before the cloud, "cost management" effectively meant **purchase approval**. You got a quote, set a budget, submitted for approval, and once the equipment arrived, after that it was just numbers sitting on a depreciation schedule for years. Once you bought, there was nothing more to watch, and if you bought wrong there was no way to undo it.

The cloud flipped this structure. You do not decide once at purchase; you **decide throughout the time you use it**. The moment you turn on one more server the bill rises, and the moment you turn it off it falls. Put kindly, that is freedom; put badly, it is **a structure that keeps leaking if nobody is watching**. So four questions that did not exist before have newly arisen: "Can we know what it will cost before we create it? (Pricing Calculator, TCO)", "Is there a cheaper way to buy? (pricing models)", "How do we see what we are spending now? (Cost Explorer, Budgets, CUR, tags)", and "Who helps when problems arise? (support plans)". What we learned this week is the answer to each, and tying all of it at the account level is Organizations and consolidated billing.

The order of cost management is always **"make it visible → split it → reduce it."** You cannot reduce costs you cannot see (Cost Explorer, CUR), costs whose owner is unknown have no one to be accountable (tags), and only after that can you truly reduce them by changing the pricing model (RI, SP, Spot). When asked "what should be done first?", recall this order.

## Pricing Models at a Glance (Day 1)

| Signal (keyword) | Pricing model |
|--------------|-----------|
| No commitment, flexible, unpredictable, short-term | On-Demand |
| 1-3 year commitment, stable workload, large discount | RI / Savings Plans |
| Discount stays even if type or Region changes | Savings Plans |
| Lowest price, spare capacity, interruption-tolerant work | Spot |
| New users, free up to a limit | Free Tier |
| Unit price falls the more you use (S3, etc.) | Volume/tiered discount |

The axis for remembering: **"how long and how certainly will you use it?"** If unsure, On-Demand; if certain, commitment (RI/SP); if interruption is acceptable, Spot.

### Turning It into Mobile Plans

Pricing models map directly onto carrier plans. If the names feel unfamiliar, grasp them with this picture first.

| Pricing model | Everyday analogy | What you give up in return |
|-----------|-----------|------------------|
| On-Demand | A pay-as-you-go plan with no contract | You are free, but you give up discounts |
| RI | A long-term contract tied to a specific device | Hard to change the terms |
| Savings Plans | A long-term contract that promises only "I'll spend this much per month" | The amount is locked, but you may change the device |
| Spot | A discounted last-minute airline ticket for leftover seats | If the seat is gone, you have to get off |
| Free Tier | A trial benefit for new sign-ups | Once you exceed the limit, normal charges apply |

If RI and Savings Plans keep confusing you to the end, remember only **"what was promised?"** RI promises a **seat**; Savings Plans promises an **amount**. That difference creates the difference in flexibility exactly.

If you step down the choice in this order, you almost never go wrong. **Is it fine to be interrupted midway? → If yes, Spot. If not, is it certain to keep running for a long time? → If yes, RI/Savings Plans (RI if the specs are fixed, SP if flexibility is needed); if not, On-Demand.**

> ⚠️ **Trap**: Reflexively picking **Spot** after seeing only "the cheapest way?" is wrong. Spot can be reclaimed by AWS at any time, so it applies only to **work that can withstand interruption**. It is not used for always-on web servers, payment processing, or databases. Expressions such as "interruption tolerant," "fault tolerant," "batch," or "restartable" must appear together for it to be a candidate answer.

Suppose there is a batch job that gathers a day's logs every night and computes statistics. If the server disappears midway, you just run it again, so **Spot** is ideal. By contrast, that same company's login server cannot go down all year, so **RI or Savings Plans**, and an experimental server to be launched next month might be shut off within days, so **On-Demand** fits. The key point is that even within one company, the answer differs depending on the nature of the workload.

## Cost Management Tools at a Glance (Day 2)

| Signal (keyword) | Tool |
|--------------|------|
| Visualize and analyze past costs, forecast the future | Cost Explorer |
| Set a budget, alert on exceeding a threshold | AWS Budgets |
| Most detailed line items, S3 export | Cost and Usage Report (CUR) |
| Distinguish/allocate costs by team or project | Cost allocation tags |

The axis for remembering: **see (Explorer) → block (Budgets) → dig deep (CUR) → divide (tags).**

### Turning It into a Household Ledger

The four cost tools also map directly onto household finances.

| Tool | Everyday analogy | The question it answers |
|------|-----------|-------------|
| Cost Explorer | A ledger app with monthly spending graphs | "Where and how much did I spend last month?" |
| AWS Budgets | A text alert that your card limit is exceeded | "At this rate I'll go over, so tell me in advance" |
| CUR | The original receipt with every item printed | "What usage did this amount come from?" |
| Cost allocation tags | "Food/Transport" stickers | "Which department's share is this?" |

The axis to distinguish well here is **timing**. Even though the same word "cost" is attached, the three stand at different points in time: **Cost Explorer and CUR are the past (money already spent), Budgets is the present (alert before exceeding), and Pricing Calculator is the future (something not yet built)**.

> ⚠️ **Trap**: Cost Explorer also has a **forecast** feature, so people often make the mistake of choosing it from that word alone. But that forecast is **a line drawn by extending the trend of what you are already using**. The cost of **an architecture not yet built** is Pricing Calculator. If you see "before deployment," "not yet created," or "new design," it is not Cost Explorer.

One more thing. If the development team and the marketing team share one account and nobody can answer "how much of this amount is our share?", the first step is not to open a new tool but **to attach team-name tags to the resources**. Only when tags are attached can you split things in Cost Explorer and set per-team Budgets.

## Support Plans and Tools at a Glance (Day 3)

| Signal (keyword) | Answer |
|--------------|----|
| Free, no technical cases, billing inquiries | Basic |
| Email technical support, development/testing | Developer |
| 24/7 support, full Trusted Advisor, production | Business |
| TAM, shortest response, mission-critical | Enterprise |
| Dedicated technical advisory staff | TAM (Enterprise only) |
| Automatic environment checks, best-practice recommendations | Trusted Advisor |

The axis for remembering: **response speed and depth of help are the tier.** Distinguish the human advisor (TAM) from the automatic check tool (Trusted Advisor).

### A Support Plan Is an "Insurance Tier"

It is quicker to understand a support plan as an **insurance tier** than as a product. In normal times you do not feel the difference, but when an accident happens, who comes and how fast differs. If you remember only **what newly appears** at each step up, you do not need to memorize the whole table.

```
 Basic        Docs · forums · billing inquiries   (technical cases ✕)
   └ + technical support (email, business hours)  → Developer
        └ + 24/7 support, full Trusted Advisor checks → Business
             └ + TAM (dedicated person), shortest response → Enterprise
```

**Trap**: People often make the mistake of jumping straight to Enterprise after seeing only "24-hour support is needed." 24/7 support itself is already provided at **Business**. The signal to choose Enterprise is when conditions that Business lacks appear together, such as a **TAM (dedicated technical advisory staff)** or the **fastest response**. Remember that choosing an expensive answer that exceeds the requirements is also wrong.

**A TAM is a person; Trusted Advisor is a tool.** Trusted Advisor automatically sweeps the account environment and points out spots that deviate from best practices from perspectives such as cost, performance, security, fault tolerance, and service quotas. A person who is attached, knows our company's circumstances, and advises us, and a program that produces a checklist according to rules, are entirely different things. If both names appear together in the options, first separate "person or tool?"

## Billing Structure at a Glance (Day 4)

| Signal (keyword) | Answer |
|--------------|----|
| Central management of many accounts, OU, SCP | AWS Organizations |
| Merge bills, combined volume discounts, commitment sharing | Consolidated billing |
| Expected cost estimate before deployment | Pricing Calculator |
| Total cost comparison including hidden costs | TCO |

The axis for remembering: **Organizations = governance, consolidated billing = savings, Pricing Calculator/TCO = decision-making.**

### Why Use Multiple Accounts, and Why Bundle Them Again?

This is the part that first-time learners find strangest. "Just use one account; why split it and then bundle it again?" The reason is that **the purpose of splitting and the purpose of bundling are different**.

- **Why split**: Something accidentally deleted in the development account must not spread to the production account. An account is the most reliable wall, so the blast radius stops inside it.
- **Why bundle (Organizations)**: Once split, management scatters. You cannot set "block this Region in every account" by hand for each account, so you group them with **OUs** and restrict them in one go from above with **SCPs**.
- **Another reason to bundle (consolidated billing)**: The bills merge into one, and **because usage is also summed, accounts can share volume discounts and commitment benefits.**

A family bundle plan is exactly this picture. The numbers (accounts) are each separate, but the charges come out as one bill (consolidated billing), and the data is shared among the family (discount sharing). A parent placing a block on a child's line is the **SCP**.

**Trap**: **An SCP is a tool that "sets a limit," not one that "grants" permissions.** Even if it is allowed by an SCP, if the IAM policy inside that account does not allow it, it still cannot be done. Conversely, even if you gave administrator permissions in IAM, if the SCP blocks it, it cannot be done. Remember it as "handing over the key (IAM) inside the fence (SCP)."

Cloud costs are governed by a four-beat rhythm of "buy well, watch well, block well, bundle well." You pick the pricing model to match the persistence and predictability of the workload, secure visibility and control with Cost Explorer, Budgets, CUR, and tags, buy stability with a support plan matched to the organization's scale, and make multiple accounts efficient with Organizations and consolidated billing. At the starting point, there is always a decision weighed with Pricing Calculator and TCO.

## Commonly Confused Pairs

Here are the distinctions that are easy to confuse, collected together.

| Confusing pair | Key difference |
|-------------|-----------|
| Cost Explorer vs Budgets | After-the-fact analysis/forecast vs advance budget alerts |
| Cost Explorer vs Pricing Calculator | Analyzing spent costs (after) vs estimate before use (before) |
| Cost Explorer vs CUR | Dashboard visualization vs the most detailed source data |
| RI vs Savings Plans | Commitment to instance attributes vs commitment to usage amount (more flexible) |
| On-Demand vs Spot | Always guaranteed (expensive) vs reclaimable (lowest price) |
| TAM vs Trusted Advisor | A person (dedicated advisor, Enterprise) vs a tool (automatic checks) |
| Business vs Enterprise | 24/7 support vs 24/7 + TAM + shortest response |
| Organizations vs consolidated billing | Account governance (permissions, policy) vs bill merging (cost) |

Most CLF cost and support questions ask for one of the distinctions in the pairs above. If you first grasp the branches along axes such as "before/after," "person/tool," "analysis/alert," and "governance/payment," you can quickly filter out wrong answers.

If you add just three more pairs on top of this, nearly every distinction in this domain is filled in. **Budgets vs Trusted Advisor** (watching an amount I set vs checking against best practices), **Free Tier vs On-Demand** (a free limit for new users vs normal pay-as-you-go charges), and **Pricing Calculator vs TCO** (an individual estimate vs comparing total cost against on-premises).

## Keyword → Answer Translation Table

Questions do not tell you the service name directly. What you actually do is **translate the language describing a situation into a service name**. These are mostly expressions that were not in the four tables above. If you read the left and the right comes to mind right away, you can consider this domain ready.

| Expression in the question | Answer to recall |
|--------------------|-----------|
| Not yet created, new design, expected estimate | Pricing Calculator |
| Compare with on-premises, including hidden costs, migration feasibility | TCO |
| Last month, by service, trend, where it was spent | Cost Explorer |
| Threshold, alert when exceeded | AWS Budgets |
| Line items, source data, receive as a file | CUR |
| Departmental allocation, split by project, label | Cost allocation tags |
| Discount persists even if type or Region changes | Savings Plans |
| Fault tolerant, batch, restartable, lowest price | Spot |
| Dedicated staff, shortest response, mission-critical | Enterprise (TAM) |
| Automatic checks, best-practice recommendations, service quota check | Trusted Advisor |
| Multiple accounts, central control, restrict by policy | Organizations (OU, SCP) |

When reading a question, do not look for the service name first; first underline the words that point to **timing (before/after), actor (person/tool), and purpose (analysis/alert/restriction)**.

## List of Frequently Missed Traps

There is a reason for getting things wrong. You have to know the reason too, so you do not get it wrong next time.

1. **Choosing Spot after seeing only "cheapest"**: Without words implying interruption tolerance, Spot is out.
2. **Choosing Cost Explorer because of the word "forecast"**: That forecast is the trend of what you already use. What is not yet built is Pricing Calculator.
3. **Jumping to Enterprise from "24-hour support"**: 24/7 starts at Business. The signals for Enterprise are the TAM and the shortest response.
4. **Mixing up TAM and Trusted Advisor**: "Dedicated, advisory, person in charge" is a person; "check, recommendation, inspection" is a tool.
5. **Treating Organizations and consolidated billing as the same thing**: The former is governance, the latter is cost. If it says "restrict permissions," every billing-side option is wrong.
6. **Looking for a tool first when you want to split costs**: Without tags, no tool can split them.
7. **Remembering the difference between RI and SP as "discount rate"**: What the exam asks is not the size of the discount but **flexibility**.
8. **Believing the expensive answer is safe**: A choice that exceeds the requirements is also wrong. The minimum configuration that satisfies the conditions **exactly** is often the answer.

## One-Line Review Cards

For covering the right side and saying it aloud.

| Card | One line |
|------|-------|
| On-Demand / RI / SP / Spot | Freedom / seat promise / amount promise / leftover seats |
| Pricing Calculator | An estimator that calculates what it will cost before you build |
| Cost Explorer | A screen that shows spent costs as graphs and lets you split them |
| AWS Budgets | A sentinel that tells you when a limit is exceeded |
| Cost allocation tags | Labels that split costs by team and project |
| Four support tiers | Deepens in the order free → email → 24/7 → dedicated TAM |
| Trusted Advisor | A check tool that automatically points out best-practice violations |
| Organizations / consolidated billing | Governance (permissions) / savings (bill merging) |

## Self-Check Checklist

If you can explain it, you pass. If any item stalls you, go back to that Day.

- [ ] I can line up the five pricing models in order on **a single axis (duration and certainty)**
- [ ] I can explain the difference between RI and Savings Plans as "what is promised"
- [ ] I can name two or more workloads for which Spot **must not be used**
- [ ] I can explain Cost Explorer, Budgets, CUR, and Pricing Calculator separated by **timing and role**
- [ ] I can answer what to do first for the requirement "allocate costs by department"
- [ ] I can describe the four support plans centered on **what newly appears at each step**
- [ ] I can explain TAM and Trusted Advisor as person versus tool
- [ ] I can describe the roles of Organizations, consolidated billing, and SCP without mixing them
- [ ] Seeing only the left side of the keyword translation table above, I can state more than half of the right side

## 📖 Glossary

- **On-Demand**: The basic pricing method of paying for the time you use, with no commitment. You can start and stop at any time.
- **RI (Reserved Instances)**: A method of getting a discount by fixing instance conditions and promising to use them for a long period.
- **Savings Plans**: A method of promising a usage amount rather than conditions. The discount follows even if you change type or Region.
- **Spot Instances**: Instances that use spare capacity cheaply in exchange for possible reclamation. For interruption-tolerant work.
- **Free Tier**: Free usage up to a limit granted to new users. Exceeding it incurs normal charges.
- **TCO (total cost of ownership)**: A perspective that compares on-premises and cloud by adding up power, space, and labor costs too.
- **Cost Explorer**: A tool that visualizes already-incurred costs by period and service and shows trends.
- **AWS Budgets**: A tool that sends alerts when a budget limit is exceeded or expected to be exceeded.
- **CUR (Cost and Usage Report)**: Source data exported with the most detailed billing and usage records.
- **Cost allocation tags**: Labels attached to resources. The basis for splitting costs by team and project.
- **Trusted Advisor**: A tool that automatically checks the account environment and points out best-practice violations.
- **TAM (Technical Account Manager)**: A person provided with the Enterprise plan. Knows the customer environment and advises.
- **SCP (service control policy)**: A policy that sets the ceiling on what an account can do. It does not grant permissions.
- **Consolidated billing**: A method of merging the bills of multiple accounts and summing usage to grow discount benefits.

---

## 📝 Practice Questions

**Question 1.** It's certain your workload runs stably all year, and you want a commitment discount, but you also want the discount to be preserved even if you change the instance type and Region. Which pricing model is the best fit?

A) On-Demand  
B) Spot Instances  
C) Savings Plans  
D) Free Tier  

**Answer: C**  
Explanation: Savings Plans commit to an hourly dollar spend, so the discount applies flexibly even when you change instance type or Region. On-Demand has no discount, Spot carries reclamation risk, and the Free Tier is a free allowance for new users — different from a stable commitment discount.

---

**Question 2.** Which correctly pairs the appropriate tool for the case of visualizing and analyzing costs already incurred by service, and for the case of estimating the expected cost of a new architecture before deployment?

A) Analysis = Pricing Calculator, Estimation = Cost Explorer  
B) Analysis = Cost Explorer, Estimation = Pricing Calculator  
C) Analysis = Budgets, Estimation = CUR  
D) Analysis = CUR, Estimation = Budgets  

**Answer: B**  
Explanation: Cost Explorer is an after-the-fact tool that visualizes and analyzes costs already spent, while Pricing Calculator is an advance-estimation tool that calculates expected costs before deployment. Budgets is budget alerts and CUR is detailed raw data, which don't match these two timings' roles.

---

**Question 3.** A company wanting to run production 24 hours a day wants 24/7 phone/chat support and the full set of Trusted Advisor checks, but doesn't need a dedicated TAM. Which support plan is the best fit?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**Answer: C**  
Explanation: The Business plan provides 24/7 phone/chat/email support and the full set of Trusted Advisor checks, making it a good fit for production operations. Basic has no technical cases, Developer is limited to email during business hours, and Enterprise includes a TAM and the fastest response, exceeding the requirements.

---

**Question 4.** In an organization running many AWS accounts, which correctly pairs what handles centrally controlling permissions/policies and what handles combining bills into one to grow volume discounts?

A) Governance = consolidated billing, Billing = Organizations  
B) Governance = Organizations (OUs/SCPs), Billing = consolidated billing  
C) Governance = Budgets, Billing = tags  
D) Governance = Trusted Advisor, Billing = Cost Explorer  

**Answer: B**  
Explanation: Organizations centrally controls multi-account permissions/policies with OUs and SCPs (governance), while consolidated billing combines bills and aggregates usage to grow volume discounts (billing). Budgets, tags, Trusted Advisor, and Cost Explorer are not the actors in these two roles.

---

**Question 5.** Which correctly pairs the 'human' who stays with the customer's environment continuously and advises, and the 'tool' that automatically inspects the environment and recommends best practices?

A) Human = Trusted Advisor, Tool = TAM  
B) Human = TAM, Tool = Trusted Advisor  
C) Human = Cost Explorer, Tool = Budgets  
D) Human = Business plan, Tool = Enterprise plan  

**Answer: B**  
Explanation: A TAM is the dedicated technical advisory 'person (human)' provided with the Enterprise plan, and Trusted Advisor is the 'tool' that automatically inspects the environment and recommends best practices like cost and security. Cost Explorer and Budgets are cost tools, and Business/Enterprise are support-plan tiers, not a human/tool.

---
