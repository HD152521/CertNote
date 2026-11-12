# Day 1 - CloudWatch: Log Groups, Metric Filters, Alarms, Anomaly Detection, Security Event Notifications

"Collecting" logs and "detecting" signals are entirely different problems. If CloudTrail records what happened, **Amazon CloudWatch** is the operational plane that **quantifies those records, defines thresholds, and wakes people the moment a threshold is crossed**. From a security exam perspective, CloudWatch is not merely a monitoring tool but the first transformer in a detection pipeline that runs "text log → metric → alarm → automated response." The core is knowing precisely the mechanism of this transformation — how a log becomes a number, and how a number becomes an alert.

In week7 we covered *what CloudTrail records and how*, and how to read those records. This week goes in the opposite direction. We build **the plumbing that turns logs that have already accumulated into queries and notifications**. Today we follow the first segment of that plumbing all the way through — text that arrives in a log group becomes a metric, the metric becomes an alarm, and the alarm splits into people and automation.

```
[ The whole plumbing Week 8 builds. Today (day1) covers the segments marked in bold ]

  Log sources           Collect/store            Query/transform           Notify/respond
 ┌──────────┐        ┌───────────────┐      ┌─────────────────┐     ┌──────────────┐
 │CloudTrail│───┬───▶│CloudWatch Logs│═══▶ │**Metric Filter**│════▶│**Alarm**     │
 │VPC Flow  │   │    │ (log group)   │      │**Logs Insights**│     │(threshold·N of M)│
 │App/ELB/R53│  │    └──────┬────────┘      └─────────────────┘     └──────┬───────┘
 └──────────┘   │           │ Subscription Filter                        │
                │           ▼                                            ▼
                │      Firehose/Lambda ──▶ OpenSearch (day3)      **SNS topic**
                │                                                   ├─ People (email/Slack/on-call)
                └──▶ S3 archive ──▶ Athena (day3)                   └─ Machines (Lambda/SSM, day4)
                          │
                          └──▶ Security Lake / Security Hub (day2·day4)
```

The segment we cover today has one defining characteristic in this picture — **it is the cheapest and fastest, but also the narrowest.** For turning a single pattern in a single log group into a number and putting a threshold on it, nothing beats CloudWatch. Conversely, the moment a requirement says "correlate signals from different sources," it is no longer CloudWatch's territory. Knowing this boundary precisely is the criterion for choosing tools on the exam.

The failure that breach post-mortems point out again and again is not "there was no detector" but **"the alarm sounded and nobody acted."** The 2013 breach of the payment systems of the US retailer Target is widely cited as the representative case — at the time of the breach, security monitoring tools detected the anomaly and raised alerts, but amid the flood of alerts that signal did not translate into actual response, as was publicly pointed out in sources such as the report of the US Senate Committee on Commerce. The implication of this lesson for today's material is clear. **The ability to create alarms and the ability to keep alarms operable are different skills.** Just as important as writing filter patterns accurately is the design that decides what *not* to turn into an alarm and splits routes by severity. The "Managing Alert Fatigue" section in the second half of this document covers that.

## The Two Planes of CloudWatch: Logs and Metrics

CloudWatch bundles two data models of different natures under one name.

- **CloudWatch Logs**: storage and search of unstructured/semi-structured *text* log events. A three-level hierarchy of log group → log stream → log event.
- **CloudWatch Metrics**: *numeric* time series over time. Namespace → metric + dimension → data point.

The bridge connecting these two is the **Metric Filter**. It extracts a pattern from log text and creates a numeric metric. Almost every security detection scenario crosses this bridge.

```
Log event (text) ──[Metric Filter]──▶ Custom metric (number) ──[Alarm]──▶ SNS/action
```

This structure is the AWS-native minimal implementation of the classic SIEM (Security Information and Event Management) pipeline — collect → normalize → correlate → alert. CloudWatch is responsible up to pattern matching within a single log group (correlation is weak), and multi-source correlation and normalization are handled by Security Hub/OpenSearch. In other words, remember the boundary that a CloudWatch alarm is strong at "single-signal threshold detection" and weak at "multi-signal correlation detection."

## Log Groups: Retention, Encryption, Access

A log group is the unit of retention, encryption, and permissions. There are three attributes that are easy to overlook in security.

- **Retention**: The default is "Never expire" (indefinite). If you do not set it explicitly, cost grows without bound. 1 day to 10 years, or indefinite.
- **KMS encryption**: A log group can be encrypted with a KMS CMK. However, you must grant permission in the **key policy** so that the CloudWatch Logs service principal can use that key (an IAM policy alone is not enough — the key policy is the gate).
- **Resource Policy**: To let other services (for example Route 53, VPC, CloudTrail) *write* logs, you must allow that service principal in the log group's resource policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "logs.ap-northeast-2.amazonaws.com" },
    "Action": ["kms:Encrypt*","kms:Decrypt*","kms:ReEncrypt*","kms:GenerateDataKey*","kms:Describe*"],
    "Resource": "*",
    "Condition": {
      "ArnLike": { "kms:EncryptionContext:aws:logs:arn": "arn:aws:logs:ap-northeast-2:111122223333:log-group:*" }
    }
  }]
}
```

> ⚠️ **Pitfall**: If you attached a KMS key to a log group but logs do not come in, or the `associate-kms-key` call fails, it is almost always because the `logs.<region>.amazonaws.com` service principal permission is missing from the *key policy*. IAM user/role permissions and the KMS key policy are separate gates, and KMS allows access only when the request passes *both* gates.

What to notice in the key policy above is not `Resource: "*"` but the **`Condition` block**. Inside a key policy document, `Resource: "*"` means "this key," so it is not a broad permission. On the other hand, without the `kms:EncryptionContext:aws:logs:arn` condition, *any log group in that Region* could be encrypted with this key, which creates a situation where another team attaches its own logs to our key and blocks the key's deletion. Narrowing the scope with the encryption context is the point of this policy.

### Two Security Settings Often Missed on Log Groups

**Data Protection policy** — It is common for credit card numbers, identifiers of the national-ID kind, and access keys to get mixed into application logs. Once sensitive information enters a log, it is exposed to everyone who can view that log, and logs are usually viewed by many developers. The CloudWatch Logs data protection policy **masks the specified data identifiers at ingestion time** and separates unmasking (`logs:Unmask`) into its own permission.

```bash
aws logs put-data-protection-policy \
  --log-group-identifier /aws/lambda/payment-service \
  --policy-document '{
    "Name": "mask-sensitive",
    "Version": "2021-06-01",
    "Statement": [
      {
        "Sid": "audit",
        "DataIdentifier": [
          "arn:aws:dataprotection::aws:data-identifier/CreditCardNumber",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ],
        "Operation": { "Audit": { "FindingsDestination": {
          "S3": { "Bucket": "sec-dataprotection-findings" } } } }
      },
      {
        "Sid": "mask",
        "DataIdentifier": [
          "arn:aws:dataprotection::aws:data-identifier/CreditCardNumber",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ],
        "Operation": { "Deidentify": { "MaskConfig": {} } }
      }
    ]
  }'
