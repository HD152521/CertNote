# Day 4 - EventBridge Security Automation: Finding Routing, Alert Pipelines, Security Data Lake Concept

Even with detection (GuardDuty), aggregation (Security Hub), and analysis (Athena/OpenSearch) in place, operations collapse quickly if humans triage and respond to every finding by hand. The nervous system of security automation is **Amazon EventBridge** — an event bus that *filters* events happening across AWS with *rules* and *routes* them to *targets*. In security exams, EventBridge is the router that links "finding → appropriate response action" and the mechanism that *closes* the detection-response loop. Today we also cover **Security Lake**, the higher-level concept that normalizes and consolidates an entire organization's security logs.

## EventBridge Structure: Bus, Rule, Target

```
Event source ──▶ [Event Bus] ──▶ [Rule: event pattern match] ──▶ [Target(s)]
(GuardDuty,                                                     (Lambda, SNS,
 Security Hub,                                                   Step Functions,
 Config, CloudTrail                                              SSM Automation,
 via API,                                                        SQS, another account's Bus...)
 Health, ...)
```

- **Event Bus**: The channel events flow through. The *default bus* (AWS service events), *custom bus* (application events), and *partner bus* (SaaS).
- **Rule**: Two ways to match events — **event pattern** based (when an event of a particular shape arrives) or **schedule** based (cron/rate, triggering periodic checks and key rotation).
- **Target**: What gets invoked on a match. Up to 5 per rule. Lambda, SNS, SQS, Step Functions, SSM Automation/Run Command, Kinesis, API Destinations (external HTTP), a Bus in another account/Region, and so on.

EventBridge is an implementation of the *content-based router* pattern of EDA (Event-Driven Architecture). It inspects the content of an event to decide its destination. In a security context, this means "distributing a detection signal to the appropriate response handler according to its meaning" — that is, the orchestration layer of SOAR. CloudWatch Events is the predecessor of EventBridge, and in security exams the two are effectively treated as the same concept (EventBridge being a superset).

### Which Service Sends Which Event

To write a pattern you must know the combination of `source` and `detail-type`. The ones used in security are effectively the list below.

| Service | `source` | `detail-type` | Note |
|---------|----------|---------------|------|
| GuardDuty | `aws.guardduty` | `GuardDuty Finding` | `detail.severity` is a **number** |
| Security Hub | `aws.securityhub` | `Security Hub Findings - Imported` | `detail.findings[]` array, severity is a **label** |
| Security Hub manual action | `aws.securityhub` | `Security Hub Findings - Custom Action` | When an analyst presses the button |
| Inspector | `aws.inspector2` | `Inspector2 Finding` | Vulnerabilities |
| Macie | `aws.macie` | `Macie Finding` | Sensitive data |
| Config | `aws.config` | `Config Rules Compliance Change` | Compliance state transitions |
| API call via CloudTrail | `aws.<service>` | `AWS API Call via CloudTrail` | Published only **if a trail exists in that Region** |
| AWS Health | `aws.health` | `AWS Health Event` | Events affecting the account |

The second-to-last row is what the exam asks about. **Automation that reacts to an individual API call** (for example, "if someone stops CloudTrail, immediately revert it") uses this path, not a CloudWatch alarm. There is a precondition, though — **a trail that records management events must exist in that Region** for events to flow to EventBridge. The statement "it is caught automatically even in a Region with no trail" is wrong.

```json
// The entry point for automation that catches and reverts an attempt to stop CloudTrail
{
  "source": ["aws.cloudtrail"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["cloudtrail.amazonaws.com"],
    "eventName": ["StopLogging", "DeleteTrail", "UpdateTrail", "PutEventSelectors"]
  }
}
```

```json
// Only the moment a Config rule transitions to NON_COMPLIANT (ignore the return to COMPLIANT)
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "messageType": ["ComplianceChangeNotification"],
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    }
  }
}
```

## Finding Routing: Writing Event Patterns Precisely

The starting point of security automation is describing "which findings to catch" precisely as an event pattern. We compare routing of GuardDuty and Security Hub findings.

```json
// Route only GuardDuty findings with severity 7.0 or higher (HIGH/CRITICAL)
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [ { "numeric": [">=", 7.0] } ]
  }
}
```

