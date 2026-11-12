# Day 1 - Pricing Models: The Same Compute Costs Differently Depending on How You Buy It

## 📌 Key Takeaways

- Even the same server costs different amounts depending on the **purchase method**. There is one criterion — **"how long and how reliably do you use it."**
- **On-Demand** is pay for what you use with no commitment (the most flexible, with the highest unit price); **RIs and Savings Plans** give large discounts for a 1-3 year commitment; **Spot** uses spare capacity at the lowest price, but it can be reclaimed.
- The difference between RIs and Savings Plans is **what you commit to** — RIs commit to instance attributes, Savings Plans commit to an hourly spend amount. That is why Savings Plans are more flexible.
- The **Free Tier** is a free allowance for new users (12 months / always free / trials). Beyond the limit, normal charges apply.
- Commitment discounts (RIs and Savings Plans) and **volume discounts** are different things. A volume discount is a structure where the unit price goes down **automatically as usage grows**, with no commitment.

This week is about money. One of the cloud's biggest draws is "you pay only for what you use" — but in fact, the very same resource can cost dramatically different amounts **depending on how you purchase it**. Today we organize the compute pricing models centered on EC2 — On-Demand, Reserved Instances (RIs), Savings Plans, and Spot — along with the Free Tier for new users and volume discounts that lower your unit price the more you use.

There is one core question: "How long, and how predictably, does this workload run?" The answer to that determines the cheapest way to buy.

## Why Are There So Many Pricing Models?

It looks strange at first. You are renting the very same server, so why are there four or five ways to buy it, with prices differing by multiples? Once you know the reason, you do not need to memorize.

Before the cloud, there was effectively **one** choice: buying servers. A company guessed in advance "how much will we need over the next three years" and ordered equipment; if it guessed high, money was tied up in idle servers, and if it guessed low, the service stalled in peak season.

The cloud solved this problem with "renting." But the party doing the renting has its own circumstances. AWS has to build data centers and fill them with servers in advance, so a **customer who promises to "use it steadily for three years"** is a valuable customer whose plans are easy to make, and there is room to give them a lower price. Conversely, **servers sitting idle that nobody uses** earn zero if left alone, so it is to AWS's advantage to hand them over even at a bargain price.

Here the true nature of pricing models is revealed. This is not a technical classification but a **classification of deal terms**, with the same structure as when we buy airline tickets.

| Airline ticket | AWS pricing model | Deal terms |
|--------|---------------|-----------|
| A full-fare ticket bought at the counter the same day | On-Demand | You can buy any time and cancel any time, but it is the most expensive |
| A discounted round-trip ticket bought in advance | Reserved Instances (RI) | A discount in return for fixing the date and route |
| An annual pass for a particular airline | Savings Plans | You only promise "I'll fly this much per year," and the route is free |
| Seats left right before departure | Spot Instances | The cheapest, but the seat may disappear |
| Chartering a whole plane | Dedicated Host | Exclusive use of the entire physical equipment |

There is one principle to read from this table. **"The more flexibility I give up, the cheaper the price gets."** On-Demand holds 100% of the flexibility, so it is expensive; a commitment gives up time in return for a discount; and Spot is the cheapest in return for accepting even the risk that "it may be cut off at any time." When you are stuck on which model to pick on the exam, ask **"What can this workload give up?"** and the answer comes out.

## On-Demand: Pay for What You Use, No Commitment

**On-Demand** is the most basic pricing model. With no long-term commitment or upfront payment, you pay only per hour (or second) of running time. You can start any time and just turn it off any time. In return, the unit price is the highest.

When is it good? It suits **times when you do not know how much you will use**, such as when traffic is hard to predict, short-term projects, or the first stage of development and testing. It is also the starting point from which you "try it first, understand the pattern, then" optimize with another model.

When you see "no commitment," "flexibly," "unpredictable workload," or "short-term use," it is On-Demand. It is the starting point of cost optimization, not the end point.

The closest analogy is a **taxi**. You do not have to decide in advance where to go, you get in when you want to ride and get out when you want to get off. The meter rises only as much as you rode. In return, if you travel the same road every day, taxi fares are far more expensive than a commuter pass.

