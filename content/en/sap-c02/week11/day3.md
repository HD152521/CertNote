# Day 3 - Integrated Monitoring: Security Hub·Detective·Audit Manager Roles and Responsibilities

After turning on all detection services (Macie·GuardDuty·Inspector), a new problem emerges. "Thousands of Findings pour in per day—who looks at them and how?" And one step further — "When a security incident happens, how do we track what happened?", "If an auditor demands PCI DSS evidence, how do we collect it?" These three operational questions are answered by **Security Hub (unified posture assessment)**, **Detective (incident investigation)**, and **Audit Manager (audit evidence)**. 

These three have similar names but clearly divided roles. Security Hub **sees the current state** (how is our security posture now, are we meeting standards). Detective **tracks the past** (how did this incident happen). Audit Manager **gathers evidence** (how do we prove regulatory compliance). If you distinguish these as the three tenses — "current · past · proof" — you'll solve integrated monitoring problems on the exam. Today we'll organize each service's internal operations and the relationship where Config and CloudTrail provide data foundations for them.

## Security Hub — CSPM and Standards Checks, Plus a Single Finding Gateway

Security Hub has two roles. First is **CSPM (Cloud Security Posture Management)** — it automatically checks account resource settings against security standards and evaluates "how well our security posture aligns with standards" with scores. Second is **Finding integration hub** — it collects Findings from GuardDuty·Inspector·Macie·IAM Access Analyzer·Firewall Manager and third parties in the **ASFF (AWS Security Finding Format)** single schema.

Standards that it automatically checks:

- **AWS Foundational Security Best Practices (FSBP)** — AWS-defined basic security recommendations
- **CIS AWS Foundations Benchmark** — Industry-standard security benchmark
- **PCI DSS** — Card payment industry security standard
- **NIST SP 800-53** — US federal security control framework

> 💡 **Related Theory**: CSPM is a product category defined in the security industry. Its core mission is **configuration drift detection + standards violation identification** — automatically catching cloud resources that deviate from safe baselines over time. Security Hub is AWS's native CSPM, with third-party competitors in the same category like Wiz, Prisma Cloud, Lacework, and Orca. Multi-cloud environments (AWS+Azure+GCP) usually use third-party CSPM as well — to evaluate multiple clouds' posture from a single console. In the exam, "AWS single cloud + CIS/PCI automatic checks + unified dashboard" means Security Hub is the answer.

> 🔍 **Deeper Dive**: Most of Security Hub's standards checks internally **run AWS Config Rules**. For example, the "S3 bucket public access blocked" check is evaluated with Config's `s3-bucket-public-read-prohibited` rule. So when you enable Security Hub's security standards, associated Config Rules are automatically deployed, and **if Config is inactive, many Security Hub checks don't work**. This dependency often appears in the exam — the cause of "Security Hub check showing 'No data'" is usually Config being disabled. Config is the engine that records and evaluates resource changes, and Security Hub is the higher layer that aggregates and standardizes those results from a security perspective.

## Detective — Tracing Incident Causality with Graphs

Suppose GuardDuty throws a Finding that "communicated with a malicious IP." So **what actually happened?** From when did that EC2 communicate, with what credentials, with which resources, and how much? This deeper investigation is **Detective's** domain.

Detective automatically collects VPC Flow Logs·CloudTrail·GuardDuty Findings·EKS audit logs and creates a **behavior graph** by connecting them. When you click a Finding, related entities (IPs, roles, instances, accounts) are visualized on a time axis showing how they interact. No need for humans to manually join multiple logs — it shows the context of anomalies by comparing "this credential's normal activity vs activity at incident time."

- **Graph Analysis**: Visualizes relationships between entities as nodes and edges
- **Time-Axis Based**: Tracks "when did behavior change"
- **Automatic Data Integration**: Pulls source logs without additional setup
- **GuardDuty Integration**: Jump directly from Finding to Detective investigation

> 💡 **Related Theory**: Detective's graph analysis applies **graph theory** to security investigation. Security incidents are fundamentally "abnormal patterns in relationships between entities" — nodes that normally don't connect (external IP) suddenly strongly connected to nodes (internal instance), edges that explode within a short time (bulk API calls). Modeling with graphs makes these abnormal connections visually obvious. This is like fraud detection and social network analysis techniques — you look at **connection structure**, not individual events. Attack paths that aren't visible in plain log listings become obvious at a glance in the graph.

