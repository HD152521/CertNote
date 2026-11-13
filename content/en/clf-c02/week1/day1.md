# Day 1 - What Is Cloud Computing

## 📌 Key Takeaways

- **Cloud computing** = renting computing resources over the internet and **paying only for what you use**. It has the same structure as an electricity bill.
- On-premises means **upfront investment (capital expense)**; the cloud means **pay for what you use (variable expense)**. Scaling takes only minutes, too.
- Three deployment models — **public** (shared by many customers) / **private** (dedicated to one organization) / **hybrid** (connecting the two).
- **Six advantages**: trade capital expense for variable expense, economies of scale, no need to guess capacity, speed and agility, lower operating costs, go global in minutes.
- The five cloud characteristics defined by NIST: on-demand self-service, broad network access, resource pooling, rapid elasticity, measured service.

## Definition of Cloud Computing

- **Definition**: a model where you rent computing resources (servers, storage, databases, networking, software, and so on) over the internet **when you need them, and pay only for what you use**.
- **Analogy**: electricity. We don't keep a generator at home. We plug into an outlet and pay for the electricity we consume.
- The cloud works the same way — instead of buying servers and placing them in your own server room, you rent servers from a provider like AWS over the internet and pay according to usage.

Comparing it with the traditional approach (on-premises) makes the difference clear.

| Comparison | On-premises (own it yourself) | Cloud (rent it) |
|-----------|----------------------|---------------------|
| Buying servers | Purchase up front with a large payment | No purchase needed, use when needed |
| Cost structure | Upfront investment (capital expense) | Pay for what you use (variable expense) |
| Capacity expansion | Weeks to months to order and install new equipment | Scale with a few clicks in minutes |
| Management responsibility | Power, cooling, and hardware are all on you | The provider manages the physical infrastructure |

The U.S. National Institute of Standards and Technology (NIST) defines five characteristics of the cloud — ① on-demand self-service (use resources immediately, on your own, when needed), ② broad network access, ③ resource pooling (resources shared among multiple users), ④ rapid elasticity (automatic scaling up/down to match demand), and ⑤ measured service (usage is metered and then billed). These five are the criteria that distinguish the cloud from merely being "someone else's server."

## Before the Cloud — What Was So Inconvenient?

You can understand why the cloud came about at a glance by looking at "what you had to do before it." To build an internet service, the steps went roughly like this.

1. **Guess in advance how big it will get** — you had to put a number on "how many people will show up at the same time?" before development even began.
2. **Order the equipment** — quotes, approvals, delivery, rack installation, cabling, and OS installation took **weeks to months**.
3. **Prepare space for the servers** — electricity, cooling, uninterruptible power, fire suppression, access control. To turn on a single server, you had to start by renovating the building.
4. **Assign people** — if a disk failed in the middle of the night, someone had to go in and swap it, so you needed a 24-hour on-call rotation.

In other words, it was **a structure where money and time went out before you had even written any code**. On top of that, there was a trap you could not escape: the "guessing in advance" in step 1 will be wrong anyway.

![A graph of fixed equipment capacity versus uneven real demand — spare capacity is waste, and exceeding it causes outages](/diagrams/en/capacity-vs-demand.svg)

- **Buy too much** — your money is tied up in equipment that sits idle most of the time. A few years later, all that is left is depreciation.
- **Buy too little** — the service stops at precisely the moment people flood in. Even if you try to buy more, it is another few weeks until delivery.

The cloud eliminates this dilemma itself. **That is because you no longer need to guess in advance.** When demand rises, you scale up at that moment, and when it falls, you scale down. This is why **③ no need to guess capacity** is emphasized so heavily among the "six advantages."

Think of university course registration or concert ticket booking. Only a few days out of the year, and only for a few minutes at a particular time, does traffic explode, while the rest of the time it is quiet. With on-premises, you would have to buy equipment that sits idle all year round for just those few minutes. With the cloud, you add servers only during that window, then return to normal, and pay **only for the time you scaled up**. This is why services with such "spiky demand" were among the first to move to the cloud.

> ⚠️ **Pitfall**: "The cloud is always cheaper" is easily used as a **wrong answer choice** on the exam. Its strength is not an absolute price but its **cost structure**: ① start without upfront investment, ② pay nothing when you don't use it, and ③ match demand. For a workload that runs at the same load for years, owning the hardware can actually be cheaper. If you see an absolute expression such as "always cheaper" in an answer choice, be suspicious.

## The Cloud We Already Use

The cloud is not a distant concept. All of the following run on the cloud.

- **Photo backup services** that automatically save your smartphone pictures
- **Online office suites** that let you edit documents right in a web browser
- **Streaming services** that deliver movies over the internet

Users may not even know where the servers are, yet they enjoy an experience that is **instantly available when needed and scales seamlessly**. That is the value the cloud provides.

