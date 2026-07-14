# Day 5 - Week 5 Synthesis: Integrated Review of Encryption and Key Management Scenarios

This week covered the first pillar of data protection: *encryption and key management*. KMS key types and dual permission models (Day 1), envelope encryption with data keys and encryption contexts (Day 2), key policies, grants, cross-account, and ViaService (Day 3), transit/at-rest encryption and key rotation (Day 4). Today we integrate these into one decision framework. Exams ask less about fragments and more about *"for this data protection requirement, which key, which permission, and which encryption location do I choose?"* The core framework is **key control level × permission mechanism × encryption location (transit/rest/layer)** in three dimensions.

## Integrated Decision Matrix: Requirement → Choice

| Requirement/Scenario | Core Choice | Reason |
|-----------|-----------|------|
| Edit key policy, control rotation, cross-account sharing | Customer managed key | AWS managed keys have fixed policies |
| External party needs to encrypt without KMS permission | Asymmetric key (public distributed) | Private key stays in KMS |
| Digital signing/verification | Asymmetric key (SIGN_VERIFY) | Private signs, public verifies |
| Large data encryption | Envelope encryption (GenerateDataKey) | KMS 4KB limit |
| Separate key creation from encryption actor | GenerateDataKeyWithoutPlaintext | Minimize plaintext exposure |
| Bind ciphertext to specific context | Encryption context (AAD) | Integrity + permission conditions |
| Temporary, granular, revocable permission | Grant | Prevent policy bloat |
| Restrict key usage to specific service | `kms:ViaService` condition | Block direct calls |
| Cross-account key use | Key policy allow + user account IAM | Both sides required |
| Organization-level key guardrails | SCP + `aws:PrincipalOrgID` | Block deletion/external sharing |
| Force S3 transit encryption | `aws:SecureTransport` Deny | Block HTTP at source |
| Encrypt existing unencrypted RDS/EBS | Snapshot → encrypted copy → restore | No toggle available |
| Regular rotation without ops burden | Symmetric CMK auto-rotation | Transparent key material update |
| Rotate asymmetric/BYOK keys | Manual (new key + alias update) | Auto-rotation unsupported |
| Reduce KMS API cost/throttling | S3 Bucket Key / DEK caching | Reduce call frequency |
| Immediate, reversible key neutralization | Key disable | Deletion is irreversible/delayed |

> 💡 **Related Theory**: This matrix's foundation is the principle *"whoever controls the key controls the data."* Encryption algorithms are standardized and fixed, so security design variables are almost entirely *key ownership, access, lifetime, and usage path*. The exam's "best" answer usually precisely satisfies the required control level while minimizing operational burden and exposure surface.

## Integrated Scenarios

> 🎯 **Scenario A — Multitenant SaaS Data Protection**: "Store large tenant files in S3. Isolate decryption by tenant, manage KMS costs, audit all key use, rotate keys regularly." Answer: (1) **SSE-KMS** + customer managed key (audit/control), (2) **encryption context** `tenant=<id>` per object with `kms:EncryptionContext:tenant` condition in IAM/key policy for tenant isolation, (3) **S3 Bucket Key** to reduce KMS call costs/throttling, (4) **auto key rotation** for burden-free regular rotation, (5) **CloudTrail** to audit all KMS use. Four days of concepts cooperate in one design.

> 🎯 **Scenario B — Cross-Account Data Sharing + Governance**: "Security account owns/manages KMS key; workload accounts use data encrypted with it, but regular accounts cannot delete the key or change policy." Answer: (1) Security account **key policy** allows `Decrypt`/`GenerateDataKey` to workload account roles + workload accounts **IAM** allows operations on key ARN (both sides), (2) `aws:PrincipalOrgID` limits to organization members, (3) **SCP** denies regular accounts' `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy`, (4) management access restricted to security team role. Three-layer governance: key policy (fine-grained) + IAM (delegation) + SCP (guardrail).

> 🎯 **Scenario C — External Partner Encryption + Signing**: "Partner without KMS permissions must encrypt data and send it to us; partner must verify integrity of our issued documents." Answer: (1) Partner encryption with **asymmetric key (encryption/decryption)** — distribute public key, only we decrypt with private key, (2) Document signing with **asymmetric key (SIGN_VERIFY)** — we sign with private key, partner verifies with public key. Impossible with symmetric keys.

