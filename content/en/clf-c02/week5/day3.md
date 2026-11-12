# Day 3 - Support Plans: How AWS Helps When Problems Arise

## 📌 Key Takeaways

- Support plans work **like a mobile carrier's pricing tiers**. The higher the tier, the faster the response and the deeper the help, and the higher the price.
- Four tiers in order: **Basic (free) → Developer → Business → Enterprise**. Climb as far as the strength of the clues in the question and you arrive at the answer.
- **A TAM is a person** (a dedicated technical advisor, Enterprise only); **Trusted Advisor is a tool** (automated checks). Do not mix the two up.
- **The full set of Trusted Advisor checks across all five categories opens at Business and above.** Lower plans get only a subset.
- The exam answer is not "the best plan" but **"the lowest plan that exactly meets the requirements."**

Even if you watch costs well and keep them under control, when a service actually stops or a design hits a wall, someone's help is needed. AWS knows that the level of help each customer needs is different, so it offers **support plans (Support Plans) at several tiers**. Today we sort out the differences among the four tiers from Basic to Enterprise, the dedicated support person called a TAM, and Trusted Advisor, an automated check tool that anyone can use.

There is only one core question: "How fast a response and how deep a level of help does this organization need?" The answer decides the appropriate plan.

## Why Do You Buy "Support" Separately?

This is the point that first-time learners find most awkward. **"I'm already paying to use the service, and now I have to pay again to be helped?"**

To answer, go back to the days before the cloud. When a company bought and ran its own servers, there was a contract that always came attached on top of the cost of the equipment: the **maintenance contract**. The contract price differed depending on how soon a person would show up when equipment broke, whether they would come at night and on weekends, and how quickly they would swap out parts. "Weekday daytime visits only" and "24-hour on-site staff" could never cost the same.

The cloud inherited exactly the same structure. Only the subject changed.

| On-premises era | Cloud |
|-----------------|----------|
| Equipment cost | Charges for the resources you use |
| Maintenance contract | **Support plan** |
| "How many hours until the technician arrives" | "How many hours until a reply arrives" |

And the cloud has one more reason. The basic premise of the cloud is **self-service**. The principle is that you create things yourself in the console, configure them yourself, and fix them yourself. Documentation and online materials are open to everyone for free. But in reality, moments come when you cannot solve things on your own.

- When a service stops in the middle of the night and you cannot tell whether the cause is your own code or something on the AWS side
- When, before starting a design, you want an experienced person to confirm "is this the right direction?"
- When, ahead of a large event, you want a check in advance on whether your configuration can withstand the traffic

A support plan buys you **how quickly and how deeply you can call on someone on the AWS side** in moments like these. Because not every company needs that level of help, it is not sold as one bundle but split into tiers.

Support plans are **subscribed to per AWS account**. You do not buy them service by service; they apply to the whole account. So in an organization with several accounts, "which plan to attach to which account" becomes a real decision item. For example, you might keep a development account on a lower tier and a production account on a higher tier.

## The Four Support Plans: Basic → Developer → Business → Enterprise

The higher up the support plans go, the faster the response and the deeper the help, and the cost rises accordingly.

- **Basic**: Provided **free** to every account. Technical support cases are not allowed; only account and billing inquiries, documentation and forums, and some Trusted Advisor checks are available.
- **Developer**: An inexpensive paid plan. **Technical inquiries by email** are possible (during business hours). Suitable for the development and testing stage.
- **Business**: **24/7, year-round** technical support (phone, chat, email) and **the full set of Trusted Advisor checks**. Suitable for production workloads in operation.
- **Enterprise**: The highest level. On top of 24/7 support, it provides **the fastest response (15-minute target for urgent cases)**, a dedicated **TAM**, concierge billing support, and more. For large-scale, mission-critical environments.

| Plan | Cost | Technical support | Representative features |
|------|------|-----------|-----------|
| Basic | Free | None (no cases) | Documentation, forums, billing inquiries, limited Trusted Advisor |
| Developer | Paid (low) | Email (business hours) | Development/testing stage |
| Business | Paid (mid) | 24/7 phone, chat, email | Full Trusted Advisor, for production |
| Enterprise | Paid (high) | 24/7 + shortest response | TAM, concierge, mission-critical |

