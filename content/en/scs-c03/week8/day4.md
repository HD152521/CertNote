# Day 4 - EventBridge Security Automation: Finding Routing, Alert Pipelines, Security Data Lake Concept

Even with detection (GuardDuty), aggregation (Security Hub), and analysis (Athena/OpenSearch), if humans manually triage and respond to every finding, operations collapse quickly. The nervous system of security automation is **Amazon EventBridge** — an event bus across AWS that *filters* events with *rules* and *routes* them to *targets*. In security exams, EventBridge is the router linking "finding → appropriate response action" and the mechanism that *closes* the detection-response loop. We also cover today the higher-level concept that normalizes and integrates security logs across the organization: **Security Lake**.

## EventBridge Structure: Bus, Rule, Target

```
Event Source ──▶ [Event Bus] ──▶ [Rule: event pattern matching] ──▶ [Target(s)]
(GuardDuty,                                                         (Lambda, SNS,
 Security Hub,                                                       Step Functions,
 Config, CloudTrail                                                  SSM Automation,
 via API,                                                            SQS, cross-account Bus...)
 Health, ...)
```

- **Event Bus**: The channel where events flow. *default bus* (AWS service events), *custom bus* (app events), *partner bus* (SaaS).
- **Rule**: Two kinds of event matching — **event pattern** based (when a specific-shaped event arrives) or **schedule** based (cron/rate, periodic checks, key rotation triggers).
- **Target**: The destination invoked when matched. Up to 5 per rule. Lambda, SNS, SQS, Step Functions, SSM Automation/Run Command, Kinesis, API Destinations (external HTTP), Bus in another account/region, etc.

> 💡 **Related Theory**: EventBridge implements the *content-based router* pattern from EDA (Event-Driven Architecture). It inspects an event's content to determine its destination. In security terms, this is "distributing detection signals to appropriate response handlers based on their meaning" — i.e., the orchestration layer of SOAR. CloudWatch Events was EventBridge's predecessor; on security exams they are treated as essentially identical (EventBridge is backward-compatible and extended).

## Finding Routing: Writing Event Patterns Precisely

The starting point for security automation is precisely describing "which findings to catch" with an event pattern. Compare GuardDuty and Security Hub finding routing.

```json
// GuardDuty findings with severity 7.0 or higher (HIGH/CRITICAL) only
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [ { "numeric": [">=", 7.0] } ]
  }
}
```

```json
// Security Hub aggregated findings of specific type + NEW status only
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Types": [{ "prefix": "TTPs/Initial Access" }],
      "Workflow": { "Status": ["NEW"] },
      "Severity": { "Label": ["HIGH", "CRITICAL"] }
    }
  }
}
```

Key pattern-matching operators:
- Exact matching (array of values), `prefix`, `suffix`, `cidr` (IP ranges), `numeric` (comparison), `exists`, `anything-but` (negation), `equals-ignore-case`.
- Nested fields represented as objects. Matching only checks keys in the pattern, so fields not in the pattern are ignored (partial matching).

> ⚠️ **Trap**: GuardDuty's `severity` is a *number* (0.1–8.9) while Security Hub's `Severity.Label` is a *string* (LOW/MEDIUM/HIGH/CRITICAL). Writing `"severity": ["HIGH"]` when catching GuardDuty findings directly will never match — you must use numeric comparison (`numeric`). The same threat has *different* pattern schemas depending on whether you catch it *directly from GuardDuty* or *after Security Hub aggregation* — this difference is a frequent exam trap.

## Input Transformation and Delivery to Targets

You can pass matched events to targets as-is or use **Input Transformer** to extract and restructure only needed fields. For example, when sending to SNS for humans, format only "account/region/resource/severity" in readable form instead of the entire raw JSON.

```json
// Input Transformer example: extract key fields for alert message
{
  "InputPathsMap": {
    "acct": "$.detail.findings[0].AwsAccountId",
    "sev": "$.detail.findings[0].Severity.Label",
    "type": "$.detail.findings[0].Types[0]",
    "res": "$.detail.findings[0].Resources[0].Id"
  },
  "InputTemplate": "\"[<sev>] Detection in account <acct>: <type> — resource <res>\""
}
```

## Automated Response Pipelines: Three Patterns

Response character varies by what you choose as the EventBridge target.

