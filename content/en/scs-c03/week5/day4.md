# Day 4 - Encryption at Rest/in Transit: TLS, Service-Specific Encryption, Key Rotation

Encryption splits by data *state*: **encryption at rest** protects data on disk/storage, **encryption in transit** protects data moving on the network. SCS-C03 specifically asks "which service encrypts how at rest?", "how do you *enforce* transit encryption?", and "how does key rotation work?" Today we organize these across services.

## Encryption in Transit: TLS and Enforcement Techniques

TLS is the de facto encryption standard for transit. The key distinction: "supporting TLS" differs from "*refusing* plaintext." Security exams always test **enforcement**.

- **S3**: Bucket policy denies requests with `aws:SecureTransport: false` to block HTTP.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

- **ALB/CloudFront**: Redirect HTTP listeners to HTTPS; set viewer protocol policy to `redirect-to-https`. Enforce minimum TLS version (e.g., TLS 1.2+) via security policy.
- **RDS**: Enforce SSL connections via parameter group `rds.force_ssl=1` (PostgreSQL) or per-user `REQUIRE SSL` (MySQL). RDS provides a certificate bundle (rds-ca).
- **API Gateway**: Set minimum TLS version and expose only HTTPS.

> 💡 **Related Theory**: `aws:SecureTransport` is a global condition key indicating *whether the request came via TLS*. Using it in a Deny condition in S3 blocks plaintext HTTP access at the source. The exam question "enforce S3 transit encryption" almost always has this bucket policy Deny as the answer — not just "use HTTPS" but "block HTTP."

## Encryption at Rest: Service-Specific Mechanisms

Most AWS storage services use envelope encryption (Day 2) internally for at-rest encryption. The difference is in *key choice* and *defaults*.

### S3
Three SSE options + client-side encryption:
- **SSE-S3** (`AES256`): S3 fully manages keys. No KMS control or audit. Now default for all new objects.
- **SSE-KMS** (`aws:kms`): Envelope encryption with KMS key. Key policy, CloudTrail audit, cross-account control possible. Optimize costs with Bucket Key.
- **SSE-C**: Customer provides key with each request (S3 doesn't store it).
- **CSE**: Encrypt client-side before upload.

### EBS
- Encryption option during volume creation. Enable *default encryption* at account/region level (`Enable EBS encryption by default`).
- Snapshots, restores, and copies of encrypted volumes are *automatically encrypted*.
- Can't directly convert unencrypted to encrypted; use snapshot → encrypted copy → new volume path.

### RDS / Aurora
- Enable encryption only at DB instance creation (cannot toggle after).
- To encrypt existing unencrypted DB, restore from an *encrypted snapshot copy*.
- Encryption covers storage, automatic backups, read replicas, and snapshots.

### Others
- **DynamoDB**: At-rest encryption always on (default AWS owned key), switchable to customer managed key.
- **EFS**: Encryption at rest configured at creation; transit encryption via mount option (`-o tls`).
- **Redshift / SQS / SNS / CloudWatch Logs / Secrets Manager**: All support KMS-based at-rest encryption.

> ⚠️ **Trap**: "Encrypt existing unencrypted RDS instance" → Cannot change the instance directly. Create a snapshot, *copy it to an encrypted version*, then restore from that snapshot. EBS follows the same snapshot path. "Toggle encryption on" is wrong.

> 🎯 **Scenario**: "Ensure all new EBS volumes in the organization are encrypted." → Enable *EBS encryption by default* per region; use Config rules (`ebs-encryption-by-default`, `encrypted-volumes`) to detect and remediate gaps.

## Key Rotation: Automatic vs. Manual

Key rotation *updates key material while maintaining the same logical key ID*. Exams frequently test the behavioral differences between auto and manual.

**Automatic Key Rotation**
- Available on customer managed keys (`enable-key-rotation`). Default *annually* (configurable 90-2560 days).
- KMS generates new key material; *key ID, ARN, and alias stay the same*. Past material is retained so *old data continues to decrypt*.
- No application changes needed. Lowest operational burden.
- **AWS managed keys** rotate *automatically at a fixed interval* (cannot disable or change).
- **Asymmetric keys, EXTERNAL (BYOK), and CloudHSM keys cannot auto-rotate**.

```bash
aws kms enable-key-rotation --key-id alias/app-data-key
aws kms get-key-rotation-status --key-id alias/app-data-key
```

**Manual Rotation**
- Create a new KMS key and *update the alias to point to the new key*. For keys that can't auto-rotate (asymmetric, BYOK) or when you want to change the key ID itself.
- Old data needs decryption with the old key, so maintain both. Alias points to new key, so new encryptions use the new key.

> 💡 **Related Theory**: Auto-rotation changes *only key material* while the key identifier stays the same — transparent. Manual rotation changes the *key itself*, requiring alias updates and retaining the old key. Exam question "rotate asymmetric key" → auto-rotation isn't possible, so manual (new key + alias update) is the answer. "Regular rotation without ops burden" → symmetric CMK auto-rotation.

> ⚠️ **Trap**: Auto-rotation doesn't *re-encrypt existing data*. Old data decrypts with the retained old material; after rotation, only new data encrypts with new material. Watch for wrong answers like "rotation re-encrypts existing data with the new key."

## TLS Certificate Management: ACM

Transit encryption certificates are managed by ACM (AWS Certificate Manager). ACM-issued certificates auto-renew via *DNS validation*, have *non-extractable private keys*, and integrate with CloudFront (us-east-1), ALB, API Gateway, etc. External certificates can be imported but auto-renewal is only for ACM-issued. (Week 4 Day 4 covered ACM regional rules.)

## One-Line Summary

Transit encryption's core is *enforcing* TLS (S3 `aws:SecureTransport` Deny, RDS `force_ssl`, ALB redirect-to-https). At-rest encryption uses service-specific approaches: SSE-KMS, EBS default encryption, RDS creation-time setting; existing unencrypted resources encrypt via snapshot path. Auto-rotation transparently updates key material (symmetric CMK); asymmetric and BYOK use alias-based manual rotation.

---

## 📝 연습 문제

**문제 1.** S3 버킷에 대한 *전송 중 암호화를 강제*하라는 요구를 받았다. 가장 정확한 구현은?

A) 버킷 기본 암호화를 SSE-KMS로 설정  
B) 버킷 정책에서 `aws:SecureTransport`가 `false`인 요청을 Deny해 평문 HTTP 접근을 차단  
C) CloudFront를 앞에 둔다  
D) 객체에 SSE-C를 적용  