**To use an analogy, it is a mobile carrier's pricing tiers, or the ticket grades at an amusement park.** Even when you enter the same park, the wait is different for a regular admission ticket and a priority-boarding pass; in the same way, even when you use the same AWS, **where you stand in the line** changes with your support plan. The important point is that it is not the performance or features of the services themselves that change.

What actually separates the four tiers becomes clear when you look at it along **three axes**.

| Axis | Lower tier | Higher tier |
|----|-----------|---------|
| **Whom do you ask?** | Documentation and online materials only | Documentation + filing cases with AWS engineers |
| **How and when do you ask?** | Email, business hours | Phone and chat as well, year-round |
| **How deeply do they help?** | Answer your question | A dedicated person who knows your environment makes proposals first |

If you walk this table from left to right, it becomes exactly Basic → Developer → Business → Enterprise. It is much easier if you think of it not as four things to memorize but as **one direction**.

Here is a sketch of what kind of company each tier actually suits.

- **Basic**: Someone who has just created an account and is studying alone, personal hands-on practice, a stage where nothing is being served yet.
- **Developer**: A development or testing environment with no customers yet. A situation where it is fine to ask by email when you get stuck and receive the answer the next day.
- **Business**: The stage of operating **a service that real customers use**. If an outage hits in the middle of the night, you need to call someone right then, so year-round support becomes essential.
- **Enterprise**: A mission-critical environment where, if it stops, the company's revenue and trust are shaken immediately. You buy not only the response after an incident but also **preparing together in advance so incidents do not happen**.

It is natural for plans to differ even within the same company. Suppose an e-commerce company splits its work into three accounts: a development account where developers experiment freely, a staging account for pre-release validation, and a production account where real orders come in. If the development account stops for a moment, the loss is a few developers' time, but **if the production account stops, no orders come in for that whole time.** So this company left the development account on a lower tier and raised only the production account to a higher plan. The real criterion for choosing a support plan is not "the size of the company" but **"what do we lose if this account stops?"**

> ⚠️ **Trap**: When several plans satisfy all the requirements in an exam question, the answer is **not the best plan but the lowest (= cheapest) plan**. If the question says only "needs 24/7 support and the full Trusted Advisor," the answer is Business, and choosing Enterprise there is marked wrong as **overspending beyond the requirements**. Conversely, when the words "dedicated technical advisor" or "mission-critical" appear, then it is Enterprise. **Not choosing one step above what the question asked for** is the key skill for this question type.

"Free basic support" = Basic, "email technical support, development stage" = Developer, "24/7 support, full Trusted Advisor, production" = Business, "TAM, fastest response, mission-critical" = Enterprise. It is easy to remember that you move up in order of the strength of the clues.

## TAM (Technical Account Manager): Our Dedicated Technical Advisor

A **TAM (Technical Account Manager)** is **a dedicated technical advisor provided with Enterprise Support**. The TAM keeps track of the customer's environment on an ongoing basis and works alongside you on architecture reviews, operational best practices, cost optimization, preparation for important launches, and so on. Unlike general support, which responds only when a case arises, the key point is that this is **a person who keeps following the customer consistently**.

**To use an analogy, it is the difference between an emergency room and a family doctor.** General support is closer to an emergency room. When you are sick you go and they treat you, but they do not know what you usually eat or what surgery you had last year. You have to explain from scratch every time. A TAM is closer to a family doctor. This is **someone who already knows our environment**, so explanations are short, and above all they bring things up before you get sick, with something like "You mentioned that event next month, so let's check ahead of time whether that configuration can hold up."

Putting this difference in a table prevents confusion.

| | General technical support | TAM |
|---|---|---|
| When do you meet? | Only when you open a case | Continuously, in normal times |
| Do they know our environment? | You must explain every time | They already know it |
| Direction | We ask, they answer | They sometimes propose first |
| Which plan? | Paid plans in general | **Enterprise only** |

To sum up, what a TAM sells is **not speed but context**. A fast response comes along with any higher plan, but "someone who knows our company's circumstances" cannot be produced without a dedicated person.

If you see "dedicated technical advisor" or "a designated person who continuously watches over our environment," it is a TAM, and this is **exclusive to the Enterprise plan**. There is no TAM at Business and below.

## AWS Trusted Advisor: The Automatic Check Coach

**AWS Trusted Advisor** is a service that **automatically inspects the customer's environment and points out improvements compared with best practices**. The checks are divided into five categories.

