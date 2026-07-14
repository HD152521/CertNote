# Day 1 - AWS KMS Fundamentals: CMK Types, Key Policy vs IAM, Symmetric/Asymmetric Keys

The essence of encryption is not "making data unreadable" but "*controlling the key*." Data encrypted with AES-256 is meaningless bytes without the key, but anyone with the key sees the plaintext. Therefore, in cloud security, encryption discussions almost always reduce to *key management* — who creates the key, who uses it, and who audits that use. AWS Key Management Service (KMS) controls all three using IAM, key policies, and CloudTrail as a managed key management service.

The core KMS concept is the **KMS key** (formerly called CMK, Customer Master Key). This key *never leaves the FIPS 140-2 validated HSM (Hardware Security Module) boundary inside KMS as plaintext*. What we send to KMS is an API call saying "encrypt/decrypt this data for me," and KMS performs the computation inside the HSM and returns the result. You cannot download the key itself — this principle underpins KMS's entire security model.

## Three Types of KMS Keys

KMS keys split into three types based on *who owns and manages the key*. Exams frequently test this distinction and each type's key policy control capabilities.

| Type | Created/Managed By | Edit Key Policy | Rotation | Billing | Cross-Account Sharing |
|------|---------------|-------------|------|------|--------------|
| AWS managed key (`aws/servicename`) | AWS on behalf of service | Read-only | Annual auto (fixed) | Key itself free, usage billed | Not possible |
| Customer managed key (CMK) | Customer owns and creates | Full control | Optional (auto/manual) | $1/month per key + usage | Possible (via key policy) |
| AWS owned key | AWS for multiple accounts | Hidden | AWS managed | Free | N/A |

> 💡 **Related Theory**: When the exam says "edit key policy directly for fine-grained access control, control key rotation period, and share across accounts," the answer is almost always **customer managed key**. AWS managed keys offer convenience but have policies fixed by AWS, failing governance requirements. AWS owned keys aren't visible in the console and are not controlled by users.

Keys with aliases like `aws/s3`, `aws/ebs`, `aws/rds` are AWS managed keys. They're automatically used when you enable "default encryption" without specifying a custom key. CMKs, by contrast, are created by the user with `kms create-key` and referenced explicitly by `key-id` or `alias`.

## Key Policy vs IAM Policy: KMS's Unique Permission Model

Most AWS services use only IAM policies for access decisions, but **KMS uses a dual permission model where IAM and key policies work together**. This is what makes KMS permission debugging difficult.

- **Key policy**: A resource-based policy that every KMS key must have. The *primary source of permissions* for the key.
- **IAM policy**: An identity-based policy attached to principals (users/roles) in an account.

The rule: **If the key policy doesn't delegate to IAM, IAM policies alone cannot grant key access.** When a key is first created, the default key policy usually includes this statement:

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

This statement says "IAM policies in this account can grant KMS permissions." The `root` doesn't mean just the root user — it means *delegation of permission decisions to IAM for the entire account*. If you delete this statement, nobody (not even admins) mentioned in the key policy can use the key, leaving it "orphaned."

> ⚠️ **Trap**: "I deleted the `Enable IAM User Permissions` statement from the key policy and now nobody can access the key." In this case, add principals directly to the key policy or, as a last resort, contact AWS Support. Don't leave the key policy empty.

The evaluation flow: A KMS request passes if (1) the key policy explicitly allows it or delegates to IAM which allows it, AND (2) no policy explicitly denies it. Explicit Deny always takes precedence.

## Symmetric vs. Asymmetric Keys

KMS keys split into symmetric and asymmetric based on key specification (key spec). Because uses differ completely, exams frequently test the distinction.

**Symmetric Keys (Symmetric, default)** — AES-256. Use the same key for encryption and decryption. Since the key plaintext never leaves KMS, you use only `Encrypt`, `Decrypt`, and `GenerateDataKey` APIs. All AWS service integrated encryption (EBS, S3, RDS, etc.) uses symmetric keys. It's also the foundation for **envelope encryption (Day 2)**.

**Asymmetric Keys (Asymmetric)** — RSA or ECC key pairs. The public key can be downloaded; the private key stays inside KMS only.
- **Encryption/decryption use**: External systems encrypt with public key → KMS decrypts with private key.
- **Signing/verification use**: KMS signs with private key → Anyone verifies with public key.

```bash
# Create symmetric key (default)
aws kms create-key --description "app-data-key"

# Create asymmetric signing key
aws kms create-key \
  --key-spec RSA_2048 \
  --key-usage SIGN_VERIFY \
  --description "doc-signing-key"
```

> 💡 **Related Theory**: When do you use asymmetric keys? When external systems (or entities without KMS API permissions) must encrypt but shouldn't have decryption rights, or when digital signing/verification is needed. If all parties can call the KMS API and the goal is AWS service integrated encryption, symmetric keys are simpler and more cost-effective. On the exam: "A partner without KMS permissions encrypts and sends data" → asymmetric key.

## Key Material Origin: Where Is the Key Generated?

When you create a CMK, you choose the source of key material.

- **AWS_KMS** (default): KMS HSM generates the key material. Simplest option.
- **EXTERNAL**: Customer generates and imports key material (BYOK, Bring Your Own Key). You control the key lifecycle but own backup/re-import responsibility. Auto-rotation not possible.
- **AWS_CLOUDHSM**: Key material stored in CloudHSM cluster (custom key store). For regulatory requirements on dedicated HSM.
- **EXTERNAL_KEY_STORE (XKS)**: Keys kept in external key manager (on-premises HSM, etc.) with KMS as proxy.