## Three Analogies for First-Time Learners

A lot of abstract terms arrive all at once, so let's anchor them with pictures first.

**① A water faucet — on-demand and pay-as-you-go billing**
Nobody digs a well at every house. You open the tap and water comes out, and you pay for what the meter shows. Close it and the billing stops. With servers, too, you open them when needed and close them when not. **"Pay only for what you use (pay-as-you-go)"** is the story of this meter.

**② A rental car — using instead of owning**
You don't buy a car just to use it for a few days. Insurance, maintenance, and parking are the rental company's worry, and all you do is drive. If you have a lot of luggage, you switch to a bigger car (scale up), and if more people join, you rent one more car (scale out).

**③ A hotel banquet hall — elasticity**
When you don't know whether 20 or 200 people will come, it is a room where the partitions are opened when needed and closed again when people leave. **Automatically growing and shrinking to match demand** is elasticity, and it is the core product the cloud sells.

Let me add just one thing here. Just as the households of an apartment building share one water main, in the cloud **many customers share the same physical resources** (resource pooling). This "sharing" is what brings unit prices down, and that is **economies of scale**.

**On-demand** means you can use something "at the very moment you need it, without waiting for anyone's permission, by yourself." In the on-premises era, to use one server you had to submit a purchase request and wait for approval. In the cloud, a few clicks on the screen give you a server in minutes. NIST's "on-demand self-service" refers to this change.

## The Three Cloud Deployment Models

Let's start with the basic classification that appears on the exam.

- **Public Cloud**: resources delivered over the internet by a provider such as AWS or Azure and shared by many customers. The most common form.
- **Private Cloud**: a cloud used exclusively by a single organization. Chosen when security or regulatory requirements are strict.
- **Hybrid Cloud**: public + private (or on-premises) connected and used together. For example, keeping some data internal while placing the rest in the public cloud.

The cloud is also divided by service level into IaaS / PaaS / SaaS. IaaS (provides basic infrastructure such as servers and networking, e.g., EC2), PaaS (also provides the application runtime environment, e.g., managed databases), and SaaS (provides finished software, e.g., webmail). The higher up you go, the less the user has to manage.

### Which Deployment Model Should You Choose?

The three models are not ranked better or worse; they are **choices that depend on the situation**. Exam questions also take the form "what would you recommend in this situation?"

| Situation | Suitable model | Reason |
|------|-------------|------|
| A new service with uncertain demand | Public | Start right away with no upfront investment, scale freely up and down |
| Law or regulation prevents keeping certain data outside | Private (or hybrid) | Keeps sensitive data within the organization's control |
| Already invested heavily in a data center and wants to migrate in stages | Hybrid | Preserves existing assets while migrating gradually |

Owning and operating everything yourself is not a deployment model but simply **on-premises**, and using several providers together, **multi-cloud**, is a different concept from hybrid. Answer choices often mix these three up, so keep them distinct.

> ⚠️ **Pitfall**: If you remember "hybrid = using several cloud companies together," you will get it wrong. The heart of hybrid is **connecting the public cloud with the organization's internal environment (private cloud or on-premises)**. If a question contains wording like "keep the existing data center while moving some workloads to AWS," the answer is hybrid.

## IaaS · PaaS · SaaS — How Much Does Someone Else Do for You?

If the deployment models classify **where** you put things, IaaS/PaaS/SaaS classifies **how much** someone else handles for you. Some questions mix the two.

The most famous analogy is **pizza**. The ways of eating pizza are exactly these four levels.

| Category | In pizza terms | What the customer manages | Typical example |
|------|------------|------------------|---------|
| On-premises | Buy the ingredients and make everything from the dough up yourself | Everything | A server in the company's own server room |
| **IaaS** (Infrastructure as a Service) | Buy a meal kit and bake it in your home oven | Operating system, middleware, apps, data | EC2 |
| **PaaS** (Platform as a Service) | Have it delivered and eat at home | Applications, data | Managed database, app deployment platform |
| **SaaS** (Software as a Service) | Go to a restaurant and eat there | Just your data and account | Webmail, web office suite |

As you go down (**IaaS → PaaS → SaaS**), there is less to worry about, but you also have less fine-grained control. So if it is "highly flexible but with a large management burden," it is **IaaS**; if it is "just upload code and the runtime environment is handled for you," it is **PaaS**; and if it is "no installation, no operations, just log in and you're done," it is **SaaS**.

**Pitfall**: the deployment model (public/private/hybrid) and the service model (IaaS/PaaS/SaaS) are **different axes**. There is "IaaS on a public cloud" and also "PaaS on a private cloud." If an answer choice mixes the two axes, first check whether the question is asking "where you put it" or "how much you hand over."

## The Six Advantages of the Cloud

