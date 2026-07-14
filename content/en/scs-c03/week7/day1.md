# Day 1 - CloudTrail: Management/Data Events, Organization Trail, Log File Integrity Validation, CloudTrail Lake

The essence of auditing is the ability to reconstruct "who, when, what, where, and how" after the fact. The primary evidence answering this question in AWS is **CloudTrail**. CloudTrail records nearly every API call occurring within an account as JSON events. From a security exam perspective, the core question is "what does CloudTrail *record and not record*" and "how do we prove that recording *has not been tampered with*."

CloudTrail exists in two modes. **Event history** is enabled by default on all accounts, showing management events from the last 90 days (cannot be saved or exported, read-only single-region console view), and **Trail**, which users create explicitly for long-term S3 storage. When you see "long-term retention," "forensics," or "regulatory compliance," Trail or CloudTrail Lake is the answer, not Event history.

## Three Types of Events: Management / Data / Insights

CloudTrail's recorded events split into three distinct categories. Missing this distinction leads to traps like "why isn't my S3 GetObject showing in logs?"

- **Management events** (control plane): API calls affecting resources. `RunInstances`, `CreateBucket`, `AttachRolePolicy`, `ConsoleLogin` etc. Recorded by default; the first trail's management event copy is free.
- **Data events** (data plane): Operations on data within resources. S3 `GetObject`/`PutObject`/`DeleteObject`, Lambda `Invoke`, DynamoDB `PutItem` etc. **Disabled by default**, high volume, requires additional fees.
- **Insights events**: ML-detected abnormal *rates* of API calls (e.g., `RunInstances` at 10x usual frequency). Requires separate activation.

```json
{
  "eventVersion": "1.09",
  "eventTime": "2026-06-24T08:14:22Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "GetObject",
  "awsRegion": "ap-northeast-2",
  "sourceIPAddress": "203.0.113.10",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc",
    "sessionContext": { "attributes": { "mfaAuthenticated": "false" } }
  },
  "resources": [
    { "type": "AWS::S3::Object", "ARN": "arn:aws:s3:::secret-data/payroll.csv" }
  ],
  "readOnly": true,
  "managementEvent": false,
  "eventCategory": "Data"
}
```

> ⚠️ **Pitfall**: Exam favorite. "Track who downloaded objects from an S3 bucket" cannot be answered with default trail alone. `GetObject` is a *data event*, so you must explicitly add S3 data event selector to the trail for evidence to exist. Similarly, tracking Lambda invocations requires Lambda data event selectors. Note that `userIdentity.sessionContext` shows MFA usage and which role was assumed.

## Advanced Event Selectors: Precise Data Event Filtering

Data events can explode in volume, so **advanced event selectors** narrow them down. Filter by specific prefix S3 objects, specific functions, read-only or write-only etc. using fields like `eventName`, `resources.ARN`, `readOnly`.

```json
{
  "AdvancedEventSelectors": [
    {
      "Name": "Log writes to sensitive prefix only",
      "FieldSelectors": [
        { "Field": "eventCategory", "Equals": ["Data"] },
        { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
        { "Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::secret-data/payroll/"] },
        { "Field": "readOnly", "Equals": ["false"] }
      ]
    }
  ]
}
```

This records *only* writes to the sensitive prefix, controlling cost while capturing critical evidence. For exams: "reduce data event cost while auditing only specific bucket changes" → advanced event selector is the answer.

## Multi-Region Trail: Collect Everything in One Place

Trails can be single-region or **multi-region**. Multi-region trails collect all regional events to a single S3 bucket. **Global service events** like IAM, STS, CloudFront originate in a specific region (mostly us-east-1), so multi-region trail or explicit global service event logging must be enabled to catch everything.

> 💡 **Related Theory**: The first principle of audit log design is *completeness*. In security incident investigations, "that region has no logs" is fatal. So the baseline recommendation is always a single multi-region trail with all management events (both read and write). This prevents *region hopping* — attackers trying to spin up resources in unmonitored regions.

## Organization Trail: Multi-Account Centralized Audit

Creating an **organization trail** from the AWS Organizations management account (or delegated administrator) automatically applies that identical trail to *all member accounts*. Member account administrators cannot view or disable this trail (it may be read-only exposed but cannot be deleted or modified). New accounts joining the organization are automatically included.

```bash
aws cloudtrail create-trail \
  --name org-audit-trail \
  --s3-bucket-name central-audit-logs-111122223333 \
  --is-organization-trail \
  --is-multi-region-trail \
  --kms-key-id arn:aws:kms:us-east-1:111122223333:key/aaaa-bbbb
```

