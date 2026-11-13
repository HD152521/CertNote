# Day 1 - Well-Architected Framework Overview — The Origins of 6 Pillars, Internal Operations of WA Tool, and Design Philosophy of Lens

When a new architect opens the AWS console for the first time, they become paralyzed by over 200 services. Thousands of decisions stack up — "Should I use RDS or Aurora, should I enable Multi-AZ, is this IAM policy secure enough" — eventually forming one architecture. The problem is that these decisions often remain **tacit knowledge**, not passed down to other teams or projects. The Well-Architected Framework (hereafter WA) is AWS's result of conducting tens of thousands of customer architecture reviews since 2012, **formalizing that tacit knowledge into 6 pillars and standard questionnaires as explicit knowledge**.

In the SAP-C02 exam, WA is not merely a memorization target but a **frame of thinking** for solving all scenario questions. The ability to instantly map "minimum operational burden" to Operational Excellence, "audit trail" to Security, "RTO of 5 minutes" to Reliability is half the battle for passing as a Pro. Today, we deeply decompose why the 6 pillars are grouped as they are, how the WA Tool derives HRI, and what design philosophy Lens uses to extend domains.

## The Origins of 6 Pillars — From 5 to 6, and Why This Classification

WA's starting point was a white paper in 2015. At that time, there were 5 pillars: Operational Excellence, Security, Reliability, Performance Efficiency, and Cost Optimization. In December 2021, at AWS re:Invent, **Sustainability** was added as the 6th pillar. This timing was no accident — it coincided with the intensification of the EU's CSRD (Corporate Sustainability Reporting Directive) and carbon regulations in each country, making cloud usage carbon emissions a mandatory item in corporate ESG reporting.

The classification into 6 pillars itself is the key to the exam. Let's nail down two commonly confused pairs first. **Reliability vs Performance Efficiency** — Reliability is "can you withstand and recover from failures" (availability and fault tolerance), while Performance is "how fast and efficiently can you process with given resources" (latency and throughput). Multi-AZ is Reliability, caching is Performance. **Cost vs Sustainability** — Cost is "minimize dollars," while Sustainability is "minimize carbon and power." Usually they go in the same direction (removing idle resources), but not always.

> 💡 **Related Theory**: These 6 pillars correspond almost one-to-one with **Non-Functional Requirements (NFR)** classification in software engineering. ISO/IEC 25010 (Software Quality Model) defines 8 quality characteristics including Reliability, Performance Efficiency, Security, and Maintainability, and WA's pillar names adopt these standard terms directly. WA is ultimately "how to fulfill cloud architecture NFRs" mapped to AWS's service catalog. Understanding ISO 25010 shows that WA's pillars are not arbitrary categories but rooted in decades of quality engineering consensus.

> 🔍 **Deeper Dive**: The history of "5 to 6 pillars" is directly tested in exams. You must remember that Sustainability was added in 2021 and was not present in pre-5-pillar materials. Internally, each pillar in the WA Tool comprises approximately 8–10 "questions," and each question has multiple "best practice choices." When a workload fails to satisfy a best practice, that question is marked with a **risk**, classified as either HRI (High Risk Issue) or MRI (Medium Risk Issue) based on severity. In other words, HRI is not subjectively assigned by humans but automatically calculated based on "best practice non-compliance" rules.

## Equivalent Frameworks in Other Clouds — Not an AWS Invention

As WA became the de facto standard for cloud architecture governance, competing clouds released equivalent frameworks. While not directly tested in exams, a Pro architect designing multi-cloud environments must understand these corresponding relationships.

| Framework | Provider | Num. Pillars | Characteristics |
|-----------|----------|--------------|-----------------|
| **Well-Architected Framework** | AWS (2015) | 6 | Started first, automated via WA Tool, richest Lens ecosystem |
| **Azure Well-Architected Framework** | Microsoft | 5 | Cost·Security·Reliability·Performance·Operational Excellence (Sustainability separate guide) |
| **Cloud Architecture Framework** | Google Cloud | 6 | System design·Operational excellence·Security·Reliability·Cost·Performance |
| **(Traditional) ITIL / COBIT** | Non-cloud | - | Process and governance focused, weak on architecture decisions |

> 💡 **Related Theory**: The decisive difference between AWS WA and traditional IT governance like ITIL and COBIT is **abstraction level**. ITIL addresses organizational and process-level concerns like "how to operate change management processes," while WA addresses **concrete architecture decisions** like "is this workload Multi-AZ, encrypted with KMS." Therefore, WA doesn't replace ITIL but complements it — organizations run processes via ITIL, and individual workloads within are validated via WA. When exam questions distinguish "governance process" from "architecture review," recall this difference.