1. **Alert Pipeline (notify)**: Rule → SNS → email/Slack (Chatbot/API Destination)/PagerDuty. Deliver to humans.
2. **Immediate Remediation (remediate)**: Rule → Lambda or **SSM Automation document**. Code/document directly fixes resources. Example: revoke exposed security group rules, disable leaked access keys, block S3 public access.
3. **Orchestration (orchestrate)**: Rule → **Step Functions**. Workflows with multiple stages, conditional branching, approval gates: isolate → snapshot → forensic analysis → create ticket.

```
Rule (CRITICAL GuardDuty: EC2 Compromise)
  └─▶ Step Functions
        ├─ 1) Replace instance with isolation SG (network block)
        ├─ 2) Create EBS snapshot (forensic preservation)
        ├─ 3) Update Security Hub Workflow.Status = NOTIFIED
        ├─ 4) Alert security team via SNS
        └─ 5) (After approval) Terminate instance
```

> 🎯 **Scenario**: "When GuardDuty detects CryptoCurrency mining on an EC2 instance, automatically isolate the instance and alert the security team" is a frequent exam automation scenario. Winning path: GuardDuty finding → EventBridge rule (severity/type matching) → Step Functions or Lambda (apply isolation SG + create EBS snapshot + SNS alert). Simple notification alone needs only SNS, but *isolation and preservation* require Step Functions/Lambda orchestration.

> ⚠️ **Trap**: Excessive IAM permissions on auto-remediation Lambda/SSM become an attack surface themselves. An isolation role must have *only* needed actions like "modify security group, snapshot, terminate" and should be scoped by resource conditions (tags, account) whenever possible. Beware the wrong multiple-choice answer "grant PowerUser/Admin for fast automation."

## Cross-Account, Cross-Region Event Routing

In multi-account security operations, EventBridge collects events from member accounts to a **central security account**.

- Set member account rule targets to *central account Event Bus ARN*.
- Central account bus's **Resource-based policy** permits member accounts' `events:PutEvents`.
- Redistribute from central bus via rules (SNS, remediation Lambda, SIEM, etc.).

This way, response logic stays *centralized and consistent* rather than scattered across accounts.

```json
// Resource policy on central security account's bus: allow org members to PutEvents
{
  "Sid": "AllowOrgMembersPutEvents",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus",
  "Condition": { "StringEquals": { "aws:PrincipalOrgID": "o-abc123" } }
}
```

> 🔍 **Deeper Dive**: EventBridge delivery guarantees *at-least-once* (not exactly-once), so rare duplicate deliveries can occur. Automatic remediation handlers must be **idempotent** — re-isolating an already-isolated instance should have no side effects. On target invocation failure, configure retry and **DLQ (Dead-Letter Queue, SQS)** to preserve lost events. "Detect but silently lose the response event" is a critical security operations gap.

## EventBridge Scheduler: Periodic Security Tasks

Beyond event-driven responses, use **schedule-based** rules (or EventBridge Scheduler) to automate periodic security tasks. Examples: daily Lambda to check for unused access keys, quarterly IAM credential reports, periodic Config evaluation triggers. Define with cron/rate expressions.

## Security Data Lake: Amazon Security Lake

As automation and analysis mature, the requirement emerges: "Collect all security logs across the organization into *a single normalized repository*." **Amazon Security Lake** provides this as a managed service.

Key concepts:
- **Purpose**: Automatically collect and normalize security logs from multiple accounts, regions, and sources (CloudTrail, VPC Flow, Route 53, Security Hub findings, third parties) into a *central S3 data lake*.
- **OCSF (Open Cybersecurity Schema Framework)**: The *open standard schema* Security Lake uses to normalize data. While ASFF is Security Hub's *internal* finding format, OCSF is the *industry-wide* security event schema. Reduces vendor lock-in.
- **Storage**: In S3 as **Parquet** (columnar), organized by OCSF schema → Athena/OpenSearch/third-party SIEMs query directly.
- **Subscriber Model**: Register data consumers (analysis tools, accounts) as subscribers to grant *query access* or *data access*.

```
CloudTrail ┐
VPC Flow   ┤
Route 53   ┼─▶ [Security Lake] ──(OCSF/Parquet, S3)──▶ Athena / OpenSearch / SIEM (subscriber)
Security Hub┤      (multi-account, multi-region, auto-collect/normalize)
Third-party ┘
```

> 💡 **Related Theory**: Security Lake is the *organization-level solution* to the problem seen in Day 3 — logs scattered, analysis tools facing different schemas per source. By standardizing normalization to OCSF at ingestion time, analysis tools (Athena/OpenSearch/SIEM) query a single schema without per-source translation. That is, Security Hub normalizes *findings* to ASFF, while Security Lake normalizes *raw logs overall* to OCSF — distinguishing this role split between the two normalization layers is an exam key point.

