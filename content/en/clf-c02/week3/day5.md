# Day 5 - Week 3 Synthesis — Core Services 2 Review

If last week was the skeleton of "servers, storage, and networking," this week we learned the "operations layer" on top of it — handling data, letting services communicate, and monitoring and automating the whole. Databases, application integration (messaging), management and monitoring tools, and IaC for building infrastructure as code. Today, with no new concepts, we review by tying these pieces together with comparison tables and selection criteria.

The core is still **"when to choose what."** The answer depends on the shape of the data, the form of the communication, and the kind of information you want to see.

### How to Use Today's Review

This is less an article to read from start to finish than a **checklist for finding the places where you are likely to slip**. Look at the map below and check whether a one-line definition comes to mind from the name alone, mark the pairs that still feel ambiguous, and finally work through the "This situation, this service" table at the end with the answers covered.

CLF-C02 asks in a consistent way. It does not ask about internal structure or how to configure things; it asks **"Here is a situation. Which service would you use?"** So what to memorize is not the definition but **"the situation this service was born to solve."**

| Original pain point | Service born from it |
|-------------|---------------|
| Installing, backing up, and patching DB servers by hand is hard | RDS / Aurora |
| A relational DB struggles to handle tens of thousands of reads per second | DynamoDB |
| Aggregating several years of data freezes the production DB | Redshift |
| Back-end services collapse when requests pile up | SQS |
| One event has to be reported to many systems one by one | SNS |
| Customers tell you about outages before you know | CloudWatch |
| Nobody knows who changed a setting | CloudTrail |
| Counting rule-violating resources by hand | Config |
| Building the same environment twice gives different results every time | CloudFormation |

## Core Services 2 Map at a Glance

| Category | Representative service | One-line definition |
|------|-------------|------------|
| Database | RDS | Managed relational DB (SQL) |
| Database | Aurora | RDS-compatible high-performance cloud DB |
| Database | DynamoDB | Managed NoSQL (key-value/document) |
| Database | Redshift | Data warehouse (for analytics) |
| Integration | SQS | Message queue (async queue) |
| Integration | SNS | Publish/subscribe notifications (fan-out) |
| Integration | EventBridge | Event bus (connecting services) |
| Management | CloudWatch | Metrics, logs, alarms (monitoring) |
| Management | CloudTrail | API call audit records (who did what) |
| Management | Config | Resource configuration change tracking, compliance |
| IaC | CloudFormation | Define and deploy infrastructure as code (templates) |
| Deployment | Elastic Beanstalk | Upload code and the runtime environment is configured automatically |
| Containers | ECS / EKS | AWS-native / standard Kubernetes orchestration |
| Containers | Fargate | Run containers without managing nodes |
| Serverless | Lambda | Run code only when an event occurs |
| Management | Systems Manager | Large-scale server operations, patching, secure access |

The common keyword for this week's services is "Managed." AWS takes on operational burdens like patching, backups, and scaling, while users focus on data and logic. This shifts things in the direction where AWS's share of the shared responsibility model grows larger.

## Database Review: RDS vs. DynamoDB vs. Aurora vs. Redshift

All four are for "storing data," but the shape and purpose of the data differ.

| Item | RDS | Aurora | DynamoDB | Redshift |
|------|-----|--------|----------|----------|
| Type | Relational (SQL) | Relational (SQL) | NoSQL (key-value/document) | Data warehouse |
| Characteristic | Supports various engines | MySQL/PostgreSQL compatible, high performance | Millisecond responses, auto-scaling | Large-scale analytical queries |
| Suitable when | General transactional apps | High-performance relational workloads | Ultra-fast, large-scale simple lookups | Aggregating and analyzing large data volumes |

> 🎯 **Scenario**: "I need to read and write millions of users' shopping carts in milliseconds" → DynamoDB, the auto-scaling NoSQL. "I want to move an existing MySQL app somewhere faster and more reliable" → Aurora. "I run complex aggregate analysis over years of sales data" → Redshift.

> ⚠️ **Pitfall**: Distinguish "relational vs. NoSQL" from "transactional vs. analytical." RDS/Aurora are for relational transactions, DynamoDB is NoSQL, and Redshift is for analytics (OLAP). Choosing Redshift for "fast key lookups" or DynamoDB for "complex analysis" is a wrong answer.