> ⚠️ **Trap**: The boundary between Security Hub and Detective. Security Hub shows "what's wrong" (Finding aggregation, standards checks) but can't do deep investigation into "why and how it happened." That investigation is Detective's job. In the exam, "visualize specific IAM user activity on a timeline to investigate root cause of incident" is Detective, while "multi-account security standards compliance status dashboard" is Security Hub. They're not replacements but complementary (detection/aggregation → investigation) relationships.

## Audit Manager — Automatically Collecting Compliance Evidence

Auditing means **proving with evidence** that "we follow regulations." Standards like PCI DSS, HIPAA, SOC 2 require hundreds of controls, and for each control, you must collect evidence (screenshots, settings, logs) to submit to auditors. Doing this manually costs the security team weeks per quarter. **Audit Manager** automates this evidence collection.

- **Pre-built Frameworks**: Pre-provides control structures of standards like PCI DSS·HIPAA·SOC 2·GDPR·NIST·FedRAMP
- **Automatic Evidence Collection**: Automatically collects **CloudTrail logs·Config snapshots·Security Hub Findings·API responses** mapped to each control and attaches them as evidence
- **Audit Report Generation**: Auto-packages reports for auditor submission
- **Custom Frameworks**: Can define your own internal control standards

> 🔍 **Deeper Dive**: The decisive difference between Audit Manager and Security Hub is **point-in-time vs continuous**. Security Hub sees "right now are we following standards" in real-time. Audits require evidence of "sustained compliance during the audit period." You can't fix settings just the night before audits — you need timestamp evidence that controls operated throughout the quarter. That's why Audit Manager accumulates evidence over time. Audits require "current state," but they demand "continuous compliance during the period" — that's the key distinction. CloudTrail (who did what when) and Config (how settings changed over time) become evidence sources. In the exam, "auto-collect audit evidence·reports for auditor submission" is Audit Manager, while "real-time standards checks" is Security Hub.

> 📚 **Case Study**: A healthcare SaaS received annual HIPAA audits but wasted 3-4 weeks per time having engineers manually capture evidence (access logs, encryption settings, backup policies, etc. — hundreds of items) and organize them. After activating Audit Manager's HIPAA framework, evidence mapped to each control (from CloudTrail, Config, Security Hub) **automatically accumulated with timestamps**, and report generation became a single button click at audit time. Prep time dropped from 3-4 weeks to days. Lesson: audit cost lies not in "maintaining controls" but in "collecting evidence of compliance," and Audit Manager automates that evidence pipeline.

> 📚 **Case Study**: A security startup operated with just Security Hub enabled but without Detective and suffered a breach. Security Hub showed "GuardDuty detected suspected IAM activity," but knowing "exactly what that credential did and how far it spread" required manually joining CloudTrail and VPC Flow Logs for days. Investigation delays let the attacker perform lateral movement to additional resources. After Detective deployment, a single Finding click brought up the credential's time-axis activity graph, letting them immediately identify the lateral movement path. Lesson: Security Hub (detection/aggregation) and Detective (investigation) aren't replacements but sequential complementary tools — detection answers "what," investigation answers "how and how far."

## Data Foundations — Config and CloudTrail Lake

All three integrated services stand on the foundation of two services: **Config** and **CloudTrail**.

**Config** is the "engine that records and evaluates resource configuration changes." Config Rules automatically evaluate compliance like "Is S3 public?", "Is EBS encrypted?", and these results become core sources for Security Hub checks and Audit Manager evidence. Without Config, many features of higher layers become empty.

**CloudTrail Lake** is a feature making CloudTrail events into a **SQL-queryable data store**. You run arbitrary investigations like "find all `DeleteBucket` calls made by this IAM role over the past 90 days" directly with SQL. Complementary to Detective (graph visualization) — Lake is strong at queries, Detective at visualization.

> 🔍 **Deeper Dive**: The fundamental difference between Config and CloudTrail is "what they record." **Config sees resource state** — "is this S3 bucket public right now, how did settings change compared to yesterday" (time series of configuration snapshots). **CloudTrail sees actions** — "who called what API when" (flow of events). Both are needed for security investigation — Config finds "currently incorrect settings," CloudTrail tracks "who changed those settings when." Example: if S3 suddenly becomes public, Config flags "public state change" and CloudTrail tells us "who called `PutBucketAcl`." This combination of state (Config) + action (CloudTrail) is the data foundation for all higher-level security services.

