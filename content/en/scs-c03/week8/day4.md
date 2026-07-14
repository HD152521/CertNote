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

## 📝 연습 문제

**문제 1.** GuardDuty 핀딩을 EventBridge 규칙으로 직접 잡으려는데 `"detail": { "severity": ["HIGH"] }` 패턴이 한 번도 매칭되지 않는다. 원인은?

A) GuardDuty는 EventBridge로 이벤트를 보내지 않는다  
B) GuardDuty의 severity는 숫자(0.1~8.9)이므로 numeric 비교 연산자를 써야 하며 문자열 "HIGH"로는 매칭되지 않는다  
C) 규칙에 대상이 없어서다  
D) default bus가 아닌 custom bus를 써야 한다  

**정답: B**  
해설: GuardDuty 핀딩의 severity는 숫자 값이므로 `{ "numeric": [">=", 7.0] }` 형태로 매칭해야 한다. 문자열 라벨(HIGH/CRITICAL)은 Security Hub로 집계된 핀딩의 `Severity.Label`에서 쓰는 형식이다. GuardDuty는 default bus로 이벤트를 보내며, 대상 유무는 매칭 여부와 무관하다.

---

**문제 2.** GuardDuty가 EC2 인스턴스 침해를 탐지하면 자동으로 (1) 인스턴스를 격리하고 (2) EBS 스냅샷을 보존하고 (3) 보안팀에 알리는 다단계 대응을 구성하려 한다. 가장 적합한 대상은?

A) SNS 토픽 하나  
B) EventBridge 규칙 → Step Functions(또는 Lambda)로 격리·스냅샷·알림을 오케스트레이션  
C) CloudWatch Alarm  
D) Athena 쿼리  

**정답: B**  
해설: 격리·스냅샷·알림처럼 순서·분기가 있는 다단계 대응은 Step Functions 오케스트레이션(또는 다단계 Lambda)이 적합하다. SNS는 단순 알림만 하고, CloudWatch Alarm은 메트릭 임계 탐지, Athena는 사후 쿼리 도구로 능동 교정 워크플로를 수행하지 못한다.

---

**문제 3.** 자동 교정 Lambda를 설계할 때 보안 위생상 가장 중요한 원칙은?

A) 대응 속도를 위해 Administrator 권한을 부여  
B) 필요한 액션만 갖는 최소 권한 역할을 부여하고 가능하면 리소스 조건으로 범위를 좁힌다  
C) Lambda를 퍼블릭 서브넷에 배치  
D) 로그를 남기지 않는다  

**정답: B**  
해설: 자동 대응 핸들러의 과도한 권한은 그 자체가 공격 표면이 되므로, 격리·스냅샷 등 필요한 액션만 부여하고 태그·계정 등 조건으로 범위를 좁히는 최소 권한이 핵심이다. Administrator 부여는 위험하고, 퍼블릭 배치·로그 미작성은 보안을 약화시킨다.

---

**문제 4.** 다계정 환경에서 모든 멤버 계정의 보안 이벤트를 중앙 보안 계정에서 일관 대응하려 한다. EventBridge 구성으로 옳은 것은?

A) 각 멤버 계정에 동일한 대응 Lambda를 복제 배포  
B) 멤버 계정 규칙의 대상을 중앙 계정 Event Bus로 지정하고, 중앙 버스의 리소스 정책으로 멤버의 PutEvents를 허용  
C) 중앙 계정에서 멤버 계정 로그를 직접 폴링  
D) SNS 토픽 하나를 모든 계정이 공유  

**정답: B**  
해설: cross-account 라우팅은 멤버 규칙의 대상을 중앙 버스 ARN으로 두고, 중앙 버스 리소스 정책(예: aws:PrincipalOrgID 조건)으로 멤버의 events:PutEvents를 허용하는 것이 표준이다. 대응 로직을 모든 계정에 복제하면 일관성·관리성이 떨어지고, 폴링·SNS 공유는 이벤트 라우팅의 정답 패턴이 아니다.

---

**문제 5.** 여러 계정·리전의 CloudTrail, VPC Flow, Route 53 로그와 서드파티 데이터를 OCSF 표준 스키마로 정규화해 S3에 모으고 Athena·SIEM이 단일 스키마로 질의하게 하려 한다. 가장 적합한 서비스는?

A) AWS Security Hub  
B) Amazon Security Lake  
C) Amazon Macie  
D) AWS Config  

**정답: B**  
해설: 다계정·다리전 원시 보안 로그를 OCSF 표준으로 정규화해 S3 데이터 레이크(Parquet)로 자동 수집하고 subscriber가 단일 스키마로 질의하게 하는 서비스는 Security Lake다. Security Hub는 핀딩을 ASFF로 집계·점수화하는 대시보드, Macie는 S3 민감데이터 발견, Config는 리소스 구성 평가로 역할이 다르다.

---

