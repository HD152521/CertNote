# Day 3 - Integrated Review Domains 5 & 6: Data Protection ↔ Management and Governance

Domains 5 (Data Protection, ~18%) and 6 (Management & Governance, ~14%) close the exam's arc. Relationship: **Domain 5 asks "how do we encrypt/isolate/retain data?" while Domain 6 asks "how do we enforce that across organization scale?"** Specialty answers take a control working in one account and propagate it organization-wide. Today we bind KMS-centric data protection with Organizations-centric enforcement into one control-propagation model.

## Data Protection: KMS as the Center

| Key Type | Possession | Rotation | Use Case |
|---|---|---|---|
| AWS managed | AWS | Auto (1yr) | Free, service default |
| Customer managed (CMK) | Customer (policy/grant) | Optional auto/manual | Control needed |
| Imported key material | Customer bring (BYOK) | Manual re-import | Source control |
| CloudHSM-backed custom key store | Customer HSM (FIPS L3) | — | Regulated, dedicated |

> 💡 **Core**: KMS uses *envelope encryption*. Master key (KEK) encrypts data key (DEK); bulk data encrypts with local DEK. `GenerateDataKey` returns plaintext DEK (immediate use, memory-only) and encrypted DEK (stored with data). So we don't send bulk to KMS repeatedly, yet KMS controls keys. "Why not encrypt directly?" → envelope encryption.

### KMS Access: Key Policy vs IAM vs Grant

KMS access: **key policy is primary authority** (unlike IAM alone). Core rules:
- Key policy must trust account root for IAM policies to delegate.
- **Grant**: Temporary, granular delegation (service uses key on user's behalf). Expirable, revocable.
- Key deletion: Not immediate — *7-30 day wait*. Before completion, *disable* to revert.

### Data Protection Tools

- **S3 Object Lock (WORM)** + MFA Delete + versioning → Prevent tampering/deletion (ransomware/regulation).
- **Bucket policy `aws:SecureTransport`** → Force TLS (reject plain HTTP).
- **ACM** → Issue certificates, auto-renewal (CloudFront = us-east-1 only).
- **Macie** → S3 sensitive data discovery (Domain 1 connection).
- **RDS/EBS/EFS encryption** → Specify KMS key at creation (later difficult → snapshot re-encrypt).

> 🎯 **Scenario A**: "Regulation requires keys solely owned/controlled, S3 encrypted by that key, audit key usage." Answer: **CloudHSM-backed KMS custom key store** (sole ownership, FIPS L3) → S3 SSE-KMS (policy controls access) → CloudTrail KMS API (Decrypt/GenerateDataKey) audit. Key ownership + control + audit = trinity.

## Governance: Enforce Control Org-Scale

| Tool | Role |
|---|---|
| AWS Organizations | Multi-account structure, OUs, consolidated billing foundation |
| SCP | OU/account permission ceiling (guardrail) |
| Control Tower | Landing zone, guardrails, account factory auto |
| AWS Config | Config compliance evaluation, history, auto-remediation |
| Conformance Pack | Config rules bundled, org-deployed |
| Firewall Manager | WAF/SG/Shield policy org-wide enforce |
| Service Catalog | Approved infra products self-service |
| RAM | Cross-account resource share |

> 💡 **Spirit**: Governance = *preventive (SCP denial) + detective (Config evaluation) + responsive (auto-remediation)* guardrail combo. **SCP = prevent** (can't do), **Config = detect** (spot violations), **auto-remediation = respond** (fix). Control Tower packages these.

### SCP Guardrail Examples

- Block root use, deny off-region, deny CloudTrail disable, deny untagged resource creation, deny non-approved instance types. **Ceiling only, not granting**.

> 🎯 **Scenario B**: "Org-wide: (1) S3 buckets encrypt+TLS-enforce, (2) CloudTrail unstoppable, (3) violations auto-discovered and auto-corrected." Answer: (1) **Config Conformance Pack** org-deploy `s3-bucket-server-side-encryption`+`s3-bucket-ssl-requests-only` + auto-remediate, (2) **SCP** deny `cloudtrail:StopLogging`/`DeleteTrail` (prevent), (3) Config non-compliant → EventBridge → SSM/Lambda auto-correct (respond). Preventive+detective+responsive org-scale.

## Dual-Domain Mental Model

```
[Data Protection: One Account]        [Governance: Org-Scale]
KMS (envelope, policy)  ──┐
SSE-KMS / TLS force      ├──► Correct controls  ──► SCP (prevent) ────────┐
Object Lock (WORM)       │                        Config (detect+fix) ──┼─► All accounts
RDS/EBS encrypt          ┘                        Control Tower      │   auto-propagate
Audit: CloudTrail(KMS API) + Config(history)      Firewall Manager ──┘
```

Drift is the real exam point: correctly encrypted/locked once doesn't persist if someone disables or new account comes bare. Mature: Control Tower auto-applies guardrails, Config constantly evaluates drift, SCP makes violation impossible.

## 📝 연습 문제

**문제 1.** 규제 요건상 키 자료를 조직이 단독 소유·통제하고(전용 FIPS 140-2 L3 HSM), 그 키로 S3를 암호화하며, 키 사용 내역을 감사해야 한다. 가장 적절한 조합은?

A) SSE-S3 + 기본 키 + Macie  
B) CloudHSM 기반 KMS custom key store의 CMK + S3 SSE-KMS + CloudTrail로 KMS API 감사  
C) SSE-C(고객 제공 키)만 사용  
D) AWS managed key + 자동 로테이션  