```json
// Only a specific type + NEW status among findings aggregated into Security Hub
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
- Exact match (array of values), `prefix`, `suffix`, `cidr` (IP range), `numeric` (comparison), `exists`, `anything-but` (negation), `equals-ignore-case`.
- Nested fields are expressed as objects. Matching inspects "only the keys in the pattern", so fields absent from the pattern are ignored (partial matching).

> ⚠️ **Pitfall**: GuardDuty's `severity` is a *number* (0.1–8.9), while Security Hub's `Severity.Label` is a *string* (LOW/MEDIUM/HIGH/CRITICAL). If you write `"severity": ["HIGH"]` when catching GuardDuty findings directly, it will never match — you must use a numeric comparison (`numeric`). Even for the same threat, the pattern schema differs depending on whether you *catch it directly from the GuardDuty bus* or *after Security Hub aggregation*, and that is an easily missed pitfall.

### What the Operators Look Like in Practice

The ability to write patterns precisely is the ability to reduce alert fatigue. Below are practical examples by operator.

```json
// ① anything-but: everything except known benign types
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 4.0] }],
    "type": [{ "anything-but": { "prefix": "Recon:EC2/PortProbeUnprotectedPort" } }]
  }
}
```

```json
// ② cidr: handle traffic from the internal range differently from external traffic
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "service": {
      "action": {
        "networkConnectionAction": {
          "remoteIpDetails": {
            "ipAddressV4": [{ "anything-but": { "cidr": "203.0.113.0/24" } }]
          }
        }
      }
    }
  }
}
```

```json
// ③ exists + multiple conditions: only FAILED controls on resources tagged as production
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Compliance": { "Status": ["FAILED"] },
      "Severity":   { "Label": ["CRITICAL", "HIGH"] },
      "Workflow":   { "Status": ["NEW"] },
      "Resources":  { "Tags": { "Env": ["prod"] } }
    }
  }
}
```

> ⚠️ **Pitfall**: Pattern matching is **partial matching**. Fields not written in the pattern are not inspected, so the fewer conditions you write, the *wider* the catch. The classic incident this property causes is **"adding a precise rule without deleting the broad rule created for testing."** EventBridge executes *every* matching rule, so if the broad rule remains, the alerts will not decrease no matter how well you write the precise rule. Remember that rules do not replace one another — they **accumulate**.

Whether to catch the same threat directly on the GuardDuty bus or after Security Hub aggregation is not merely a matter of schema differences — it is a **design choice**. Catching it directly gives the shortest latency and lets you use every original field, but you must write new rules each time a detector is added. Going through Security Hub is one beat slower, but **every detector arrives in the same schema, so one rule covers many detectors**. The practical compromise is this — *a small number of threat types where immediacy is vital* (credential leakage, mining) take the direct path, and *everything else* goes through Security Hub. When an exam question adds the condition "without rewriting the automation as detectors are added," the answer is always the aggregation path.

## Input Transformation and Delivery to Targets

You can pass the matched event to the target as is, or use an **Input Transformer** to extract and reshape only the fields you need. For example, when sending to a human via SNS, instead of the entire original JSON you process it into a readable "account/Region/resource/severity".

```json
// Input Transformer example: extract only the key fields into an alert message
{
  "InputPathsMap": {
    "acct": "$.detail.findings[0].AwsAccountId",
    "sev": "$.detail.findings[0].Severity.Label",
    "type": "$.detail.findings[0].Types[0]",
    "res": "$.detail.findings[0].Resources[0].Id"
  },
  "InputTemplate": "\"[<sev>] <type> detected in account <acct> — resource <res>\""
}
```

The phenomenon of AWS access keys accidentally committed to a public repository being discovered and abused **within a very short time** is a pattern long observed and reported in the security industry. This is because attackers run automation that constantly scans public code repositories, and leaked keys are usually used to launch mining instances or access data before a human notices. The implication of this fact for today's material is sobering — **the attacking side is already automated.** If defense stays in the loop of "a human looks at the finding, judges, and then acts," the time constant of that loop is far larger than the time constant of the attack. The reason automated response is needed is not labor savings but **restoring symmetry of speed**. At the same time, for the same reason, the damage from a malfunctioning automated response also spreads at automated speed, so judgments about reversibility and least privilege must be stricter here than in any other area.

## Automated Response Pipelines: Three Archetypes

What you set as the EventBridge target changes the nature of the response.

1. **Notification pipeline (notify)**: Rule → SNS → email/Slack (Chatbot/API Destination)/PagerDuty. Delivered to humans.
2. **Immediate remediation (remediate)**: Rule → Lambda or an **SSM Automation document**. Code/documents fix the resource directly. Examples: revoking a public security group rule, deactivating an exposed access key, blocking S3 public access.
3. **Orchestration (orchestrate)**: Rule → **Step Functions**. A response workflow with multiple steps, conditional branches, and approval gates, such as isolate → snapshot → forensic analysis → ticket creation.

```
Rule(CRITICAL GuardDuty: EC2 compromise)
  └─▶ Step Functions
        ├─ 1) Replace the instance's SG with an isolation SG (network block)
        ├─ 2) Create an EBS snapshot (forensic preservation)
        ├─ 3) Security Hub Workflow.Status = NOTIFIED
        ├─ 4) Notify the security team via SNS
        └─ 5) (After approval) Terminate the instance