```

Note the structure in which the two Statements work as a pair. `Audit` sends "what was found and how many times" to a separate destination, and `Deidentify` does the actual masking. If you apply masking without auditing, you will not even know *that sensitive information keeps flowing in* — masking relieves the symptom but does not remove the cause, and the cause lies in the application code.

**Log Class** — Besides the Standard class, a log group can choose the Infrequent Access class. The storage price is lower, but **real-time features such as metric filters, subscription filters, and alarms cannot be used** and it is used only for queries. A security-relevant judgment diverges here.

| Purpose of the log | Suitable class | Reason |
|--------------------|----------------|--------|
| Detection targets (logs you will alarm on, such as root usage or login failures) | Standard | Metric filters and alarms are required |
| Large volumes of logs for post-incident investigation (debug and access logs) | Infrequent Access | Only queries are needed and the volume is large |
| Long-term retention is the goal (compliance archive) | **S3**, not CloudWatch Logs | Storage price, lifecycle, Object Lock |

> ⚠️ **Pitfall**: The situation "I lowered the log class to cut cost and the alarm disappeared" really happens. A log group on a detection path must never be moved down to the Infrequent Access class. By the same logic, **keeping logs whose only purpose is retention in CloudWatch Logs indefinitely is also a wrong answer** — the standard design is to separate the archive using a subscription filter or an S3 export, and cut retention on the CloudWatch side to the period needed for detection and investigation (for example, a few tens of days).

Leaving a log group's retention at "indefinite" is not only a cost issue. It is also a matter of **legal exposure**. Logs you hold become subject to production in litigation and regulatory investigations, so logs kept longer than necessary can themselves become a liability. Conversely, deleting them sooner than a regulation requires is a compliance violation. In other words, retention is set not by "how long do we need it" but by being able to answer in writing **"which regulation requires how long, and why do we keep anything beyond that."** This is why exam questions asking about a "log retention policy" are generally placed in a compliance context.

## Metric Filter: Turning Text into Numbers

A Metric Filter applies a filter pattern to the *new* events arriving in a log group and records a value to the specified metric each time there is a match. There are two pattern syntaxes.

- **Space-delimited / text pattern**: Finds words, as in `?ERROR ?WARN`.
- **JSON pattern**: Evaluates fields in structured JSON logs (for example CloudTrail), as in `{ $.eventName = "ConsoleLogin" }`.

The core of security detection is to send CloudTrail logs to CloudWatch Logs (the CloudTrail → CloudWatch Logs integration) and then catch risky API calls with JSON patterns.

```
# Detect root account usage (CIS recommended alarm)
{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }

# Detect console login failures
{ ($.eventName = "ConsoleLogin") && ($.errorMessage = "Failed authentication") }

# Detect unauthorized API calls (AccessDenied)
{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }

# Detect IAM policy changes
{ ($.eventName = "DeleteGroupPolicy") || ($.eventName = "DeleteRolePolicy") ||
  ($.eventName = "PutGroupPolicy") || ($.eventName = "AttachRolePolicy") ||
  ($.eventName = "DetachRolePolicy") || ($.eventName = "CreatePolicyVersion") }
```

A Metric Filter has two important settings.

- **metricValue**: The value to record on a match. For a simple count it is `1`. To use a log field value as is, reference it like `$.bytes`.
- **defaultValue**: The value to record during periods with no match. If you do not set this to `0`, the intervals with no match have *empty* data points, so the alarm falls into `INSUFFICIENT_DATA` or evaluation becomes unstable.

```bash
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
    metricName=RootAccountUsageCount,metricNamespace=CISBenchmark,metricValue=1,defaultValue=0