> ⚠️ **Trap**: Confusing CloudTrail Lake vs Athena over S3 logs vs CloudWatch Logs Insights. All three query logs but — **CloudTrail Lake** is a managed SQL store dedicated to CloudTrail events (zero config, instant query). **Athena** can query CloudTrail logs stored in S3 but has ETL burden of setting up tables and partitions directly. **CloudWatch Logs Insights** is for CloudWatch Logs (application/system logs), not a CloudTrail event store. In the exam, "arbitrary SQL investigation of CloudTrail events" makes CloudTrail Lake the most direct answer.

| Tool | Core Role | Form |
|------|----------|------|
| **Config** | Record and evaluate resource setting changes | Compliance evaluation engine |
| **CloudTrail** | Record API calls (who when what) | Audit log |
| **CloudTrail Lake** | SQL query CloudTrail events | Queryable store |

> 🎯 **Scenario**: "Operating security across multiple accounts. (1) See CIS/PCI standards compliance status of all accounts on a single dashboard, (2) when GuardDuty detects a suspicious Finding, investigate the resource's timeline behavior deeply, (3) collect evidence for annual HIPAA audit automatically." How to design? → (1) **Security Hub** (standards checks + Finding integration, Org delegated administrator), (2) **Detective** (GuardDuty integration graph investigation), (3) **Audit Manager** (HIPAA framework automatic evidence collection). The three services each handle "current posture · past incidents · compliance proof," and Config/CloudTrail supply data below them. Trap: don't try to merge them into one — they have different roles so you combine them.

## Integrated SOC Architecture

```
[GuardDuty]   [Inspector]   [Macie]   [IAM Access Analyzer]
     │            │            │            │
     └────────────┴────────────┴────────────┘
                       │  (ASFF Integration)
                       ▼
              [Security Hub]  ◀── (Standards Checks: Config Rule-based)
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   [Detective]    [EventBridge]   [Audit Manager]
   (Graph Investigation)  (Automated Response)   (Audit Evidence·Reports)
                       │
                [Lambda · SNS · SOAR]

   Data Foundation: Config(Setting Changes) + CloudTrail/Lake(API Logs)
```

## Summary

Integrated monitoring is the three tenses — "current · past · proof" — **Security Hub** checks **current** security posture against standards (CIS·PCI·NIST) and integrates all Findings in ASFF, **Detective** tracks **past** incidents via graphs to investigate root causes, and **Audit Manager** **proves** compliance by automatically collecting evidence. All are grounded in data from Config (setting evaluation) and CloudTrail (API logs), with many of Security Hub's standards checks implemented internally as Config Rules.

SAP exam frequent mappings: (1) "Multi-account CIS/PCI automatic checks + unified dashboard" → **Security Hub**, (2) "Timeline visualization of IAM user activity, incident root cause investigation" → **Detective**, (3) "HIPAA/PCI audit evidence automatic collection·reports" → **Audit Manager**, (4) "Automatic resource non-compliance evaluation" → **Config Rule**, (5) "CloudTrail event SQL query" → **CloudTrail Lake**, (6) "Security Hub checks showing No data" → Config disabled, (7) "Send Findings to external SIEM" → EventBridge → Kinesis/Lambda. Next day we look at edge security (WAF·Shield·Firewall Manager).

---

## 📝 Practice Questions

**Question 1.** In an Organization of 30 accounts, you want to automatically check compliance with the CIS and PCI DSS standards and consolidate Findings from GuardDuty, Inspector, and Macie into a single dashboard. Which is the most appropriate?

A) Trusted Advisor

B) Security Hub (Org delegated administrator)

C) Audit Manager

D) Detective

**Answer: B**

**Explanation:** Security Hub automatically checks the CIS, PCI, NIST, and FSBP standards, consolidates the Findings of all security services in ASFF, and manages all accounts at once from the Org delegated administrator. A (Trusted Advisor) performs general best-practice checks and is not an integrated check of security standards (CIS/PCI) or a Finding hub. C (Audit Manager) collects audit evidence and is not a real-time standards check or dashboard. D (Detective) is an incident investigation tool. Trap: "automatic standards checks + consolidated Finding dashboard" is Security Hub.

---

**Question 2.** GuardDuty detected suspected credential theft on an EC2 instance. You must investigate in depth with a time-series graph — since when, with which credentials, and with which resources this instance communicated — to identify the root cause. Which is the most appropriate?

A) Manually search logs in the CloudTrail console

B) Detective

C) X-Ray

D) Macie

**Answer: B**