```

> 🎯 **Scenario**: "When GuardDuty detects cryptocurrency mining (CryptoCurrency) on an EC2 instance, automatically isolate the instance and notify the security team" is a classic automation scenario. Correct path: GuardDuty finding → EventBridge rule (match severity·type) → Step Functions or Lambda (apply isolation SG + EBS snapshot + SNS notification). If only a notification is needed, SNS alone suffices, but if *isolation and preservation* are required, Step Functions/Lambda orchestration is needed.

If the IAM permissions granted to the automated-response Lambda/SSM are excessive, they themselves become an attack surface. The isolation role should have *only the necessary actions* such as "replace security group, snapshot, terminate," and where possible its scope should be narrowed by resource conditions (tag, account). "Attach PowerUser/Admin for automated response" is a wrong answer choice.

### What to Run Unattended: Reversibility as the Criterion

The only criterion in automated response design that never wavers is **whether it can be undone**.

| Action | Reversibility | Unattended automation | Reason |
|--------|---------------|-----------------------|--------|
| Replace with isolation security group | Reversible | **Allowed** | Just switch back to the original SG |
| Tag the resource (isolation marker) | Reversible | **Allowed** | No side effects |
| Create EBS snapshot | Reversible (additive only) | **Allowed** | Direction of *creating* evidence |
| Invalidate IAM session / deactivate key | Reversible | **Allowed** | Can be reactivated. Beware of service disruption |
| Block S3 public access | Reversible | **Allowed** | Direction of reducing exposure |
| Stop instance | Semi-reversible | Conditional | Memory evidence is lost |
| **Terminate instance** | **Irreversible** | **Forbidden** | Destroys evidence + service outage |
| **Delete volume/snapshot** | **Irreversible** | **Forbidden** | Destroys evidence |
| **Delete role/user** | **Irreversible** | **Forbidden** | Unrecoverable, cascading outage of other workloads |

The one on the borderline is "stop instance." The effect of cutting the network is the same as an isolation SG, but **memory-resident evidence (running processes, decrypted keys, network connection state) disappears with it.** That is why the standard order for incident response is *isolate, not stop* — leave the instance running but cut only its communication, take the snapshot and memory capture in that state, and then let a human decide.

> 🎯 **Scenario**: For a question like "when GuardDuty detects an instance compromise, respond automatically but preserve forensic evidence," the correct bundle of actions is **swap to an isolation SG + tagging + EBS snapshot + invalidating the sessions of the instance profile role + notification**. There are three typical wrong options. (1) **Terminating** as the first action — destroys evidence. (2) **Notification only, with no automation** — hands over the several minutes during which exfiltration is under way. (3) **Deleting the role** — irreversible, and other instances using the same role die too. The correct answer is always of the form "stop the damage with reversible actions, and hand irreversible actions to a human."

### Approval Gates: How to Make a Human Pass Through Once

When an irreversible action is needed, use the Step Functions **callback pattern** to put a human inside the workflow.

```
Step Functions workflow
  ├─ 1) Swap to isolation SG        (automatic, reversible)
  ├─ 2) Create snapshot             (automatic, evidence preservation)
  ├─ 3) Invalidate sessions         (automatic, reversible)
  ├─ 4) Request approval via Slack/ticket ◀── waitForTaskToken (waiting for a human)
  │        │
  │        ├─ Approved → 5) Terminate/clean up (irreversible, only after approval)
  │        └─ Rejected → 6) Keep isolation + escalate to an investigation ticket
  └─ (Timeout) → Keep the isolated state and escalate