1. **Cost optimization**: unused resources, underutilized instances, and so on
2. **Performance**: throughput and configuration improvements
3. **Security**: open security groups, MFA not set up, exposed access keys, and so on
4. **Fault tolerance (Fault Tolerance)**: lack of backups and redundancy
5. **Service quotas (Service Quotas)**: warnings when you are approaching a limit

What matters is that **the scope of checks differs by plan**. Basic/Developer offer **only the core security and service quota checks**, and **the full five-category checks open at Business and Enterprise**.

**To use an analogy, it is a regular car inspection or a health checkup.** Even with no symptoms, when you go to the garage they tell you "the brake pads are nearly worn out" or "the tire pressure is low." The key is that they tell you **before it breaks**, not after. This is exactly what Trusted Advisor does for a cloud environment. A person cannot comb through the account every day checking "are there any open ports, any unused servers?", so a tool sweeps through for you and hands you a list.

If you get a feel for what kind of nagging each of the five categories does, it becomes easier to memorize.

| Category | What it points out | One-line summary |
|------|------------------|------------|
| Cost optimization | Storage volumes not attached to anything, instances that are barely used | "Money is leaking" |
| Performance | Spots where specs are insufficient or configuration is inefficient | "It may get slow" |
| Security | Overly open firewall rules, MFA not set up | "It's dangerous" |
| Fault tolerance | No backups, configurations concentrated in one place | "If one dies, everything dies" |
| Service quotas | Items close to the limits placed on the account | "Soon you won't be able to create more" |

What the exam asks is **"to receive all five of these, which plan must you be on?"** The answer is Business or above. Even on the free plan you can meet Trusted Advisor itself, but remember only that **the scope it shows is limited**.

If you see "automatically check the environment and give recommendations on security, cost, and performance," it is Trusted Advisor. "Which plan do you need to get the full checks?" → Business or above. Do not confuse who does the checking (a person, the TAM) with what does the checking (a tool, Trusted Advisor).

> ⚠️ **Trap**: An option saying "Trusted Advisor can be used only on paid plans" is **wrong.** Some checks are provided even on the free Basic plan. The accurate wording is "**the full set of checks** opens at Business and above." Questions like this create wrong answers by swapping *whether it is offered* with *the scope it is offered at*, so read carefully whether an option's statement says "cannot be used" or "only partly available."

## How to Tell People from Tools

Let us line up side by side the three things that learners mix up most often in this unit.

| Name | Person or tool? | What it does | Where |
|------|-------------------|---------|--------|
| Technical support case | A person (responds when asked) | Answers the problem we asked about | Developer and above |
| **TAM** | **A person (always attached)** | Knows our environment and proposes first | **Enterprise only** |
| **Trusted Advisor** | **A tool (automatic)** | Sweeps the environment and gives a list of improvements | All plans (scope differs) |

In one line: **a case is something we call, a TAM is a person at our side, and Trusted Advisor is a checker that runs on its own.**

The response speed and depth of help you need is the tier of the plan. You start with free Basic; at the development stage you go to Developer, to protect production 24/7 you go to Business, and for a mission-critical environment that needs a dedicated person (TAM) and the shortest response you move up to Enterprise. A support plan is closer to insurance. If nothing happens it feels like a waste, but it pays for itself the one time a service stops in the middle of the night. So judge not by "do we need it right now?" but by "what do we lose when it stops?"

## How It Appears on the Exam

| If the question contains this kind of wording | The answer is |
|---------------------------|--------|
| "At no additional cost," "cannot open technical cases," "billing inquiries only" | Basic |
| "Development/testing stage," "email inquiries are enough," "business hours" | Developer |
| "Production operation," "year-round phone and chat," "full Trusted Advisor" | Business |
| "Dedicated technical advisor," "mission-critical," "fastest response," "concierge" | Enterprise |
| "A designated person who continuously understands the customer environment" | TAM (Enterprise) |
| "Automatic checks," "improvement recommendations versus best practices," "five categories" | Trusted Advisor |
| "The cheapest plan that satisfies the requirements" | The **lowest** tier that exactly meets the conditions |

Be especially careful with the last row. About half of the questions in this unit take the form of asking for **"the cheapest option that gives everything required."** Build the habit of crossing off the requirement list one item at a time and choosing the lowest tier that remains at the end.

## Support Plan Signal Keywords