**정답: B**  
해설: 전송 중 암호화 강제는 평문(HTTP) 연결을 *거부*하는 것이다. 버킷 정책에서 `aws:SecureTransport: false`를 Deny하면 TLS가 아닌 요청이 차단된다. SSE-KMS·SSE-C는 *저장* 암호화 방식이라 전송과 무관하고, CloudFront 배치는 HTTP를 막는 강제가 아니다.

---

**문제 2.** 기존에 암호화 없이 운영 중인 RDS MySQL 인스턴스를 저장 암호화하려 한다. 올바른 절차는?

A) 인스턴스 설정에서 암호화 토글을 켠다  
B) 스냅샷을 만들고 *암호화된 사본으로 복사*한 뒤 그 스냅샷에서 새 인스턴스를 복원한다  
C) 파라미터 그룹에서 `force_ssl`을 켠다  
D) DynamoDB로 마이그레이션한다  

**정답: B**  
해설: RDS 암호화는 인스턴스 생성 시에만 설정 가능하고 나중에 토글할 수 없다. 기존 미암호화 인스턴스는 스냅샷 → 암호화된 사본 복사 → 복원 경로로 암호화한다. `force_ssl`은 *전송* 암호화 강제이지 저장 암호화가 아니며, DynamoDB 마이그레이션은 불필요한 과잉 조치다.

---

**문제 3.** 운영 부담 없이 대칭 customer managed key를 정기적으로 회전하려 한다. 자동 키 회전에 대한 설명으로 가장 정확한 것은?

A) 회전 시 키 ID와 ARN이 바뀌므로 애플리케이션을 수정해야 한다  
B) 키 자료만 갱신되고 키 ID·ARN·별칭은 유지되며, 옛 키 자료는 보관되어 기존 데이터도 계속 복호화된다  
C) 회전하면 기존 데이터가 자동으로 새 키로 재암호화된다  
D) 비대칭 키도 동일하게 자동 회전된다  

**정답: B**  
해설: 자동 회전은 키 자료만 투명하게 갱신하고 키 식별자는 그대로라 애플리케이션 변경이 필요 없으며, 옛 키 자료가 보관되어 과거 데이터도 계속 복호화된다. 기존 데이터를 새 키로 재암호화하지는 않는다. 비대칭 키·BYOK는 자동 회전이 불가능하다.

---

**문제 4.** 자동 회전이 불가능한 비대칭 KMS 키를 정기적으로 교체해야 한다. 가장 적절한 방법은?

A) `enable-key-rotation`을 호출한다  
B) 새 비대칭 키를 만들고 별칭(alias)을 새 키로 갱신하며, 옛 키는 과거 데이터 복호화용으로 유지하는 수동 회전을 수행한다  
C) 키를 대칭으로 변환한다  
D) 회전이 불가능하므로 아무것도 하지 않는다  

**정답: B**  
해설: 비대칭 키는 KMS 자동 회전을 지원하지 않으므로, 새 키를 만들고 별칭을 갱신해 새 암호화는 새 키로 보내고 옛 키는 과거 데이터 복호화를 위해 유지하는 수동 회전을 한다. `enable-key-rotation`은 비대칭 키에 적용되지 않고, 키 종류는 변환할 수 없으며, 보안상 정기 교체가 필요한 키를 방치하면 안 된다.

---

**문제 5.** 조직의 모든 신규 EBS 볼륨이 예외 없이 저장 암호화되도록 보장하려 한다. 가장 효과적인 조합은?

A) 사용자에게 암호화 체크박스를 켜라고 안내  
B) 각 리전에서 EBS encryption by default를 활성화하고, AWS Config 규칙(`encrypted-volumes` 등)으로 미암호화 볼륨을 탐지·교정  
C) 볼륨마다 SSE-C 적용  
D) S3 버킷 정책으로 통제  

**정답: B**  
해설: 리전별 EBS encryption by default는 신규 볼륨을 자동 암호화하고, Config 규칙으로 누락·드리프트를 탐지·교정하는 예방+탐지 조합이 보장 요구에 맞는다. 사용자 안내는 강제력이 없고, SSE-C는 S3 객체 암호화 방식이며, S3 버킷 정책은 EBS와 무관하다.

---