```

> 🎯 **Scenario**: "Notify immediately when the root account is used" is a classic scenario and a control item of the CIS AWS Foundations Benchmark. The correct path is (1) enable CloudTrail in *all Regions* and send it to CloudWatch Logs → (2) match the root-usage pattern with a Metric Filter → (3) an Alarm that fires at 1 or above → (4) notify through an SNS topic. It is also possible with an EventBridge rule, but the CIS benchmark and the Security Hub controls expect the Metric Filter + Alarm path.

### The CIS Monitoring Set: Every Alarm You Actually Have to Build

The monitoring section of the CIS AWS Foundations Benchmark (numbered 3.x or 4.x depending on the version) specifies concretely "monitor these dozen or so items with metric filters and alarms." When you turn on the CIS standard in Security Hub, these items are evaluated as controls, so each filter pattern is effectively both exam scope and a practical checklist. Below is that whole set organized into one table and a bundle of patterns.

| What to monitor | Why watch it | Key matching field |
|-----------------|--------------|--------------------|
| Unauthorized API calls | Traces of **permission-enumeration reconnaissance** with stolen credentials | `errorCode` = `*UnauthorizedOperation` / `AccessDenied*` |
| Console login without MFA | Policy violation + possibility that credentials alone were stolen | `additionalEventData.MFAUsed` |
| Root account usage | Abnormal use of the highest privilege. Never normal, not even once | `userIdentity.type` = `Root` |
| IAM policy changes | Direct traces of privilege escalation | `eventName` = `Put*Policy` / `Attach*` / `CreatePolicyVersion` |
| CloudTrail configuration changes | **Disabling logging** — the preparation stage of an attack | `StopLogging` / `DeleteTrail` / `UpdateTrail` |
| Console authentication failures | Credential stuffing, brute force | `errorMessage` = `Failed authentication` |
| CMK disabling/scheduled deletion | **Data hostage (ransom)** or evidence destruction | `DisableKey` / `ScheduleKeyDeletion` |
| S3 bucket policy changes | The shortest path to public data exposure | `PutBucketPolicy` / `PutBucketAcl` / `Delete*` |
| Config configuration changes | Disabling compliance evaluation | `StopConfigurationRecorder` / `DeleteDeliveryChannel` |
| Security group changes | Opening the network perimeter | `AuthorizeSecurityGroupIngress` etc. |
| NACL changes | Opening the subnet perimeter | `CreateNetworkAclEntry` etc. |
| Network gateway changes | Creating a new internet path | `CreateInternetGateway` / `AttachInternetGateway` |
| Route table changes | Creating **traffic detour/exfiltration paths** | `CreateRoute` / `ReplaceRoute` |
| VPC changes | Alteration of the network topology itself | `CreateVpc` / `CreateVpcPeeringConnection` etc. |
| Organizations changes | Disabling SCPs, accounts leaving | `DetachPolicy` / `LeaveOrganization` / `MoveAccount` |

There is a logic running through this list. **The upper half is "how did permissions move," and the lower half is "how did the perimeter open."** Between them sit the CloudTrail, Config, and KMS items, and these three are different in nature — they are items that watch for **the act of turning off the monitoring devices themselves**. From the attacker's point of view these three are "things to take care of first, before the real work," so in practice these three alarms are assigned a higher severity than any other item.

```
# Unauthorized API calls (reconnaissance detection)
{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }

# Console login without MFA (successful ones only)
{ ($.eventName = "ConsoleLogin") && ($.additionalEventData.MFAUsed != "Yes")
  && ($.userIdentity.type = "IAMUser") && ($.responseElements.ConsoleLogin = "Success") }

# CloudTrail configuration changes — attempts to disable logging
{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail)
  || ($.eventName = StartLogging) || ($.eventName = StopLogging) }

# KMS CMK disabling / scheduled deletion — data hostage, evidence destruction
{ ($.eventSource = kms.amazonaws.com)
  && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }

# S3 bucket policy/ACL changes
{ ($.eventSource = s3.amazonaws.com) &&
  (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) ||
   ($.eventName = PutBucketCors) || ($.eventName = PutBucketReplication) ||
   ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketReplication)) }

# Disabling AWS Config
{ ($.eventSource = config.amazonaws.com) &&
  (($.eventName = StopConfigurationRecorder) || ($.eventName = DeleteDeliveryChannel) ||
   ($.eventName = PutDeliveryChannel) || ($.eventName = PutConfigurationRecorder)) }

# Security group changes
{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) ||
  ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) ||
  ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }

# Route table changes — creating a traffic detour path
{ ($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) ||
  ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) ||
  ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) ||
  ($.eventName = DisassociateRouteTable) }

# Network gateway changes — creating a new internet path
{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) ||
  ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) ||
  ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }

# Organizations changes — disabling SCPs, accounts leaving
{ ($.eventSource = organizations.amazonaws.com) &&
  (($.eventName = "DetachPolicy") || ($.eventName = "DeletePolicy") ||
   ($.eventName = "LeaveOrganization") || ($.eventName = "MoveAccount") ||
   ($.eventName = "DisablePolicyType") || ($.eventName = "RemoveAccountFromOrganization")) }
```

### Three Pitfalls of Filter Pattern Syntax

**(1) Asymmetry in string quoting.** In a JSON pattern, a value may be written without quotes, as in `$.eventName = CreateTrail`, or with quotes, as in `"CreateTrail"`. However, **to use a wildcard (`*`) you must wrap the value in quotes** — `$.errorCode = AccessDenied*` does not work as intended. This is why only the `errorCode` lines in the patterns above carry quotes.

**(2) A field that does not exist fails to match.** `$.additionalEventData.MFAUsed != "Yes"` is true when that field *exists and its value is not Yes*. Events that lack the field entirely do not match. So when catching "login without MFA," you also apply the `userIdentity.type = "IAMUser"` and `responseElements.ConsoleLogin = "Success"` conditions to narrow the target to *events of a comparable shape*. A common mistake is trying to catch even cases like federated logins, where this field arrives in a different form, with a single pattern and ending up catching nothing.

**(3) A correct pattern is useless without logs.** The `errorCode` family of patterns works only if CloudTrail management events arrive in CloudWatch Logs. If the trail goes only to S3, the metric filter stays at 0 forever. In exam stems, the cause of "the alarm does not fire" is more often a **missing path configuration** than filter syntax.

### How to Build: One Filter and One Alarm as a Pair

```bash
# 1) Metric filter — turn log text into numbers
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name CloudTrailConfigChanges \
  --filter-pattern '{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) ||
                      ($.eventName = DeleteTrail) || ($.eventName = StartLogging) ||
                      ($.eventName = StopLogging) }' \
  --metric-transformations \
    metricName=CloudTrailConfigChangeCount,metricNamespace=CISBenchmark,metricValue=1,defaultValue=0

# 2) Alarm — turn the number into an alert (if it happens even once)
aws cloudwatch put-metric-alarm \
  --alarm-name CIS-CloudTrailConfigChanges \
  --alarm-description "CloudTrail configuration change detected — possible attempt to disable logging" \
  --namespace CISBenchmark --metric-name CloudTrailConfigChangeCount \
  --statistic Sum --period 300 \
  --evaluation-periods 1 --datapoints-to-alarm 1 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical
```

**Metric filters are not applied retroactively.** They apply only to events that enter the log group after the filter is created, and they do not go back over already stored past logs to create metrics. Creating a metric filter in response to "count root usage in last month's logs" is a wrong answer; that is a job for Logs Insights or Athena (day3). Metric filter = *watch what is coming*, query tools = *investigate what has already come* — this distinction of time direction is the axis running through all of week8.

You can attach **dimensions** to a metric filter's `metricTransformations`. For example, if you attach `$.userIdentity.userName` as a dimension to the login-failure count, the metric is split down to "whose" failure it is. It is a tempting but dangerous feature — a *separate custom metric* is created for each distinct dimension value and each is billed, so if an attacker attempts logins with arbitrary usernames, a **cardinality explosion** occurs and cost skyrockets. In other words, the attacker gets to steer our bill. The principle is this: **use only values the attacker cannot control as dimensions.** Account ID and Region are safe; username, IP, and User-Agent are dangerous. If you need to know "who," that is a problem to answer with a query (Logs Insights), not a metric.

## Alarm: Threshold, Evaluation Period, Missing Data Handling

A CloudWatch Alarm evaluates a metric periodically and keeps it in one of three states (`OK`, `ALARM`, `INSUFFICIENT_DATA`). The decisive parameters for security alarms:

- **Period**: The aggregation interval for data points (for example 300 seconds).
- **Evaluation Periods (M)** / **Datapoints to Alarm (N)**: The alarm goes to ALARM when N of the most recent M periods breach the threshold ("N of M" evaluation). Use N<M to reduce noise.
- **Statistic**: `Sum`, `Average`, `Maximum`, and so on. Security count detection usually uses `Sum` (how many times did it occur during a period).
- **Treat Missing Data**: `notBreaching` (treat as normal), `breaching` (treat as a violation), `ignore`, `missing` (default). In security detection you must distinguish the case where "no data means normal" (`notBreaching`) from the case where "the data stopping is itself abnormal" (`breaching`).

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name RootAccountUsageAlarm \
  --namespace CISBenchmark --metric-name RootAccountUsageCount \
  --statistic Sum --period 300 \
  --evaluation-periods 1 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:security-alerts
```

Choosing the wrong `Statistic` neutralizes detection. If you evaluate a count such as 5 login failures with `Average` (for example an average of 0.x over 5 minutes), it can never exceed a threshold of 5. Count-based security detection must use `Sum`. Also, if you do not set `defaultValue=0` on the metric filter, gaps appear and the alarm becomes unstable — the two settings work as a pair.

### Missing Data Handling: The Most Misunderstood Setting in Security

`treat-missing-data` decides "how to view periods that have no data points." The meanings of the four values and the **correct choice in security** are as follows.

| Value | Interpretation of missing periods | When to use it in security |
|-------|-----------------------------------|----------------------------|
| `notBreaching` | Treated as normal | **The default choice for event detection alarms.** Metrics like root usage or policy changes, where "nothing happening is normal" |
| `breaching` | Treated as a violation | **Heartbeat (liveness) alarms.** When watching "are logs still coming in" — the data stopping is itself the incident |
| `missing` (default) | Keeps the previous state; INSUFFICIENT_DATA if everything is missing | Ambiguous. An explicit choice is recommended for security alarms |
| `ignore` | Ignores the gap and keeps the last state | When you want to prevent flapping. Note that ALARM is not cleared automatically |

The second row is decisive in both the exam and practice. **"Log collection has stopped" is itself a security incident.** If an attacker turns off logging, an agent dies, or the permission of the log-delivery role is revoked — all the detection alarms go quiet, and a quiet dashboard looks "safe." The heartbeat alarm is the only device that breaks this silence.

```bash
# Heartbeat: alarm if CloudTrail logs stop for 5 minutes or more
# (keep a separate metric filter that counts all events)
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name AllEventsHeartbeat \
  --filter-pattern '{ $.eventVersion = "*" }' \
  --metric-transformations \
    metricName=TrailEventHeartbeat,metricNamespace=CISBenchmark,metricValue=1

aws cloudwatch put-metric-alarm \
  --alarm-name CloudTrailDeliveryStopped \
  --alarm-description "CloudTrail log ingestion stopped — logging disabled or pipeline failure" \
  --namespace CISBenchmark --metric-name TrailEventHeartbeat \
  --statistic Sum --period 300 \
  --evaluation-periods 2 --datapoints-to-alarm 2 --threshold 1 \
  --comparison-operator LessThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical
```

For this alarm alone, we **do not set** `defaultValue`. The reason matters — if you give `defaultValue=0`, a data point of 0 keeps being generated even when logs stop, so no gap occurs and therefore `breaching` is never triggered. In this case, however, `LessThanThreshold 1` fires instead, so it is caught in the end. To keep both paths open, the safe combination is to set missing-data handling to `breaching` and omit `defaultValue`. The identity of this alarm is that it is **exactly the opposite setting from every other alarm**.

### N of M: The Scale Between False Positives and Misses

The combination of `--evaluation-periods M` and `--datapoints-to-alarm N` determines the character of an alarm.

```
N=1, M=1  →  Immediately if it happens even once     (root usage, CMK scheduled deletion, CloudTrail stop)
N=1, M=3  →  Even once within the last 3 periods     (intermittent but must-not-miss signals)
N=3, M=3  →  Must persist for 3 consecutive periods  (sustained brute force — ignore a one-off typo)
N=2, M=5  →  2 times within the last 5 periods       (sporadic repeating pattern. Highest noise tolerance)
```

The criterion is simple. **"Is a single occurrence an incident in itself?"** A root login is an incident at one occurrence, so it is N=1/M=1. A single console login failure, on the other hand, is not an incident but everyday life, so noise must be filtered on both the threshold (for example 5 times) and persistence (N=2/M=3). If you skip this judgment and make every alarm N=1/M=1, within a few days nobody will read the notifications.

### Composite Alarm: Combine Signals to Raise Precision

Earlier we said CloudWatch is strong at single-metric thresholds and weak at multi-signal correlation, but the **composite alarm** partially fills that gap. It builds a new alarm by combining the states of several alarms with a Boolean expression.