These are the six advantages of cloud adoption that AWS officially emphasizes. They are within the scope of the exam, so make sure you understand the meaning of each one.

| Advantage | Core meaning |
|------|-----------|
| ① Trade capital expense for variable expense | Instead of investing a large sum up front (capital expense), pay only for what you actually use (variable expense) |
| ② Benefit from massive economies of scale | Because countless customers share the platform, unit costs drop and prices are lower |
| ③ Stop guessing capacity | No need to predict how much you'll need in advance — scale up or down to match demand |
| ④ Increase speed and agility | Provision resources in minutes → experiment with and launch ideas quickly |
| ⑤ Stop spending money running and maintaining data centers | No need to handle power, cooling, or hardware replacement yourself |
| ⑥ Go global in minutes | Expand your service onto AWS infrastructure in multiple countries with a few clicks |

Here is each advantage unpacked.

- **① Trade capital expense for variable expense** — if you buy servers up front, your money is tied up even while they sit idle, but with the cloud you pay only for what you use.
- **② Massive economies of scale** — because AWS aggregates the usage of millions of customers worldwide, it can supply resources far more cheaply than an individual company buying equipment alone.
- **③ No need to guess capacity in advance** — with the traditional approach you had to predict "peak traffic" and buy equipment accordingly. Buy too much and it's wasted, buy too little and you get outages. With the cloud you simply adjust to demand.
- **④ Speed and agility** — a new server is ready in minutes with a few clicks, so experimentation and launches happen faster.
- **⑤ Lower data center operating costs** — hand off "non-core work" like electricity, cooling, and hardware management to the provider and focus on your core business.
- **⑥ Go global in minutes** — with a few clicks you can serve users on other continents from nearby infrastructure, making responses fast.

The cloud's "elasticity" and "scalability" are similar but different. Scalability is the ability to add resources itself, while elasticity is the ability to **automatically grow and shrink** with demand. Items ③ and ④ among the six advantages are possible precisely because of this elasticity.

## Confusing Term Pairs

What costs points on a foundational exam is not difficult concepts but **telling similar terms apart**.

| Pair | Difference | One-line memory aid |
|----|------|-------------|
| Scalability vs elasticity | Whether you **can** add vs whether it grows and shrinks **automatically** to match demand | Elasticity = scalability + automatic + shrinking too |
| Scale **up** (vertical) vs scale **out** (horizontal) | Make one server **bigger** vs have **more** servers | Up = switch to a bigger car / Out = add one more car |
| Capital expense (CapEx) vs operating expense (OpEx) | Money that goes out big up front vs money that goes out as you use | The cloud shifts CapEx to OpEx |
| High availability vs fault tolerance | A design that **reduces** downtime vs a design that **keeps working as is** even when something fails | Both are "preparing for failure," but the required level differs |
| On-premises vs private cloud | Simply owning and operating it yourself vs dedicated to one organization but offering self-service, pooling, and elasticity **like a cloud** | Not everything dedicated is a private cloud |
| Agility vs elasticity | Being able to **try new ideas quickly** vs **capacity following demand** | Agility is speed, elasticity is capacity |

What the cloud does well is **scale out**. You cannot grow one machine indefinitely, but splitting across many machines takes you much further, and when one dies the others hold up. If a question contains "add more servers to distribute traffic," it is scale out (horizontal scaling).

## How It Appears on the Exam

CLF-C02 is mostly not calculation or configuration questions but **questions that check whether you recognize concepts**. When you see the keywords below in a question, the answer candidates are nearly determined.

| If the question contains this wording | The answer is this |
|--------------------------|----------|
| "start without upfront investment," "minimize initial investment," "CapEx to OpEx" | Trade capital expense for variable expense |
| "demand is hard to predict," "we don't know how much we'll need" | No need to guess capacity / elasticity |
| "AWS buys in bulk and lowers unit prices," "cheap thanks to scale" | Massive economies of scale |
| "what took weeks now takes minutes," "experiment and launch quickly" | Speed and agility |
| "no need to manage power, cooling, or racks" | Lower data center operating costs |
| "quickly to overseas users," "easily expand to multiple countries" | Go global in minutes |
| "create instantly without approval," "meter usage and bill for it" | On-demand self-service / measured service |
| "keep the existing data center while moving only some workloads to AWS" | Hybrid cloud |
| "want to manage even the operating system," "maximum control" | IaaS (EC2) |
| "no installation or operations, just log in and use it right away" | SaaS |

Imagine a startup whose sign-ups jumped to dozens of times the usual level in a single day because of an ad campaign. With on-premises, there would be no way to add equipment that same day and the service would have stopped. In the cloud, you add servers while traffic rises and return to normal when the campaign ends. More than one advantage is at work here — no need to guess capacity, elasticity, speed and agility, and variable expense all operate at once. The exam asks you to pick "the one it solved most directly," so it is important to get into the habit of first identifying whether the heart of the passage is **cost**, **speed**, or **capacity fluctuation**.