Aurora is one kind of product within the RDS family — an engine that is compatible with MySQL and PostgreSQL while being redesigned by AWS for the cloud. Remember RDS as "the managed relational DB bundle" and Aurora as "the high-performance option among them."

### Database Wrong-Answer Notes

In practice, the places where people slip are almost always one of the four below.

**First, lumping "relational or not" and "transactional or analytical" onto a single axis.** These are different axes, so you have to ask the questions separately.

```
Question 1: Is the data shaped like tables, and do relationships matter?
   Yes → RDS / Aurora / Redshift family
   No  → DynamoDB

Question 2: Is the work "reading and writing quickly, record by record," or "gathering what has piled up and analyzing it"?
   Record by record → RDS / Aurora / DynamoDB
   Gather and analyze → Redshift
```

**Second, reflexively picking DynamoDB whenever you see the word "scale."** If "complex joins and transactions are needed" appears alongside it, relational is the answer.

**Third, forgetting the cache.** If the wording is something like "put it in front of the DB to speed up repeated reads," ElastiCache (an in-memory cache) may be the answer. A place that stores data and a place that holds it briefly have different roles.

**Fourth, over-interpreting "managed."** It means AWS carries **operational burdens** such as backup, patching, and recovery; it does not mean AWS takes care of schema design or query performance for you.

| Situation wording | Answer | Reason |
|-----------|-----|------|
| "Complex transactions that join multiple tables" | RDS/Aurora | The home turf of relational |
| "Tens of thousands of simple key lookups per second" | DynamoDB | Millisecond responses, auto-scaling |
| "Gather three years of logs and total up quarterly sales" | Redshift | Dedicated to analytics (OLAP) |
| "Keep the MySQL app as is and only raise performance and availability" | Aurora | MySQL compatible |
| "The same lookup repeats and I want to cut response time further" | ElastiCache | In-memory cache |

## Integration Review: SQS vs. SNS vs. EventBridge

These are tools for connecting services loosely (decoupling) instead of binding them together directly.

| Item | SQS | SNS | EventBridge |
|------|-----|-----|-------------|
| Method | Queue | Publish/subscribe (fan-out) | Event bus (routing) |
| Analogy | Stand in one line, processed in turn | Broadcast once, many receive at once | Distribute events by rules |
| Suitable when | Process work in order, slowly | Notify multiple targets of one event at once | Connect various events by condition |

> 🎯 **Scenario**: "Even when orders surge, I want to digest payment processing one at a time, reliably" → SQS, which piles them in a queue for sequential processing. "When a single order comes in, I want to notify the notification, inventory, and shipping systems at once" → SNS, which publishes once and fans out to multiple subscribers.

SQS is a "pull" queue, and SNS is "push" publish/subscribe. The "fan-out pattern" — combining the two so SNS fans out and each SQS queue receives — is also common. EventBridge is a higher-level tool that adds "rule-based routing by event content" on top of this.

### Integration Wrong-Answer Notes

The trap in this area is that **"sending a message" applies to all three**. The decisive distinction is "how many receivers there are and how they receive."

| Question | Answer |
|------|-----|
| Is there one receiver that processes items one at a time at its own pace? | SQS |
| Are there several receivers that all get the same content at the same time? | SNS |
| Does the event need to be split and sent to different targets depending on its content? | EventBridge |

Another important concept is **decoupling (loose coupling)**. Here is a picture of why a queue is placed in the middle.

```
[Direct connection]  Order service ──direct call──► Payment service
                     If payment stalls, ordering stalls with it

[Via a queue]        Order service ──► [SQS queue] ──► Payment service
                     Even if payment pauses briefly, orders keep being accepted and piled up
```

The point is **"keeping a failure on one side from spreading to the other."** When you see phrases like "reduce coupling between services," "keep the failure of one component from affecting the whole," or "absorb traffic spikes (buffering)," the queue/messaging family is the answer.

> ⚠️ **Pitfall**: If you remember SNS only as "a service that sends email," you will get it wrong. The essence of SNS is a structure where **one publish is delivered to multiple subscribers at the same time**, and email and text messages are just some of those delivery targets. Conversely, do not mistake SQS for a "notification service." SQS is a **queue** that the receiving side pulls from when it is ready.

## Management & Monitoring Review: CloudWatch vs. CloudTrail vs. Config

All three "observe," but **what** they watch is different. Distinguishing these three is easy to get confused on the exam.