| Signal (keyword) | Answer |
|--------------|----|
| Free, no technical cases, billing inquiries only | Basic |
| Email technical support, development/testing stage | Developer |
| 24/7 support, full Trusted Advisor, production | Business |
| TAM, fastest response, mission-critical | Enterprise |
| Dedicated technical advisory staff | TAM (Enterprise only) |
| Automatic environment checks, best-practice recommendations | Trusted Advisor |

In the next article, we will look at the billing structure for bundling multiple accounts for payment and management, and at the tools for estimating costs in advance.

## 📖 Glossary

- **Support Plan**: A tiered system that decides how fast and how deep a help you receive from AWS. Subscribed to per AWS account.
- **Basic**: The free tier provided to every account by default. You cannot open technical support cases.
- **Developer**: A low paid tier suited to the development and testing stage. Technical inquiries by email are possible during business hours.
- **Business**: A tier suited to production operation used by real customers. Year-round support and the full Trusted Advisor checks open up.
- **Enterprise**: The top tier for mission-critical environments. Provides the fastest response and a dedicated TAM.
- **Technical support case**: An inquiry filed with AWS by describing a problem. Can be opened at Developer and above.
- **TAM (Technical Account Manager)**: A dedicated technical advisory **person** provided with Enterprise. Continuously keeps track of the customer's environment.
- **Trusted Advisor**: A **tool** that automatically sweeps the account environment and points out improvements compared with best practices.
- **Fault Tolerance**: The property that the whole does not stop even if part of it fails. One of the Trusted Advisor check categories.
- **Service Quotas**: The upper limits on resource creation placed on each account. Trusted Advisor warns when you approach a limit.
- **Mission-critical**: Core work where the business is hit immediately if it stops. A representative clue in Enterprise questions.

---

## 📝 Practice Questions

**Question 1.** You run a production workload 24/7 and need phone/chat technical support and the full set of Trusted Advisor checks. However, you don't need a dedicated TAM. Which support plan is the best fit?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**Answer: C**  
Explanation: The Business plan provides 24/7 phone/chat/email technical support and the full set of Trusted Advisor checks, making it suitable for production operations. Basic has no technical cases, Developer is limited to email during business hours, and Enterprise includes a TAM and the fastest response — exceeding the requirements (and overpaying).

---

**Question 2.** A large enterprise running a mission-critical environment wants a dedicated technical advisor and the fastest emergency response. Which support plan is the best fit?

A) Developer  
B) Business  
C) Enterprise  
D) Basic  

**Answer: C**  
Explanation: The Enterprise plan provides a dedicated TAM, the fastest response for critical cases (15-minute target), concierge support, and more, making it suitable for a mission-critical environment. Basic and Developer don't even have 24/7 support, and Business is 24/7 but doesn't include a TAM.

---

**Question 3.** Which plan is provided to every account at no additional cost, cannot open technical support cases, and can only use billing inquiries, documentation, and forums?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**Answer: A**  
Explanation: Basic is provided free to every account but cannot open technical support cases; it can only use account/billing inquiries, documentation, forums, and limited Trusted Advisor. Developer and above are all paid and can open technical support cases.

---

**Question 4.** Which dedicated person is provided with Enterprise Support and continuously understands the customer's environment to advise on architecture, operations, and cost?

A) Trusted Advisor  
B) Technical Account Manager (TAM)  
C) Solutions Architect certification  
D) AWS Config  

**Answer: B**  
Explanation: A TAM is a dedicated technical advisor provided with the Enterprise plan who stays with the customer continuously and guides them on best practices. Trusted Advisor is an automatic-check tool (not a person), and Config is a configuration assessment service — different from a dedicated advisory person.

---

**Question 5.** Which service automatically inspects your environment and recommends improvements across five categories — cost, performance, security, fault tolerance, and service quotas? (Note: the full set of checks is provided on Business or higher.)

A) AWS Budgets  
B) AWS Trusted Advisor  
C) AWS Cost Explorer  
D) Technical Account Manager  

**Answer: B**  
Explanation: Trusted Advisor automatically inspects your environment across five categories (cost, performance, security, fault tolerance, service quotas) and recommends improvements relative to best practices, with the full set of checks unlocking on Business and Enterprise. Budgets is budget alerts, Cost Explorer is cost analysis, and a TAM is a human advisor — none is an automatic-check tool.

---