In the next article, we look at where and how this cloud is actually laid out — AWS's global infrastructure (Regions, Availability Zones, and edge locations).

## 📖 Glossary

- **Cloud computing**: a model of renting someone else's servers and storage over the internet and paying fees for what you use.
- **On-premises**: the traditional approach of buying servers yourself and running them in your own company's server room.
- **Capital expense (upfront investment)**: the large lump sum spent to buy equipment in advance. It is money already spent even if you don't use it.
- **Variable expense**: money that goes out only as much as you use. If you don't use it, you don't pay.
- **Economies of scale**: the effect where unit prices fall when you pool a large amount of demand and buy together.
- **Elasticity**: the property of resources **automatically** growing and shrinking to match demand.
- **Scalability**: the ability to add resources itself. It differs from elasticity in that it does not have to be automatic.
- **Public / private / hybrid cloud**: shared by many customers / dedicated to one organization / connecting the two (or on-premises) and using them together.
- **IaaS · PaaS · SaaS**: three levels of renting out only basic infrastructure (EC2) / up to the app runtime environment (managed DB) / up to finished software (webmail).
- **NIST**: the U.S. National Institute of Standards and Technology. The body that produced the official standard defining the five characteristics of the cloud.
- **On-demand**: using something at the very moment you need it, directly and immediately, without waiting for approval.
- **Pay-as-you-go**: a pricing method like a water meter that measures usage and bills only for that amount.
- **Resource pooling (multi-tenancy)**: multiple customers sharing the same pool of physical resources. This is what brings unit prices down.
- **Scale up / scale out**: making one server bigger (vertical) / adding more servers (horizontal). The cloud is strong at scaling out.
- **CapEx / OpEx**: capital expense that goes out big up front / operating expense that goes out as you use. The cloud turns the former into the latter.
- **Agility**: the ability to quickly build a new idea and drop it if needed. It comes from the shortened time to obtain resources.
- **Workload**: the bundle of applications and resources running for a single purpose.
- **Multi-cloud**: using multiple cloud providers together. It is a different concept from hybrid.

## 📝 Practice Questions

**Question 1.** Which of the following best describes the most essential characteristic of cloud computing?

A) All servers are installed and managed directly inside the company  
B) Computing resources are rented over the internet when needed and paid for according to usage  
C) Once purchased, there are no costs at all  
D) Resources can be used without limit even without an internet connection  

**Answer: B**  
Explanation: The cloud is a model where resources are rented on demand over the internet and paid for according to usage. Installing servers directly inside the company is the on-premises approach; the cloud incurs ongoing costs based on usage, and resources are accessed via an internet connection.

---

**Question 2.** Among the six advantages of the cloud, which one best represents "paying only for what you use instead of investing a large sum up front"?

A) Benefit from massive economies of scale  
B) Trade capital expense for variable expense  
C) Go global in minutes  
D) Increase speed and agility  

**Answer: B**  
Explanation: Paying as you go (variable expense) instead of investing up front (capital expense) is exactly the trade of capital expense for variable expense. Economies of scale refers to lower unit costs thanks to many customers, going global refers to the ease of worldwide expansion, and speed and agility refers to the ability to provision resources quickly.

---

**Question 3.** A startup is about to launch a new service where traffic is hard to predict. Which advantage of the cloud directly solves this concern?

A) Stop spending money running and maintaining data centers  
B) Stop guessing capacity  
C) Benefit from massive economies of scale  
D) Trade capital expense for variable expense  

**Answer: B**  
Explanation: When demand is hard to predict, the most direct solution is not having to size capacity in advance — scaling up and down according to demand. Lower operating costs and economies of scale are cost-side benefits, and the capital-to-variable-expense trade is about the payment model, which is not the core concern of "handling unpredictable demand."

---

**Question 4.** Which deployment model connects a public cloud and a private cloud for combined use?

A) Public cloud  
B) Private cloud  
C) Hybrid cloud  
D) On-premises  

**Answer: C**  
Explanation: Connecting the two (or including on-premises) and using them together is the hybrid cloud. Public is a provider's cloud shared by many customers, private is a cloud dedicated to one organization, and on-premises is not cloud at all but the traditional model of owning and operating infrastructure yourself.

---

**Question 5.** Which of the following is NOT one of the cloud characteristics defined by NIST?

A) On-demand self-service  
B) Rapid elasticity  
C) Permanent free usage  
D) Measured service  

**Answer: C**  
Explanation: NIST defines on-demand self-service, broad network access, resource pooling, rapid elasticity, and measured service as characteristics of the cloud. Because the cloud meters usage and bills for it, "permanent free usage" is not a characteristic of the cloud.

---