That is why On-Demand earns its keep in **a new service whose traffic scale nobody knows**, **short-term projects lasting a few weeks**, **development and test environments that are turned off at night**, and **extra capacity layered on top of the usual committed portion only when a sudden surge hits**. In particular, the fact that no charges accrue while it is switched off matters greatly for development environments.

> ⚠️ **Pitfall**: Do not memorize "On-Demand is expensive, so it is a bad choice." If a question contains **"we do not want a commitment" or "the requirements are still uncertain,"** the answer is On-Demand, and choosing RIs or Savings Plans in that case is wrong. Cheap is not automatically the answer; **the cheapest among those that satisfy the conditions** is the answer.

## Reserved Instances (RI) and Savings Plans: Commit and Get a Discount

If you are **certain that the workload runs steadily**, you can get a large discount in return for committing to one or three years. It becomes up to about 72% cheaper than On-Demand.

- **Reserved Instances (RIs)**: A 1-year/3-year commitment on a specific instance type, Region, and so on. The scope of the commitment is tied to instance attributes, so it is relatively rigid.
- **Savings Plans**: A **usage (amount) based commitment** of "I will spend a certain amount per hour (for example, $10/hour) for 1 or 3 years." The commitment applies flexibly even when you change the instance type or Region, so it is freer than RIs.

| Item | Reserved Instances (RI) | Savings Plans |
|------|------------------|----------------|
| What you commit to | Specific instance attributes | Hourly spend amount |
| Flexibility | Relatively low | High (type and Region changes allowed) |
| Discount | Up to ~72% vs On-Demand | Up to ~72% vs On-Demand |
| Suitable situation | Stable, fixed workloads | Stable, but the configuration may change |

When you see "run a workload that operates steadily over a long period at the lowest price," it is RIs or Savings Plans. If a clue is added such as "keep the discount even if the type or Region changes" or "flexible commitment," choose Savings Plans.

### Looking at It as a Commuter Pass and a Membership

The difference between the two models is close to the difference between a **commuter pass** and a **prepaid transit card**.

- **Reserved Instance = a commuter pass for a specific route.** You promise "I'll ride this route for a year" and buy it cheaply. If you ride that route, you benefit, but if you move house and end up taking a different route, it becomes useless.
- **Savings Plans = a transit card loaded in advance with a year's worth.** You only promise "I'll spend this much every month for a year," and whichever route you take, the discount applies within that committed amount.

So when you see the nuance **"I want to commit, but I think the configuration will change later,"** it leans toward Savings Plans.

One more axis to know is the **upfront payment option**. It splits into three depending on when you pay at the time of commitment.

| Upfront option | Description | Discount level |
|-------------|------|-----------|
| All Upfront | Pay for the whole commitment period at once | The largest discount |
| Partial Upfront | Pay part in advance and the rest monthly | Middle |
| No Upfront | Pay in monthly installments | The smallest discount |

The principle is simple. **The earlier you pay, the more you get discounted.** This is exactly the same logic as getting a discount for paying annually in daily life.

> ⚠️ **Pitfall**: A commitment discount is **a deal where you save money in exchange for losing flexibility**. If you take a 1-year commitment and close the service after six months, the commitment for the unused period remains as a burden. That is why the practical order is always **"check the pattern with On-Demand, then commit only as much as reliably runs all the time,"** and on the exam too, "a 3-year commitment for a workload that is just starting" is a wrong-answer signal.

A manufacturer that moved its internal business system to AWS was shocked at its first month's bill. There were two causes. **The development and test servers were left on at night and on weekends**, and **even the periodic business servers that were certain to run all year round were all run On-Demand**. The company set the development servers to shut down automatically outside business hours and moved only the portion that runs 24 hours into a commitment. It did not build a new feature or reduce servers; **simply by buying the same resources in a different way**, the bill dropped noticeably. The first step of cost optimization is usually this unglamorous.

## Spot Instances: Spare Capacity at a Bargain Price, but It Can Be Reclaimed

**Spot Instances** are a way to **rent AWS's spare compute capacity at a bargain price, like an auction (up to about 90% off On-Demand)**. In return, when AWS needs that capacity back, it can **reclaim the instance after a short notice**.