**정답: B**

---

**문제 2.** KMS가 대용량 S3 객체를 직접 암호화하지 않고 데이터 키를 발급하는 방식의 이름과 이유는?

A) 대칭 키 회전 — 비용 절감  
B) envelope encryption — KMS가 데이터 키(DEK)를 마스터 키로 암호화하고, 실제 데이터는 평문 DEK로 로컬 암호화해 대용량을 KMS에 보내지 않으면서도 키를 KMS가 통제  
C) client-side hashing — 무결성 확보  
D) TLS 터널링 — 전송 보호  

**정답: B**

---

**문제 3.** 조직의 모든 계정에서 누구도 CloudTrail을 끄지 못하게 하려 한다. 가장 효과적인 예방 통제는?

A) Config 규칙으로 사후 탐지만 한다  
B) SCP로 `cloudtrail:StopLogging`·`cloudtrail:DeleteTrail`을 Deny해 애초에 불가능하게 한다  
C) IAM 사용자마다 정책을 수동으로 붙인다  
D) GuardDuty로 모니터링한다  

**정답: B**

---

**문제 4.** S3 버킷의 평문 HTTP 접근을 거부하고 TLS만 허용하려 한다. 올바른 방법은?

A) 버킷을 퍼블릭으로 설정  
B) 버킷 정책에 `aws:SecureTransport`가 false면 Deny하는 조건을 추가  
C) NACL로 80 포트를 차단  
D) SSE-KMS만 켜면 자동으로 TLS가 강제된다  

**정답: B**

---

**문제 5.** 신규로 추가되는 계정들에도 표준 가드레일(로깅·암호화·리전 제한)이 자동 적용되는 landing zone을 빠르게 구축하려 한다. 가장 적절한 서비스는?

A) 계정마다 수동으로 Config·SCP를 설정  
B) AWS Control Tower — landing zone·가드레일·계정 팩토리로 신규 계정에 통제를 자동 적용  
C) CloudFormation StackSets만 사용  
D) IAM Identity Center만 사용  

**정답: B**

---

**문제 6.** 실수로 KMS CMK 삭제를 요청했다가 그 키로 암호화된 데이터가 남아 있음을 알았다. 데이터 손실을 막는 올바른 조치는?

A) 즉시 새 키를 만들어 같은 ID로 교체한다  
B) 키 삭제는 7~30일 대기 기간이 있으므로, 그 기간 내에 삭제를 취소(cancel)하거나 disable로 되돌린다  
C) 데이터를 복구할 수 없으므로 포기한다  
D) IAM 정책을 수정한다  

**정답: B**

---
