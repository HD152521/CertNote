# Day 1 - What Is Cloud Computing

The first step in studying for an AWS certification is getting a clear grip on "what exactly the cloud is." The terminology may look intimidating, but the core idea is surprisingly simple. This article covers the definition of cloud computing, examples we already use in everyday life, and the **six advantages of the cloud** that AWS emphasizes — all explained so that beginners can understand them right away.

## Definition of Cloud Computing

Cloud computing is **a model where you rent computing resources (servers, storage, databases, networking, software, and so on) over the internet when you need them, and pay only for what you use**. Think of electricity. We don't keep a generator at home. We plug into an outlet and pay for the electricity we consume. The cloud works the same way. Instead of buying servers and placing them in your own server room, you rent servers from a provider like AWS over the internet and pay according to usage.

Comparing it with the traditional approach (on-premises) makes the difference clear.

| Comparison | On-premises (own it yourself) | Cloud (rent it) |
|-----------|----------------------|---------------------|
| Buying servers | Purchase up front with a large payment | No purchase needed, use when needed |
| Cost structure | Upfront investment (capital expense) | Pay for what you use (variable expense) |
| Capacity expansion | Weeks to months to order and install new equipment | Scale with a few clicks in minutes |
| Management responsibility | Power, cooling, and hardware are all on you | The provider manages the physical infrastructure |

> 💡 **Related theory**: The U.S. National Institute of Standards and Technology (NIST) defines five essential characteristics of the cloud — ① on-demand self-service (use resources immediately, on your own, when needed), ② broad network access, ③ resource pooling (resources shared among multiple users), ④ rapid elasticity (automatic scaling up/down to match demand), and ⑤ measured service (usage is metered and billed). These five characteristics are what distinguish the cloud from merely being "someone else's server."

## The Cloud We Already Use

The cloud is not a distant concept. Photo backup services that automatically save your smartphone pictures, online office suites that let you edit documents right in a web browser, streaming services that deliver movies over the internet — all of these run on the cloud. Users may not even know where the servers are, yet they enjoy an experience that is instantly available and scales seamlessly. That is the value the cloud provides.

## The Three Cloud Deployment Models

Let's start with the basic classification that appears on the exam.

- **Public cloud**: Resources delivered over the internet by a provider such as AWS or Azure and shared by many customers. The most common form.
- **Private cloud**: A cloud used exclusively by a single organization. Chosen when security or regulatory requirements are strict.
- **Hybrid cloud**: Public + private (or on-premises) connected and used together. For example, keeping some data internal while placing the rest in the public cloud.

> 💡 **Related theory**: The cloud is also divided by service level into IaaS / PaaS / SaaS. IaaS (provides basic infrastructure such as servers and networking, e.g., EC2), PaaS (also provides the application runtime environment, e.g., managed databases), and SaaS (provides finished software, e.g., webmail). The higher up you go, the less the user has to manage.

## The Six Advantages of the Cloud

These are the six advantages of cloud adoption that AWS officially emphasizes. They are a favorite exam topic, so make sure you understand each one.

| Advantage | Core meaning |
|------|-----------|
| ① Trade capital expense for variable expense | Instead of investing a large sum up front (capital expense), pay only for what you actually use (variable expense) |
| ② Benefit from massive economies of scale | Because countless customers share the platform, unit costs drop and prices are lower |
| ③ Stop guessing capacity | No need to predict how much you'll need in advance — scale up or down to match demand |
| ④ Increase speed and agility | Provision resources in minutes → experiment with and launch ideas quickly |
| ⑤ Stop spending money running and maintaining data centers | No need to handle power, cooling, or hardware replacement yourself |
| ⑥ Go global in minutes | Expand your service onto AWS infrastructure in multiple countries with a few clicks |

Here is each advantage unpacked.

**① Trade capital expense for variable expense.** If you buy servers up front, your money is tied up even while they sit idle, but with the cloud you pay only for what you use.

**② Massive economies of scale** lower costs. Because AWS aggregates the usage of millions of customers worldwide, it can supply resources far more cheaply than an individual company buying equipment alone.

**③ No need to guess capacity in advance.** With the traditional approach you had to predict "peak traffic" and buy equipment accordingly — buy too much and it's wasted, buy too little and you get outages. With the cloud you simply adjust to demand.

**④ Speed and agility** improve. A new server is ready in minutes with a few clicks, so experimentation and launches happen faster.

**⑤ You no longer worry about data center operating costs.** Hand off "non-core work" like electricity, cooling, and hardware management to the provider and focus on your core business.

**⑥ Go global in minutes.** With a few clicks you can serve users on other continents from nearby infrastructure, making responses fast.

> 💡 **Related theory**: "Elasticity" and "scalability" in the cloud are similar but different. Scalability is the ability to add resources at all, while elasticity is the ability to **automatically grow and shrink** according to demand. Among the six advantages, ③ and ④ are possible precisely because of this elasticity.

## Wrapping Up

Today we covered the core definition of cloud computing — "renting computing resources over the internet and paying for what you use" — and the six advantages AWS emphasizes (capital expense → variable expense, economies of scale, no capacity guessing, speed and agility, lower operating costs, global deployment). In the next article, we'll look at where and how this cloud is actually laid out — AWS's global infrastructure (Regions, Availability Zones, and edge locations).

---

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