> ⚠️ **Trap**: Do not confuse Security Lake and Security Hub. Security Hub is the *findings* (detection results) aggregation, scoring, and compliance dashboard; Security Lake is a *raw security logs* normalization repository (for analytics data lake). "Normalize logs from multiple sources to OCSF, SIEM queries" → Security Lake. "See and score findings from multiple detectors on one dashboard" → Security Hub.

## Summary: Automation Nervous System

EventBridge is the router distributing detection signals to alerts, remediation, or orchestration by meaning; idempotence, DLQ, and least privilege are core to operational hygiene. Security Lake sits above, normalizing organization-wide logs to OCSF for analysis under a single schema. Day 5 ties CloudWatch, Security Hub, analysis, and EventBridge into one detection-aggregation-analysis-response flow.

---

## 📝 Practice Questions

**Question 1.** You are trying to catch GuardDuty findings directly with an EventBridge rule, but the pattern `"detail": { "severity": ["HIGH"] }` never matches. What is the cause?

A) GuardDuty does not send events to EventBridge  
B) GuardDuty severity is a number (0.1 to 8.9), so a numeric comparison operator must be used, and the string "HIGH" will not match  
C) The rule has no target  
D) You must use a custom bus rather than the default bus  

**Answer: B**  
Explanation: The severity of a GuardDuty finding is a numeric value, so you must match it in the form `{ "numeric": [">=", 7.0] }`. String labels (HIGH/CRITICAL) are the format used in `Severity.Label` of findings aggregated into Security Hub. GuardDuty sends events to the default bus, and whether a target exists is irrelevant to matching.

---

**Question 2.** You want to configure a multi-step response in which, when GuardDuty detects an EC2 instance compromise, it automatically (1) isolates the instance, (2) preserves an EBS snapshot, and (3) notifies the security team. What is the most suitable target?

A) A single SNS topic  
B) EventBridge rule → Step Functions (or Lambda) to orchestrate isolation, snapshot, and notification  
C) CloudWatch Alarm  
D) Athena query  

**Answer: B**  
Explanation: A multi-step response with ordering and branching, such as isolation, snapshot, and notification, suits Step Functions orchestration (or multi-step Lambda). SNS only sends simple notifications, a CloudWatch Alarm is metric threshold detection, and Athena is an after-the-fact query tool, so none can perform an active remediation workflow.

---

**Question 3.** When designing an automatic remediation Lambda, what is the most important principle for security hygiene?

A) Grant Administrator permissions for response speed  
B) Grant a least-privilege role with only the required actions and, where possible, narrow the scope with resource conditions  
C) Place the Lambda in a public subnet  
D) Do not write logs  

**Answer: B**  
Explanation: Excessive permissions on an automatic response handler are themselves an attack surface, so the key is least privilege: grant only the needed actions such as isolation and snapshot, and narrow the scope with conditions such as tags and accounts. Granting Administrator is dangerous, and public placement and not writing logs weaken security.

---

**Question 4.** In a multi-account environment, you want the central security account to respond consistently to security events from all member accounts. Which EventBridge configuration is correct?

A) Deploy copies of the same response Lambda to every member account  
B) Set the target of the member account rules to the central account's event bus, and allow the members' PutEvents with the central bus's resource policy  
C) Directly poll member account logs from the central account  
D) Share a single SNS topic across all accounts  

**Answer: B**  
Explanation: For cross-account routing, the standard is to set the target of the member rule to the central bus ARN and allow the members' events:PutEvents through the central bus resource policy (for example, with an aws:PrincipalOrgID condition). Replicating the response logic to all accounts reduces consistency and manageability, and polling or sharing SNS is not the correct pattern for event routing.

---

**Question 5.** You want to normalize CloudTrail, VPC Flow, and Route 53 logs from multiple accounts and Regions, plus third-party data, into the OCSF standard schema, collect them in S3, and let Athena and a SIEM query them with a single schema. What is the most suitable service?

A) AWS Security Hub  
B) Amazon Security Lake  
C) Amazon Macie  
D) AWS Config  

**Answer: B**  
Explanation: The service that normalizes raw security logs from multiple accounts and Regions into the OCSF standard, automatically collects them into an S3 data lake (Parquet), and lets subscribers query them with a single schema is Security Lake. Security Hub is a dashboard that aggregates and scores findings in ASFF, Macie is S3 sensitive data discovery, and Config is resource configuration evaluation, so their roles differ.

---

