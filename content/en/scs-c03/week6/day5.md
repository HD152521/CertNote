# Day 5 - Week 6 Integration: Secrets, Storage, and Sensitive Data Scenario Review

This week we covered the second axis of data protection — secrets (Secrets Manager), storage security (S3 encryption, access control, exposure prevention), certificates (ACM), and sensitive information classification (Macie). Today we integrate individual services into *scenarios*, reviewing in the way exams actually test — combining multiple controls to satisfy one requirement. The key is not "what does each service do" but "which combination is correct for this requirement."

## Integrated Mental Model: Four Layers of Data Protection

```
[1. Discovery·Classification]  Macie → "Where is what" (sensitivity labeling)
       ↓
[2. Rest Encryption] SSE-KMS / DSSE-KMS / Object Lock → "Protect dormant state + immutability"
       ↓
[3. Access Control]  Bucket policy / Access Point / BPA / VPC Endpoint → "Who, from where"
       ↓
[4. Channel·Secrets] ACM(TLS) + Secrets Manager(credential rotation) → "Protect in-transit + lifecycle"
```

> 💡 **Related Theory**: These four layers implement *defense in depth* on the data plane. If any one layer is breached (e.g., credential compromise), the next layer holds — compromised keys accessing S3 face KMS key policy denying decryption (layer 2), VPC endpoint condition blocking external paths (layer 3), and Object Lock Compliance physically preventing deletion (layer 2). The principle is not single-point reliance but *overlapping independent-failure controls*.

## Scenario 1: Rotating DB Credential + Zero Downtime

**Requirement**: Auto-rotate RDS master password every 30 days with zero auth failures. Rotation Lambda accesses private subnet DB.

**Combination**:
- Secrets Manager + alternating-users rotation strategy → zero downtime
- Deploy rotation Lambda in same VPC as DB + Secrets Manager VPC endpoint (or NAT) → API call path secured
- Encrypt secret with CMK → key policy grants Decrypt to rotation Lambda role only
- App uses caching client, minimizing GetSecretValue calls

> ⚠️ **Pitfall summary**: single-user risks brief auth failures → use alternating-users + master secret reference. Rotation Lambda not reaching Secrets Manager from VPC → timeout. ARN policy requires `-*` suffix wildcard.

## Scenario 2: Immutable Regulatory Data Retention

**Requirement**: Retain audit logs for 7 years, deletion impossible even by root. Dual-encryption regulation applies.

**Combination**:
- Versioning + Object Lock **Compliance Mode** (7 years) → even root cannot delete
- **DSSE-KMS** → satisfies dual-encryption regulation
- Bucket policy Deny `aws:SecureTransport:false` → in-transit protection
- MFA Delete redundant with Compliance (Compliance already absolute immutability)

> 🎯 Key distinction: "Authorized user can bypass for operational flexibility" → Governance. "Absolutely no one" → Compliance. "Dual-encryption regulation" → DSSE-KMS (else SSE-KMS).

## Scenario 3: Exfiltration Prevention

**Requirement**: Company confidential bucket data never leaves company VPC.

**Combination**:
- Create S3 gateway VPC endpoint
- Bucket policy: `aws:SourceVpce` StringNotEquals Deny → block all paths except specified endpoint
- VPC endpoint policy: `aws:ResourceOrgID` condition → endpoint only accesses our org buckets
- Bidirectional lock constructs *data perimeter*

> 💡 Data perimeter is trusted identity (PrincipalOrgID) + trusted resource (ResourceOrgID) + trusted network (SourceVpce) combined. None alone is sufficient.

## Scenario 4: High Traffic + KMS Cost/Throttle

**Requirement**: SSE-KMS bucket sees KMS ThrottlingException and cost explosion.

**Combination**: **Enable S3 Bucket Key** — replace per-object KMS calls with bucket-level key derivation, reducing calls by 99%. (Note: DSSE-KMS is not compatible with Bucket Key, so inappropriate here.)

