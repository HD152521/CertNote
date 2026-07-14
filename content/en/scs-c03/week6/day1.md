# Day 1 - Secrets Manager: Automatic Rotation (Lambda), Parameter Store Comparison, Cross-Account Secrets

A secret is "a credential that leads directly to a breach if exposed." This includes DB passwords, API keys, OAuth tokens, and TLS private keys. From a security exam perspective, the essence of secret management is not merely "encryption at rest" but *full lifecycle control*. Encryption during storage, IAM authorization on access, rotation after use, and deletion during discard — you must manage all four stages. AWS Secrets Manager is a service designed to automate this lifecycle.

## Why Hardcoding Secrets in Code/Environment Variables Is Wrong

Hardcoding secrets in source code, Git repositories, EC2 user data, or container environment variables creates three problems. First, everyone with code access sees the secret (least privilege violation). Second, rotation is impossible — you must redeploy to change it. Third, auditing is absent — you cannot track who accessed the secret or when. Secrets Manager solves all three: it encrypts with KMS envelope encryption, controls access via IAM/resource policies, and logs `GetSecretValue` calls to CloudTrail.

> 💡 **Related Theory**: Secret management ultimately reduces to the *secret zero* problem. "To securely retrieve a secret, I need another credential—how is that credential protected?" This is infinite regression. AWS breaks this with IAM roles — EC2/Lambda/ECS receive temporary credentials from instance metadata or task roles, which they then use to call Secrets Manager. In other words, "machine identity" replaces secret zero. There is no persistent secret on disk.

## Secrets Manager's Storage and Encryption Model

Secret values are always encrypted with a KMS key at rest. The default is the AWS-managed key `aws/secretsmanager`, but the exam-recommended approach is a **customer-managed KMS key (CMK)**. Using a CMK allows you to further control via key policy "which principals can decrypt this secret," and it becomes mandatory for cross-account sharing.

```bash
aws secretsmanager create-secret \
  --name prod/db/mysql \
  --description "Production MySQL master credentials" \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234 \
  --secret-string '{"username":"admin","password":"P@ssw0rd!","host":"db.internal","port":3306}'
```

Secret values are conventionally stored as JSON structures — rotation Lambdas and RDS integration expect standard keys like `username` and `password`.

## Access Control: IAM Policy + Resource Policy

Secrets Manager access is controlled on two axes. **Identity-based policies** (IAM) define "what can this principal do to which secrets," while **resource-based policies** (policies attached directly to the secret) define "who can access this secret." Cross-account access requires a resource policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowAppRoleRead",
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
    "Resource": "arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:prod/db/mysql-*",
    "Condition": {
      "StringEquals": { "aws:PrincipalTag/team": "payments" }
    }
  }]
}
```

> ⚠️ **Pitfall**: Do not forget the 6-character random suffix at the end of the secret ARN. Secrets Manager appends a 6-character random suffix to the ARN to distinguish between deletion and recreation of secrets with the same name. If an IAM policy Resource specifies only `prod/db/mysql`, it won't match — you must use a wildcard like `prod/db/mysql-*` to include the suffix.

## Automatic Rotation (Rotation): Lambda-Based 4-Step Process

Rotation is the core value of Secrets Manager. If secrets are automatically rotated periodically, the effective lifetime of a leaked credential becomes very short. Rotation is performed by a Lambda function, and AWS provides rotation Lambda templates for RDS, Redshift, and DocumentDB.

The rotation Lambda is invoked in **4-step stages**:

```
createSecret  → Create a new secret value, store in AWSPENDING version stage
setSecret     → Actually apply the new credential to the target service (e.g., DB via ALTER USER)
testSecret    → Test the AWSPENDING credential with real connection/query
finishSecret  → Promote AWSPENDING stage to AWSCURRENT (previous CURRENT becomes AWSPREVIOUS)
```

```
[AWSPREVIOUS] ← [AWSCURRENT] ← [AWSPENDING]
   Previous value   Current value   New value being rotated
```

> 💡 **Related Theory**: This 4-step mimics *atomic swap*. The key insight is that finishSecret only runs if testSecret succeeds — traffic switches only after the new credential is validated to work. If setSecret applies to the DB but testSecret fails, AWSCURRENT still points to the old value, so the application doesn't break. This is the same principle as blue/green deployment — defer traffic cutover until after validation.

### Single-User vs. Alternating-User Strategy

RDS rotation has two strategies:
- **single-user**: Only change the password of the same DB user. Simple, but there can be a brief authentication failure window between password change and application cache refresh. The rotation Lambda doesn't use master credentials — it rotates itself.
- **alternating-users**: Use two users (e.g., `app_user_1`, `app_user_2`) alternately. During rotation, change the password of the user not currently in use, then switch — this results in virtually no downtime. However, the rotation Lambda must retrieve **master (superuser) credentials** from a separate secret (`masterarn` parameter).

> 🎯 **Scenario**: "During RDS password rotation, no authentication errors must occur (zero-downtime)" is a common exam question. The answer is the alternating-users strategy, which requires connecting the rotation Lambda to a master credential secret. single-user is simpler to implement but can suffer brief authentication failures depending on timing.

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/db/mysql \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111122223333:function:SecretsManagerRDSMySQLRotation \
  --rotation-rules '{"AutomaticallyAfterDays":30}'
```