```

The last line decides the quality of the design. **The default behavior on timeout must not be "do nothing"** — if the approval request gets buried, the instance stays isolated and forgotten, and is discovered days later as "why can't this instance communicate?" The default behavior on timeout must be *escalating to a higher tier*.

## Cross-Account, Cross-Region Event Routing

In multi-account security operations, EventBridge gathers events from member accounts into a **central security account**.

- Set a member account rule's target to the *central account's Event Bus ARN*.
- Allow the member account's `events:PutEvents` with the central account bus's **resource-based policy**.
- Distribute again from the central bus with rules (SNS, remediation Lambda, SIEM, etc.).

This way, instead of scattering response logic across accounts, you *respond consistently from the center*.

```json
// Resource policy of the central security account bus: allow PutEvents from organization members
{
  "Sid": "AllowOrgMembersPutEvents",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus",
  "Condition": { "StringEquals": { "aws:PrincipalOrgID": "o-abc123" } }
}
```

EventBridge delivery is *at-least-once*, so duplicate delivery can occasionally occur. Automated remediation handlers must be designed to be **idempotent** — so that isolating an already isolated instance again has no side effects. Also, configure retries and a **DLQ (Dead-Letter Queue, SQS)** for target invocation failures to preserve missed events. A response event silently lost even though the threat was detected is a fatal gap in security operations.

### The Multi-Account Aggregation Structure on One Page

```
[ Structure where an entire organization's security events converge on one bus ]

 Workload account A         Workload account B         Workload account C
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ GuardDuty    │         │ GuardDuty    │         │ GuardDuty    │
│ Config       │         │ Config       │         │ Config       │
│ CloudTrail   │         │ CloudTrail   │         │ CloudTrail   │
│      │       │         │      │       │         │      │       │
│  default bus │         │  default bus │         │  default bus │
│      │       │         │      │       │         │      │       │
│ [Rule: fwd]  │         │ [Rule: fwd]  │         │ [Rule: fwd]  │
└──────┼───────┘         └──────┼───────┘         └──────┼───────┘
       │                        │                        │
       │   events:PutEvents (allowed by the central bus resource policy)
       └────────────┬───────────┴────────────┬───────────┘
                    ▼                        ▼
        ┌───────────────────────────────────────────────┐
        │   Security Tooling account / aggregation Region │
        │   custom bus: central-security-bus             │
        │   ├─ Resource policy: aws:PrincipalOrgID cond.  │
        │   ├─ Archive: preserve original events          │
        │   └─ Rule set:                                  │
        │        · CRITICAL → Step Functions (isolate/preserve) │
        │        · HIGH     → SNS on-call + ticket        │
        │        · MEDIUM   → SQS aggregation queue → daily summary │
        │        · All      → Firehose → S3 (audit copy)  │
        └───────────────────────────────────────────────┘
                    │                        │
                    ▼                        ▼
              DLQ (SQS): preserve failed   Replay: reprocess after fixing the handler
              deliveries
```

Three things are the point of this diagram. **(1) Put only rules in workload accounts, not response logic** — if the logic is scattered, versions diverge. **(2) Split by tier at the central bus** — if you send every event to the same place, alert fatigue arises immediately. **(3) The archive and the DLQ sit at both ends** — the front one is for "replaying events that were mishandled due to a handler bug," and the back one is for "not losing events whose delivery itself failed."

```bash
# Central bus: allow PutEvents from organization members
aws events put-permission \
  --event-bus-name central-security-bus \
  --action events:PutEvents \
  --principal "*" \
  --statement-id AllowOrgMembers \
  --condition '{"Type":"StringEquals","Key":"aws:PrincipalOrgID","Value":"o-abc123xyz"}'

# Member account: forward its own events to the central bus (a forwarding role is required)
aws events put-targets \
  --rule forward-security-events \
  --targets '[{
    "Id": "to-central",
    "Arn": "arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus",
    "RoleArn": "arn:aws:iam::111122223333:role/EventBridgeCrossAccountRole"
  }]'