That is why Spot suits only **work that is fine to interrupt (fault-tolerant)**. Workloads that can stop midway and restart, such as batch processing, large-scale data analysis, rendering, and CI builds, are typical. It is unsuitable for always-on services that must never be cut off, such as a payment server.

```
[Trade-off between price and stability]
On-Demand  : expensive, always guaranteed
RI/SP      : commitment, guaranteed + large discount
Spot       : lowest price, can be reclaimed (only for interruption-tolerant work)
```

When you see "cheapest," "spare capacity," or "batch/analysis work that is fine to interrupt," it is Spot. If it is "an always-on service that must not be interrupted," Spot is the wrong answer.

The analogy that explains Spot best is **a plane ticket for seats left right before departure**. An empty seat is worth zero the moment the plane takes off, so it is better to fill it even at a bargain price. In return, such tickets carry the condition that "you may have to give up the seat if a full-fare passenger appears." AWS's spare capacity is the same: when demand that will pay the regular price arises, it takes the capacity back. That is why Spot suits only **"work that is fine to stop and just redo."**

| Work suited to Spot | Work not suited to Spot |
|--------------------|-------------------------|
| Large-scale data analysis that runs all night | Always-on services such as payment and login |
| Video and image rendering jobs | Web servers that hold session information on the server |
| Code build and test (CI) jobs | The main database |
| Batch processing that can simply be re-run | Work where data is lost if interrupted |

**Pitfall**: If you reflexively choose Spot just from the sentence "Choose the cheapest method," you will be wrong. If a question carries **"must not be interrupted," "must be always available," or "mission critical,"** Spot is immediately wrong. Conversely, if there is **"interruption allowed," "can be restarted," or "batch processing,"** it is almost certainly Spot.

## Dedicated Hosts and Dedicated Instances: Monopolizing a Physical Server

If the distinctions so far were according to "when and how much you use," there is one more axis. It is **who you share the hardware with**.

By default in the cloud, several customers' virtual servers run together on one physical server (isolation is guaranteed). But there are cases where the software **license is based on the number of physical cores**, so you must identify which physical server it runs on, or regulations mean you **cannot share hardware with other organizations**. What you use then are **Dedicated Hosts** and **Dedicated Instances**.

| Category | Description |
|------|------|
| Dedicated Host | You are assigned **a whole physical server** and control it directly. Used to handle socket- and core-based licensing |
| Dedicated Instance | The hardware is dedicated to our account, but you do not look into or place workloads on the physical server itself |

**Pitfall**: If clues such as **"we must bring over the software license we already use (BYOL)"** or **"the license must be calculated per physical server"** appear, the answer is a Dedicated Host. The point is that this option appears **because of licensing**, not because of security.

## Free Tier: A Free Allowance for People Trying It for the First Time

The **AWS Free Tier** is a free allowance offered so that new users can try services without cost burden. There are three types.

- **12 months free**: A certain amount free for 12 months after signing up (for example, EC2 t2.micro 750 hours per month, a certain amount of S3 capacity).
- **Always Free**: A certain amount free with no time limit (for example, 1 million Lambda requests per month, a certain amount of DynamoDB capacity).
- **Trials**: Using a particular service free for a short period.

When you see "new users" or "try it free up to a certain limit," it is the Free Tier. Beyond the limit, normal charges apply, so the habit of checking usage even while studying is important.

The Free Tier is like a **supermarket sample counter**. It is given so you can just taste it; it is not a substitute for your shopping. So there are points where you get caught while actually studying. The free coverage is limited to **specific instance types and conditions**, so if you pick a larger spec, charges start from that moment; the allowance is **calculated monthly**, so if you run two servers it is used up that much faster. Above all, **resources you forgot to turn off** after finishing studying, especially inconspicuous things such as attached disks and fixed IPs, quietly generate charges.

That is why the first thing to do when you start learning is **to set up a budget alert**. If you set it so an email arrives when a certain amount is exceeded, you can avoid the accident of "finding out when you see next month's card bill" (the budget tool is covered in the next article).

