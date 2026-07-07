# Day 1 - The Game Called the SAP Exam: Hands-On Techniques for Decomposing Scenarios

When you walk into the SAP-C02 exam room and open the first question, almost everyone gets the same shock. **A single question is 10-15 lines long.** Some company is in some industry, its headquarters is in some region, its three subsidiaries sit under some OU, the RTO is 4 hours and the RPO is 15 minutes, traffic drops 80% only at night, and you're asked to solve it "while minimizing operational overhead" and "in the most cost-effective way." Below that, the four answer choices are each 4-6 line architecture descriptions. Your time budget: an average of 2 minutes 24 seconds per question.

This exam is not a "knowledge test" — it is a game of **satisfying multiple constraints simultaneously and judging priorities**. Where SAA asked about the features of a single service, Pro asks for "the best combination that simultaneously satisfies cost, operations, and security requirements" among solutions weaving together 5-10 services. That's why the first day of the first week decomposes not a service but **the grammar of the exam itself**. Without this grammar, the knowledge you accumulate over 16 weeks scatters within 5 seconds in the exam room.

## The Real Structure of SAP-C02: What the Numbers Tell You

Let's start with the surface-level numbers.

| Item | Value | What it means |
|------|----|-------------------|
| Number of questions | 75 | Only 65 are scored; 10 are unscored pre-test questions |
| Time | 180 minutes | 2 min 24 sec per question; if you reserve ~15 min for review, 2 min 6 sec |
| Passing score | 750 / 1000 | Scaled score, domain weights undisclosed |
| Exam fee | USD $300 | Practice exam is a separate $40 (free on Skill Builder) |
| Validity | 3 years | For recertification, you retake the same exam |

> 🔍 **Deeper dive**: AWS applies **scaled scoring** to all its exams. In other words, it's not "number correct × points" but a converted score reflecting each item's difficulty (IRT — Item Response Theory). So the simple calculation that 56 out of 75 correct (about 75%) means passing is wrong. One hard question is worth two easy ones. Also, the 10 unscored items cannot be identified in advance, so you must apply **equal concentration to every question**. AWS pilots new questions, and once enough statistics accumulate, converts them to scored questions in subsequent sittings.

