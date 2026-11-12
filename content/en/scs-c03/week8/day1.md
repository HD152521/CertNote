# Day 1 - CloudWatch: Log Groups, Metric Filters, Alarms, Anomaly Detection, Security Event Notifications

"Collecting logs" and "detecting signals" are entirely different problems. If CloudTrail records what happened, **Amazon CloudWatch** is the operational plane that **quantifies those records, defines thresholds, and wakes people when thresholds are crossed**. From a security exam perspective, CloudWatch is not merely a monitoring tool but the first transformer in a detection pipeline: "text log → metric → alarm → auto-response." The mechanism of this transformation — how logs become numbers and numbers become alerts — is the core.

## CloudWatch's Two Planes: Logs and Metrics

CloudWatch bundles two distinct data models under one name.

- **CloudWatch Logs**: Storage and search of unstructured/semi-structured *text* log events. Three-layer hierarchy: log group → log stream → log event.
- **CloudWatch Metrics**: *Numeric* time series. Namespace → metric + dimension → data points.

The bridge between them is **Metric Filter**. It extracts patterns from log text to create numeric metrics. Nearly every security detection scenario crosses this bridge.

```
Log event (text) ──[Metric Filter]──▶ Custom metric (numeric) ──[Alarm]──▶ SNS/Actions
```

> 💡 **Related Theory**: This structure is the AWS-native minimal implementation of the classic SIEM pipeline — collect → normalize → correlate → alert. CloudWatch handles pattern matching within a single log group (weak at correlation), while multi-source correlation/normalization is handled by Security Hub/OpenSearch. Thus CloudWatch alerts are strong on "single-signal threshold detection" but weak on "multi-signal correlation detection."

## Log Groups: Retention, Encryption, Access

Log groups are the unit of retention, encryption, and permissions. Three often-overlooked security properties:

- **Retention (Retention Period)**: Default is "Never expire" (indefinite). Without explicit setting, costs grow infinitely. Options: 1 day to 10 years or indefinite.
- **KMS Encryption**: Log groups can be encrypted with KMS CMK. However, **key policy must grant the CloudWatch Logs service principal permission** (IAM policy alone is insufficient — key policy is the gate).
- **Resource Policy**: To allow other services (e.g., Route 53, VPC, CloudTrail) to *write* logs, the log group resource policy must allow their service principals.

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

> ⚠️ **Pitfall**: If logs don't arrive after attaching KMS key, or `associate-kms-key` fails, almost always *key policy lacks `logs.<region>.amazonaws.com` service principal* permission. IAM user/role permissions and KMS key policy are separate gates; KMS requires *both* to pass.

## Metric Filter: Text to Numbers

Metric Filter applies filter patterns to *new* events arriving in a log group, recording values to a metric whenever a match occurs. Two pattern syntaxes:

- **Space-delimited/text patterns**: `?ERROR ?WARN` finds words.
- **JSON patterns**: For structured logs (e.g., CloudTrail), evaluates fields like `{ $.eventName = "ConsoleLogin" }`.

Security detection's core: stream CloudTrail logs to CloudWatch Logs (CloudTrail → CloudWatch Logs integration), then use JSON patterns to catch risky API calls.

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

Two critical Metric Filter settings:

- **metricValue**: Value to record on match. For simple count, `1`. To use log field value, reference like `$.bytes`.
- **defaultValue**: Value to record when no matches. Without `0` here, matching-free periods create *missing* data points, causing alarms to go `INSUFFICIENT_DATA` or evaluations to falter.

```bash
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
    metricName=RootAccountUsageCount,metricNamespace=CISBenchmark,metricValue=1,defaultValue=0
```

> 🎯 **Scenario**: "Alert immediately when root is used" is exam-frequent and a CIS AWS Foundations Benchmark control. Answer path: (1) Enable CloudTrail in *all regions*, stream to CloudWatch Logs → (2) Metric Filter matching root patterns → (3) Alarm triggering ≥1 → (4) SNS topic notification. EventBridge rules also work, but CIS benchmarks and Security Hub controls expect the Metric Filter+Alarm path.

## Alarm: Thresholds, Evaluation Periods, Missing Data

CloudWatch Alarm periodically evaluates metrics into one of three states: `OK`, `ALARM`, `INSUFFICIENT_DATA`. Critical parameters for security alarms:

- **Period**: Aggregation window (e.g., 300 seconds).
- **Evaluation Periods (M)** / **Datapoints to Alarm (N)**: If N of last M periods exceed threshold, trigger ALARM ("N of M" evaluation). N<M reduces noise.
- **Statistic**: `Sum`, `Average`, `Maximum` etc. Security count detection typically uses `Sum` (how many times occurred in period).
- **Treat Missing Data**: `notBreaching` (normal), `breaching` (violation), `ignore`, `missing` (default). Security detection must distinguish "no data = normal" (`notBreaching`) from "data gap = anomaly" (`breaching`).

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

> ⚠️ **Pitfall**: Wrong `Statistic` disables detection. 5 login failures counted as `Average` (5-minute average ~0.x) never reaches threshold 5. Count-based security detection *must* use `Sum`. Also, without `defaultValue=0` in metric filter, missing periods create gaps causing alarm instability — both settings move together.

## CloudWatch Anomaly Detection

For metrics where static thresholds are difficult (traffic patterns vary by hour/day), use **CloudWatch Anomaly Detection**. ML model learns past patterns and creates expected *bands*; exceeding bands triggers alarm.

```
Static threshold:   ─────── 5 ───────  (fixed line)
Band threshold:     ╱╲  ╱╲  Expected range  ╱╲   (bands vary with time)
                   Real value exceeding band → ALARM
```

Security use: Unusual data exfiltration volume (NetworkOut spike), abnormal API call frequency, login attempt pattern deviation — when "different from usual" is the signal, not absolute value. Requires learning period; explicit thresholds (root use = fail at 1) benefit from static.

> 💡 **Related Theory**: Anomaly Detection provides managed statistical outlier detection (time series decomposition + confidence intervals). Same philosophy as GuardDuty's behavior-based detection, but GuardDuty is a *completed detector* combining threat intel and ML, while CloudWatch Anomaly Detection is a *generic band for arbitrary metrics*. Exam: "specific threat (cryptomining, credential exfiltration)" → GuardDuty; "arbitrary custom metric anomaly" → CloudWatch Anomaly Detection.

## CloudWatch Logs Subscription Filter: Real-Time Streaming

If Metric Filter is "pattern → number," **Subscription Filter** is "stream matching log events themselves real-time elsewhere." Targets: Kinesis Data Streams, Kinesis Data Firehose, Lambda, or cross-account logs.

Security architecture role: Critical for real-time log aggregation of multiple accounts to **central logging account**. Each account's log group Subscription Filter → central account Kinesis/Firehose → S3 data lake or OpenSearch.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/payment-service \
  --filter-name ErrorsToFirehose \
  --filter-pattern "?ERROR ?Exception ?AccessDenied" \
  --destination-arn arn:aws:firehose:ap-northeast-2:444455556666:deliverystream/central-logs \
  --role-arn arn:aws:iam::111122223333:role/CWLtoFirehoseRole
```

> 🔍 **Deeper Dive**: Max 2 active Subscription Filters per log group (default). To stream one group to both Firehose (archive) and Lambda (real-time response), respect this limit. Cross-account subscriptions require *destination* account creating destination (logical endpoint) with access policy allowing *source* account — the destination's policy is the gate, not log group resource policy — this confusion point is common.

## SNS Notifications: Human and Machine Branches

Most Alarms' actions go to SNS topics. SNS then fans out to email/SMS (humans) and Lambda/SQS (machine response). Security alert topic hygiene:

- SNS topics also get **KMS encryption** (SSE) and **topic policy** specifying who can publish/subscribe.
- Alarm → SNS → Lambda closes the detection-response loop (e.g., auto-revoke exposed security group). Minimize Lambda's permission scope (over-privileged Lambda is itself a threat).

## Summary: CloudWatch's Security Detection Place

CloudWatch is a *first-line detector*: "quantize patterns from single log group, alert on numeric threshold." Strengths: simple, immediate, low-cost. Limits: multi-source correlation, normalization, long-term analysis — those are covered by day 2 (Security Hub), day 3 (Athena/OpenSearch), day 4 (EventBridge). Remember the core equation: **CloudTrail → CloudWatch Logs → Metric Filter → Alarm → SNS**.

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