| Item | CloudWatch | CloudTrail | Config |
|------|------------|------------|--------|
| What it watches | Performance metrics, logs, alarms | API calls (who, when, what) | Resource configuration, change history |
| Question | "Is it running well right now?" | "Who performed this action?" | "Does this resource follow the rules?" |
| Use | Monitoring, alerting | Auditing, security tracing | Compliance, configuration tracking |

**Pitfall**: "Alarm when CPU utilization is high" = CloudWatch, "trace who deleted this S3 bucket" = CloudTrail, "check whether every EBS volume is encrypted" = Config. All three "observe," which is confusing, but their roles split into **performance, auditing, and configuration compliance**.

CloudTrail records nearly all API activity within the account, making it the primary evidence for security incident investigation and auditing. It's easy to tell them apart with the analogy: CloudWatch is a "health monitor," CloudTrail is an "entry/exit log," and Config is a "compliance checklist."

### Management & Monitoring Wrong-Answer Notes

On top of the three services, we also sort out **Systems Manager** from this week, along with **Trusted Advisor and Health Dashboard**, which often appear alongside them.

| Situation wording | Answer |
|-----------|-----|
| "Alert when CPU utilization crosses a threshold" | CloudWatch |
| "Search application logs from many servers in one place" | CloudWatch Logs |
| "Find out who deleted this resource" | CloudTrail |
| "Keep a record of activity for a regulatory audit" | CloudTrail |
| "Continuously check that all volumes are encrypted" | Config |
| "What were this security group's settings last month?" | Config |
| "Apply patches to hundreds of servers at once" | Systems Manager |
| "Receive cost and security improvement recommendations" | Trusted Advisor |
| "Check for AWS-side outages or scheduled maintenance" | AWS Health Dashboard |

**Pitfall**: Do not pick CloudTrail every time just because you see the phrase "incident investigation." If the subject of the investigation is **a person's action**, it is CloudTrail; if it is **the state or performance of a system**, it is CloudWatch; if it is **whether a setting matched a rule**, it is Config. Even for a single incident, each of the three tells a different piece — CloudWatch shows the symptom, CloudTrail the culprit, and Config whether a rule was violated.

## IaC Review: CloudFormation

CloudFormation is an IaC (Infrastructure as Code) service that **defines infrastructure as templates (code) to automatically create and manage it** rather than clicking by hand. It can reproduce the same environment repeatedly without mistakes.

| Concept | Meaning |
|------|------|
| Template | A code file (JSON/YAML) describing the resources to build |
| Stack | The bundle of resources created together from a template |
| Benefit | Reproducibility, version control, bulk create/delete |

> 🎯 **Scenario**: "I need to build three identical environments for dev, test, and prod." → Building each by clicking invites mistakes, so you repeatedly create stacks from a single CloudFormation template. Deletion is also cleaned up in one go, per stack.

With CloudFormation, you declare "the final state I want," and AWS creates and changes resources to reach that state. Thanks to this declarative approach, the same template produces the same result whenever you run it.

### Deployment & Compute Wrong-Answer Notes

This area becomes easy to sort out if you line the services up on a single axis: **"how much do you hand over to AWS."**

```
I manage more                                       AWS manages more
─────────────────────────────────────────────────────────►
EC2 directly  →  CloudFormation  →  Beanstalk  →  Fargate  →  Lambda
(more control)                                    (less operational burden)
```

| Situation wording | Answer |
|-----------|-----|
| "Create everything at once per stack and delete it all at once" | CloudFormation |
| "Deployment should be done once the developer just uploads the code" | Elastic Beanstalk |
| "Move a workload already running on Kubernetes" | EKS |
| "Operate containers simply, the AWS way" | ECS |
| "Use containers but don't manage the nodes (EC2)" | Fargate |
| "No operations staff, so minimize management burden" | Serverless (Lambda/Fargate) |
| "A legacy app that needs specific OS kernel settings" | EC2 |

**Pitfall**: Do not compare CloudFormation and Elastic Beanstalk by asking "which is better." Beanstalk uses CloudFormation internally, and the fork between them is **"do you need to define the entire infrastructure in fine detail (CloudFormation)"** versus **"is the goal to get a web app up quickly (Beanstalk)."** Likewise, ECS and EKS are separated not by performance but by **the AWS-native way versus standard Kubernetes**.

## This Situation, This Service — 20 Comprehensive Cases

