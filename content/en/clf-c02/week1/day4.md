# Day 4 - The Six Pillars of the Well-Architected Framework and the Value of Cloud Adoption

So far we've learned what the cloud is (Day 1), where it's laid out (Day 2), and how responsibility is divided (Day 3). So what does "good cloud design" actually mean? AWS distilled the answer from countless customer experiences into six pillars called the **Well-Architected Framework**. Today we go over an overview of these six pillars and the value a company gains when it adopts the cloud, all at a beginner-friendly level.

## What Is the Well-Architected Framework

The Well-Architected Framework is **a set of best-practice design guidelines that summarizes "what you need to pay attention to in order to build stable, secure, and efficient systems in the cloud."** Many individual exam questions are, in fact, asking about one of these six pillars, so once you have the pillars' names and meanings down, the answers become visible.

## The Six Pillars at a Glance

| Pillar | Name | Core question |
|------|--------|-----------|
| ① Operational Excellence | Operational Excellence | Are you running the system well and continuously improving it? |
| ② Security | Security | Are you keeping data and systems safe? |
| ③ Reliability | Reliability | Does the system recover quickly from failures and keep running? |
| ④ Performance Efficiency | Performance Efficiency | Are you using resources efficiently to deliver good performance? |
| ⑤ Cost Optimization | Cost Optimization | Are you using only what you truly need, with no unnecessary spend? |
| ⑥ Sustainability | Sustainability | Are you reducing environmental impact (energy and carbon)? |

> 💡 **Memorization tip**: Collect the initials and you get **O-S-R-P-C-S**. ⑥ Sustainability was added in 2021, becoming the sixth pillar. More important than rote memorization is practicing the question "which pillar is this scenario asking about?"

## Each Pillar, Explained Simply

**① Operational Excellence** is about running the system well and making it steadily better. Automating repetitive manual work, observing what's happening (monitoring), and safely rolling out small changes frequently all belong here.

**② Security** is about protecting data, systems, and assets. The keys are the **principle of least privilege** (granting only the permissions that are truly needed), data encryption, applying security at every layer, and being prepared for incidents.

**③ Reliability** is the ability of a service to keep going despite failures, and to recover quickly when it does stop. Distributing across multiple Availability Zones (AZs) and having automatic recovery and backups are representative practices (recall the multi-AZ design from Day 2).

**④ Performance Efficiency** is about using resources efficiently, without waste, to deliver the performance you need. It means picking resources sized exactly for the job (right-sizing) and using the appropriate technology when needed.

**⑤ Cost Optimization** is about doing the same work at lower cost. Turning off unused resources, choosing a pricing model that matches your usage, and measuring and managing costs all fall under this pillar.

**⑥ Sustainability** is about reducing the environmental impact of your cloud usage. Energy-efficient designs and appropriate Region selection are examples.

> 💡 **Related theory**: The six pillars can be in a **trade-off** relationship with one another. For example, adding resources across multiple AZs to increase reliability raises costs. The purpose of the Well-Architected Framework is not to hand you "the one right answer" but to make you consciously think through these balances.

## Practice Mapping Scenarios to Pillars

The most useful exam skill is recognizing which pillar a scenario is asking about.

| Scenario keyword | Pillar to think of |
|-----------------|-------------|
| "Keep the service running even if one AZ goes down" | Reliability |
| "Turn off resources during idle hours to save money" | Cost Optimization |
| "Least privilege, data encryption" | Security |
| "Automate repetitive tasks, monitoring" | Operational Excellence |
| "Improve response times and right-size resources" | Performance Efficiency |
| "Reduce energy and carbon impact" | Sustainability |

## The Value of Cloud Adoption

When a company adopts the cloud, it gains value beyond simply "renting servers." This connects back to the six advantages from Day 1.

- **Agility**: Experiment with and launch new ideas in minutes, not days.
- **Cost efficiency**: Pay only for what you use without a large upfront investment (capital expense → variable expense).
- **Scalability and elasticity**: Resources grow automatically as users increase, and shrink as they decrease.
- **Global reach**: Serve users worldwide with a few clicks.
- **Focus on the core business**: Shed burdens like data center operations and concentrate on what you do best.

> 💡 **Related theory**: AWS also provides the **Cloud Adoption Framework (CAF)**, a guide for companies moving to the cloud. The CAF organizes what to prepare from perspectives such as business, people, governance, platform, security, and operations, drawing the big picture of "how do we migrate to the cloud."

## Wrapping Up

Today we covered the **six pillars** of the Well-Architected Framework — the standard for "good cloud design" (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability — O-S-R-P-C-S) — how to map scenarios to pillars, and the value of cloud adoption (agility, cost efficiency, scalability, global reach, focus on the core business). In the next article, we review all the cloud concepts learned in Week 1 in one go.

---

## 📝 연습 문제

**문제 1.** Which of the following is NOT one of the six pillars of the Well-Architected Framework?

A) Reliability  
B) Security  
C) Compliance  
D) Cost Optimization  

**정답: C**  
해설: The six pillars are Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, and Sustainability. Compliance is a separate governance area — it is addressed within the Security pillar but is not an independent pillar.

---

**문제 2.** The requirement "the service must keep running even if one Availability Zone (AZ) fails" is primarily related to which pillar?

A) Cost Optimization  
B) Reliability  
C) Sustainability  
D) Operational Excellence  

**정답: B**  
해설: The ability for a service to keep going and recover despite failures is the core of the Reliability pillar. Cost Optimization is about reducing spend, Sustainability is about environmental impact, and Operational Excellence is about operations and automation.

---

**문제 3.** The approach of "turning off resources during unused nighttime hours to reduce spend" falls under which pillar?

A) Security  
B) Performance Efficiency  
C) Cost Optimization  
D) Reliability  

**정답: C**  
해설: Turning off unused resources to eliminate unnecessary spend is a classic Cost Optimization activity. Security is about protecting data and systems, Performance Efficiency is about the efficient use of resources, and Reliability is about failure recovery.

---

**문제 4.** Which pillar was newly added to the Well-Architected Framework in 2021, becoming the sixth?

A) Sustainability  
B) Security  
C) Reliability  
D) Operational Excellence  

**정답: A**  
해설: Sustainability was added in 2021 as the sixth pillar and focuses on reducing the environmental impact of cloud usage. The other choices are pillars that existed before then.

---

**문제 5.** Which of the following is NOT a value a company gains by adopting the cloud?

A) Agility to experiment with and launch ideas quickly  
B) Elasticity that scales resources up and down with usage  
C) An increased burden of building and operating data centers yourself  
D) Global reach that serves the whole world with a few clicks  

**정답: C**  
해설: The value of cloud adoption includes agility, elasticity, global reach, and relief from the burden of operating data centers. An increased burden of building and operating your own data centers is not a value of the cloud — it is precisely the burden the cloud removes.

---