> 💡 **Related theory**: IRT is a psychometric theory established by Frederic Lord in the 1960s that simultaneously models the test-taker's ability (θ) and each item's difficulty (b), discrimination (a), and guessing (c). Most IT certifications — AWS, Microsoft, Cisco, and others — use IRT-based 2PL or 3PL models. That's why you don't get per-domain scores like "my score was 850, so which domain was weak" (if they were provided, it would break unidimensionality, IRT's core assumption).

### The Decisive Difference Between SAA and SAP

If you fail to grasp this difference, you'll charge in on the confidence of a fresh SAA pass and collapse at under 50% on your first practice exam.

| Dimension | SAA (Associate) | SAP (Professional) |
|------|-----------------|---------------------|
| Question length | 2-4 lines, single scenario | 10-15 lines, multiple constraints |
| Choice length | One-line service names | 4-6 line solution descriptions |
| Number of services | 1-2 | Solutions combining 5-10 |
| Nature of answers | The "correct answer" is clear | The "optimal solution" — all 4 choices technically work |
| Core skill | Memorizing service features | **Priority judgment + trade-offs** |
| Frequently tested NFRs | Availability, security | Operational overhead, cost efficiency, multi-account, DR RTO/RPO |

> 🎯 **Scenario**: "A global media company runs 80 microservices in a single AWS account. Every new service launch causes IAM policy conflicts, and cost tracking is difficult. How do you solve this while minimizing operational overhead?" — On SAA the answer would be "Cross-Account Role," but on SAP the correct answer is **AWS Organizations + Control Tower + Account Factory automation**. The reason is the keyword "minimize operational overhead." A single keyword can flip the entire answer for the same question.

## The 5-Step Scenario Decomposition Method: With Your Hands, Not Your Head

If you try to organize a long scenario purely in your head, by line 5 you've forgotten line 1. You need the **hands-on technique of drawing 5 boxes on paper (or the exam center whiteboard) and filling them in**.

```
┌─────────────────────────────────────────────────────────┐
│ 1. WHO    │ Who (org structure, users, subsidiaries, external partners) │
├─────────────────────────────────────────────────────────┤
│ 2. WHAT   │ Current state (services, data, existing infrastructure)      │
├─────────────────────────────────────────────────────────┤
│ 3. WHY    │ Business goals (growth, cost, regulation, DR)              │
├─────────────────────────────────────────────────────────┤
│ 4. CONSTRAINTS │ Constraints (RTO/RPO, cost, operations, compliance)  │
├─────────────────────────────────────────────────────────┤
│ 5. KEYWORD │ Priority keywords (minimal ops, cost-effective, ...)     │
└─────────────────────────────────────────────────────────┘
```

Of these five boxes, the most important is **#5 KEYWORD**. Nearly all four choices on a Pro question "will work." The differences lie in the magnitude of operational overhead, the magnitude of cost, the degree of resilience, and whether regulations are satisfied. Catching the adjectives and adverbs in the scenario's final sentence is 90% of getting the answer right.

### Dictionary of Frequently Appearing Keywords

| Keyword | Phrases appearing in scenarios | Priority ordering |
|--------|--------------------------|---------------|
| Minimal operational overhead | "minimal operational overhead", "least operational effort" | Serverless > Managed > Self-managed |
| Cost efficiency | "most cost-effective", "lowest cost" | Spot > Savings Plans > RI > On-Demand |
| Scalability | "elastically scale", "handle traffic spikes" | Auto Scaling, DynamoDB On-Demand, Lambda |
| Fault isolation | "blast radius", "isolate failures" | Multi-Account > Multi-Region > Multi-AZ |
| Least privilege | "least privilege", "limit blast radius" | Triple layer of SCP + Permission Boundary + IAM policy |
| Audit/regulation | "audit trail", "compliance" | CloudTrail + Config + Audit Manager |
| Global users | "users around the world", "low latency globally" | CloudFront + GA + Route 53 latency |
| Migration | "minimize downtime", "lift and shift" | MGN (servers) + DMS (databases) |

> ⚠️ **Pitfall**: The hardest cases are when **two or more** keywords appear in the same scenario. If a scenario asks for something "cost-effective with low operational overhead," you must determine which one is emphasized more. Usually the keyword mentioned last is the stronger constraint. AWS's official exam guide also explicitly says to satisfy the "primary requirement" first.

> 📚 **Case study**: Reviews from the 2022 SAP beta exam commonly mention the strategy that "**it's faster to look at the answer choices first without reading the whole question**." It's a reverse-engineering technique: spot the common pattern across the 4 choices (e.g., if all include RDS Multi-AZ, then RDS is the answer's skeleton), then return to the scenario to find the differentiators. But this is an emergency tactic only for when you're short on time; the orthodox approach is the 5-step decomposition.

## The 4 Patterns of Eliminating Wrong Answers

If you can't directly identify the correct answer among the 4 Pro choices, **eliminate the definitely-wrong ones first**. Four wrong-answer patterns that appear frequently:

### 1) Over-Engineering

A design that is excessive relative to the requirements — like "configure a 100-person internal intranet as Multi-Region Active-Active" — is a wrong answer. Pro weighs both cost and operational overhead, so **the answer that solves exactly as much as was asked** is the correct one.

### 2) Under-Engineering

Conversely, an answer that serves "a global SaaS with 1 million users on a single-AZ EC2 + RDS" is also wrong. If a choice contains wording that explicitly sacrifices availability or scalability, it is almost always a trap.

### 3) Self-Built Solutions That Increase Operational Overhead

Answers like "mimic SCP effects with a custom Lambda" or "implement SSO with a self-managed LDAP server" increase operational overhead, so they are wrong. If an AWS Managed Service provides the same capability, that is the correct answer.

### 4) Invalid Service Combinations

Combinations that do not integrate directly, like "send a DynamoDB Stream to an SQS Standard Queue," or services used for the wrong purpose, like "back up a database with S3 Cross-Region Replication," are wrong answers. The Pro exam sets traps with subtly incompatible combinations.

> 🔍 **Deeper dive**: AWS's service compatibility matrix is scattered across official documentation and hard to memorize, but one principle captures half of it: **"asymmetric triggers from event source → target often require going through EventBridge or Lambda."** For example, S3 → Step Functions is not direct and goes through EventBridge or Lambda (direct triggering became possible after the 2021 EventBridge integration was added). DynamoDB Stream → SQS is also not direct and goes through Lambda. These asymmetries are the source of the exam's traps.

