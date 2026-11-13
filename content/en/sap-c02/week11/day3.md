# Day 3 - Integrated Monitoring: Dividing the Roles of Security Hub, Detective, and Audit Manager

Once you have turned on all the detection services (Macie, GuardDuty, Inspector), a new problem appears: "Thousands of findings pour in every day, so who looks at them, and how?" And one step further: "When a security incident happens, how do we trace what occurred?" and "When an auditor asks for PCI DSS evidence, how do we gather it?" The services that answer these three operational questions are **Security Hub (consolidation and posture assessment)**, **Detective (incident investigation)**, and **Audit Manager (audit evidence)**.

These three have similar-sounding names and are easily confused, but their roles are clearly separated. Security Hub **looks at the current state** (what is our security posture right now, are we meeting the standards). Detective **traces the past** (how did this incident happen). Audit Manager **gathers evidence** (how do we prove regulatory compliance). If you separate them by the three tenses "present, past, proof," the exam's integrated monitoring questions get solved. Today we sort out the internal workings of each service and how Config and CloudTrail are the data foundation beneath them.

## Security Hub: CSPM, Standards Checks, and a Single Window for Findings

Security Hub has two roles. First, **CSPM (Cloud Security Posture Management)**: it automatically compares the resource configurations of your accounts against security standards and assesses "how well does our security posture conform to the standards" with a score. Second, a **finding consolidation hub**: it gathers the findings of all security services and third parties, such as GuardDuty, Inspector, Macie, IAM Access Analyzer, and Firewall Manager, into a single schema, the **ASFF (AWS Security Finding Format)**.

The standards it checks automatically:

- **AWS Foundational Security Best Practices (FSBP)**: the basic security recommendations defined by AWS
- **CIS AWS Foundations Benchmark**: an industry-standard security benchmark
- **PCI DSS**: the payment card industry security standard
- **NIST SP 800-53**: the US federal security control framework

CSPM is a product category defined in the security industry. Its core mission is **detecting configuration drift + identifying standards violations**: automatically catching cloud resources as they deviate from a secure baseline over time. Security Hub is the AWS-native CSPM, and third parties in the same category include Wiz, Prisma Cloud, Lacework, and Orca. Multi-cloud environments (AWS+Azure+GCP) usually use a third-party CSPM alongside, to assess the posture of several clouds in one console. In the exam, "AWS single cloud + automated CIS/PCI checks + an integrated dashboard" is answered by Security Hub.

Most of Security Hub's standards checks internally run **AWS Config Rules**. For example, the check for "whether S3 bucket public access is blocked" is evaluated by Config's `s3-bucket-public-read-prohibited` rule. So when you turn on a Security Hub security standard, the related Config Rules are deployed automatically, and **if Config is inactive, many of Security Hub's checks do not work**. This dependency often appears on the exam: the cause of "Security Hub checks show 'No data'" is usually that Config is not enabled. Config is the engine that records and evaluates resource changes, and Security Hub is the upper layer that aggregates and standardizes those results from a security perspective.

## Detective: Tracing the Causality of an Incident with a Graph

Suppose GuardDuty throws a finding saying "communicated with a malicious IP." So **what actually happened?** Since when did that EC2 instance communicate, with whose credentials, with which resources, and how much? This in-depth investigation is the domain of **Detective**.

Detective **automatically collects and links** VPC Flow Logs, CloudTrail, GuardDuty findings, and EKS audit logs to build a **behavior graph**. When you click a finding, it visualizes how the related entities (IPs, roles, instances, accounts) interacted along a time axis. Without a person manually joining multiple logs, it compares "this credential's usual activity vs the activity at the time of the incident" and shows the context of the anomaly.

- **Graph analysis**: visualizes relationships between entities as nodes and edges
- **Time-axis based**: tracks "since when did the behavior change"
- **Automatic data integration**: pulls in the source logs without extra setup
- **GuardDuty integration**: jump straight from a finding into a Detective investigation

Detective's graph analysis applies **graph theory** to security investigation. A security incident is, in essence, "an abnormal pattern of relationships between entities": a node (an external IP) that had no usual connection suddenly strongly connected to a node (an internal instance), or edges (mass API calls) that surged in a short time. Modeled as a graph, such abnormal connections become visually apparent. This is the same technique as fraud detection and social network analysis: it looks not at individual events but at **the structure of connections**. The "attack path" that is invisible in a simple list of logs is visible at a glance in a graph.