**Pitfall**: The Free Tier is **not a discount model.** If you choose the Free Tier for a question like "How can we reduce the cost of a service in operation?", it is wrong. The Free Tier is a free allowance for new users' **trial and learning**, and the cost-reduction means are commitments (RIs and Savings Plans), Spot, or cleaning up unused resources.

## Volume Discounts: The More You Use, the Lower the Unit Price

Many services use **tiered** pricing where **the unit price falls automatically as usage grows**. The representative is **S3 storage**. For example, the per-GB unit price in the tiers above is cheaper than in the first TB tier. A similar structure exists for data transfer and more.

On top of this, if you bundle multiple accounts with AWS Organizations and use **consolidated billing**, usage is added together and you reach higher discount tiers sooner (consolidated billing is covered in detail on day 4).

When you see "the per-GB unit price drops the more you use" or "pricing by usage tiers," it is a volume (tiered) discount. Distinguish it as an automatic discount based on usage itself, different from commitment-based discounts (RIs/SPs).

## The Five Purchase Methods Compared at a Glance

Putting the methods covered so far on the same axes makes the relationships clear at a glance.

| Purchase method | Commitment | Price | Interruption risk | Typical situation |
|-----------|------|------|-----------|-----------|
| On-Demand | None | Most expensive | None | Unpredictable demand, short-term, development and test |
| Reserved Instances (RI) | 1 or 3 years | Large discount | None | Always-on workloads with a fixed configuration |
| Savings Plans | 1 or 3 years (amount-based) | Large discount | None | Always-on, but the type or Region may change |
| Spot | None | Cheapest | **Can be reclaimed** | Interruption-tolerant batch, analysis, rendering |
| Dedicated Host | Optional | High | None | Per-physical-server licensing, requirement for exclusive hardware |

**The order to run in your head when choosing** is this.

```
Is it fine if it is interrupted?
  └ Yes ──────────────────────────► Spot
  └ No → Does it reliably run for a year or more?
        └ No ──────────────────────► On-Demand
        └ Yes → Might the type or Region change?
              └ Yes ───────────────► Savings Plans
              └ No ────────────────► Reserved Instances (RI)

  (If per-physical-server licensing is involved → Dedicated Host)
```

In reality, you do not use just one of these. You mix them: **lay down a commitment for the portion that runs all the time, take the portion that grows from time to time On-Demand, and handle the analysis that runs at night with Spot**. The exam telling you to pick only one is merely a simplification.

If it is unpredictable, start with On-Demand; once the pattern is established and stable, get a commitment discount with RIs/Savings Plans; and aim for the lowest price with Spot for work that may be interrupted. You learn without burden with the Free Tier, and when usage is large, volume discounts automatically lower the unit price.

## Pricing Model Signal Keywords and Wrong-Answer Traps

| Signal (keyword) | Pricing model |
|--------------|-----------|
| No commitment, flexible, unpredictable, short-term | On-Demand |
| 1-3 year commitment, stable workload, large discount | RI / Savings Plans |
| Keep the discount even if type or Region changes | Savings Plans |
| Lowest price, spare capacity, interruption-tolerant work | Spot |
| New user, free up to a limit | Free Tier |
| Unit price drops the more you use (for example, S3) | Volume/tiered discount |
| Per-physical-server licensing, exclusive hardware | Dedicated Host |

**Wrong-answer traps people often fall for**

1. **"Cheap is the answer"** — If "must not be interrupted" is present, Spot is out; if "we do not want a commitment" is present, RIs and SPs are out. Filter by the conditions first, then choose the cheapest among what remains.
2. **Swapping RIs and Savings Plans** — "Keep the discount even if the type or Region changes" is a Savings Plans clue.
3. **Choosing the Free Tier as a cost-reduction means** — It is only a free allowance for new users' trials.
4. **Lumping volume discounts together with commitment discounts** — A volume discount applies automatically according to usage with no commitment.
5. **Choosing a Dedicated Host as the answer to a security problem** — It mainly shows up for **licensing** requirements.

In the next article, we look at the tools for actually examining and controlling the costs incurred this way — Cost Explorer, Budgets, and cost reports.

## 📖 Glossary