## Time Management: Anatomy of 180 Minutes

180 minutes = 10,800 seconds. To solve 75 questions, that's an average of 144 seconds per question. But a simple average doesn't work in the exam room.

```
[0-30 min]    20 quick questions (60-90 sec each)
            → SAA-level questions answerable instantly via keyword matching
[30-120 min]  40 medium questions (130-160 sec each)
            → Scenario decomposition + wrong-answer elimination
[120-150 min] 15 hard questions (200+ sec each)
            → flagged for review
[150-165 min] Revisit flagged hard questions
[165-180 min] Full review, check for marking mistakes
```

> 💡 **Memorization tip**: The "**3-2-2 rule**" — never spend more than **3 minutes** on one question, don't second-guess the same answer more than **2 times** (statistics mostly say the first intuition is right), and if you can't see the answer within **2 minutes**, flag it and move on. Even if you have time left, don't change your first intuition. Psychology frames this as the flip side of the "first instinct fallacy" — research shows that answers test-takers change are statistically wrong more often (Kruger et al., 2005).

> 📚 **Case study**: From one Pro passer's review: "Of 75 questions, I confidently solved 35 at first, flagged 25, and outright guessed 15. Of the 25 flagged, I changed my answer on 8 during review. When scored, 5 of the 8 I changed had been correct the first time." — That is the textbook first instinct fallacy.

## The Center of Gravity Across the 4 Domains: Where to Spend Your Time

| Domain | Weight | Study focus | Where mistakes happen |
|--------|------|----------------|------------------|
| 1. Design Solutions for Organizational Complexity | 26% | Organizations, SCP, Identity Center, network integration | SCP is deny-only; confused with Permission Boundary |
| 2. Design for New Solutions | 29% | Simultaneously satisfying availability, scalability, security, cost | Cost vs. operational overhead prioritization |
| 3. Migration and Modernization | 20% | 7R, MGN, DMS, containerization/serverless adoption | Re-host vs Re-platform vs Re-architect |
| 4. Continuous Improvement | 25% | Well-Architected, FinOps, automation | Mapping scenarios to the 6 Pillars |

Domain 2 (new solutions) carries the largest weight, but Domain 1 (organizational design) is an area SAA barely covered, so it yields the biggest learning gains. This is the design intent of the 16-week curriculum: **focus the first 4 weeks on organizations and networking**, then move to new solutions and migration from week 5.

## What Actually Happens at the Exam Center

1. **PSI vs Pearson VUE**: You take the exam at one of the two testing providers. PSI offers an OnVue (online) option, and Pearson is more stable offline. In an online exam, even a single photo of another person or a sheet of paper in the room can get you disqualified, so offline is recommended if possible.

2. **Language**: You can take the exam in Korean. However, translations are sometimes awkward, so you can check the original text with the **"View in English" toggle**. If you get confused at the exam center, switch to English immediately.

3. **Calculator/notes**: The exam center provides a whiteboard + marker or laminated sheets + marker. Use them actively when decomposing scenarios. Online exams have an on-screen whiteboard feature.

4. **Right after the exam ends**: PSI shows only PASS/FAIL on the spot, and Pearson emails results 1-3 days later. Scores appear in the AWS Certification portal within 5 days.

