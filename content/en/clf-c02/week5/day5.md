# Day 5 - Week 5 Wrap-Up: Billing, Pricing, and Support in One Review

This week was the week of "money and help." We learned how the same resource costs differently by how you buy it (pricing models), how to see how much you spent (cost tools), who helps when problems arise (support plans), and how to pay for and manage many accounts (billing structure). Today we'll tie these four strands into a single picture for review and organize the pairs most often confused on the exam.

The core one sentence: **estimate before you buy (Pricing Calculator/TCO) → buy the right way (pricing models) → see and control what you spent (cost tools) → resolve problems with the right support (support plans) → tie all of this together at the multi-account level (Organizations/consolidated billing).**

## Pricing Models at a Glance (Day 1)

| Signal (keyword) | Pricing model |
|--------------|-----------|
| No commitment, flexible, unpredictable, short-term | On-Demand |
| 1–3 year commitment, stable workload, large discount | RI / Savings Plans |
| Discount preserved even when type/Region changes | Savings Plans |
| Cheapest, spare capacity, interruption-tolerant work | Spot |
| New user, free up to a limit | Free Tier |
| Unit price drops the more you use (S3, etc.) | Volume/tiered discount |

The axis of memory: **"how long and how certainly you'll use it."** Unsure → On-Demand; certain → commitment (RI/SP); fine to be interrupted → Spot.

## Cost Management Tools at a Glance (Day 2)

| Signal (keyword) | Tool |
|--------------|------|
| Visualize / analyze past costs / forecast future | Cost Explorer |
| Set a budget, alert when a threshold is exceeded | AWS Budgets |
| Most detailed line items, S3 export | Cost and Usage Report (CUR) |
| Break down / allocate costs by team or project | Cost allocation tags |

The axis of memory: **see (Explorer) → stop (Budgets) → dig deep (CUR) → sort out (tags).**

## Support Plans and Tools at a Glance (Day 3)

| Signal (keyword) | Answer |
|--------------|----|
| Free, no technical cases, billing inquiries | Basic |
| Email technical support, development/testing | Developer |
| 24/7 support, full Trusted Advisor, production | Business |
| TAM, fastest response, mission-critical | Enterprise |
| Dedicated technical advisor | TAM (Enterprise-only) |
| Automatic environment checks, best-practice recommendations | Trusted Advisor |

The axis of memory: **response speed and depth of help is the tier.** Distinguish a human advisor (TAM) from an automatic-check tool (Trusted Advisor).

## Billing Structure at a Glance (Day 4)

| Signal (keyword) | Answer |
|--------------|----|
| Centrally manage many accounts, OUs, SCPs | AWS Organizations |
| Combine bills, aggregate volume discounts, share commitments | Consolidated billing |
| Estimate expected costs before deployment | Pricing Calculator |
| Total-cost comparison including hidden costs | TCO |

The axis of memory: **Organizations = governance, consolidated billing = savings, Pricing Calculator/TCO = decision-making.**

## Frequently Confused Pairs

Here are the distinctions people get wrong most often.

| Confused pair | Core difference |
|-------------|-----------|
| Cost Explorer vs. Budgets | After-the-fact analysis/forecast vs. in-advance budget alerts |
| Cost Explorer vs. Pricing Calculator | Analyze spent costs (after) vs. estimate before use (before) |
| Cost Explorer vs. CUR | Dashboard visualization vs. most detailed raw data |
| RI vs. Savings Plans | Instance-attribute commitment vs. dollar-spend commitment (more flexible) |
| On-Demand vs. Spot | Always guaranteed (expensive) vs. reclaimable (cheapest) |
| TAM vs. Trusted Advisor | Human (dedicated advisor, Enterprise) vs. tool (automatic checks) |
| Business vs. Enterprise | 24/7 support vs. 24/7 + TAM + fastest response |
| Organizations vs. consolidated billing | Account governance (permissions/policies) vs. bill combining (cost) |

