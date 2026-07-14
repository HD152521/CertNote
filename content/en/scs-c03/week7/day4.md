# Day 4 - Log Integrity, Retention, and Centralization: S3 Object Lock, Cross-Account Log Aggregation, KMS Encryption of Logs

So far we've covered *what* to log (CloudTrail, Config, Flow Logs, Resolver). Today we cover *how* to store logs trustworthily. Audit log value depends on three properties: **integrity** (not tampered), **availability and retention** (exists when needed), **confidentiality** (authorized access only). Both attackers and malicious insiders target logs — to erase breach traces. The security peak: "making logs impossible even for their creator to erase."

## Threat Model: Why Logs Are Stored Separately and Strongly Protected

Log storage design starts from clear threat model:
1. **Attacker compromises operations account** → deletes/modifies logs to cover breach traces.
2. **Malicious insider** → edits logs of their unauthorized activity.
3. **Accident/ransomware** → accidentally deletes/encrypts logs.

Three response principles: ① Send logs to **separate account** (logging-only account) isolated from operations compromise, ② **Object Lock** prevents anyone (root included) from deleting within retention, ③ **KMS encryption** for confidentiality and key-based access control separate from bucket access.

> 💡 **Related Theory**: This combines security's classic principles *separation of duties* and *defense in depth*. Separating log generator from log guardian means one breach doesn't topple both. Like accounting: "separate record-keeper and auditor." Logging account takes *write-only inbound* only, operations teams cannot access, preserving chain of custody even under breach.

## S3 Object Lock: WORM Guarantees Tampering Impossible

**S3 Object Lock** protects objects via **WORM (Write Once Read Many)** model. No object version can be deleted/overwritten during retention. Object Lock must be **enabled at bucket creation** (later activation requires support request), **versioning is required**.

Two retention modes:
- **Governance mode**: Specific IAM permission holders (`s3:BypassGovernanceRetention`) can override retention and delete. Operational flexibility.
- **Compliance mode**: **No user (root included) can delete/modify during retention.** Retention period cannot even be shortened. For regulatory compliance (SEC 17a-4 etc.).

Additionally, **Legal Hold** locks object indefinitely regardless of retention period (litigation preservation). Explicitly release to unlock.

```bash
# Compliance mode 7-year retention lock
aws s3api put-object-retention \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --retention 'Mode=COMPLIANCE,RetainUntilDate=2033-06-24T00:00:00Z'

# Bucket default retention rule
aws s3api put-object-lock-configuration \
  --bucket central-audit-logs \
  --object-lock-configuration \
    'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Years=7}}'
```

> ⚠️ **Pitfall**: Exam frequently tests — "audit logs *no one, not even root* can delete during retention." Answer: **Object Lock Compliance mode**. Governance mode allows `BypassGovernanceRetention` privilege holders to override, failing "absolutely no" requirement. Object Lock cannot be enabled *later* and requires versioning — remember these prerequisites.

> 🎯 **Scenario**: "Store CloudTrail for 7 years regulatory compliant, with day 1 integrity validation combined so tampering is both *prevented and proven*." Answer: organization trail → logging account S3 (Object Lock Compliance 7-year) + log file integrity validation enabled. Object Lock *prevents* tampering, hash chain *proves* it — preventive and detective combined.

## KMS-Encrypted Logs: Confidentiality and Key-Based Access Control

Logs contain sensitive info (IPs, user ARNs, resource names, sometimes request parameters). **SSE-KMS** encryption gives two things: ① at-rest confidentiality, ② **KMS key policy controls "who can decrypt"** — a second lock independent of bucket access.

CloudTrail with KMS key specified encrypts log files via SSE-KMS. The **KMS key policy** must allow CloudTrail `kms:GenerateDataKey*`.

```json
{
  "Sid": "Allow CloudTrail to encrypt logs",
  "Effect": "Allow",
  "Principal": { "Service": "cloudtrail.amazonaws.com" },
  "Action": "kms:GenerateDataKey*",
  "Resource": "*",
  "Condition": {
    "StringLike": {
      "kms:EncryptionContext:aws:cloudtrail:arn":
        "arn:aws:cloudtrail:*:111122223333:trail/*"
    }
  }
}
```