> 🔍 **Deeper dive**: Since 2020, AWS has offered a **30-minute extra time option (ESL +30)** on all exams for test-takers whose native language is not English. Even if you take the exam in Korean, you use the English toggle, so requesting ESL +30 gives you 180 + 30 = 210 minutes. You request it via a separate form right after booking. Many people take the exam without knowing this. [Official guidance](https://aws.amazon.com/certification/policies/before-testing/).

## Practice: Decomposing One Question in 5 Steps

Let's try it once in advance with a practice question.

> Scenario: "A multinational insurance company operates 5 OUs and 50 accounts with AWS Organizations. A development team accidentally created resources in the production OU, which resulted in a finding in a PCI-DSS audit. Additionally, some teams launched EC2 instances in regions other than ap-northeast-2, causing data sovereignty violations. How do you solve both problems while minimizing operational overhead?"

Decomposed into 5 steps:

1. **WHO**: Multinational insurance company, 50 accounts across 5 OUs, development team and production team are separated
2. **WHAT**: Currently running AWS Organizations, OU structure exists
3. **WHY**: PCI-DSS audit finding, preventing data sovereignty regulation violations
4. **CONSTRAINTS**: Minimize operational overhead, multi-account environment, regulatory compliance
5. **KEYWORD**: Minimal operational overhead + audit + regulation

→ Answer: **Apply SCPs at the OU level to block dev-account permissions in the production OU + restrict allowed regions**. The reason is that an SCP is the guardrail with the least operational overhead — "apply once at the Organizations level and it applies to all accounts." Monitoring with Lambda or after-the-fact detection with Config Rules carries higher operational overhead.

## Wrapping Up

SAP-C02 is not a game of knowledge but of **decomposition and priority judgment**. Over 80 days you'll memorize the features of some 100 services, but that alone will never get you a pass. The hands-on technique of splitting a scenario into 5 boxes, the elimination method that removes over-engineered, under-engineered, self-built, and invalid combinations from the 4 choices, and the reflex of matching the keyword dictionary instantly without looking — these three are the weapons that actually work in the exam room.

Apply today's decomposition method as-is to the practice questions of every day. After 16 weeks, even when you encounter an unfamiliar scenario in the exam room, your hand will draw the 5 boxes first. That is the real sign you'll pass. In the next article, we revisit IAM, STS, and Federation — which SAA covered lightly — at Pro depth. IAM scenarios are scattered across Domains 1, 2, and 4 on the Pro exam, so this is the review with the highest ROI.

---

## 📝 연습 문제

**문제 1.** A company runs a global SaaS and has 200 AWS accounts. The security team wants to "enforce MFA for the root user in all accounts and prohibit S3 public access." How should this be applied **while minimizing operational overhead**?

A) Build Lambda automation that deploys separate IAM policies to every account
B) Apply deny policies at the OU level using SCPs in AWS Organizations
C) Enable IAM Identity Center in each account
D) Deploy AWS Config Rules per account to detect non-compliant resources

**정답: B**
해설: The keywords are "minimize operational overhead" + "apply across all accounts at once." An SCP, applied once at the Organizations level, automatically propagates to all accounts and all OUs with no separate automation or deployment needed. A carries heavy Lambda operational overhead and risks missing newly added accounts. C is merely an SSO tool and is unrelated to enforcing root MFA. D is only after-the-fact detection, not prevention, and carries higher operational overhead. Trade-off: SCPs can only deny and cannot grant permissions, so grants must be combined with separate IAM policies or Permission Sets.

---

**문제 2.** A fintech startup is growing rapidly and its EC2 instance costs have exceeded $40,000 per month. Traffic concentrates on weekdays 09:00-18:00, and nights/weekends run at about 20%. The business direction may change within a year, so **a 3-year commitment is too burdensome**. What is the most cost-effective combination?

A) Convert all instances to 3-year All Upfront RIs
B) A combination of 1-year Compute Savings Plans + Spot + Auto Scaling
C) 1-year Reserved Capacity commitment + On-Demand
D) Convert everything to Spot Instances

**정답: B**
해설: The keywords are "cost efficiency" + "flexibility (3-year burden)" + "traffic variability." A 1-year Compute Savings Plan minimizes commitment and is the most flexible form, applying to EC2, Fargate, and Lambda alike (about 27% discount). Spot adds 70-90% savings for stateless workloads. Auto Scaling handles the nighttime scale-down as well. A is wrong because the 3-year commitment was explicitly rejected. C's Reserved Capacity is fixed to an EC2 instance family, offering low flexibility. D is unsuitable for all of production due to Spot interruption risk. Trade-off: Spot averages 60-80% discounts, but instances can be reclaimed after a 2-minute warning, making it unsuitable for stateful workloads.

---

**문제 3.** A media company provides a real-time game matchmaking service (WebSocket-based) to global users. Users must automatically connect to the nearest region, and on a regional failure, failover to another region must occur **within seconds**. Which combination is most suitable?

A) Route 53 Latency-Based Routing + Health Check
B) CloudFront + Lambda@Edge
C) Global Accelerator + Application Load Balancer
D) API Gateway Regional + Custom Domain