> 🎯 **Scenario**: "In a 200-account organization, guarantee centralized audit that no account administrator can disable." Answer: Create organization trail (multi-region) in management account and aggregate logs to S3 bucket in separate logging account. Individual trails per member account lack consistency and enforcement.

## Log File Integrity Validation

Audit log value rests on the trust that "it has not been tampered with." CloudTrail provides cryptographic guarantee via **log file integrity validation**. When enabled, CloudTrail generates **digest files** hourly and stores them separately in S3.

How it works:
1. Compute SHA-256 *hash* of each log file.
2. Record those hashes and *the hash of the previous digest file* in the hourly digest — digests form a **hash chain**.
3. Digest files are **RSA-signed** with CloudTrail's private key. Verification uses AWS public key.

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail \
  --start-time 2026-06-20T00:00:00Z
```

> 💡 **Related Theory**: This structure mirrors *Merkle chains/append-only integrity* used in blockchain and Git. If someone deletes or modifies a past log file, that file's SHA-256 differs from the digest record, and if someone forges the digest, the RSA signature and chain linkage break. This creates *tamper-evident* detection. But this *detects* tampering, not *prevents* it. To prevent tampering itself requires S3 Object Lock (day 4).

> ⚠️ **Pitfall**: Integrity validation "proves logs haven't changed" but cannot recover events that were never recorded in the first place. If digest files are deleted, that period's validation becomes impossible, so protecting logs and digests via separate account and Object Lock is what completes the control.

## CloudTrail Lake: Query Audit Logs as a Queryable Data Lake

Traditional trails dump logs as JSON to S3. Investigating requires building Athena tables or manual parsing. **CloudTrail Lake** stores events in *immutable* data store and lets you **query directly with SQL**. Retention goes up to 10 years (extensible).

```sql
SELECT eventTime, userIdentity.arn, eventName, sourceIPAddress
FROM event_data_store_id
WHERE eventName = 'ConsoleLogin'
  AND element_at(additionalEventData, 'MFAUsed') = 'No'
  AND eventTime > '2026-06-01 00:00:00'