> 🎯 **Scenario**: "Regulations require we create and control key material ourselves; AWS can't generate keys." → Set key material origin to `EXTERNAL` for BYOK, or for stricter requirements, CloudHSM custom key store or XKS. Tradeoff: *EXTERNAL keys cannot auto-rotate*.

## Multi-Region Keys

By default, KMS keys are *bound to a single region*; data encrypted with a key in one region cannot be decrypted in another (the key doesn't leave that region). Multi-region keys replicate the *same key material and key ID* as primary/replica keys across regions, allowing data encrypted in one region to be decrypted by the identical key in another. Used for DynamoDB global tables and cross-region DR. Key policies, however, are managed independently per region.

> ⚠️ **Trap**: To copy an EBS snapshot encrypted with a single-region KMS key from us-east-1 to us-west-2, *re-encryption with the target region's key* is required. Without multi-region keys, the key itself cannot cross regions.

## One-Line Summary

KMS "provides computation without letting keys leave the HSM," controls usage with *key policy (required, resource-based) + IAM (if delegated) + grant (temporary)*, and logs all use with CloudTrail. For governance needs, customer managed key; for external encryption/signing, asymmetric keys are the starting point.

---

## 📝 연습 문제

**문제 1.** 보안팀이 "키 정책을 직접 편집해 세밀한 접근 통제를 적용하고, 키 회전 주기를 통제하며, 다른 계정과 키를 공유해야 한다"고 요구한다. 어떤 종류의 키를 써야 하는가?

A) AWS owned key  
B) AWS managed key (`aws/s3`)  
C) Customer managed key  
D) S3 관리형 키(SSE-S3)  

**정답: C**  
해설: 키 정책 편집, 회전 주기 통제, 교차계정 공유는 모두 고객이 소유·관리하는 customer managed key에서만 가능하다. AWS managed key는 키 정책이 AWS에 의해 고정돼 편집할 수 없고 교차계정 공유도 안 된다. AWS owned key는 콘솔에 보이지도 않으며 통제 대상이 아니다. SSE-S3는 KMS 키가 아니라 S3가 관리하는 별도 방식으로 키 정책 개념이 없다.

---

**문제 2.** 관리자가 KMS 키의 기본 키 정책에서 `Enable IAM User Permissions`(Principal이 계정 root, Action `kms:*`) 구문을 실수로 삭제했다. IAM 관리자 권한을 가진 사용자도 키를 사용할 수 없게 되었다. 원인으로 가장 정확한 것은?

A) IAM 정책이 KMS보다 항상 우선하므로 무관하다  
B) 키 정책이 IAM에 권한을 위임하지 않으면 IAM 정책만으로는 키에 접근할 수 없기 때문  
C) 키가 자동으로 비활성화되었기 때문  
D) CloudTrail이 비활성화되었기 때문  

**정답: B**  
해설: KMS는 키 정책과 IAM이 함께 작동하는 이중 모델을 쓴다. 키 정책의 `Enable IAM User Permissions` 구문이 "이 계정의 IAM 정책으로 권한 결정을 위임한다"는 핵심 위임이다. 이를 삭제하면 키 정책에 직접 명시되지 않은 어떤 프린시펄도(관리자 포함) 키를 쓸 수 없다. IAM이 KMS보다 항상 우선한다는 설명은 틀렸으며, 키 비활성화나 CloudTrail은 이 증상과 무관하다.

---

**문제 3.** AWS 외부의 파트너 시스템이 데이터를 암호화해 우리 계정으로 보내야 한다. 파트너에게는 KMS API 호출 권한이나 복호화 권한을 주면 안 된다. 가장 적절한 키 구성은?

A) 대칭 customer managed key를 만들고 파트너에게 `kms:Encrypt` 권한 부여  
B) 비대칭 KMS 키(암호화/복호화 용도)를 만들어 퍼블릭 키를 파트너에게 배포, 복호화는 KMS 내부 프라이빗 키로 수행  
C) S3 presigned URL을 파트너에게 발급  
D) AWS managed key를 공유  

**정답: B**  
해설: 파트너에게 KMS 호출 권한을 주지 않고 암호화만 시키려면 비대칭 키가 적합하다. 퍼블릭 키를 배포하면 파트너는 KMS API 없이 로컬에서 암호화할 수 있고, 프라이빗 키는 KMS 밖으로 나가지 않아 복호화는 우리 계정의 KMS만 수행한다. 대칭 키로 `kms:Encrypt`를 주면 파트너가 KMS API를 호출해야 하므로 요구를 위반한다. presigned URL이나 managed key 공유는 이 요구와 맞지 않는다.

---

**문제 4.** 단일 리전 customer managed key로 암호화한 EBS 스냅샷을 us-east-1에서 us-west-2로 복사해 사용하려 한다. 가장 정확한 설명은?

A) 같은 키 ID로 어느 리전에서나 복호화되므로 추가 작업이 없다  
B) 스냅샷 복사 시 대상 리전의 키로 재암호화가 필요하다(단일 리전 키는 리전을 넘지 못함). 교차 리전 운영이 잦으면 멀티 리전 키를 고려한다  
C) 비대칭 키로 변환하면 자동 해결된다  
D) AWS owned key로 바꿔야 한다  

**정답: B**  
해설: 일반 KMS 키는 키 자료가 해당 리전을 떠나지 못하므로, 다른 리전에서 스냅샷을 쓰려면 대상 리전의 키로 재암호화해야 한다. 교차 리전 복호화를 동일 키로 하려면 같은 키 자료를 여러 리전에 복제하는 멀티 리전 키가 설계상 정답이다. 비대칭 변환이나 AWS owned key 전환은 이 문제를 해결하지 못한다.

---