```bash
# Page on-call only when both signals are on at the same time — each alone flows to a lower-severity channel
aws cloudwatch put-composite-alarm \
  --alarm-name SUSPECTED-ACCOUNT-COMPROMISE \
  --alarm-description "Permission-enumeration reconnaissance + policy change observed at the same time" \
  --alarm-rule "ALARM(CIS-UnauthorizedAPICalls) AND ALARM(CIS-IAMPolicyChanges)" \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-oncall-page
```

Another face of the composite alarm is the **actions suppressor**. During planned deployments or maintenance windows, it suppresses actions even if the underlying alarms sound.

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name PROD-NetworkChangeAlarm \
  --alarm-rule "ALARM(CIS-SecurityGroupChanges) OR ALARM(CIS-RouteTableChanges)" \
  --actions-suppressor ChangeWindowActive \
  --actions-suppressor-wait-period 60 \
  --actions-suppressor-extension-period 120 \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-high
```

The suppressor **blocks only the actions without changing the alarm state.** That is, even during suppression the alarm is recorded as ALARM, so afterward you can trace back "what changes happened during that window." This property matters because designs that confuse suppression with "turning off detection" are common. If you delete the metric filter or disable the alarm during a change window, that interval becomes a **permanent gap**, and if an attacker targets the change window, no trace is left. Suppression is a device for reducing *notifications*, not for reducing *records*.

Described in the language of detection engineering, what a composite alarm does is a **trade between precision and recall**. A single-signal alarm has high recall and low precision (it does not miss, but has many false positives). The AND of two signals greatly raises precision at the cost of recall (if the attacker leaves only one signal, you miss it). So a mature design runs both *at the same time* — single signals go to a lower-severity channel (dashboard, daily summary), and combined signals go to a higher-severity channel (on-call paging). The recognition that **the real design problem is not "which alarms to create" but "which channel to send each alarm to"** is the starting point for solving alert fatigue.

### Alarm Actions Are Not Only SNS

There are four kinds of actions an alarm can take. On the exam it appears in the form of asking "what all can you do with an alarm."

| Action | Use | Usefulness in security |
|--------|-----|------------------------|
| SNS publish | Fan out to people and machines | The most common. Splits out to email, Slack, Lambda, SQS |
| EC2 action | Stop, terminate, reboot, recover | **Unsuitable** for security response because a false positive causes large irreversible damage |
| Auto Scaling action | Capacity adjustment | Availability response rather than security |
| Systems Manager OpsItem / Incident Manager | Create operational items and incidents | **Automatic opening of tickets and incidents.** Suitable for organizations with an investigation workflow |

An answer option saying "when GuardDuty detects a compromise, terminate the instance with the EC2 action of a CloudWatch alarm" is wrong on two layers. First, a GuardDuty finding is an event, not a metric, so the EventBridge path is correct (day4). Second, **termination is irreversible and destroys forensic evidence.** The principle of automated security response is to run only reversible measures (moving to an isolation SG, snapshots, tagging, session invalidation) unattended, and to route irreversible measures through a person.

## CloudWatch Anomaly Detection

For metrics where a static threshold is difficult (cases where the traffic pattern changes by time of day and day of week), use **CloudWatch Anomaly Detection**. A machine-learning model learns the metric's past pattern to build an expected *band*, and the alarm fires when the value leaves the band.

```
Static threshold:   ─────── 5 ───────  (fixed line)
Band threshold:     ╱╲  ╱╲  expected range  ╱╲   (a band that undulates over time)
                    ALARM if the actual value jumps above/below the band
```

Usefulness in security: unusual data exfiltration volume (a NetworkOut surge), abnormal API call frequency, deviations in login attempt patterns, and so on — cases where "different from usual" rather than an "absolute value" is the signal. However, it needs a learning period, and for controls with a clear threshold (root usage = a violation even if it happens just once), a static threshold is more accurate.

Anomaly Detection provides statistical outlier detection (time-series decomposition + confidence intervals) as a managed service. The philosophy is the same as GuardDuty's behavior-based anomaly detection, but GuardDuty is a *finished detector* combining threat intelligence and ML, whereas CloudWatch Anomaly Detection is a *general-purpose band for arbitrary metrics*. On the exam, if it asks about a "specific threat (crypto mining, credential exfiltration)," GuardDuty is the likely answer; if it asks about "an anomaly in an arbitrary custom metric," CloudWatch Anomaly Detection is closer to the answer.

A band-based alarm has a different CLI shape from a regular alarm. This is because the threshold is not a *number* but *another metric expression*.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name EC2-NetworkOut-Anomaly \
  --alarm-description "Suspected data exfiltration: outbound transfer volume left the learned band" \
  --comparison-operator GreaterThanUpperThreshold \
  --evaluation-periods 2 --datapoints-to-alarm 2 \
  --threshold-metric-id ad1 \
  --treat-missing-data notBreaching \
  --metrics '[
    {"Id":"m1",
     "MetricStat":{"Metric":{"Namespace":"AWS/EC2","MetricName":"NetworkOut",
                             "Dimensions":[{"Name":"InstanceId","Value":"i-0abc123def4567890"}]},
                   "Period":300,"Stat":"Average"},
     "ReturnData":true},
    {"Id":"ad1","Expression":"ANOMALY_DETECTION_BAND(m1, 2)",
     "Label":"NetworkOut expected range","ReturnData":true}
  ]' \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-high
```

There are three things to read. `--threshold-metric-id ad1` specifies that "the threshold is the band called ad1." The second argument of `ANOMALY_DETECTION_BAND(m1, 2)` is the band width (a multiple of the standard deviation); the larger you set it, the less sensitive it becomes. And the comparison operator `GreaterThanUpperThreshold` means it watches **only upward spikes** — that is right for data exfiltration detection, but to watch for "log inflow suddenly dropped" you need `LessThanLowerThreshold`. The latter is the direction more often missed in practice.