## Internal Operations of WA Tool — Workload, Milestone, Lens

The WA Tool is a managed service provided free on the console (or via API). Understanding the workflow precisely is essential for solving exam questions like "what is produced at which stage."

```
[1] Define Workload (name, environment, region, owner)
        ↓
[2] Select Lens (default AWS Lens + 0~N domain Lenses)
        ↓
[3] Answer pillar-specific questions (check each best practice)
        ↓
[4] Automatically derive HRI (High Risk Issue) / MRI (Medium Risk Issue)
        ↓
[5] Generate Improvement Plan (with AWS documentation and solution links)
        ↓
[6] Save Milestone (point-in-time snapshot) → re-evaluate after improvement → compare trend
```

Two concepts that exams love here are **Milestone** and **Lens**. **Milestone** is a complete snapshot frozen at a specific point in time. If you had 23 HRIs in the first review and reduced it to 8 a quarter later, you can quantitatively demonstrate improvement trends by comparing two Milestones. Like Git's commits and tags — anchoring immutable snapshots (Milestones) to mutable state (current answers) enables time-axis comparison.

> 💡 **Related Theory**: Milestone embodies the functional programming concepts of **immutability** and **event sourcing**. With only current state, you cannot know "how did we get here," but by accumulating point-in-time snapshots, you can reconstruct the trajectory of change. AWS Config's configuration timeline and CloudFormation's stack versions follow the same pattern. When you see "track and report WA improvement trends over time" in an exam, Milestone is the signal for the correct answer.

> 🔍 **Deeper Dive**: The WA Tool is **bidirectionally integrated with Trusted Advisor**. Trusted Advisor is a tool that **automatically checks** 5 categories — cost, performance, security, fault tolerance, and service limits — while WA Tool offers broader **question-based qualitative assessment**. Their relationship can be understood as "automated scanning (TA) vs structured interview (WA)." The latest WA Tool automatically pulls Trusted Advisor check results into some questions, pre-filling answers (for example: "Is an S3 bucket public" is something TA already knows). In exams, distinguish "automatically check cost and security risks" as Trusted Advisor, and "structure workload evaluation across 6 pillars" as WA Tool.

## Lens — Design Philosophy of Domain-Specific Extension

The default WA Lens contains general best practices common to all workloads. However, serverless apps and HPC clusters, multi-tenant SaaS apps have completely different risk points. **Lens** is a plugin that layers domain-specific questions on top of the default Lens.

| Lens | Target Workload | Specialized Check Areas |
|------|-----------------|--------------------------|
| **Serverless Lens** | Lambda·API Gateway·Step Functions | Cold starts·concurrency limits·execution time·event sourcing |
| **SaaS Lens** | Multi-tenant SaaS | Tenant isolation·tier-based billing·onboarding·noisy neighbor |
| **ML Lens** | SageMaker·MLOps | Model governance·data drift·retraining pipeline |
| **Data Analytics Lens** | Redshift·Athena·EMR·Lake | Data lake governance·query cost·schema evolution |
| **HPC Lens** | Simulation·rendering | Inter-node communication·parallel file system·job scheduler |
| **FTR / Financial Services / Healthcare Lens** | Regulated industries | Regulatory compliance·audit·data sovereignty |

> 🎯 **Scenario**: "A company operates a multi-tenant SaaS and wants to check the 'noisy neighbor' problem where one tenant's overload degrades other tenants' performance, plus tenant data isolation. Which WA assessment should they apply?" — Answer: **default WA Lens + SaaS Lens**. The SaaS Lens adds multi-tenancy-specific questions like tenant isolation models (silo vs pool vs bridge), per-tier throttling, and per-tenant cost attribution. These risks don't surface with just the default Lens. In exams, when you see "multi-tenant and tenant isolation," SaaS Lens is the signal.

> 📚 **Case Study**: AWS standardized **FTR (Foundational Technical Review)** based on WA in 2018. For APN Partners to list their SaaS product on AWS Marketplace or earn Competency, they must pass WA Tool review with Serverless/SaaS Lens. This shows that WA has transcended being a simple self-assessment tool to become **an institutionalized quality gate in the partner ecosystem**. Many SaaS startups actually discovered tenant isolation gaps, missing encryption, and other HRIs during the FTR process, fixing them before launch. While not directly tested in exams, understanding that WA serves as "certification you must pass" rather than "recommendation" provides context for its weight.