## Frequently Confused Distinctions

**Key policy vs IAM vs grant** — key policy is required/permanent/resource-based (primary permission source), IAM is identity-based (if delegated), grant is temporary/granular/programmatic. Cross-account needs both key policy and IAM.

**GenerateDataKey vs Encrypt** — large data uses envelope encryption (GenerateDataKey + local encryption), only small secrets ≤4KB use `Encrypt` directly.

**Encryption context is not encrypted** — AAD for integrity and permission conditions only; never put secrets (logged plaintext in CloudTrail).

**At-rest vs in-transit encryption** — SSE-KMS/EBS/RDS are at-rest; TLS enforcement (aws:SecureTransport/force_ssl/redirect-to-https) is in-transit. Separate and both needed.

**Auto-rotation vs manual rotation** — auto updates key material only (identifier retained, symmetric CMK), doesn't re-encrypt old data. Manual creates new key + updates alias (asymmetric/BYOK).

**Disable vs deletion** — disable is immediate/reversible; deletion is 7-30 day wait/irreversible (crypto-shredding).

**SSE-S3 vs SSE-KMS** — SSE-S3 means S3 manages keys (no audit/control); SSE-KMS means KMS control, CloudTrail audit, cross-account possible.

> ⚠️ **Trap Collection**:
> - Delete key policy's `Enable IAM User Permissions` statement orphans the key.
> - Cross-account: set only key policy or only IAM, missing one side.
> - Put secrets in encryption context, exposed plaintext in CloudTrail.
> - Expect "toggle to encrypt" for unencrypted RDS/EBS (snapshot path needed).
> - Think auto-rotation re-encrypts existing data (it doesn't).
> - Try auto-rotation on asymmetric/BYOK keys (unsupported).
> - Choose deletion to immediately neutralize suspect key (disable is reversible).
> - Expect single-region-key encrypted data to decrypt cross-region without multi-region keys.

## Visibility: Prove Your Encryption

Data protection must also be *proven*. **CloudTrail** logs all KMS operations (Encrypt/Decrypt/GenerateDataKey/grant changes/key policy changes), **AWS Config** continuously evaluates encryption compliance (`encrypted-volumes`, `s3-bucket-server-side-encryption-enabled`, `rds-storage-encrypted`), and **Security Hub** aggregates non-compliance findings. Turning on a control is the start; verifying and auditing it with data is what operational security is. Next week (Data Protection 2: Secrets Manager, certificates, S3 advanced protection) follows.

## One-Line Summary Checklist

- [ ] For governance (policy, rotation, cross-account), chose customer managed key
- [ ] Large data uses envelope encryption; external encryption/signing uses asymmetric
- [ ] Encryption context binds context and conditions, no secrets
- [ ] Temporary/granular permissions use grant; restricted paths use `kms:ViaService`
- [ ] Cross-account configures both key policy and IAM
- [ ] Transit encryption *enforced* (HTTP blocked); at-rest defaults enabled
- [ ] Regular rotation configured correctly: auto (symmetric) or manual (asymmetric/BYOK)
- [ ] Suspect keys use disable (reversible); all KMS use audited via CloudTrail/Config

---

## 📝 연습 문제

**문제 1.** 멀티테넌트 SaaS가 S3에 테넌트별 대용량 파일을 저장한다. 테넌트별 복호화 격리, KMS 비용 관리, 전체 감사, 정기 회전을 모두 만족하는 설계는?

A) SSE-S3 + 객체마다 별도 KMS 키  
B) SSE-KMS(customer managed key) + 객체별 암호화 컨텍스트 `tenant=<id>`와 `kms:EncryptionContext` 조건 + S3 Bucket Key + 자동 회전 + CloudTrail  
C) 클라이언트가 평문으로 업로드하고 IAM으로만 통제  
D) 모든 테넌트가 AWS managed key 공유  

**정답: B**  
해설: customer managed key 기반 SSE-KMS가 감사·통제·회전을 제공하고, 암호화 컨텍스트의 테넌트 조건으로 복호화를 테넌트별 격리하며, S3 Bucket Key가 KMS 호출 비용·throttling을 완화하고, 자동 회전이 운영 부담 없이 정기 교체를, CloudTrail이 전체 감사를 담당한다. SSE-S3는 감사·통제가 없고, 평문 업로드는 저장 암호화를 포기하며, AWS managed key 공유는 정책·격리 통제가 불가능하다.