The rotation Lambda must access the private DB inside a VPC, so it is typically **deployed in the same VPC as the DB**, and to call the Secrets Manager API it needs **a VPC endpoint (or NAT)**. Omitting this network path will cause rotation to fail with a timeout.

## Parameter Store Comparison: When to Use What

AWS Systems Manager Parameter Store can also store secrets as `SecureString`, encrypting them with KMS at rest. The exam tests the selection criteria between the two.

| Item | Secrets Manager | Parameter Store (SecureString) |
|------|-----------------|--------------------------------|
| Automatic Rotation | Built-in (Lambda integration) | None (manual implementation required) |
| Cross-Account Sharing | Resource policy support | Standard unsupported (Advanced limited) |
| Cost | Monthly per-secret fee + API calls | Standard free, Advanced paid |
| Size Limit | Up to 64KB | Standard 4KB / Advanced 8KB |
| Random Password Generation | Built-in `GetRandomPassword` | None |
| RDS/Redshift Integration | First-class integration | None |
| Use Case | Secrets requiring rotation/cross-account sharing | Config values, simple secrets not needing rotation, non-confidential configuration |

> ⚠️ **Pitfall**: "Minimize cost + no rotation needed for a simple API key" → Parameter Store SecureString is the answer. Conversely, "auto-rotate DB password" or "cross-account secret sharing" is required → Secrets Manager. Interestingly, Parameter Store can *reference* Secrets Manager secrets via `/aws/reference/secretsmanager/{secret-name}` path, enabling a hybrid pattern.

## Cross-Account Secret Sharing

To allow an IAM role in account B to read a secret in account A, **both** of the following are required:

1. **Secret Resource Policy**: Allow the principal in account B
2. **KMS Key Policy**: Allow the principal in account B to decrypt with that key — AWS-managed key `aws/secretsmanager` cannot have its key policy modified, so it **must be a CMK**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CrossAccountRead",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::444455556666:role/AppReader" },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

The KMS CMK key policy must also allow account B's `kms:Decrypt`. The IAM policy of account B's role must have both `secretsmanager:GetSecretValue` and `kms:Decrypt` (all three policies must intersect for authorization to succeed).

> 🎯 **Scenario**: "Cross-account secret sharing results in `AccessDeniedException` (KMS) in account B" — the typical cause is that the secret is encrypted with an AWS-managed key. Managed keys cannot have their key policies edited, so there is no way to allow external account decryption. Solution: re-encrypt the secret with a CMK and add account B's Decrypt to the key policy.

## Deletion Grace Period and Recovery

`DeleteSecret` does not immediately delete but rather imposes a **7-30 day recovery grace period** (30 days by default). You can restore with `RestoreSecret` during this period. It's a safeguard against accidental or malicious deletion. If immediate deletion is truly necessary, use `--force-delete-without-recovery`, but the exam recommends the default grace period for "accidental deletion prevention."

> 🔍 **Deeper Dive**: Secrets Manager provides an automatic caching client library that allows applications to avoid calling `GetSecretValue` on every request by caching in memory and refreshing only at rotation time. This improves both cost (charged per API call) and availability (application continues with cached value even if Secrets Manager is unavailable). The key is making the cache TTL shorter than the rotation period — that way, rotated new credentials are fetched on time.

---

## 📝 연습 문제

**문제 1.** RDS MySQL 마스터 비밀번호를 자동 회전하되, 회전 중 단 한 건의 인증 실패도 발생하면 안 된다. 가장 적절한 회전 전략은?

A) single-user 회전 — 같은 사용자의 비밀번호만 교체  
B) alternating-users 회전 — 두 사용자를 번갈아 쓰고 마스터 자격증명 시크릿을 회전 Lambda에 연결  
C) 회전을 비활성화하고 수동으로 분기마다 교체  
D) Parameter Store SecureString으로 옮긴 뒤 회전  

**정답: B**  
해설: alternating-users 전략은 현재 사용 중이 아닌 사용자의 비밀번호를 먼저 바꾼 뒤 전환하므로 인증 실패 창이 사실상 없다. 이를 위해 회전 Lambda는 슈퍼유저(마스터) 자격증명을 별도 시크릿으로 참조해야 한다. single-user는 비밀번호 변경과 캐시 갱신 사이에 순간 실패가 가능하고, 수동 회전은 자동화 요구에 어긋나며, Parameter Store는 자동 회전 기능 자체가 없다.