## Scenario 5: Sensitive Data Discovery → Auto-Response

**Requirement**: PII uploaded to public bucket → instant detection and remediation.

**Combination**:
- Macie sensitive data detection + bucket security posture assessment → generate findings
- EventBridge rule catches findings → Lambda applies BPA and fixes policy
- Security Hub multi-account aggregation
- (Macie S3-only — DB PII is out of scope)

## Scenario 6: Cross-Account Secret + Certificates

**Requirement**: Account B app reads account A secret. App serves via ACM certificate HTTPS.

**Combination**:
- Secret: CMK encryption + resource policy (account B allowed) + KMS key policy (account B Decrypt) + account B IAM policy → three-policy intersection
- TLS: ALB + ACM public certificate (DNS validation, auto renewal). CloudFront requires us-east-1 issuance.

## Quick Decision Table

| Requirement Keyword | Answer |
|---------------------|--------|
| DB password auto-rotation | Secrets Manager + Lambda rotation |
| Zero-downtime rotation | alternating-users strategy |
| Rotation unnecessary, cost-minimal simple secret | Parameter Store SecureString |
| Cross-account secret | CMK + resource policy + KMS key policy |
| Key access separation and audit needed | SSE-KMS |
| Dual-encryption regulation | DSSE-KMS |
| Do not entrust key to AWS | SSE-C |
| KMS cost/throttle mitigation | S3 Bucket Key |
| Root cannot delete within retention | Object Lock Compliance |
| Authorized user can override retention | Object Lock Governance |
| Block accidental public exposure | Block Public Access |
| Enforce only specific key encryption | Bucket policy conditional Deny |
| Force HTTPS | aws:SecureTransport:false Deny |
| Prevent exfil outside VPC | aws:SourceVpce Deny + endpoint policy |
| Split giant bucket policy | S3 Access Point |
| Continuously detect external exposure | IAM Access Analyzer |
| S3 PII detection/classification | Macie |
| Unattended TLS renewal | ACM + DNS validation |
| EC2 direct TLS termination | ALB+ACM or Private CA export |

> 🔍 **Deeper Dive**: Exam traps often are "similar but subtly wrong" choices. SSE-KMS vs DSSE-KMS (look for dual-encryption keyword), Governance vs Compliance (override possible or not), single vs alternating (downtime or not), Macie S3-only (DB answer is wrong), ACM public cert EC2 non-installable, CloudFront cert requires us-east-1 — mastering these boundaries separates pass from fail. Everyone knows "what does it do," but "when is this and when is that" is Specialty depth.

---

## 📝 연습 문제

**문제 1.** 감사 로그를 7년간 보관해야 하며, 침해로 루트 자격증명이 탈취되더라도 보존 기간 내 삭제가 절대 불가능해야 한다. 또한 규제가 이중 암호화 계층을 요구한다. 올바른 조합은?

A) SSE-S3 + Object Lock Governance + 버전 관리  
B) DSSE-KMS + Object Lock Compliance + 버전 관리  
C) SSE-KMS + MFA Delete + 버전 관리  
D) SSE-C + Object Lock Governance  

**정답: B**  
해설: "루트조차 삭제 불가"는 Object Lock Compliance(버전 관리 전제)가 유일하게 충족하고, "이중 암호화 규제"는 DSSE-KMS가 충족한다. Governance는 우회 권한자가 삭제할 수 있어 부적합하고, MFA Delete는 MFA를 가진 루트가 여전히 삭제 가능하며, SSE-S3/SSE-C는 이중 암호화가 아니다.

---

**문제 2.** 회사 기밀 버킷의 데이터가 회사가 통제하는 VPC 네트워크 밖으로 나가지 못하게 하려 한다. 가장 완전한 조합은?