> 💡 **Related Theory**: This is *cryptographic access control* power. Even with S3 `s3:GetObject` permission, if object is KMS-encrypted and user lacks `kms:Decrypt`, they get only ciphertext, not plaintext. Two locks (S3 + KMS) via separate policies mean one policy mistake doesn't immediately leak. Cross-account with separate KMS key permissions enables "receive logs but only key owner reads" asymmetric control.

> ⚠️ **Pitfall**: Cross-account logging with KMS means the *account/principal wanting decryption* needs `kms:Decrypt` from the KMS key policy. Both key policy *and* bucket policy must align to read logs. "Gave bucket permission but can't read logs" typically means KMS key policy missing.

## Cross-Account Log Aggregation

Multi-account environment best practice: **central logging account (log archive account)** collects all logs. AWS standard multi-account baseline (Control Tower's Log Archive account) standardizes this pattern.

Aggregation method varies by log type:

**S3-based (CloudTrail, Config, Flow Logs → S3)**: Central logging account S3 bucket uses **bucket policy** to allow other account/service writes. Organization trail auto-configures this.

```json
{
  "Sid": "AllowOrgCloudTrailWrite",
  "Effect": "Allow",
  "Principal": { "Service": "cloudtrail.amazonaws.com" },
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::central-audit-logs/AWSLogs/o-orgid/*/*",
  "Condition": {
    "StringEquals": {
      "s3:x-amz-acl": "bucket-owner-full-control",
      "aws:SourceOrgID": "o-exampleorgid"
    }
  }
}
```

**CloudWatch Logs-based**: Use **CloudWatch Logs subscription filter** to stream logs to **Kinesis Data Stream/Firehose** (cross-account destination) for central aggregation.

> ⚠️ **Pitfall**: Why use both `bucket-owner-full-control` ACL condition *and* `aws:SourceOrgID` condition together? Former ensures objects written by other account get *bucket owner* ownership — central account fully controls all logs (else writer account controls). Latter blocks *Confused Deputy* attack (arbitrary external account impersonating service principal). Both missing = security hole.

## Comprehensive Architecture: Tamper-Proof Central Audit Repository

Combining three controls, the standard design:

```
[Operations Accounts]           [Log Archive Account]
 CloudTrail (org trail) ──┐
 Config delivery ─────────┼──▶ S3 Bucket
 VPC Flow Logs ───────────┘     ├─ Object Lock (Compliance, 7 years)
 Resolver query logs ──────────▶├─ SSE-KMS (dedicated CMK, key policy separation)
                                 ├─ Versioning enabled
                                 ├─ Bucket policy: write-only inbound + SourceOrgID
                                 └─ Integrity validation (CloudTrail digest)
       Operations team no access ─── Security/audit team only read + kms:Decrypt
```

> 🔍 **Deeper Dive**: The elegance is *each control prevents different threat*. Separate account = isolates operations breach. Object Lock Compliance = prevents even-root deletion (insider/ransomware defense). KMS = confidentiality + decrypt authority separation. Integrity validation = cryptographic proof of tampering. SourceOrgID/bucket-owner ACL = confused deputy defense. One breach doesn't topple all. All logs in one place enables multi-layer correlation from day 3 (CloudTrail + Flow Log + Resolver). Tomorrow (day 5) integrates all pieces — activity, config, network, integrity/retention/centralization — into one breach investigation scenario. Next week's threat detection (GuardDuty, Security Hub) layers automatic analysis *atop* this foundation. Centralization is prerequisite for multi-log correlation.

---

## 📝 연습 문제

**문제 1.** "감사 로그를 보존 기간 동안 *어떤 사용자도, 루트 계정조차* 삭제·변경할 수 없게 하라"는 규제 요구를 만족하는 것은?

A) S3 버전 관리만 활성화  
B) S3 Object Lock Governance 모드  
C) S3 Object Lock Compliance 모드  
D) 버킷 정책으로 Deny Delete 추가  

**정답: C**  
해설: Compliance 모드는 보존 기간 내 어떤 주체도(루트 포함) 객체 버전을 삭제·변경할 수 없으며 보존 기간을 줄일 수도 없다. Governance 모드는 `s3:BypassGovernanceRetention` 권한자가 우회할 수 있어 "절대 불가" 요구를 만족하지 못한다. 버전 관리만으로는 삭제 마커·만료가 가능하고, 버킷 정책 Deny는 정책 변경 권한자가 되돌릴 수 있다.