- **Pricing model (purchase option)** : The way of deciding under what deal terms you buy the same resource. It is a classification of contracts, not technology.
- **On-Demand** : The basic rate where you pay only for what you ran, with no commitment. The most flexible and the highest unit price.
- **Reserved Instances (RI)** : A method of fixing attributes such as instance type and Region, committing to use for 1 or 3 years, and receiving a discount.
- **Savings Plans** : A commitment based on **amount**: "I will spend this much per hour." The discount follows even if the type or Region changes.
- **Upfront** : The choice of when to pay the committed amount. There are all, partial, and none, and the earlier you pay, the larger the discount.
- **Spot Instances (Spot)** : A way of using AWS's spare capacity at a greatly discounted price. It can be reclaimed when needed, so **interruption-tolerant (fault-tolerant) work** that may stop and restart is a prerequisite.
- **Dedicated Host** : A method of being assigned a whole physical server exclusively. Used to handle per-physical-unit licensing.
- **Free Tier** : A free allowance for new users. There are three types: 12 months free, always free, and trials.
- **Volume (tiered) discount** : A pricing structure where the unit price drops automatically as usage grows. No commitment is needed.
- **Consolidated billing** : A way of combining the usage of several accounts into a single invoice. Thanks to the summing, you reach discount tiers sooner.

---

## 📝 Practice Questions

**Question 1.** You want to run a new project whose traffic pattern is still uncertain, flexibly and without commitment. Which pricing model is the best fit?

A) Reserved Instances (RIs)  
B) Spot Instances  
C) On-Demand  
D) Savings Plans  

**Answer: C**  
Explanation: On-Demand bills only for what you run, with no long-term commitment or upfront payment, so it's a good starting point for unpredictable or short-term workloads. RIs and Savings Plans assume a 1–3 year commitment, which is a burden when the pattern is uncertain, and Spot carries reclamation risk that doesn't suit stable operation.

---

**Question 2.** You want to run a stable workload that runs steadily 24 hours a day as cheaply as possible, but you also want the discount to keep applying even if you change the instance type or Region. Which is the best fit?

A) Savings Plans  
B) On-Demand  
C) Spot Instances  
D) Free Tier  

**Answer: A**  
Explanation: Savings Plans commit to an hourly dollar spend, so the commitment applies flexibly even when you change instance type or Region. On-Demand has no discount, Spot carries high reclamation risk that doesn't suit always-on stable operation, and the Free Tier is merely a free allowance for new users, not a discount mechanism for always-on workloads.

---

**Question 3.** You want to process a large-scale batch data analysis job — one that's fine to be interrupted and restarted midway — as cheaply as possible. Which pricing model is the best fit?

A) On-Demand  
B) Reserved Instances (RIs)  
C) Spot Instances  
D) Savings Plans  

**Answer: C**  
Explanation: Spot Instances use AWS spare capacity at up to roughly 90% off On-Demand but can be reclaimed, making them the best fit for interruption-tolerant (fault-tolerant) batch and analysis work. On-Demand, RIs, and Savings Plans are more stable but not as cheap as Spot.

---

**Question 4.** A new user wants to try out EC2 and S3 up to a set limit without cost concerns after signing up. What can they use?

A) Volume discount  
B) AWS Free Tier  
C) Reserved Instances (RIs)  
D) Savings Plans  

**Answer: B**  
Explanation: The Free Tier lets new users try services up to a set limit for free, in the form of 12 Months Free, Always Free, and Trials. A volume discount is a unit-price reduction as usage grows, and RIs/Savings Plans are commitment-based discounts, which differ from a free-trial purpose.

---

**Question 5.** What is the pricing structure called where the per-GB price on S3 automatically drops as you store more and more data?

A) Savings Plans  
B) Spot pricing  
C) Volume (tiered) discount  
D) On-Demand pricing  

**Answer: C**  
Explanation: A volume (tiered) discount is a pricing structure where the unit price automatically drops as usage grows, with S3 storage being the prime example. Savings Plans are commitment-based discounts, Spot is auction pricing for spare capacity, and On-Demand is the standard unit price with no commitment — all conceptually different from an automatic unit-price reduction based on usage itself.

---
