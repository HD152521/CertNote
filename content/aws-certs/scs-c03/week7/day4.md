# Day 4 - 로그 무결성·보존·중앙화: S3 Object Lock, 교차 계정 로그 집계, KMS 암호화 로그

지금까지 무엇을 로깅하는지(CloudTrail, Config, Flow Logs, Resolver)를 배웠다. 오늘은 그 로그를 *어떻게 신뢰할 수 있게 보관하는가*를 다룬다. 감사 로그의 가치는 세 가지 속성에 달려 있다: **무결성**(변조되지 않음), **가용성·보존**(필요할 때 존재함), **기밀성**(허가된 자만 봄). 공격자와 내부자 모두 로그를 노린다 — 흔적을 지우기 위해. 그래서 "로그를 만든 사람조차 지울 수 없게" 만드는 것이 보안 로깅의 정점이다.

## 위협 모델: 왜 로그를 따로, 강하게 보호하는가

로그 보관 설계는 명확한 위협 모델에서 출발한다:
1. **공격자가 운영 계정 권한을 탈취** → 로그를 삭제·변조해 침해 흔적 제거.
2. **악의적 내부자** → 자신의 부정 활동 로그를 수정.
3. **실수·랜섬웨어** → 로그 우발적 삭제·암호화.

대응 원칙은 *세 가지*다: ① 로그를 **별도 계정**(로깅 전용 계정)으로 보내 운영 계정 침해와 격리, ② **Object Lock**으로 누구도(루트조차) 보존 기간 내 삭제·변조 불가, ③ **KMS 암호화**로 기밀성과 키 기반 접근 통제.

> 💡 **관련 이론**: 이것은 보안의 고전 원칙 *separation of duties(직무 분리)*와 *defense in depth(심층 방어)*의 결합이다. 로그를 생성하는 주체와 로그를 보관·통제하는 주체를 분리하면, 한쪽이 침해돼도 다른 쪽이 무너지지 않는다. 회계의 "기록자와 감사자를 분리한다"는 원리와 같다. 로깅 계정은 *write-only inbound*만 받고 운영팀은 접근하지 못하게 해, 침해 시에도 증거의 사슬(chain of custody)이 보존된다.

## S3 Object Lock: WORM으로 변조 불가 보장

**S3 Object Lock**은 객체를 **WORM(Write Once Read Many)** 모델로 보호한다. 보존 기간 동안 객체 버전을 삭제·덮어쓸 수 없다. Object Lock은 *버킷 생성 시점에* 활성화해야 하며(나중 활성화는 지원 요청 필요), **버전 관리가 필수**다.

두 가지 보존 모드:
- **Governance mode**: 특정 IAM 권한(`s3:BypassGovernanceRetention`)을 가진 사용자는 보존을 우회·삭제할 수 있다. 운영 유연성이 필요한 경우.
- **Compliance mode**: **어떤 사용자도(루트 계정 포함) 보존 기간 내 삭제·변경 불가.** 한 번 설정한 보존 기간은 줄일 수도 없다. 규제 준수(SEC 17a-4 등)에 사용.

추가로 **Legal Hold**는 보존 기간과 무관하게 객체를 무기한 잠근다(소송 보존 등). 명시적으로 해제하기 전까지 유지된다.

```bash
# Compliance 모드로 7년 보존 잠금
aws s3api put-object-retention \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --retention 'Mode=COMPLIANCE,RetainUntilDate=2033-06-24T00:00:00Z'

# 버킷 기본 보존 규칙
aws s3api put-object-lock-configuration \
  --bucket central-audit-logs \
  --object-lock-configuration \
    'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Years=7}}'
```

> ⚠️ **함정**: 시험에서 자주 묻는다 — "감사 로그를 *누구도, 심지어 루트 계정도* 보존 기간 내 삭제할 수 없게 하라." 정답은 **Object Lock Compliance mode**다. Governance mode는 `BypassGovernanceRetention` 권한자가 우회할 수 있으므로 "절대 불가" 요구를 만족하지 못한다. 또 Object Lock은 버킷을 *나중에* 켤 수 없고 생성 시 + 버전 관리가 전제임을 기억하라.

> 🎯 **시나리오**: "CloudTrail 로그를 7년간 규제 준수로 보관하되, 1일차의 무결성 검증과 결합해 변조를 *막고 동시에 증명*하라." 정답: organization trail → 로깅 계정 S3 버킷(Object Lock Compliance, 7년) + 로그 파일 무결성 검증 활성화. Object Lock이 변조를 *막고*, 무결성 검증의 해시 체인이 변조를 *증명*한다 — 예방과 탐지를 함께 건다.

## KMS 암호화 로그: 기밀성과 키 기반 접근 통제