---

**문제 2.** 다계정 조직에서 한 운영 계정이 침해돼도 감사 로그가 변조·삭제되지 않도록 격리하는 가장 핵심적인 설계 원칙은?

A) 모든 로그를 각 운영 계정 내부에만 보관한다  
B) 로그를 운영팀이 접근할 수 없는 별도 로깅 전용 계정의 S3 버킷에 집계한다  
C) 로그를 CloudWatch Logs에만 보관한다  
D) 로그 보존 기간을 30일로 짧게 한다  

**정답: B**  
해설: 직무 분리·심층 방어 원칙에 따라 로그를 생성하는 운영 계정과 보관·통제하는 로깅 계정을 분리하면, 운영 계정이 침해돼도 공격자가 로그에 접근·변조할 수 없다. 같은 계정 내 보관은 침해 시 함께 노출되고, 짧은 보존은 오히려 증거를 잃으며, CloudWatch Logs 단독은 격리·불변성 보장이 약하다.

---

**문제 3.** 중앙 로깅 계정 버킷에 다른 계정의 CloudTrail이 객체를 쓸 때, 중앙 계정이 그 객체를 온전히 소유·관리하고 임의 외부 계정의 위조 쓰기를 막으려면 버킷 정책에 무엇이 필요한가?

A) `s3:x-amz-acl = bucket-owner-full-control` 조건과 `aws:SourceOrgID`(또는 SourceArn) 조건  
B) 퍼블릭 읽기 허용  
C) `s3:BypassGovernanceRetention` 허용  
D) KMS 키 삭제 권한  

**정답: A**  
해설: `bucket-owner-full-control` ACL 조건은 다른 계정이 쓴 객체의 소유권을 버킷 소유자에게 귀속시켜 중앙 계정이 온전히 관리하게 하고, `aws:SourceOrgID`/`aws:SourceArn` 조건은 서비스 주체를 빙자한 임의 외부 계정의 쓰기(confused deputy)를 차단한다. 퍼블릭 읽기는 위험하고, BypassGovernance·KMS 삭제 권한은 이 목적과 무관하며 오히려 위험하다.

---

**문제 4.** 로그를 SSE-KMS로 암호화한 cross-account 버킷에서, 보안팀 계정이 S3 GetObject 권한은 있는데 로그 내용을 읽지 못한다. 가장 가능성 높은 원인은?

A) Object Lock이 읽기를 막는다  
B) 보안팀 주체에게 KMS 키 정책상 `kms:Decrypt` 권한이 없다  
C) 버전 관리가 꺼져 있다  
D) 로그가 너무 오래됐다  

**정답: B**  
해설: SSE-KMS 객체를 읽으려면 S3 접근 권한과 별개로 KMS 키에 대한 `kms:Decrypt` 권한이 필요하다. 권한이 없으면 암호문은 받지만 복호화하지 못한다. 이 두 자물쇠(S3 + KMS) 분리가 암호학적 접근 통제의 핵심이다. Object Lock은 삭제·변경을 막을 뿐 읽기를 막지 않고, 버전 관리·로그 나이는 복호화 실패와 무관하다.

---

**문제 5.** CloudTrail 로그에 대해 변조를 *예방*하면서 동시에 변조 여부를 *증명*하려 한다. 가장 적절한 조합은?

A) Object Lock Compliance 모드(예방) + CloudTrail 로그 파일 무결성 검증(증명)  
B) KMS 암호화만  
C) 버킷 버전 관리만  
D) CloudWatch 경보만  

**정답: A**  
해설: Object Lock Compliance 모드는 보존 기간 내 삭제·변경 자체를 막아 변조를 *예방*하고, CloudTrail 로그 파일 무결성 검증(SHA-256 해시 체인 + RSA 서명 digest)은 변조가 있었는지를 암호학적으로 *증명*한다. 예방과 탐지를 함께 거는 설계다. KMS는 기밀성, 버전 관리는 이력 보존, 경보는 알림으로 각각 단독으로는 예방+증명을 모두 제공하지 못한다.

---