# Central bus: attach a retry policy and a DLQ to each target
aws events put-targets \
  --event-bus-name central-security-bus \
  --rule critical-findings \
  --targets '[{
    "Id": "isolate-workflow",
    "Arn": "arn:aws:states:ap-northeast-2:999988887777:stateMachine:IsolateAndPreserve",
    "RoleArn": "arn:aws:iam::999988887777:role/EventBridgeInvokeSfn",
    "RetryPolicy": { "MaximumRetryAttempts": 4, "MaximumEventAgeInSeconds": 3600 },
    "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:999988887777:eb-dlq" }
  }]'

# Archive: if you preserve the original events, you can replay them later
aws events create-archive \
  --archive-name central-security-archive \
  --event-source-arn arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus \
  --retention-days 90
```

Cross-account delivery requires permissions on **both sides**. The central bus's resource policy must allow `PutEvents`, and *at the same time* the **role specified in the member account's rule target must have the `events:PutEvents` permission**. The most common symptom is configuring only one side and saying "the events don't arrive," and worse, **the failure is silent**. That is why you must always attach a DLQ to cross-account delivery and monitor with an alarm whether messages pile up in the DLQ.

The value of archive and replay in security is often underestimated. Suppose a bug in the automated-response handler caused three days' worth of CRITICAL findings to be handled incorrectly. Even if you fix the handler, **events that have already passed do not come back** — because the detector will not generate the same findings again. With an archive, you can replay a specified period, and if the handler is idempotent at that point, the replay is safe. The key is that **idempotency is not just protection against duplicate delivery but the prerequisite for "replayability."** A non-idempotent handler cannot be replayed, and if it cannot be replayed, there is no way to recover from the blast radius of the bug.

## Managing Alert Fatigue: The New Noise Automation Creates

You would expect alerts to decrease after adding automation, but they actually **increase.** What you previously learned about only when a human looked at the console now all floods into the channel. Each stage of the pipeline needs a mechanism to reduce noise.

```
 [ Occurrence ]    [ Routing ]        [ Aggregation ]      [ Reach ]
 Finding ──────▶ EventBridge ──┬──▶ Immediate path ──────▶ On-call (CRITICAL only)
                               │
                               ├──▶ SQS aggregation queue ──▶ Lambda (batch) ──▶ Daily summary
                               │      (collect during the window, send at once)
                               │
                               └──▶ Firehose ──▶ S3 ──▶ Dashboards / weekly review
```

| Mechanism | What it reduces | Implementation |
|-----------|-----------------|----------------|
| **Severity-threshold routing** | Low tiers reaching on-call | `numeric`/`Label` conditions in the rule |
| **Deduplication (dedupe)** | Repeats of the same problem on the same resource | Key on resource ID + type to reuse the ticket/alert |
| **Aggregation window** | The *number* of alerts | Collect in SQS, send once as a batch |
| **Suppression list** | Repeated alerts for approved exceptions | Security Hub automation rules (day2) or pattern exclusion |
| **Ticket granularity change** | Ticket explosion per finding | A ticket **per resource, not per finding** |

The last item makes the biggest difference in practice. If you create one ticket per finding, a control failing on 200 resources produces 200 tickets. Changing to a structure where **one ticket saying "fix this resource" has 200 findings attached** makes it a unit the owner can actually process.

When introducing aggregation windows, **applying them identically to every tier** is the pitfall. Putting CRITICAL in a 15-minute window delays the response by 15 minutes. The correct design uses a **different time axis per tier** — CRITICAL immediately with no window, HIGH with a short window, MEDIUM and below as a daily summary. When an exam question adds the condition "reduce alerts while keeping response time for critical threats," this tiered time axis is the shape of the correct answer.

## EventBridge Scheduler: Periodic Security Tasks

Besides event-reactive rules, you automate periodic security tasks with **schedule-based** rules (or EventBridge Scheduler). Examples: a Lambda that checks unused access keys daily, quarterly generation of the IAM credential report, triggering periodic Config evaluations. Define them with cron/rate expressions.

```bash
# Check unused and aged access keys every early morning
aws scheduler create-schedule \
  --name daily-credential-hygiene \
  --schedule-expression "cron(0 18 * * ? *)" \
  --schedule-expression-timezone "Asia/Seoul" \
  --flexible-time-window '{"Mode":"FLEXIBLE","MaximumWindowInMinutes":15}' \
  --target '{
    "Arn": "arn:aws:lambda:ap-northeast-2:999988887777:function:credential-hygiene",
    "RoleArn": "arn:aws:iam::999988887777:role/SchedulerInvokeLambda",
    "RetryPolicy": { "MaximumRetryAttempts": 2 },
    "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:999988887777:sched-dlq" }
  }'