Cover the answers with your hand, read only the left column, and recall the service name.

| Situation | Service |
|------|--------|
| 1. Look up user profiles in milliseconds, auto-scaling even when traffic surges | DynamoDB |
| 2. Handle transactions that span multiple tables, such as orders and payments | RDS |
| 3. Keep using the existing MySQL while raising performance and availability | Aurora |
| 4. Gather five years of sales data and build quarterly reports | Redshift |
| 5. The same lookup repeats and you want a cache in front of the DB | ElastiCache |
| 6. Even when orders surge, process payments one by one reliably | SQS |
| 7. Notify the notification, inventory, and shipping systems of one event at the same time | SNS |
| 8. Route to different targets depending on the event content | EventBridge |
| 9. Lower coupling between services to stop failure propagation | SQS (decoupling) |
| 10. Alert the person in charge when CPU crosses a threshold | CloudWatch (+SNS) |
| 11. Search scattered application logs in one place | CloudWatch Logs |
| 12. Automatically add and remove instances according to load | CloudWatch alarm + Auto Scaling |
| 13. Find out who deleted which resource and when | CloudTrail |
| 14. Continuously check that every S3 bucket is encrypted | Config |
| 15. Check the resource settings as of last week | Config |
| 16. Apply OS patches to hundreds of servers at once | Systems Manager |
| 17. Connect to a server without SSH keys and without opening ports | Systems Manager (Session Manager) |
| 18. Build three identical infrastructures and delete them all at once | CloudFormation |
| 19. A developer who doesn't know infrastructure deploys a web app quickly | Elastic Beanstalk |
| 20. A thumbnail-generation job that runs only when a file is uploaded | Lambda |

## Self-Check List

If you can answer "yes" to this list the night before the exam, you are through Week 3.

- [ ] I can explain the difference between RDS and DynamoDB in terms of data shape
- [ ] I know why Redshift is "for analytics" and how Aurora relates to RDS
- [ ] I can explain the difference between SQS and SNS in terms of "number of receivers"
- [ ] I can give an example of why decoupling is needed
- [ ] I know the question each of CloudWatch, CloudTrail, and Config answers
- [ ] I know how a CloudWatch alarm connects to Auto Scaling and SNS
- [ ] I can name two operational burdens that Systems Manager reduces
- [ ] I know the difference between a template and a stack, and the difference in focus between CloudFormation and Beanstalk
- [ ] I know the one-line difference among ECS, EKS, and Fargate
- [ ] I know which direction the phrase "minimize operational burden" points

## Confusing Concept Pairs at a Glance

| Pair | Decisive difference |
|----|-------------|
| RDS vs DynamoDB | Relational (SQL) vs NoSQL (key-value, document) |
| RDS vs Aurora | Managed multiple engines vs the cloud-optimized high-performance option among them |
| RDS vs Redshift | Transactions (handled record by record) vs analytics (gather and aggregate) |
| DynamoDB vs ElastiCache | A place that stores data vs a cache that holds it briefly |
| SQS vs SNS | One pulls it out (queue) vs many receive at once (fan-out) |
| SNS vs EventBridge | Same delivery to every subscriber vs split and sent according to rules |
| CloudWatch vs CloudTrail | Performance and state vs who did what |
| CloudTrail vs Config | Who changed it vs what changed and how |
| Trusted Advisor vs Config | General improvement recommendations vs evaluating compliance with rules I define |
| Health Dashboard vs CloudWatch | AWS-side status vs the status of my resources |
| CloudFormation vs Beanstalk | Defining the whole infrastructure vs automating app deployment |
| Template vs stack | A blueprint file vs the bundle of resources created |
| ECS vs EKS | AWS-native way vs standard Kubernetes |
| EC2 vs Fargate | I manage the nodes vs no node management |
| Fargate vs Lambda | Keeps a container running vs runs a function only on events |
| Systems Manager vs CloudFormation | Operating existing servers vs creating infrastructure from scratch |

## Decision Flow for When You Get Stuck

This is the order to use when all four options look plausible.

```
1) What does this situation deal with?
   Storing data → DB family
   Passing between services → Integration family
   Reporting and watching → Management family
   Building and deploying → IaC and compute family

2) Within that, look for the decisive word
   DB          : Relational? Analytics? Ultra-fast key lookups?
   Integration : One receiver? Many? By condition?
   Management  : Performance? Who? Rules?
   Deployment  : Repeatable reproduction? Fast deployment? No server management?

3) If options still remain, choose "the least operational burden"
   CLF often puts managed and serverless options as the correct answer
```