ORDER BY eventTime DESC;
```

CloudTrail Lake strengths:
- **Immediate Query**: Execute SQL without ETL or Athena setup.
- **Event Data Store**: Collects not only management/data/Insights events but **external sources** (other AWS services, on-prem, SaaS audit logs).
- **Organization aggregation** and Athena federation support.

> 🎯 **Scenario**: "Security analysts want to ad-hoc SQL-query 2 years of CloudTrail without coding." Answer is CloudTrail Lake. S3 + Athena is possible but carries table/partition management overhead; Lake provides retention, immutability, and query in one. But Lake has different cost model than trail, so if the goal is "cheapest simple storage," S3 trail is still better.

## CloudTrail and Near-Real-Time Response

CloudTrail is a recording tool, but combined with **CloudWatch Logs** or **EventBridge** rules, near-real-time detection and response become possible. Example: catch "root account login" or "CloudTrail disabled (`StopLogging`)" events via EventBridge to trigger SNS alerts and Lambda auto-response.

> 🔍 **Deeper Dive**: One of the first things attackers target post-breach is *log disabling* — `StopLogging`, `DeleteTrail`, `PutEventSelectors` to turn off data events etc. So mature detection design watches "CloudTrail config changes" themselves. EventBridge rules catch `eventName in (StopLogging, DeleteTrail, UpdateTrail)` for immediate alerting, use organization trail to prevent member accounts from disabling, and send logs to separate account so *even if attackers gain that account's permissions, they cannot delete logs*. This achieves "configuration and activity dual audit" with tomorrow (day 2 AWS Config).

---

## 📝 연습 문제

**문제 1.** S3 버킷에서 특정 객체를 누가 다운로드했는지 추적하려는데 기본 multi-region trail에 해당 `GetObject` 호출이 보이지 않는다. 원인과 해결로 옳은 것은?

A) `GetObject`는 글로벌 서비스 이벤트라서 us-east-1 trail이 필요하다  
B) `GetObject`는 데이터 이벤트라서 기본으로 기록되지 않으며, trail에 S3 data event selector를 추가해야 한다  
C) 로그 파일 무결성 검증을 켜야 데이터 이벤트가 기록된다  
D) Insights 이벤트를 활성화해야 한다  

**정답: B**  
해설: S3 객체 수준 작업(`GetObject`/`PutObject` 등)은 데이터 평면 작업인 데이터 이벤트이며 기본적으로 꺼져 있다. trail에 S3 data event selector(또는 advanced event selector)를 명시적으로 추가해야 기록된다. `GetObject`는 글로벌 서비스 이벤트가 아니고, 무결성 검증은 변조 탐지용이지 기록 대상을 늘리지 않으며, Insights는 호출 *비율* 이상 탐지로 개별 다운로드 추적과 무관하다.

---

**문제 2.** 200개 계정 조직에서 어떤 멤버 계정 관리자도 끄거나 변경할 수 없는 중앙 집중 감사를 보장해야 한다. 가장 적절한 설계는?

A) 각 멤버 계정에서 개별 trail을 만들고 정기적으로 점검한다  
B) 관리 계정에서 멀티리전 organization trail을 만들어 로그를 별도 로깅 전용 계정 S3 버킷에 집계한다  
C) Event history를 90일마다 내보내 보관한다  
D) 각 계정의 CloudWatch Logs를 수동으로 모은다  

**정답: B**  
해설: organization trail은 관리 계정(또는 위임 관리자)에서 생성되어 모든 멤버 계정에 자동 적용되며, 멤버 계정 관리자는 이를 끄거나 삭제할 수 없다. 새 계정도 자동 포함된다. 로그를 별도 로깅 계정으로 보내면 멤버 계정이 권한을 얻어도 로그를 변조할 수 없다. 개별 trail은 일관성·강제성이 없고, Event history는 90일·내보내기 불가, 수동 집계는 누락·변조에 취약하다.

---

**문제 3.** 컴플라이언스 감사관이 지난 3개월간 CloudTrail 로그 파일이 변조되지 않았음을 암호학적으로 증명하라고 요구한다. 어떤 기능이 이를 직접 제공하는가?

A) S3 버킷 버전 관리  
B) CloudTrail 로그 파일 무결성 검증(SHA-256 해시 + RSA 서명된 digest 체인)  
C) Insights 이벤트  
D) KMS 봉투 암호화  

**정답: B**  
해설: 로그 파일 무결성 검증은 각 로그 파일의 SHA-256 해시를 계산하고, 이를 RSA로 서명된 시간별 digest 파일에 기록하며, digest를 이전 digest와 해시 체인으로 연결한다. 따라서 로그나 digest의 어떤 변조도 검증 단계에서 탐지된다. 버전 관리는 덮어쓰기 이력만 남기고 암호학적 증명을 제공하지 않으며, Insights는 이상 탐지, KMS 암호화는 기밀성 통제로 무결성 *증명*과는 다르다.

---

**문제 4.** 보안 분석가가 별도 ETL나 Athena 테이블 구성 없이 지난 2년치 CloudTrail 이벤트를 SQL로 즉시 조사하길 원한다. 가장 적합한 것은?

A) Event history 콘솔에서 필터링  
B) CloudTrail Lake 이벤트 데이터 스토어에서 SQL 쿼리  
C) S3에 저장된 JSON을 매번 수동 파싱  
D) Insights 대시보드  

**정답: B**  
해설: CloudTrail Lake는 이벤트를 불변 데이터 스토어에 저장하고 SQL로 직접 쿼리하게 하며 최대 10년 보존을 지원한다. ETL이나 Athena 테이블·파티션 관리가 필요 없다. Event history는 90일·내보내기 불가, 수동 JSON 파싱은 비효율, Insights는 호출 비율 이상 탐지용 대시보드로 임의 SQL 조사를 제공하지 않는다.

---

**문제 5.** 침해 대응팀이 "공격자가 침투 후 CloudTrail을 끄는 행위(`StopLogging`)를 즉시 탐지·경보하라"고 요청한다. 가장 적절한 구성은?

A) trail의 로그 파일 무결성 검증만 켠다  
B) CloudTrail 관리 이벤트를 EventBridge 규칙(`eventName in [StopLogging, DeleteTrail, UpdateTrail]`)으로 매칭해 SNS·Lambda로 실시간 대응을 트리거한다  
C) 데이터 이벤트 선택기를 추가한다  
D) Insights 이벤트를 켜고 매주 검토한다  

**정답: B**  
해설: `StopLogging`/`DeleteTrail`/`UpdateTrail`은 관리 이벤트로 기록되며, EventBridge 규칙으로 이 이벤트를 실시간 매칭해 SNS 경보나 Lambda 자동 대응을 트리거할 수 있다. 무결성 검증은 사후 변조 증명이라 실시간 경보가 아니고, 데이터 이벤트 선택기는 데이터 평면 작업용이며, Insights는 비율 이상 탐지로 즉시성과 정밀도가 떨어진다. organization trail로 멤버 계정에서 끌 수 없게 하는 것도 보완책이다.

---