---

**문제 2.** 계정 A의 시크릿을 계정 B의 IAM 역할이 읽으려 하자 KMS 관련 `AccessDeniedException`이 발생한다. 시크릿은 `aws/secretsmanager` 관리형 키로 암호화되어 있다. 올바른 조치는?

A) 계정 B 역할에 `secretsmanager:GetSecretValue`만 추가하면 된다  
B) 시크릿을 고객 관리형 KMS 키(CMK)로 암호화하고, 그 키 정책에 계정 B의 kms:Decrypt를 허용한다  
C) 시크릿 복구 대기 기간을 늘린다  
D) 시크릿을 계정 B로 복제한다  

**정답: B**  
해설: 교차계정 복호화에는 시크릿 리소스 정책, KMS 키 정책, 계정 B IAM 정책 세 가지가 모두 필요하다. AWS 관리형 키 `aws/secretsmanager`는 키 정책을 편집할 수 없어 외부 계정에 Decrypt를 부여할 방법이 없다. 따라서 CMK로 재암호화하고 키 정책에 계정 B 주체의 kms:Decrypt를 추가해야 한다. GetSecretValue만으로는 복호화 단계에서 막히고, 복구 기간이나 복제는 무관하다.

---

**문제 3.** 회전 Lambda의 4단계 중, 새 자격증명이 실제로 동작하는지 검증한 뒤에야 현재 버전으로 승격되도록 보장하는 메커니즘은?

A) createSecret이 AWSCURRENT를 즉시 갱신한다  
B) testSecret이 AWSPENDING 자격증명으로 연결을 검증하고, 성공해야만 finishSecret이 AWSPENDING을 AWSCURRENT로 승격한다  
C) setSecret이 검증과 승격을 동시에 수행한다  
D) finishSecret이 먼저 승격한 뒤 testSecret으로 사후 검증한다  

**정답: B**  
해설: 회전은 createSecret(신규 생성, AWSPENDING) → setSecret(대상에 적용) → testSecret(AWSPENDING으로 실제 검증) → finishSecret(승격) 순서다. testSecret이 성공해야 finishSecret이 AWSPENDING을 AWSCURRENT로 올린다. 검증 실패 시 AWSCURRENT는 옛 값을 유지하므로 애플리케이션이 멈추지 않는다. createSecret/setSecret은 승격하지 않으며, 승격을 검증보다 먼저 하면 무중단 보장이 깨진다.

---

**문제 4.** 회전이 필요 없고 비용을 최소화하면서 단순 API 키 하나를 KMS 암호화해 저장하려 한다. 가장 적절한 서비스는?

A) Secrets Manager — 회전 기능을 끄고 사용  
B) Parameter Store의 SecureString 파라미터(Standard 티어)  
C) S3 객체로 SSE-KMS 저장  
D) DynamoDB 항목에 평문 저장  

**정답: B**  
해설: 회전·교차계정 공유가 불필요하고 비용이 우선이면 Parameter Store SecureString(Standard 티어, 무료)이 최적이다. KMS로 암호화 저장하고 IAM으로 접근을 통제한다. Secrets Manager는 시크릿당 월정액이 들어 단순 저장에는 과하고, S3/DynamoDB는 시크릿 전용 수명주기 기능이 없다. DynamoDB 평문 저장은 보안상 부적절하다.

---

**문제 5.** IAM 정책에서 `Resource`를 `arn:aws:secretsmanager:...:secret:prod/db/mysql`로 정확히 지정했는데도 `GetSecretValue`가 거부된다. 가장 가능성 높은 원인은?

A) 시크릿 ARN 끝의 6자 무작위 접미사가 매칭되지 않아서 — `prod/db/mysql-*`처럼 와일드카드를 붙여야 한다  
B) KMS 키가 비활성화되어서  
C) 시크릿 복구 대기 중이라서  
D) Parameter Store와 이름이 충돌해서  

**정답: A**  
해설: Secrets Manager는 같은 이름의 시크릿이 삭제·재생성될 때를 구분하려 ARN 끝에 `-` + 6자 무작위 문자를 붙인다. 정책 Resource에 접미사 없는 정확한 이름만 쓰면 실제 ARN과 매칭되지 않아 거부된다. `prod/db/mysql-*` 또는 `prod/db/mysql-??????`로 접미사를 포함해야 한다. KMS 비활성화는 복호화 단계에서 다른 오류를 내고, 복구 대기·이름 충돌은 이 증상의 원인이 아니다.

---