```

The place periodic tasks hold in security is catching **"risks where no event occurs."** Old access keys, users without MFA left lying around, unused roles left unattended — these states generate no events at all, so reactive automation will never catch them. **Reactive automation sees incidents; periodic automation sees state.**

What is dangerous is the periodic task itself dying silently. Even if the schedule does not run, there is no alert. So periodic security tasks need a heartbeat that **leaves a signal saying "executed successfully" and raises an alarm when that signal stops** (the same idea as the missing-data `breaching` alarm on day1). Automation that does not monitor its automation becomes, over time, the same as not existing.

## Security Data Lake: Amazon Security Lake

When automation and analysis mature, the requirement arises: "let's gather the organization-wide security logs into a *single normalized repository*." **Amazon Security Lake** provides this as a managed service.

Key concepts:
- **Purpose**: Automatically collect and normalize security logs from multiple accounts, Regions, and sources (CloudTrail, VPC Flow, Route 53, Security Hub findings, third parties) into a *central S3 data lake*.
- **OCSF (Open Cybersecurity Schema Framework)**: The *open standard schema* by which Security Lake normalizes data. If ASFF is the finding format *inside* Security Hub, OCSF is the *industry-common* security event schema. It reduces vendor lock-in.
- **Storage**: Stored in S3 as **Parquet** (columnar), organized in the OCSF schema → Athena/OpenSearch/third-party SIEMs can query it directly.
- **Subscriber model**: Register the consumers of the data (analysis tools, accounts) as subscribers to grant *query access* or *data access*.

```
CloudTrail ┐
VPC Flow   ┤
Route 53   ┼─▶ [Security Lake] ──(OCSF/Parquet, S3)──▶ Athena / OpenSearch / SIEM (subscriber)
Security Hub┤        (multi-account, multi-Region automatic collection and normalization)
Third party ┘
```

Security Lake is the *organization-level solution* to the problem seen on Day 3, "logs are scattered, so each analysis tool faces a different schema." If you unify normalization to OCSF at ingestion time, analysis tools (Athena/OpenSearch/SIEM) query with the same schema without per-source conversion. That is, if Security Hub normalizes *findings* into ASFF, Security Lake normalizes *raw logs overall* into OCSF — distinguishing the division of roles between these two normalization layers is an exam point.

Do not confuse Security Lake with Security Hub. Security Hub is the aggregation, scoring, and compliance dashboard of *detection findings*, and Security Lake is the normalized storage (data lake for analysis) of *raw security logs*. If it is "normalize logs from multiple sources into OCSF and query them in a SIEM," it is Security Lake; if it is "view and score the findings of multiple detectors on one dashboard," it is Security Hub.

### The Two Kinds of Subscribers: This Distinction Is an Exam Point

There are two ways to consume data from Security Lake, and the two use entirely different mechanisms.

| Axis | Query access | Data access |
|------|--------------|-------------|
| Consumption | **Query tables with SQL** | **Read S3 objects directly** |
| Permission management | **AWS Lake Formation** | S3 + IAM roles |
| Notification | None (queries are pull) | **New-object notification via SQS** |
| Typical consumers | In-house analysts (Athena), QuickSight | Third-party SIEMs, in-house pipelines |
| Granularity | Controllable down to table, column, and row level | Prefix level |

The one line to remember from this table is **"if you need fine-grained access control, use Lake Formation-based query access."** If the requirement is "make only VPC Flow logs visible to a specific team, and not CloudTrail," the answer is Lake Formation permissions, not an S3 bucket policy.

```bash
# Enable a source: which logs to gather into the lake
aws securitylake create-aws-log-source --sources '[{
  "regions": ["ap-northeast-2", "us-east-1"],
  "sourceName": "CLOUD_TRAIL_MGMT",
  "sourceVersion": "2.0"
}]'

# Register a data-access subscriber for a third-party SIEM
aws securitylake create-subscriber \
  --subscriber-name external-siem \
  --access-types S3 \
  --subscriber-identity '{"principal":"444455556666","externalId":"siem-ext-9021"}' \
  --sources '[{"awsLogSource":{"sourceName":"VPC_FLOW","sourceVersion":"2.0"}}]'