> ⚠️ **Pitfall**: The boundary between Security Hub and Detective. Security Hub shows "what went wrong" (finding aggregation and standards checks), but it cannot do the deep investigation of "why and how did it happen." That investigation is Detective. In the exam, "visualize a specific IAM user's activity as a time series and investigate the root cause of the incident" is Detective, and "a dashboard of security standards compliance across all accounts" is Security Hub. The two are not substitutes but complements (detection and aggregation → investigation).

## Audit Manager: Automatically Gathering Compliance Evidence

An audit is the work of **proving with evidence** that "we comply with regulations." Standards such as PCI DSS, HIPAA, and SOC 2 require hundreds of controls, and for each control you must gather evidence (screenshots, configurations, logs) that "we really comply" and submit it to the auditor. Done manually, the security team spends weeks every quarter. **Audit Manager** automates this evidence collection.

- **Prebuilt frameworks**: provides in advance the control structure of standards such as PCI DSS, HIPAA, SOC 2, GDPR, NIST, and FedRAMP
- **Automatic evidence collection**: automatically collects and attaches as evidence the **CloudTrail logs, Config snapshots, Security Hub findings, and API responses** mapped to each control
- **Audit report generation**: automatically packages a report for submission to the auditor
- **Custom frameworks**: you can also define your own internal control criteria

The decisive point where Audit Manager differs from Security Hub is **point-in-time vs continuous**. Security Hub looks in real time at "are we meeting the standard at this very moment." Audit Manager "accumulates over time the evidence that proves we continuously complied during the audit period." This is because an audit demands not "the current state" but "continuous compliance within the period": you cannot fix the configuration only the day before the audit; you need timestamped evidence that the controls worked throughout the quarter. That is why Audit Manager uses CloudTrail (who did what and when) and Config (how the configuration changed over time) as its evidence sources. In the exam, "automatic collection of evidence for the auditor, and a report" is Audit Manager, and "real-time standards checks" is Security Hub.

(Hypothetical case) A healthcare SaaS underwent a HIPAA audit every year, and each time its engineers spent 3 to 4 weeks manually capturing and organizing per-control evidence (hundreds of items such as access logs, encryption settings, and backup policies). When they enabled Audit Manager's HIPAA framework, the CloudTrail, Config, and Security Hub evidence mapped to each control was **collected automatically and accumulated with timestamps**, and at audit time they generated the report with the click of a button. The preparation period dropped from 3 to 4 weeks to a few days. The lesson: the cost of an audit lies not in "complying with controls" but in "collecting evidence that you complied," and Audit Manager automates that evidence pipeline.

(Hypothetical case) A security startup ran with only Security Hub turned on and no Detective, and suffered a breach. Security Hub showed the finding "GuardDuty detected suspicious IAM activity," but to learn "so what exactly did that credential do and how far did it spread," they had to manually join CloudTrail and VPC Flow Logs over several days. While the investigation was delayed, the attacker moved laterally to additional resources. After adopting Detective, a single click on the finding brought up a time-axis activity graph of the credential, and they identified the lateral movement path immediately. The lesson: Security Hub (detection and aggregation) and Detective (investigation) are not substitutes but sequential complements: detection answers "what," and investigation answers "how and how far."

## The Data Foundation: Config and CloudTrail Lake

All three integrated services stand on two foundations, **Config** and **CloudTrail**.

**Config** is the engine that "records changes to resource configuration and evaluates them with rules." Config Rules automatically evaluate compliance such as "is S3 public" and "is EBS encrypted," and these results become the core source of Security Hub checks and Audit Manager evidence. Without Config, many features of the upper layers are empty.

**CloudTrail Lake** is a feature that turns CloudTrail events into a **data store you can query with SQL**. You do ad hoc investigation directly in SQL, such as "find every `DeleteBucket` called by a specific IAM role over the past 90 days." It complements Detective (graph visualization): Lake is strong at querying, Detective at visualization.

Config and CloudTrail are fundamentally different in "what they record." **Config looks at the state of resources**: "is this S3 bucket public right now, and how has its configuration changed compared with yesterday" (a time series of configuration snapshots). **CloudTrail looks at actions**: "who called which API and when" (a flow of events). Security investigation needs both: use Config to find "the wrong configuration right now," and CloudTrail to trace "who changed that setting and when." For example, if S3 suddenly became public, Config flags the "change to public state" and CloudTrail tells you "who called `PutBucketAcl`." This combination of state (Config) + action (CloudTrail) is the data foundation of every higher-level security service.