로그에는 민감 정보(IP, 사용자 ARN, 리소스 이름, 때로 요청 파라미터)가 담긴다. **SSE-KMS**로 로그를 암호화하면 두 가지를 얻는다: ① 저장 데이터 기밀성, ② **KMS 키 정책으로 "복호화할 수 있는 자"를 통제** — 즉 버킷 접근 권한과 *별개의* 두 번째 자물쇠.

CloudTrail은 trail에 KMS 키를 지정하면 로그 파일을 SSE-KMS로 암호화한다. 이때 **KMS 키 정책**이 CloudTrail에 `kms:GenerateDataKey*`를 허용해야 한다.

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

> 💡 **관련 이론**: 이것이 *cryptographic access control*의 힘이다. 버킷 정책으로 `s3:GetObject`를 허용해도, 객체가 KMS로 암호화돼 있고 그 사용자가 `kms:Decrypt` 권한이 없으면 *암호문만 받고 내용을 못 본다*. 두 자물쇠(S3 접근 + KMS 복호화)를 다른 정책으로 통제하면, 한 정책의 실수가 곧바로 유출로 이어지지 않는다. 특히 cross-account에서 KMS 키 권한을 분리하면 "로그를 받지만 키 소유자만 읽을 수 있는" 비대칭 통제가 가능하다.

> ⚠️ **함정**: cross-account로 로그를 보낼 때 KMS 암호화를 쓰면, *복호화하려는 계정/주체*가 KMS 키 정책에서 `kms:Decrypt` 권한을 받아야 한다. 키 정책과 버킷 정책 *둘 다* 맞아야 읽힌다. "버킷 권한은 줬는데 로그가 안 읽힌다"는 KMS 키 정책 누락이 흔한 원인이다.

## 교차 계정 로그 집계(Cross-Account Log Aggregation)

다계정 환경의 모범은 **중앙 로깅 계정(log archive account)**에 모든 로그를 모으는 것이다. AWS의 다계정 베이스라인(Control Tower의 Log Archive 계정)이 이 패턴을 표준화한다.

집계 방법은 로그 종류마다 다르다:

**S3 기반(CloudTrail, Config, Flow Logs → S3)**: 중앙 로깅 계정의 S3 버킷에 **버킷 정책**으로 다른 계정/서비스의 쓰기를 허용. organization trail은 이를 자동 구성한다.

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

**CloudWatch Logs 기반**: **CloudWatch Logs subscription filter**로 로그를 **Kinesis Data Stream/Firehose**(cross-account destination)로 보내 중앙 계정에 집계. 또는 각 계정의 CloudWatch Logs를 중앙으로 스트리밍.

> ⚠️ **함정**: `bucket-owner-full-control` ACL 조건과 `aws:SourceOrgID`(또는 `aws:SourceArn`) 조건을 함께 쓰는 이유가 있다. 전자는 다른 계정이 쓴 객체의 소유권이 *버킷 소유자*에게 가도록 보장해(아니면 쓴 계정이 객체를 통제) 중앙 계정이 모든 로그를 온전히 관리하게 한다. 후자는 *Confused Deputy* 공격(임의 외부 계정이 서비스 주체를 빙자해 쓰는 것)을 막는다. 둘 다 빠지면 보안 구멍이 된다.

## 종합 아키텍처: 변조 불가 중앙 감사 저장소

세 통제를 결합한 표준 설계:

```
[운영 계정들]                    [로그 아카이브 계정]
 CloudTrail (org trail) ──┐
 Config delivery ─────────┼──▶ S3 버킷
 VPC Flow Logs ───────────┘     ├─ Object Lock (Compliance, 7년)
 Resolver query logs ──────────▶├─ SSE-KMS (전용 CMK, 키 정책 분리)
                                 ├─ 버전 관리 활성화
                                 ├─ 버킷 정책: write-only inbound + SourceOrgID
                                 └─ 무결성 검증(CloudTrail digest)
       운영팀은 접근 불가 ─── 보안/감사팀만 read + kms:Decrypt
```

> 🔍 **더 깊이**: 이 아키텍처의 우아함은 *각 통제가 다른 위협을 막는다*는 데 있다. 별도 계정 = 운영 계정 침해 격리. Object Lock Compliance = 루트조차 보존 기간 내 삭제 불가(내부자·랜섬웨어 방어). KMS = 기밀성 + 복호화 권한 분리. 무결성 검증 = 변조의 암호학적 증명. SourceOrgID/bucket-owner ACL = confused deputy 방어. 어느 하나가 뚫려도 나머지가 버틴다. 그리고 모든 로그가 한 곳에 모이므로 3일차에서 본 다층 상관 분석(CloudTrail + Flow Log + Resolver)이 가능해진다. 내일(5일차)은 이 모든 조각 — 활동(CloudTrail), 구성(Config), 네트워크(Flow/Resolver), 무결성·보존·중앙화 — 을 하나의 침해 조사 시나리오로 엮는다.

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