**정답: C**
해설: The keywords are "WebSocket (L4)" + "failover within seconds" + "global routing." Route 53 LBR (A) takes minutes to fail over due to DNS TTL caching. CloudFront (B) handles only L7 HTTP/HTTPS, so WebSocket is possible, but matchmaking's bidirectional traffic is unsuitable for Lambda@Edge. Global Accelerator (C) is based on BGP Anycast, provides 2 static IPs, bypasses DNS caching to enable regional failover **within seconds**, and can accelerate both TCP and UDP. D is a single-region API lacking global routing and failover capability. Trade-off: Global Accelerator adds $0.025 per hour plus data processing costs, so if a failover SLA of minutes is sufficient, Route 53 can be cheaper.

---

**문제 4.** A manufacturer wants to migrate an on-premises Oracle DB (50TB) to AWS. Downtime is limited to under 1 hour, and bidirectional synchronization is needed for a period after migration. **To avoid additional license costs, an engine conversion to PostgreSQL** will be performed at the same time. Which combination is suitable?

A) AWS DMS Full Load + CDC + Schema Conversion Tool
B) Move data with Snowball Edge + restore to RDS
C) Native Oracle Data Pump + S3 + RDS Oracle import
D) Database Migration Service + Aurora Oracle Compatible

**정답: A**
해설: The keywords are "engine conversion (Oracle → PostgreSQL)" + "low downtime" + "bidirectional synchronization." DMS minimizes downtime with Full Load (initial data) + CDC (change data capture) while enabling bidirectional sync. SCT (Schema Conversion Tool) automatically converts Oracle schemas and PL/SQL to PostgreSQL. B has too much downtime (Snowball ships by mail). C cannot convert engines (Oracle → Oracle). D's "Aurora Oracle Compatible" is a service that doesn't actually exist (Aurora is only PostgreSQL/MySQL compatible). Trade-off: the DMS+SCT combination requires about 20-30% manual code fixes after automatic conversion (especially PL/SQL functions). Assess the conversion in advance with an SCT Assessment Report.

---

**문제 5.** A global e-commerce company operated only in us-east-1 and, with growing EU users, wants to expand to eu-west-1. Under **data sovereignty** (GDPR), EU user data must remain within the EU. How do you operate both regions from a single codebase while guaranteeing per-user data isolation?

A) DynamoDB Global Table + per-user PartitionKey
B) RDS Cross-Region Read Replica + per-user DB routing
C) Independent DynamoDB per region + Route 53 Geolocation routing + region determination at the user authentication layer
D) Aurora Global Database + Write Forwarding

**정답: C**
해설: The keywords are "data sovereignty" + "regional isolation" + "single codebase." A's Global Table replicates automatically between both regions, so data exists on both sides — a potential GDPR violation. B's Cross-Region Read Replica also replicates data to both sides. D's Aurora Global is the same (read replicas bring EU data into us-east-1). C uses independent per-region databases so data never leaves its region, and Route 53 Geolocation plus routing logic at the authentication step keeps a single codebase. Trade-off: if a user connects from another continent while traveling, latency increases, so decide the region once at authentication and include the region information in the token thereafter.

---

**문제 6.** A company is taking the SAP exam for the first time. They score 75% on practice exams but ran out of time at the exam center. What is the most effective improvement strategy?

A) Memorize more services
B) Drill the 5-step scenario decomposition + 4 elimination patterns into muscle memory
C) Practice only harder questions
D) Since English is a burden, use only Korean

**정답: B**
해설: The root cause of running out of time is taking too long to interpret questions. A 75% accuracy rate signals that knowledge is sufficient; the bottleneck is lack of technique. Rehearsing the 5-step decomposition + 4 elimination patterns + the 3-2-2 rule until they become reflexes reduces time. A is an area already sufficient. C helps with difficulty adaptation but does little to reduce time. D is actually inefficient because when the Korean translation is awkward, toggling to English is faster.

---

**문제 7.** In an SAP-C02 scenario where the keywords "**most cost-effective**" and "**minimize operational overhead**" appear together, which takes precedence?

A) Always cost
B) Always operational overhead
C) The keyword mentioned last in the scenario is the stronger constraint
D) Whichever the majority of the 4 choices satisfies

**정답: C**
해설: AWS's official exam guide explicitly says to prioritize the "primary requirement." The most important NFR usually sits in the last sentence or two of the scenario, and earlier sentences are secondary constraints. For example, in "We want to reduce costs. Which approach has the least operational overhead?" — operational overhead is primary. However, if both keywords appear together at the end, you must choose an answer satisfying both, which is usually a Serverless combination (Lambda, Fargate, DynamoDB On-Demand).