A) Block Public Access만 활성화  
B) 버킷 정책에 aws:SourceVpce StringNotEquals Deny를 걸고, VPC 엔드포인트 정책에 ResourceOrgID 조건으로 조직 버킷만 허용  
C) SSE-KMS로 암호화  
D) Macie로 버킷을 스캔  

**정답: B**  
해설: 데이터 경계는 양방향 봉쇄로 완성된다 — 버킷 정책은 `aws:SourceVpce`로 "내 버킷은 이 엔드포인트로만" 접근을 강제하고, 엔드포인트 정책은 `aws:ResourceOrgID`로 "이 엔드포인트는 우리 조직 버킷으로만" 향하게 한다. BPA는 공개 차단일 뿐 VPC 경로를 강제하지 못하고, 암호화는 유출 경로를 막지 못하며, Macie는 탐지 도구다.

---

**문제 3.** RDS 마스터 비밀번호를 자동 회전하려는데 회전 Lambda가 프라이빗 서브넷의 DB에 접근해야 하고, 회전 중 인증 실패가 없어야 한다. 누락하면 회전이 실패하는 핵심 요소 두 가지는?

A) alternating-users 전략과, Lambda를 DB VPC에 두고 Secrets Manager VPC 엔드포인트(또는 NAT) 제공  
B) single-user 전략과 공개 서브넷 배치  
C) Parameter Store 전환과 MFA  
D) DSSE-KMS와 Object Lock  

**정답: A**  
해설: 무중단 회전은 alternating-users 전략으로 달성하고, 프라이빗 DB 접근 + Secrets Manager API 호출을 위해 회전 Lambda를 같은 VPC에 두고 Secrets Manager VPC 엔드포인트(또는 NAT)를 제공해야 한다. 둘 중 하나라도 빠지면 회전이 실패하거나 인증 실패가 발생한다. single-user는 순간 실패 위험, Parameter Store는 회전 미지원, DSSE/Object Lock은 회전과 무관하다.

---

**문제 4.** SSE-KMS를 사용하는 매우 높은 트래픽의 버킷에서 KMS ThrottlingException과 비용 급증이 동시에 발생한다. 단, 이중 암호화 규제는 없다. 최적 해결책은?

A) DSSE-KMS로 전환  
B) S3 Bucket Key를 활성화  
C) SSE-C로 전환  
D) 암호화를 비활성화  

**정답: B**  
해설: S3 Bucket Key는 버킷 수준 키를 KMS에서 한 번 받아 객체 데이터 키를 S3가 로컬 파생하므로 KMS 호출을 최대 99% 줄여 스로틀과 비용을 동시에 해결한다. DSSE-KMS는 KMS 호출이 늘고 Bucket Key와 비호환이며, SSE-C는 키 관리 부담이 크고, 암호화 비활성화는 보안 위반이다.

---

**문제 5.** 계정 B의 애플리케이션이 계정 A의 Secrets Manager 시크릿을 읽어야 한다. 어떤 정책 구성이 모두 필요한가?

A) 계정 B의 IAM 정책만  
B) 시크릿 리소스 정책(계정 B 허용) + CMK 키 정책(계정 B Decrypt 허용) + 계정 B IAM 정책(GetSecretValue·Decrypt)  
C) 버킷 정책과 BPA  
D) 시크릿을 AWS 관리형 키로 암호화하고 리소스 정책만  

**정답: B**  
해설: 교차계정 시크릿 접근은 세 정책의 교집합으로 인가된다 — 시크릿 리소스 정책이 계정 B를 허용하고, 시크릿이 CMK로 암호화되어 그 키 정책이 계정 B의 Decrypt를 허용하며, 계정 B IAM 정책이 GetSecretValue와 kms:Decrypt를 부여해야 한다. IAM 정책만으로는 리소스·키 정책이 막고, AWS 관리형 키는 키 정책 편집이 불가해 교차계정 복호화를 허용할 수 없다. 버킷 정책/BPA는 S3 통제로 무관하다.

---