> ⚠️ **Pitfall**: It is easy to confuse CloudTrail Lake, Athena over S3 logs, and CloudWatch Logs Insights. All three query logs, but **CloudTrail Lake** is a managed SQL store dedicated to CloudTrail events (zero setup, instant queries). **Athena** can query the CloudTrail logs accumulated in S3, but you carry the ETL burden of building the tables and partitions yourself. **CloudWatch Logs Insights** is for CloudWatch Logs (application and system logs) and is not a store for CloudTrail events. In the exam, "investigate CloudTrail events with ad hoc SQL" is answered by the most direct option, CloudTrail Lake.

| Tool | Core role | Form |
|------|----------|------|
| **Config** | Records resource configuration changes, evaluates rules | Compliance evaluation engine |
| **CloudTrail** | Records API calls (who did what and when) | Audit log |
| **CloudTrail Lake** | SQL queries over CloudTrail events | Analyzable store |

> 🎯 **Scenario**: "You operate security across multiple accounts. (1) You must view the CIS and PCI standards compliance status of all accounts on a single dashboard, (2) when GuardDuty raises a suspicious finding, investigate the related resource's behavior in depth as a time series, and (3) automatically collect evidence for the annual HIPAA audit. How do you configure it?" → (1) **Security Hub** (standards checks and finding consolidation, Org delegated administrator), (2) **Detective** (graph investigation integrated with GuardDuty), (3) **Audit Manager** (automatic evidence collection for the HIPAA framework). The three services each handle "current posture, past incidents, and proof of compliance," and beneath them Config and CloudTrail supply the data. The trap: do not try to bundle the three into one. Their roles differ, so you combine them.

## Integrated SOC Architecture

```
[GuardDuty]   [Inspector]   [Macie]   [IAM Access Analyzer]
     │            │            │            │
     └────────────┴────────────┴────────────┘
                       │  (ASFF integration)
                       ▼
              [Security Hub]  ◀── (standards checks: based on Config Rules)
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   [Detective]    [EventBridge]   [Audit Manager]
   (graph         (automated      (audit evidence,
   investigation)  response)       reports)
                       │
                [Lambda · SNS · SOAR]

   Foundation data: Config (config changes) + CloudTrail/Lake (API logs)
```

## Summary

Integrated monitoring has three tenses: "present, past, proof." **Security Hub** checks the **present** security posture against standards (CIS, PCI, NIST) and consolidates all findings into ASFF, **Detective** traces **past** incidents with a graph to investigate the root cause, and **Audit Manager** automatically collects the evidence that **proves** compliance. The data foundation of all of them is Config (configuration evaluation) and CloudTrail (API logs), and many of Security Hub's standards checks are implemented as Config Rules.

SAP exam mapping: (1) "multi-account automated CIS/PCI checks + an integrated dashboard" → **Security Hub**, (2) "visualize IAM user activity as a time series, investigate the root cause of an incident" → **Detective**, (3) "automatic collection of HIPAA/PCI audit evidence, reports" → **Audit Manager**, (4) "automatic evaluation of resource non-compliance" → **Config Rule**, (5) "SQL queries over CloudTrail events" → **CloudTrail Lake**, (6) "Security Hub checks show No data" → Config not enabled, (7) "send findings to an external SIEM" → EventBridge → Kinesis/Lambda. The next day looks at edge security (WAF, Shield, Firewall Manager).

---

## 📝 Practice Questions

**Question 1.** In an Organization of 30 accounts, you want to automatically check compliance with the CIS and PCI DSS standards and manage the findings of GuardDuty, Inspector, and Macie from a single dashboard. Which is the most suitable?

A) Trusted Advisor

B) Security Hub (Org delegated administrator)

C) Audit Manager

D) Detective

**Answer: B**
Explanation: Security Hub automatically checks the CIS, PCI, NIST, and FSBP standards, consolidates all security service findings into ASFF, and manages all accounts in bulk from the Org delegated administrator. A (Trusted Advisor) checks general best practices and is not an integrated security standards (CIS/PCI) check or finding hub. C (Audit Manager) collects audit evidence and is not a real-time standards check or dashboard. D (Detective) is an incident investigation tool. Trap: "automated standards checks + a finding consolidation dashboard" is Security Hub.