Step 3 is not a cure-all, but because the questions are meant to check "what becomes easier when you use AWS," it works as a useful default.

Let us tie together how this week's services are used as one scene. A delivery app piles incoming orders into **SQS** so the payment service processes them in order, and sends the results out through **SNS** to the notification, settlement, and dispatch systems at the same time. Order data goes into **DynamoDB**, and aggregates for settlement go into **Redshift**. The overall state is watched with **CloudWatch**, and when load rises, an alarm wakes **Auto Scaling**. **CloudTrail** catches who changed a setting, and **Config** catches rule violations. And this whole setup can be rebuilt from a single **CloudFormation** template. Rather than memorizing individual services, remembering each one's place within a scene like this lasts longer.

## Wrap-Up

To re-etch Core Services 2: **Databases** split by data shape into RDS/Aurora (relational), DynamoDB (NoSQL), and Redshift (analytics); **integration** loosely connects services with SQS (queue), SNS (fan-out), and EventBridge (event routing); **management** differs by what it watches with CloudWatch (performance), CloudTrail (auditing), and Config (configuration compliance); and **IaC** reproduces infrastructure as code with CloudFormation.

Remember again that the exam asks "situation → most appropriate service." In particular, the CloudWatch/CloudTrail/Config distinction and the SQS/SNS difference are within the exam scope. Next week we move on to the operations and governance area — security, pricing, support, and more.

---

## 📝 Practice Questions

**Question 1.** You must read and write the session information of millions of users quickly, in milliseconds, and it must scale automatically even during traffic spikes. Which database is most appropriate?

A) Amazon Redshift  
B) Amazon DynamoDB  
C) Amazon RDS for MySQL  
D) AWS CloudFormation  

**Answer: B**  
Explanation: DynamoDB is a managed NoSQL database that provides millisecond responses and automatic scaling, making it suitable for large-scale, high-speed key-value lookups. Redshift is an analytical data warehouse with a different response orientation, RDS's auto-scaling is not as flexible as NoSQL, and CloudFormation is an IaC service, not a database.

---

**Question 2.** When a single order occurs, you want to send the same message simultaneously to the notification system, the inventory system, and the shipping system. Which service is most appropriate?

A) Amazon SQS  
B) Amazon SNS  
C) Amazon RDS  
D) Amazon CloudWatch  

**Answer: B**  
Explanation: SNS is a publish/subscribe (fan-out) service that delivers a single message to multiple subscribers simultaneously, making it suitable for notifying many systems at once. SQS is a queue that piles messages in one line for sequential processing, RDS is a relational DB, and CloudWatch is a monitoring service, so none are meant for simultaneous fan-out notification.

---

**Question 3.** You want to trace after the fact when a specific user called which AWS API to delete a resource, for a security audit. Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Config  
D) Amazon EventBridge  

**Answer: B**  
Explanation: CloudTrail records "who, when, and what" for API calls within the account, making it suitable for security auditing and incident investigation. CloudWatch is for performance metric/log monitoring, Config tracks resource configuration and compliance, and EventBridge is used for event routing, so tracing the caller is not their main role.

---

**Question 4.** You want to continuously check compliance with resource configuration rules — such as "whether every EBS volume is encrypted" — and track change history. Which service is most appropriate?

A) AWS Config  
B) Amazon CloudWatch  
C) Amazon SQS  
D) Amazon Aurora  

**Answer: A**  
Explanation: Config tracks resource configuration state and change history and detects violations of compliance rules. CloudWatch is for performance/log monitoring, SQS is a message queue, and Aurora is a database, so their roles differ from configuration-compliance checking.

---

**Question 5.** You want to repeatedly create a completely identical infrastructure environment for dev, test, and prod without mistakes, and delete it all at once when it's no longer needed. Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS CloudFormation  
C) Amazon DynamoDB  
D) Amazon SNS  

**Answer: B**  
Explanation: CloudFormation is an IaC service that defines infrastructure as templates (code) and creates/deletes it in bulk per stack, making it suitable for repeatedly building identical environments. CloudWatch is for monitoring, DynamoDB is a NoSQL DB, and SNS is a notification service, so none are meant for automatic infrastructure provisioning.

---