**Explanation:** Detective automatically ingests VPC Flow Logs, CloudTrail, and GuardDuty Findings to build a behavior graph, and visualizes relationships between entities and changes over time to help investigate the root cause of an incident. You can jump to it directly from a GuardDuty Finding. A (manual log search) requires a person to join multiple logs, which is slow and easy to miss things. C (X-Ray) is application distributed tracing, not security investigation. D (Macie) classifies S3 data. Trap: "time series of an incident, relationship visualization, root-cause investigation" is Detective.

---

**Question 3.** For an annual HIPAA audit, you must automatically collect evidence for each control (access logs, encryption settings, backup policies, and so on) over the audit period and generate a report for submission to the auditor. Which is the most appropriate?

A) Security Hub

B) Audit Manager

C) Config

D) Inspector

**Answer: B**

**Explanation:** Audit Manager automatically collects CloudTrail, Config, and Security Hub evidence for each control of prebuilt frameworks such as HIPAA, accumulates it with timestamps, and generates audit reports. A (Security Hub) is a point-in-time standards check and does not accumulate evidence of continuous compliance over a period or automate reports. C (Config) is an evaluation engine, not audit report packaging (it serves as an evidence source). D (Inspector) is vulnerability scanning. Trap: "automatic audit evidence collection + report" is Audit Manager; "real-time checks" is Security Hub.

---

**Question 4.** Many of the security standard checks in Security Hub show a "No data" status. What is the most likely cause?

A) GuardDuty is disabled

B) AWS Config is disabled, so the Config Rules that underlie the standard checks are not evaluated

C) Macie is disabled

D) There is no CloudFront

**Answer: B**

**Explanation:** Many of Security Hub's standard checks are implemented internally as Config Rules. If Config is inactive, the related Config Rules cannot evaluate resources, so the check results become "No data". The fix is to enable Config in that account and Region. A and C only affect the integration of Findings from specific detection services and are not the foundation of the standard checks. D is irrelevant. Trap: the classic cause of "Security Hub checks showing No data" is Config not being enabled.

---

**Question 5.** You want to investigate an incident by querying, with arbitrary SQL, all `DeleteBucket` API calls made by a specific IAM role over the past 90 days. Which is the most appropriate?

A) Athena over raw S3 CloudTrail logs (build your own ETL)

B) CloudTrail Lake

C) CloudWatch Logs Insights

D) Detective

**Answer: B**

**Explanation:** CloudTrail Lake is a managed data store that lets you query CloudTrail events directly with SQL, and it performs event investigation with arbitrary conditions most directly. A (Athena) is possible but carries the ETL burden of collecting logs in S3 and configuring tables and partitions yourself. C (Logs Insights) is a query tool for CloudWatch Logs and is not optimized for a CloudTrail event store. D (Detective) is strong at graph visualization but is not an arbitrary SQL query tool. Trap: "SQL queries on CloudTrail events" is CloudTrail Lake.

---

**Question 6.** You want to send all Security Hub Findings in real time to an external SIEM (for example, Splunk) for consolidated analysis in the SOC. Which is the most appropriate configuration?

A) Export to S3 and run a nightly batch ETL

B) Security Hub → EventBridge Rule → Kinesis Data Firehose/Lambda → SIEM

C) Send Config Snapshots

D) CloudWatch Metric alarm

**Answer: B**

**Explanation:** Security Hub Findings are normalized to ASFF and flow to EventBridge, and an EventBridge Rule sends them to Kinesis Data Firehose or Lambda to deliver them to the SIEM in real time. Because ASFF is a single schema, SIEM parsing is consistent. A (nightly batch) is not real time and has a heavy operational burden. C (Config Snapshot) is a configuration snapshot, not a stream of security Findings. D (Metric alarm) is a threshold notification and does not send the full Finding. Trap: "real-time Finding delivery to a SIEM" is EventBridge-based streaming.

---

## 📌 Today's Summary

Today's core: integrated monitoring divides across three tenses — **Security Hub** (current state: standards checks + Finding integration), **Detective** (past: timeline graph investigation), **Audit Manager** (proof: continuous evidence collection). Security Hub uses Config Rules for standards checks, so Config being disabled causes "No data." Detective enables root-cause investigation of GuardDuty Findings via automated log integration and graph visualization. Audit Manager collects evidence continuously during audit periods (not point-in-time snapshots like Security Hub). CloudTrail and Config are data foundations for all three. Multi-account deployments use delegated administrator for unified management.
