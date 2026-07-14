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

## 📝 연습 문제

**문제 1.** CloudTrail 로그에서 루트 계정 사용을 탐지해 즉시 알림을 보내려 한다. 올바른 구성 순서는?

A) CloudTrail → S3 → Athena 쿼리 스케줄링 → 이메일  
B) CloudTrail을 CloudWatch Logs로 전송 → Metric Filter로 루트 사용 패턴 매칭 → Alarm(임계 1) → SNS  
C) GuardDuty를 활성화하면 자동으로 처리된다  
D) VPC Flow Logs에 Metric Filter를 적용  

**정답: B**  
해설: 루트 사용 탐지의 표준 경로는 CloudTrail 로그를 CloudWatch Logs로 보내고, JSON 패턴 Metric Filter로 루트 주체 호출을 카운트한 뒤, 임계 1 이상이면 발동하는 Alarm을 SNS에 연결하는 것이다. S3+Athena는 사후 배치 분석이라 "즉시"가 아니고, GuardDuty는 루트 사용 자체를 핵심 탐지로 다루지 않으며, VPC Flow Logs에는 API 호출 정보가 없다.

---

**문제 2.** 5분 동안 콘솔 로그인 실패가 5회 이상이면 경보하도록 알람을 만들었는데 한 번도 발동하지 않는다. 메트릭 필터와 알람을 점검했을 때 가장 가능성 높은 원인은?

A) 알람의 Statistic을 Average로 설정해 카운트 합이 임계를 넘지 못한다  
B) SNS 토픽이 암호화되어 있다  
C) 로그 그룹 보존 기간이 너무 길다  
D) CloudFront 스코프가 잘못되었다  

**정답: A**  
해설: 카운트 기반 보안 탐지는 지정 기간 동안 발생 횟수의 합이 중요하므로 `Sum` 통계를 써야 한다. `Average`로 평가하면 5분 평균이 임계 5에 도달하지 못해 영원히 발동하지 않는다. SNS 암호화·보존 기간은 발동 여부와 무관하고, CloudFront 스코프는 WAF 개념으로 이 문맥과 관계없다.

---

**문제 3.** 트래픽이 시간대와 요일에 따라 크게 변동하는 애플리케이션의 NetworkOut 급증(데이터 유출 의심)을 정적 임계 없이 탐지하려 한다. 가장 적절한 것은?

A) 고정 임계 알람을 보수적으로 낮게 설정  
B) CloudWatch Anomaly Detection으로 학습된 밴드를 벗어나는 값을 탐지  
C) Subscription Filter로 모든 로그를 Lambda로 전송  
D) 로그 그룹 보존 기간을 무기한으로 설정  

**정답: B**  
해설: 패턴이 시간에 따라 변동해 정적 임계를 정하기 어려운 메트릭에는 Anomaly Detection이 적합하다. ML 모델이 과거 패턴으로 예상 밴드를 만들고 이를 벗어나면 발동한다. 고정 임계를 낮게 잡으면 정상 피크에서 오탐이 폭증하고, Subscription Filter는 탐지가 아니라 스트리밍 전달이며, 보존 기간은 탐지와 무관하다.

---

**문제 4.** 여러 멤버 계정의 로그를 중앙 로깅 계정으로 실시간 집계하려 한다. 핵심 구성 요소는?

A) 각 계정에서 S3 버킷 복제(replication)만 설정  
B) 각 로그 그룹의 Subscription Filter를 중앙 계정의 Kinesis Data Firehose destination으로 연결하고, destination access policy로 소스 계정을 허용  
C) 각 계정에서 Metric Filter를 만들면 자동으로 중앙 집계된다  
D) CloudWatch Alarm을 cross-account로 공유  

**정답: B**  
해설: 실시간 로그 집계는 Subscription Filter가 핵심이며, cross-account 시 *대상* 계정에 destination(Kinesis/Firehose)을 만들고 그 access policy로 소스 계정을 허용해야 한다. S3 복제는 실시간 이벤트 스트리밍이 아니고, Metric Filter는 같은 계정 내 숫자 변환일 뿐 cross-account 집계를 하지 않으며, 알람 공유로는 원본 로그가 모이지 않는다.

---

**문제 5.** 로그 그룹에 KMS CMK 암호화를 설정했더니 로그가 더 이상 수집되지 않는다. 가장 먼저 확인할 것은?

A) IAM 사용자에게 CloudWatch 읽기 권한이 있는지  
B) KMS 키 정책에 `logs.<region>.amazonaws.com` 서비스 주체의 키 사용 권한이 있는지  
C) 로그 그룹 보존 기간 설정  
D) SNS 토픽 구독 상태  

**정답: B**  
해설: CloudWatch Logs가 KMS로 암호화하려면 *키 정책*에 CloudWatch Logs 서비스 주체의 Encrypt/Decrypt/GenerateDataKey 권한이 명시돼야 한다. KMS는 IAM 권한과 키 정책 두 게이트를 모두 통과해야 하며, 서비스 주체 권한이 없으면 수집이 실패한다. IAM 읽기 권한, 보존 기간, SNS 구독은 수집 실패 원인과 무관하다.

---