> 🔍 **Deeper Dive**: AWS added **Custom Lens capability** in 2022, allowing organizations to define their own internal standards (e.g., "all DBs encrypted with corporate KMS key," "all ALBs require WAF") as JSON and register them as a Lens. The WA Tool then outputs internal standard violations as HRI. This means WA has expanded beyond AWS guidance to become an **organizational governance engine**. Standardizing Custom Lens across multi-account Organizations means all teams are evaluated by identical criteria. In exams, when you see "check AWS base best practices plus internal regulations simultaneously," Custom Lens comes to mind.

## Common DNA of Design Principles — 5 Threads Running Through All 6 Pillars

Each pillar has its own principles, but there are common design philosophies running through all 6 pillars. Exams constantly ring changes on this common DNA with keywords like "minimum operational burden" and "managed first."

1. **Automation First** — Every point requiring manual intervention is a source of accidents and inefficiency. IaC·CI/CD·Auto Scaling·automatic recovery.
2. **Design for Failure** — Premise that "failures will happen." Multi-AZ·retry·circuit breaker.
3. **Horizontal Scaling** — Prefer many small servers (scale-out) over one large server (scale-up). Eliminate single points of failure + elasticity.
4. **Loose Coupling** — Separate components via queues and events so failure in one part doesn't propagate.
5. **Managed > Self-managed** — AWS-operated managed services handle operational burden, security patching, and scaling instead.

> 🔍 **Deeper Dive**: These 5 threads of common DNA align with WA's General Design Principles. Among them, unique to the cloud are **"Stop guessing capacity"** and **"Test at production scale."** On-premises required pre-purchase matched to peak demand (over-provisioning), but cloud uses Auto Scaling to adjust in real-time to demand — guessing is replaced with measurement. Furthermore, "testing at production scale" was impossible on-premises due to cost, but cloud makes it possible by immediately releasing resources after testing. When you see "automatic response without demand forecasting" or "validate operational accidents before production" in exams, this principle is the foundation.

> ⚠️ **Pitfall**: "Switch to managed services" is almost always the right direction in exams, but when asked **which pillar's score improves**, confusion arises. Switching EC2 to Fargate reduces operational burden, so the primary improvement is **Operational Excellence**, with secondary gains in Security (AWS patches), and Cost·Sustainability (removing idle resources). If the exam asks for "primary pillar," it's "minimum operational burden = Operational Excellence," but if emphasis shifts to cost savings, the answer can move to Cost. Understanding that a single action impacts multiple pillars is the core of Pro-level thinking.

## Summary

The Well-Architected Framework is AWS's governance engine that formalizes tacit knowledge extracted from tens of thousands of architecture reviews into 6 pillars and standard questionnaires. The 6 pillars (Operational Excellence·Security·Reliability·Performance Efficiency·Cost Optimization·Sustainability) are rooted in the ISO 25010 quality model, and Sustainability was added in 2021. The WA Tool operates through a flow of question answering → automatic HRI/MRI derivation → Improvement Plan → Milestone snapshots, Lens is a plugin for domain-specific (Serverless·SaaS·ML·HPC, etc.) questions, and Custom Lens absorbs even internal standards.

SAP exam common mappings: (1) "structured 6-pillar workload evaluation" → **WA Tool**, (2) "automatically check cost·security·fault tolerance" → **Trusted Advisor**, (3) "track and report improvement trends at specific points" → **Milestone**, (4) "check multi-tenant isolation" → **SaaS Lens**, (5) "check AWS base + internal regulations simultaneously" → **Custom Lens**, (6) "pillar added in 2021" → **Sustainability**, (7) "primary pillar for managed service switch" → typically **Operational Excellence** (but shifts with emphasis). Next day dives into Operational Excellence and Security pillars down to the tool level.

---

## 📝 Practice Questions

**Question 1.** An organization runs a serverless application based on Lambda, API Gateway, and Step Functions, and wants to review serverless-specific risks such as cold starts, concurrency limits, and execution time with the WA Tool. Which is the most appropriate approach?

A) Evaluate with only the default AWS WA Lens

B) Evaluate by adding the Serverless Lens to the default WA Lens

C) Use only Trusted Advisor's automated checks

D) Build a Custom Lens yourself and write all the questions from scratch