Anomaly detection **needs a learning window, and if an attack is already mixed into the training data, it learns that attack as "normal."** If you newly attach a band to an environment where a compromise is in progress, the compromise traffic becomes the baseline. Also, if you use a band on a control whose normal baseline must be 0, such as "root account usage," the few occurrences get learned and the threshold rises. **Static thresholds for controls with a clear norm, bands for metrics with no norm and only a pattern** — this distinction is the exam's criterion.

## CloudWatch Logs Insights: The 5 Minutes After the Alarm Sounds

An alarm only says "something happened." The questions the on-call engineer immediately throws are "who, where, how much," and the answers are in the raw logs. **Logs Insights** is a tool that queries logs already in CloudWatch Logs instantly without separate ingestion, filling the gap between alarm and investigation. (The details of the query language and cost model, and the criteria for choosing between it and Athena, which works against an S3 archive, are covered in day3. Here we look only at **the few queries your hands should reach for first right after an alarm**.)

```
# 1) The identity behind the "unauthorized API call" alarm that just fired — who was blocked, on which APIs
fields @timestamp, userIdentity.arn, eventName, errorCode, sourceIPAddress
| filter errorCode like /AccessDenied|UnauthorizedOperation/
| stats count(*) as denied,
        count_distinct(eventName) as distinct_apis
    by userIdentity.arn, sourceIPAddress
| sort denied desc
| limit 20
```

**How to read the result is the key.** What you should look at in this query is not the `denied` number but **`distinct_apis`**.

- `denied` is large and `distinct_apis` is **1~2** → A misconfigured automation is repeatedly failing the same call. It is an operational issue, not a security incident.
- `denied` is moderate but `distinct_apis` is **dozens** → This is **permission-enumeration reconnaissance**. It means a person or tool is sweeping "what can I do with this credential." Legitimate automation is built to succeed, so there is no reason for the failing APIs to be varied.
- The same `arn` but `sourceIPAddress` splits into several → A signal that the session is also being used from somewhere else. This is the point at which to suspect temporary-credential leakage.

```
# 2) Console login successes/failures per IP on one screen — check whether the brute force got through
fields @timestamp, sourceIPAddress, userIdentity.userName,
       responseElements.ConsoleLogin as result
| filter eventName = "ConsoleLogin"
| stats count(*) as attempts,
        sum(result = "Success") as ok,
        sum(result = "Failure") as fail
    by sourceIPAddress
| sort fail desc
| limit 25
```

What is decisive here is not the row where `fail` is large but the row where **`fail` is large and `ok` is not 0**. An IP with nothing but failures is an attack that has (so far) failed, whereas an IP whose failures piled up and then had one success mixed in has **already broken through**. The urgency of the response is completely different.

```
# 3) Everything a specific principal did around the alarm time — reconstructing the timeline
fields @timestamp, eventName, eventSource, awsRegion, sourceIPAddress, errorCode
| filter userIdentity.arn like /AdminRole/
| sort @timestamp asc
| limit 200
```

```
# 4) Failure trend by time — a sustained attack or a one-off incident
fields @timestamp
| filter errorCode = "AccessDenied"
| stats count(*) as denied by bin(5m)
```

The shape of the result of query 4 settles the judgment. A **flat plateau** means automation keeps failing, a **single peak** means a person swept through during one session, and a **sawtooth at regular intervals** means a scheduler or script. The *shape* says more than the size of the numbers.

Logs Insights looks at **only what is in CloudWatch Logs**. If you send CloudTrail only to S3 and have not turned on delivery to CloudWatch Logs, all the queries above return empty results. Conversely, if you did send it to CloudWatch Logs, ingestion and storage costs are added accordingly. **A design that "sends every log to CloudWatch Logs" is convenient for detection but collapses on cost** — the practical standard is a tiered separation: dual-deliver to CloudWatch Logs *only the logs you must alarm on*, and keep the rest in the S3 archive and investigate with Athena.

## Managing Alert Fatigue: Quiet Without Missing Anything

With what we have learned so far, creating dozens of alarms is easy. The hard part is **making those alarms still get read six months later**. Alert fatigue is a design problem, not a tooling problem, and the exam also repeatedly presents it in the form "reduce noise but do not create blind spots." The shape of the correct answer is always **do all the detection, but split the delivery paths by severity**.

### Splitting into Layers: What to Send Where

```
[ One detection set, three delivery paths ]

  Detection (all kept)                Severity grading         Delivery path
 ┌────────────────────┐          ┌──────────────┐      ┌───────────────────────┐
 │ Root usage         │──CRITICAL─▶│              │─────▶│ On-call page (wake now)│
 │ CloudTrail stop    │          │              │      │ sec-alerts-critical   │
 │ CMK scheduled del. │          │              │      └───────────────────────┘
 ├────────────────────┤          │  SNS topic   │      ┌───────────────────────┐
 │ IAM policy change  │──HIGH────▶│  split in 3  │─────▶│ Security channel (business hours)│
 │ SG/route change    │          │              │      │ sec-alerts-high       │
 │ Permission-enum.   │          │              │      └───────────────────────┘
 ├────────────────────┤          │              │      ┌───────────────────────┐
 │ Console login fail │──LOW─────▶│              │─────▶│ Dashboard · daily summary│
 │ Individual AccessDenied│      │              │      │ (no alert, aggregation only)│
 └────────────────────┘          └──────────────┘      └───────────────────────┘
         ▲                                                        │
         │        Promotion via composite alarm: when two LOW       │
         └──────── signals are on at once, re-enter as HIGH ◀───────┘
```

In this picture, **the left side is never reduced**. The work of reducing noise is done on the right side (delivery), not the left side (detection). And the last arrow — the path where a *combination* of low-severity signals is promoted back to high severity — must exist to solve the problem "I demoted it to low severity and now nobody looks."

### Five Devices Used in Practice