---

**Question 2.** GuardDuty detected suspected credential theft on an EC2 instance. You must investigate in depth, with a time-series graph, since when this instance communicated, with which credentials, and with which resources, to determine the root cause. Which is the most suitable?

A) Manual log search in the CloudTrail console

B) Detective

C) X-Ray

D) Macie

**Answer: B**
Explanation: Detective automatically integrates VPC Flow Logs, CloudTrail, and GuardDuty findings to build a behavior graph, and visualizes relationships between entities and changes along the time axis to help investigate the root cause of an incident. You can jump straight to it from a GuardDuty finding. A (manual log search) requires a person to join multiple logs, so it is slow and easy to miss things. C (X-Ray) is application distributed tracing, not a security investigation. D (Macie) is S3 data classification. Trap: "time series of an incident, relationship visualization, root cause investigation" is Detective.

---

**Question 3.** For an annual HIPAA audit, you must automatically collect evidence for each control (access logs, encryption settings, backup policies, and so on) across the audit period and generate a report for submission to the auditor. Which is the most suitable?

A) Security Hub

B) Audit Manager

C) Config

D) Inspector

**Answer: B**
Explanation: Audit Manager automatically collects CloudTrail, Config, and Security Hub evidence for each control of a prebuilt framework such as HIPAA, accumulates it with timestamps, and generates an audit report. A (Security Hub) is a point-in-time standards check, not accumulation of continuous-compliance evidence over a period or report automation. C (Config) is an evaluation engine, not audit report packaging (it serves as an evidence source). D (Inspector) is vulnerability scanning. Trap: "automatic audit evidence collection + report" is Audit Manager, and "real-time checks" is Security Hub.

---

**Question 4.** Many of Security Hub's security standards checks show a "No data" status. What is the most likely cause?

A) GuardDuty is disabled

B) AWS Config is disabled, so the Config Rules that underpin the standards checks are not evaluated

C) Macie is disabled

D) There is no CloudFront

**Answer: B**
Explanation: Many of Security Hub's standards checks are implemented internally as Config Rules. If Config is inactive, the related Config Rules cannot evaluate resources, so the check results become "No data." The fix is to enable Config in that account and Region. A and C only affect the integration of the findings of specific detection services and are not the foundation of standards checks. D is unrelated. Trap: the typical cause of "Security Hub checks show No data" is that Config is not enabled.

---

**Question 5.** You want to investigate an incident by querying, ad hoc with SQL, every `DeleteBucket` API call made by a specific IAM role over the past 90 days. Which is the most suitable?

A) Athena over raw S3 CloudTrail logs (your own ETL)

B) CloudTrail Lake

C) CloudWatch Logs Insights

D) Detective

**Answer: B**
Explanation: CloudTrail Lake is a managed data store that lets you query CloudTrail events directly with SQL, and it performs event investigation with arbitrary conditions most directly. A (Athena) is possible, but you carry the ETL burden of collecting the logs in S3 and building the tables and partitions yourself. C (Logs Insights) is a query for CloudWatch Logs and is not optimized for a CloudTrail event store. D (Detective) is strong at graph visualization and is not an ad hoc SQL query tool. Trap: "SQL queries over CloudTrail events" is CloudTrail Lake.

---

**Question 6.** You want to send all Security Hub findings in real time to an external SIEM (for example, Splunk) for integrated analysis in the SOC. Which is the most suitable configuration?

A) Export to S3, then a nightly batch ETL

B) Security Hub → EventBridge Rule → Kinesis Data Firehose/Lambda → SIEM

C) Send a Config snapshot

D) A CloudWatch Metric alarm

**Answer: B**
Explanation: Security Hub findings are normalized to ASFF and flow to EventBridge, and an EventBridge Rule sends them to Kinesis Data Firehose or Lambda to deliver them to the SIEM in real time. Because of the single ASFF schema, SIEM parsing is consistent. A (nightly batch) is not real time and has a large operational burden. C (Config snapshot) is a configuration snapshot, not a security finding stream. D (Metric alarm) is a threshold notification, not a transfer of all findings. Trap: "real-time finding delivery to a SIEM" is EventBridge-based streaming.