```

Security Lake's **rollup Region** concept is easily confused with Security Hub's aggregation Region. Both are "multiple Regions in one place," but the targets differ — the Security Hub aggregation Region copies over *findings*, whereas the Security Lake rollup Region gathers *normalized log data*. And the latter involves cross-Region data transfer, so **a judgment is needed on both cost and data residency**. If the condition "regulations forbid data from leaving a specific Region" is attached, a rollup Region configuration can be a violation as is, and in that case the answer is a design that separates lakes per Region and federates only the queries.

Security Lake can accept a **custom source** so that in-house logs or on-premises data can also be ingested as OCSF. A misunderstanding arises here — Security Lake does *not automatically convert* them; the ingesting side must **produce the data in OCSF format and then load it**. The statement "if you put on-premises firewall logs into Security Lake, they are normalized automatically" is wrong. Only AWS-native sources are normalized automatically, and beyond those the conversion responsibility lies with the consumer side.

## Distinguishing Three Ways of "Automatically Doing Something"

There is a triangle the exam uses to confuse you. All three are "if a condition is met, do something," but the point where they operate differs.

| Axis | CloudWatch alarm | Security Hub automation rule | EventBridge rule |
|------|------------------|------------------------------|------------------|
| Input | Metrics (numbers) | Incoming findings | Events |
| Condition | Threshold, statistics | Finding fields (account, tag, severity) | Event pattern |
| What it can do | SNS, SSM OpsItem, EC2/ASG actions | **Update finding fields only** (suppress, adjust severity) | **Everything that manipulates external resources** |
| What it cannot do | Use the original event context | **Change external resources** | Thresholds and aggregation (counting occurrences) |
| Retroactive application | No | **No** (past findings via a separate API) | No (archive replay is possible) |
| Typical use | "Notify me if it happens N or more times" | "Fold this type for this account" | "Isolate when this finding arrives" |

The option "fix an exposed security group with a Security Hub automation rule" is a wrong answer. An automation rule changes **only the finding's fields inside Security Hub**. Actually fixing the resource is the job of EventBridge → Lambda/SSM Automation. Conversely, "count 5 failed logins with EventBridge and alert" is also wrong — EventBridge only routes individual events and does not count occurrences; aggregation is the job of CloudWatch alarms. The three questions **"does it change a field / change a resource / count occurrences"** separate this triangle.

## Summary

EventBridge is a router that distributes detection signals into notification, remediation, and orchestration according to their meaning. Condensing today's material into one sentence: **"Choose signals by pattern, divide responses by reversibility, and protect delivery with idempotency, DLQ, and archive."**

There are four decision criteria to keep even if you forget the details.

1. **The schema differs depending on where you catch it.** The direct GuardDuty path has a numeric severity; the Security Hub path has a label. And if you know detectors will grow in number, the aggregation path is right.
2. **Run only reversible things unattended.** Termination and deletion pass through a human, and the default for the timeout of that approval flow must be "escalate."
3. **Monitor silent failures.** Missing cross-account permissions, DLQ backlog, a stopped periodic task — all three halt the pipeline without any error.
4. **Alerts have a different time axis per tier.** Applying an aggregation window uniformly delays the response to critical threats by that much.

And Security Lake is **standardization of the storage and analysis layer** sitting on top of this automation. If Security Hub unifies *findings* into ASFF, Security Lake unifies *raw logs* into OCSF — that the two normalizations target different things is the distinction most often tested on the exam. On day5 we run the four days of week8 through a single pipeline once more.

### One-Line Summary Checklist

- [ ] In event patterns, did you handle severity with `numeric` for GuardDuty and `Label` for Security Hub?
- [ ] Is there no leftover broad test rule still catching widely (rules accumulate rather than replace)?
- [ ] Did you keep irreversible actions (termination, deletion) out of unattended automation?
- [ ] Is the default behavior on the approval gate's timeout escalation?
- [ ] Did you configure **both sides' permissions** (bus resource policy + forwarding role) for cross-account delivery?
- [ ] Did you attach a retry policy and DLQ to every target, and do you monitor DLQ backlog with an alarm?
- [ ] Did you turn on the archive so replay is possible after fixing a handler (and is the handler idempotent)?
- [ ] Did you apply a different time axis per tier (immediate / short window / daily summary)?
- [ ] Are you creating tickets **per resource** rather than per finding?
- [ ] If Security Lake subscribers needed fine-grained permissions, did you use Lake Formation-based query access?

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