| Device | What it reduces | What it does not lose | Implementation |
|--------|-----------------|-----------------------|----------------|
| **Separate SNS topics by severity** | Notifications arriving at the wrong time | Every detection still occurs | 3 topics + separate subscribers |
| **Requiring N of M persistence** | One-off false positives | Sustained attacks are always caught | `--datapoints-to-alarm` |
| **Composite alarm AND** | Single-signal false positives | Each signal is still observed at low severity | `put-composite-alarm` |
| **Actions suppressor** | Noise from planned change windows | **Alarm state and history remain** | `--actions-suppressor` |
| **Aggregated summary** | The number of individual notifications | The trend is checked without fail once a day | Low severity → dashboard/summary |

Among ways to reduce noise, the exam often mixes in **wrong methods**. (1) **Deleting metric filters or alarms** — this turns off detection, so the blind spot is permanent. (2) **Shortening log group retention** — the notifications stay the same and only the ability to investigate is lost. (3) **Blindly raising the threshold** — if the attacker moves slowly below the threshold, they become completely transparent (low-and-slow). All three produce the same symptom of "it went quiet," but the reason it went quiet is not that it *sounds less* but that you *can no longer see*. The correct answer option always takes the form **keep the detection and filter by routing, correlation, and persistence**.

Organizations that manage alert fatigue quantitatively record two numbers for each alarm — the **number of occurrences** and the **proportion of them that led to actual action (actionability)**. An alarm with an extremely low action rate is one of two things. Either its threshold is wrong (a tuning target), or it should have been a dashboard metric rather than an alarm in the first place (a demotion target). If you start cleaning up with only the feeling that "there are too many alarms," without this metric, an incident happens where a quiet but important alarm (such as the root-usage alarm that sounds once a year) is deleted along with the rest on the grounds that "it never sounds, so it is not needed." The counterintuitive point of this area is that **an alarm that never sounds may be the most important alarm of all**.

## CloudWatch Logs Subscription Filter: Real-Time Streaming

If a Metric Filter is "pattern → number," a **Subscription Filter** is a device that "streams the log events matching a pattern themselves to somewhere else in real time." The destinations are Kinesis Data Streams, Kinesis Data Firehose, Lambda, or logs of another account (cross-account).

Its role in security architecture: it is key when aggregating logs from multiple accounts in real time into a **central logging account**. Subscription Filter on each account's log group → central account Kinesis/Firehose → S3 data lake or OpenSearch.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/payment-service \
  --filter-name ErrorsToFirehose \
  --filter-pattern "?ERROR ?Exception ?AccessDenied" \
  --destination-arn arn:aws:firehose:ap-northeast-2:444455556666:deliverystream/central-logs \
  --role-arn arn:aws:iam::111122223333:role/CWLtoFirehoseRole