> 💡 **Related theory**: Most CLF cost/support questions ask about the distinction in one of the pairs above. If you first sort by an axis like "before/after," "human/tool," "analysis/alert," or "governance/billing," you can quickly filter out the wrong answers.

## Wrapping Up

Week 5 in one sentence: **cloud costs are governed by the four-beat rhythm of "buy well, watch well, block well, bundle well."** Choose a pricing model to match the workload's durability and predictability, secure visibility and control with Cost Explorer, Budgets, CUR, and tags, buy stability with a support plan sized to your organization, and make multi-account efficient with Organizations and consolidated billing. And at the starting point of it all, there's always a decision worked out with Pricing Calculator and TCO.

With that, we finish the billing, pricing, and support domain. Once you've made the keywords and pair distinctions second nature, you can reach the correct answer quickly on most questions in this domain.

---

## 📝 연습 문제

**문제 1.** It's certain your workload runs stably all year, and you want a commitment discount, but you also want the discount to be preserved even if you change the instance type and Region. Which pricing model is the best fit?

A) On-Demand  
B) Spot Instances  
C) Savings Plans  
D) Free Tier  

**정답: C**  
해설: Savings Plans commit to an hourly dollar spend, so the discount applies flexibly even when you change instance type or Region. On-Demand has no discount, Spot carries reclamation risk, and the Free Tier is a free allowance for new users — different from a stable commitment discount.

---

**문제 2.** Which correctly pairs the appropriate tool for the case of visualizing and analyzing costs already incurred by service, and for the case of estimating the expected cost of a new architecture before deployment?

A) Analysis = Pricing Calculator, Estimation = Cost Explorer  
B) Analysis = Cost Explorer, Estimation = Pricing Calculator  
C) Analysis = Budgets, Estimation = CUR  
D) Analysis = CUR, Estimation = Budgets  

**정답: B**  
해설: Cost Explorer is an after-the-fact tool that visualizes and analyzes costs already spent, while Pricing Calculator is an advance-estimation tool that calculates expected costs before deployment. Budgets is budget alerts and CUR is detailed raw data, which don't match these two timings' roles.

---

**문제 3.** A company wanting to run production 24 hours a day wants 24/7 phone/chat support and the full set of Trusted Advisor checks, but doesn't need a dedicated TAM. Which support plan is the best fit?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**정답: C**  
해설: The Business plan provides 24/7 phone/chat/email support and the full set of Trusted Advisor checks, making it a good fit for production operations. Basic has no technical cases, Developer is limited to email during business hours, and Enterprise includes a TAM and the fastest response, exceeding the requirements.

---

**문제 4.** In an organization running many AWS accounts, which correctly pairs what handles centrally controlling permissions/policies and what handles combining bills into one to grow volume discounts?

A) Governance = consolidated billing, Billing = Organizations  
B) Governance = Organizations (OUs/SCPs), Billing = consolidated billing  
C) Governance = Budgets, Billing = tags  
D) Governance = Trusted Advisor, Billing = Cost Explorer  

**정답: B**  
해설: Organizations centrally controls multi-account permissions/policies with OUs and SCPs (governance), while consolidated billing combines bills and aggregates usage to grow volume discounts (billing). Budgets, tags, Trusted Advisor, and Cost Explorer are not the actors in these two roles.

---

**문제 5.** Which correctly pairs the 'human' who stays with the customer's environment continuously and advises, and the 'tool' that automatically inspects the environment and recommends best practices?

A) Human = Trusted Advisor, Tool = TAM  
B) Human = TAM, Tool = Trusted Advisor  
C) Human = Cost Explorer, Tool = Budgets  
D) Human = Business plan, Tool = Enterprise plan  

**정답: B**  
해설: A TAM is the dedicated technical advisory 'person (human)' provided with the Enterprise plan, and Trusted Advisor is the 'tool' that automatically inspects the environment and recommends best practices like cost and security. Cost Explorer and Budgets are cost tools, and Business/Enterprise are support-plan tiers, not a human/tool.

---