---

**문제 2.** 보안 계정이 KMS 키를 소유·관리하고 워크로드 계정들이 사용하되, 일반 계정이 키를 삭제하거나 정책을 변경하지 못하게 하려 한다. 가장 적절한 조합은?

A) 워크로드 계정 IAM 정책만 설정  
B) 보안 계정 키 정책 허용 + 워크로드 계정 IAM 허용(양측) + `aws:PrincipalOrgID` 한정 + SCP로 삭제·정책변경 Deny  
C) 키를 모든 계정에 복제  
D) AWS managed key로 전환  

**정답: B**  
해설: 교차계정 사용은 키 정책과 사용 계정 IAM 양측이 모두 허용해야 하고, `aws:PrincipalOrgID`로 조직 내부로 한정하며, SCP로 일반 계정의 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy`를 Deny하는 가드레일을 더하는 3층 거버넌스가 정답이다. IAM만으로는 위임이 없어 실패하고, 키 복제·AWS managed key 전환은 중앙 통제 요구와 어긋난다.

---

**문제 3.** KMS 호출 권한이 없는 외부 파트너가 데이터를 암호화해 보내야 하고, 동시에 우리가 발행하는 문서의 무결성을 파트너가 검증할 수 있어야 한다. 가장 적절한 키 구성은?

A) 대칭 키 하나를 공유  
B) 암호화/복호화용 비대칭 키(퍼블릭 키를 파트너에 배포) + 서명/검증용 비대칭 키(우리가 프라이빗 서명, 파트너가 퍼블릭 검증)  
C) SSE-S3  
D) grant를 파트너 계정에 부여  

**정답: B**  
해설: 파트너에게 KMS 호출 권한 없이 암호화만 시키려면 비대칭 키(퍼블릭 배포, 프라이빗은 KMS 내부)를, 문서 무결성 검증에는 서명용 비대칭 키(프라이빗 서명·퍼블릭 검증)를 쓴다. 대칭 키 공유는 복호화 권한까지 노출되고, SSE-S3는 외부 암호화·서명과 무관하며, grant는 KMS 호출 권한 자체가 없는 파트너에게는 부적합하다.

---

**문제 4.** 다음 중 이번 주 데이터 보호 설계에서 *함정*으로 자주 지적되는 항목이 아닌 것은?

A) 기존 미암호화 RDS를 "암호화 토글"로 켜려 함  
B) 자동 회전이 기존 데이터를 새 키로 재암호화한다고 오해  
C) 교차계정에서 키 정책과 사용 계정 IAM을 *둘 다* 설정함  
D) 암호화 컨텍스트에 비밀번호를 넣어 CloudTrail에 평문 노출  

**정답: C**  
해설: 교차계정 KMS 접근은 키 정책 허용과 사용 계정 IAM 허용이 *둘 다* 필요하므로, 둘 다 설정하는 것은 함정이 아니라 올바른 설계다. 나머지는 모두 실제 빈출 함정이다: RDS는 토글로 암호화할 수 없고(스냅샷 경유), 자동 회전은 기존 데이터를 재암호화하지 않으며, 암호화 컨텍스트는 암호화되지 않아 비밀을 넣으면 평문 노출된다. 함정이 *아닌* 것을 고르는 문제이므로 정답은 양측 설정이다.

---

**문제 5.** 유출이 의심되는 customer managed key를 즉시 무력화하되 오탐일 경우 신속히 복구할 수 있어야 한다. 가장 적절한 조치는?

A) `ScheduleKeyDeletion`으로 7일 후 삭제 예약  
B) 키를 disable(비활성화)하고 관련 grant·정책을 회수하며 조사 — disable은 즉시 효력·가역적  
C) 키 별칭만 삭제  
D) 멀티 리전 복제본을 만든다  

**정답: B**  
해설: 키 disable은 즉시 효력이 있고 가역적이어서 의심 상황의 긴급·복구 가능 무력화에 적합하며, grant·정책 회수를 병행해 노출을 줄인다. `ScheduleKeyDeletion`은 대기 후 비가역 삭제라 데이터가 영구 복호화 불가가 되고, 별칭 삭제는 키 사용을 막지 못하며, 복제본 생성은 무력화와 무관하다.

---