**Answer: B**
**Explanation:** The Serverless Lens layers serverless-specific best-practice questions, such as cold starts, concurrency, execution time, and event sourcing, on top of the default Lens. With A, serverless-specific risks are missing because the questions do not cover them. C (Trusted Advisor) is merely an automated scan, not a structured six-pillar assessment. D is unnecessary work that rebuilds from scratch even though AWS already provides the Serverless Lens; a Custom Lens is used to add "internal rules not in the AWS standard." Trap: domain-specific review means adding the relevant Lens, not relying on the default Lens.

---

**Question 2.** A fintech performs a WA Review every quarter and wants to freeze the risk state at each review point and share the improvement trend (23 HRIs → 8 → 3) with AWS Support. Which WA Tool feature does it use?

A) Lens

B) Milestone

C) Trusted Advisor

D) Custom Lens

**Answer: B**
**Explanation:** A Milestone saves the answers and risk state at a specific point in time as an immutable snapshot, enabling comparison along the time axis (the same idea as a Git tag). Comparing two Milestones lets you show the improvement trend quantitatively. A (Lens) extends domain-specific questions and is not point-in-time tracking. C is an automated check tool and has no feature for freezing a trend. D is a feature for adding internal standards as questions. Trap: "trend tracking, point-in-time comparison, reporting" are the direct-answer keywords for Milestone.

---

**Question 3.** In the WA Tool, how is an HRI (High Risk Issue) derived?

A) An AWS Solutions Architect reviews it manually and assigns it subjectively

B) It is automatically classified by risk level when the workload does not meet the best practices of each question

C) It is determined solely by Trusted Advisor's cost check results

D) The customer enters the risk level directly

**Answer: B**
**Explanation:** For each question, the WA Tool provides several best-practice choices and **automatically classifies by rules** as HRI (high) or MRI (medium) according to the risk of the items the workload fails to meet. It is derived from the objective criterion of unmet best practices, not from human judgment (A, D). C confuses it with Trusted Advisor; TA is an automated scanning tool, whereas the WA Tool is a question-based assessment. Trap: an HRI is the result of "unmet best practices," not "subjective judgment."

---

**Question 4.** Which of the following is the sixth pillar newly added to the Well-Architected Framework at re:Invent 2021?

A) Operational Excellence

B) Cost Optimization

C) Sustainability

D) Security

**Answer: C**
**Explanation:** WA started in 2015 with five pillars (Ops, Security, Reliability, Performance, Cost), and Sustainability was added as the sixth in 2021. This coincides with the period when carbon regulations such as the EU CSRD took full effect. A, B, and D are all pillars included in the original five. Trap: "a recently added pillar" or "carbon and power efficiency" points to Sustainability.

---

**Question 5.** A company wants to include **internal security standards** that are not in the AWS default best practices, such as "all databases are encrypted with a company-dedicated KMS key" and "all external ALBs must have WAF," in its WA Tool assessment. What is the most appropriate method?

A) Apply the Serverless Lens

B) Define a Custom Lens and register the internal standards as questions

C) Create a Trusted Advisor custom check

D) Record Milestones more often

**Answer: B**
**Explanation:** A Custom Lens is a feature that lets a company define its own standards in JSON and register them as WA Tool assessment items, and it surfaces violations of internal rules that the AWS default Lens does not cover as HRIs. If the Custom Lens is standardized across a multi-account environment, all teams are assessed against the same criteria. A is only specific to the serverless domain and unrelated to internal standards. C (Trusted Advisor) has no custom six-pillar assessment capability. D is merely the frequency of point-in-time records. Trap: "checking the AWS defaults and internal rules at the same time" is the direct-answer signal for Custom Lens.

---

**Question 6.** What is the most accurate description of the relationship between Trusted Advisor and the WA Tool?

A) They are the same tool with different names

B) Trusted Advisor automatically scans cost, performance, security, fault tolerance, and service limits, whereas the WA Tool is a structured qualitative assessment based on six-pillar questions

C) The WA Tool completely replaces Trusted Advisor

D) Only Trusted Advisor supports multiple accounts

**Answer: B**
**Explanation:** Trusted Advisor is a scanner that automatically checks five categories, while the WA Tool is a tool that assesses a workload against the six pillars in a structured way using broad questions. The two are complementary, and the latest WA Tool automatically pulls in TA results for some questions to prefill the answers (A and C are wrong). D has nothing to do with the facts. Trap: it splits into "automatic scan = Trusted Advisor" and "question-based structured assessment = WA Tool."

---