```

The number of active Subscription Filters per log group is limited to (by default) a maximum of 2. To send one log group's data to both Firehose (archive) and Lambda (real-time response) at the same time, you must be mindful of this limit. Also, to use a cross-account subscription, you must create a destination (a logical endpoint) in the *target* account and allow the *source* account with an access policy — the confusing part is that the gate is the destination's policy, not the log group's resource policy.

## SNS Notifications: The Fork Between People and Machines

An Alarm's action most commonly goes to an SNS topic. SNS then fans out again to email/SMS (people) and Lambda/SQS (machine response). Hygiene for designing a security notification topic:

- Protect the SNS topic too with **KMS encryption** (SSE) and a **topic policy**. State explicitly who can publish/subscribe.
- Attaching automated response through alarm → SNS → Lambda (for example, revoking an exposed security group rule) closes the detection-response loop. However, you must minimize the permission scope of the automated response (an over-privileged Lambda is itself a threat).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudWatchAlarmsToPublish",
      "Effect": "Allow",
      "Principal": { "Service": "cloudwatch.amazonaws.com" },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sns:*",
      "Resource": "arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

It is a common incident that **alarms go quiet after you turn on KMS encryption** on a security notification topic. If you use a customer managed key for SNS SSE, CloudWatch must be able to encrypt with that key, so the **key policy must allow `kms:GenerateDataKey*` and `kms:Decrypt` for `cloudwatch.amazonaws.com`**. It is exactly the same structure as the log group KMS pitfall — *the key policy, not IAM, is the gate*. And this failure is silent: the alarm transitions to ALARM just fine, but only the notification fails to arrive. That is why a security notification path must **periodically push synthetic events to verify delivery** (a heartbeat for the notification pipeline itself).

## Comparing the Three Ways of "Extracting Signals from Logs"

There are three ways to extract signals from the same CloudTrail logs. The exam likes to write stems that confuse these three.

| Axis | Metric filter + alarm | Logs Insights | EventBridge rule |
|------|-----------------------|---------------|------------------|
| Input | **New events** in CloudWatch Logs | **Stored events** in CloudWatch Logs | The **event stream** published by AWS services |
| Time direction | What is coming | What has already come | What is coming now |
| Latency | Log delivery delay + alarm evaluation period | Immediate (at query time) | Shortest |
| Output | Numeric metric → state (OK/ALARM) | Tables and charts (read by people) | Event → target invocation |
| Correlation ability | Single pattern (limited combination via composite alarms) | Aggregation and join-like operations within a query | Pattern matching (within a single event) |
| Cost model | Custom metrics + number of alarms | Scan volume at query time | Number of events (most AWS events are free to ingest) |
| Typical use | Threshold alerts, CIS controls | Incident investigation, hunting | Result routing, automated response (day4) |
| Retroactive application | **Not possible** | Possible (within retention period) | Not possible |

> 🎯 **Scenario**: If the stem says "when an IAM policy change happens, immediately verify it automatically with Lambda and revert it if it is a violation," the answer is **EventBridge rule → Lambda**, not a metric filter + alarm. There are two reasons. (1) The alarm path happens *after conversion to a number*, so it loses the original context of "which policy changed and how" — the information the Lambda needs to receive is gone. (2) The alarm is delayed by the evaluation period. Conversely, "notify me when a specific event occurs **more than a certain number of times**" needs a threshold and aggregation, so EventBridge alone will not do and a metric filter + alarm is right. **The deciding criterion is 'is the content of the individual event needed (EventBridge)' vs 'is aggregation of the occurrence count needed (alarm)'.**

## Summary

CloudWatch is the first-line detector that "turns a pattern in a single log group into a number and alerts on a threshold." Its strengths are simplicity, immediacy, and low cost, and its limits are multi-source correlation, normalization, and long-term analysis, areas that are filled in day2 (Security Hub), day3 (Athena/OpenSearch), and day4 (EventBridge). Today's core equation stands as is: **CloudTrail → CloudWatch Logs → Metric Filter → Alarm → SNS**.

But if you remember what you learned today only as a single equation, you miss half of it. This plumbing has **three silent failure points**, and a considerable share of exam questions point at those points.

1. **There is no path** — If CloudTrail does not reach CloudWatch Logs, every filter yields 0.
2. **The transformation is off** — If `defaultValue=0` is missing or `Statistic` is not `Sum`, the number does not reach the threshold.
3. **Delivery is blocked** — If a KMS key policy or topic policy blocks it, the alarm sounds but only the notification disappears.

All three share a common trait. **No error appears at all, and the dashboard looks calm.** So a detection pipeline is not finished at "we built it"; it is complete only when you *verify delivery end to end with synthetic events* and keep a *heartbeat that watches log inflow itself*. That quiet does not mean safety — this is the real conclusion of today.

### One-Line Summary Checklist

- [ ] Did you open the detection path by delivering CloudTrail (all Regions) to CloudWatch Logs?
- [ ] Did you cover the CIS monitoring set (root usage, CloudTrail stop, CMK deletion, policy/network changes, and so on) with metric filters?
- [ ] For count detection, did you match `metricValue=1` + `defaultValue=0` + `Statistic=Sum` as a set?
- [ ] For each alarm, did you ask "is one occurrence an incident" and decide N of M?
- [ ] Did you set up a separate heartbeat alarm (`treat-missing-data=breaching`) that catches log inflow stopping?
- [ ] Did you split SNS topics by severity and route the lower severities to aggregation/dashboards?
- [ ] Did you do suppression with the actions suppressor and keep detection and records (rather than quieting things by deleting filters or raising thresholds)?
- [ ] Did you put each service principal's permission into the log group KMS key policy and the SNS topic KMS key policy?
- [ ] Did you apply a data protection policy (Audit + Deidentify) to log groups where sensitive information gets mixed in?

---

## 📝 Practice Questions

**Question 1.** You want to detect root account usage in CloudTrail logs and send an immediate alert. What is the correct configuration order?

A) CloudTrail → S3 → Athena scheduled query → email  
B) Send CloudTrail to CloudWatch Logs → match the root usage pattern with a Metric Filter → Alarm (threshold 1) → SNS  
C) Enabling GuardDuty handles it automatically  
D) Apply a Metric Filter to VPC Flow Logs  

**Answer: B**  
Explanation: The standard path for detecting root usage is to send CloudTrail logs to CloudWatch Logs, count calls by the root principal with a JSON-pattern Metric Filter, and connect an Alarm that fires at a threshold of 1 or more to SNS. S3 + Athena is after-the-fact batch analysis and so is not "immediate," GuardDuty does not treat root usage itself as a core detection, and VPC Flow Logs contain no API call information.

---

**Question 2.** You created an alarm to alert when there are 5 or more failed console logins in 5 minutes, but it has never fired. When checking the metric filter and alarm, what is the most likely cause?

A) The alarm Statistic is set to Average, so the count sum never exceeds the threshold  
B) The SNS topic is encrypted  
C) The log group retention period is too long  
D) The CloudFront scope is wrong  

**Answer: A**  
Explanation: For count-based security detection, the sum of occurrences over the specified period matters, so you must use the `Sum` statistic. If evaluated with `Average`, the 5-minute average never reaches the threshold of 5, so it never fires. SNS encryption and the retention period are unrelated to whether it fires, and CloudFront scope is a WAF concept unrelated to this context.

---

**Question 3.** You want to detect a NetworkOut spike (suspected data exfiltration) in an application whose traffic varies greatly by time of day and day of week, without a static threshold. What is most appropriate?

A) Set a fixed threshold alarm conservatively low  
B) Use CloudWatch Anomaly Detection to detect values outside the learned band  
C) Send all logs to Lambda with a Subscription Filter  
D) Set the log group retention period to indefinite  

**Answer: B**  
Explanation: Anomaly Detection suits metrics whose pattern varies over time, making a static threshold hard to set. An ML model builds an expected band from past patterns and fires when values leave it. Setting a low fixed threshold causes a flood of false positives at normal peaks, a Subscription Filter is streaming delivery rather than detection, and the retention period is unrelated to detection.

---

**Question 4.** You want to aggregate logs from multiple member accounts to a central logging account in real time. What are the key components?

A) Set up only S3 bucket replication in each account  
B) Connect each log group's Subscription Filter to a Kinesis Data Firehose destination in the central account, and allow the source accounts with the destination access policy  
C) Creating a Metric Filter in each account automatically aggregates centrally  
D) Share CloudWatch Alarms cross-account  

**Answer: B**  
Explanation: Real-time log aggregation centers on the Subscription Filter, and for cross-account use you must create a destination (Kinesis/Firehose) in the *target* account and allow the source accounts with its access policy. S3 replication is not real-time event streaming, a Metric Filter is only a numeric conversion within the same account and does not aggregate cross-account, and sharing alarms does not gather the original logs.

---

**Question 5.** After you configured KMS CMK encryption on a log group, logs are no longer ingested. What should you check first?

A) Whether the IAM user has CloudWatch read permission  
B) Whether the KMS key policy grants key usage permission to the `logs.<region>.amazonaws.com` service principal  
C) The log group retention setting  
D) The SNS topic subscription status  

**Answer: B**  
Explanation: For CloudWatch Logs to encrypt with KMS, the *key policy* must explicitly grant the CloudWatch Logs service principal Encrypt/Decrypt/GenerateDataKey permissions. KMS requires passing both gates, IAM permissions and the key policy, and ingestion fails if the service principal lacks permission. IAM read permission, the retention period, and SNS subscriptions are unrelated to the cause of ingestion failure.

---
