# Day 2 - Encryption: KMS and Service-Specific Encryption

Data must be protected both at rest and in transit. At the heart of AWS encryption is **KMS (Key Management Service)**, and data services like S3, Redshift, and Glue integrate with KMS to manage keys. Today we organize key types, encryption setup per service, and client-side encryption.

## 1. KMS Basics

KMS is a service creating, managing, and controlling encryption keys.

- **CMK (Customer Master Key) / KMS key**: Root key for data encryption in envelope encryption.
  - **AWS managed key**: Service auto-creates (`aws/s3` etc.), limited policy control.
  - **Customer-managed key (CMK)**: You create, full control of key policy, rotation, access.
  - **AWS owned key**: AWS-owned, invisible to you.
- **Envelope encryption**: KMS key encrypts data key (data key), data key encrypts actual data. Efficient for large data.

```text
KMS CMK ──encrypt──> Data Key ──encrypt──> Actual data (S3 objects etc.)
  (kept in KMS)    (as ciphertext with object)
```

> 💡 **Related Theory**: KMS doesn't encrypt data itself; it manages data keys. Large data is encrypted locally by data key, reducing KMS API calls and latency.

## 2. Encryption at Rest

### S3
- **SSE-S3**: S3-managed keys (AES-256). Simplest, no key control.
- **SSE-KMS**: Uses KMS key. Policy, CloudTrail audit possible. **S3 Bucket Key** reduces KMS call costs.
- **DSSE-KMS**: Dual-layer KMS encryption (compliance requirements).
- **SSE-C**: Customer-provided key. AWS doesn't store key.

### Redshift
- Encrypt at cluster creation with KMS or HSM. Snapshots and node disks encrypted.

### Glue
- Glue Security Configuration encrypts S3 data, CloudWatch logs, job bookmarks with KMS.

```json
{
  "ServerSideEncryptionConfiguration": {
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      },
      "BucketKeyEnabled": true
    }]
  }
}
```

## 3. Encryption in Transit

- **TLS/HTTPS**: S3, Redshift, Glue APIs communicate via TLS. Enforce HTTP blocking with `aws:SecureTransport` condition.
- **Redshift**: `require_ssl` parameter forces SSL connections.

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::lake-curated", "arn:aws:s3:::lake-curated/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

This bucket policy denies all non-TLS connections.

> 💡 **Related Theory**: Encryption at rest and in transit are separate protection layers. Even SSE-KMS storage encryption is exposed to MITM if HTTP is allowed, so both must be enforced.

## 4. Key Management: Policy, Rotation, Access

- **Key Policy**: KMS key resource-based policy. Defines who uses/manages. Cross-account access specified here.
- **Key Rotation**: Customer-managed keys can enable auto-annual rotation. Past key material retained for decryption.
- **Grants**: Temporary, granular key-use permissions (used in service integration).

```json
{
  "Sid": "AllowGlueRoleUseOfKey",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/GlueETLRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*"
}
```

## 5. Client-Side Encryption

Client-side encryption means applications encrypt data **before** sending to AWS.

- Implement with **AWS Encryption SDK / S3 Encryption Client**.
- Protect data key with KMS key or own key.
- AWS receives only ciphertext, never sees plaintext (strongest confidentiality).
- Downside: key/decryption responsibility increases client operational complexity.

Server-side (SSE) encrypts after S3 receives; client-side before sending — choose by threat model.

## Exam Points Summary

- Distinguish SSE-S3 (no control) vs SSE-KMS (policy/audit/bucket key) vs SSE-C (customer key) vs client-side.
- Envelope encryption: KMS key → data key → data. Efficient for large scale.
- Transit: TLS, `aws:SecureTransport` to deny HTTP, Redshift `require_ssl`.
- Key policy is central to KMS access (cross-account/service role allowance here).
- S3 Bucket Key reduces SSE-KMS KMS call costs.

## 📝 연습 문제

**문제 1.** 대량의 S3 객체를 SSE-KMS로 암호화하는데 KMS API 호출 비용과 스로틀링이 문제가 된다. 비용·호출을 줄이는 가장 적절한 방법은?

A) SSE-C로 전환  
B) 모든 객체를 SSE-S3로 변경  
C) KMS 키를 매일 교체  
D) S3 Bucket Key 활성화  

**정답: D**  
해설: S3 Bucket Key는 버킷 수준 데이터 키를 사용해 객체별 KMS 호출을 크게 줄여 비용·스로틀링을 완화하면서 KMS 키 제어를 유지합니다. SSE-C/SSE-S3 전환은 키 제어·감사를 잃고, 키 교체는 비용과 무관합니다.

---

**문제 2.** 규정상 AWS가 데이터의 평문을 절대 보지 못하도록 보장해야 한다. 가장 적합한 암호화 방식은?

A) SSE-S3  
B) SSE-KMS  
C) 클라이언트 측 암호화  
D) DSSE-KMS  

**정답: C**  
해설: 클라이언트 측 암호화는 데이터를 AWS로 보내기 전에 암호화하므로 AWS는 암호문만 받아 평문을 볼 수 없습니다. SSE 계열은 모두 AWS가 수신 후 암호화하므로 일시적으로 평문을 처리합니다.

---

**문제 3.** S3 데이터는 SSE-KMS로 암호화돼 있으나, 보안 검토에서 평문 HTTP 접근이 가능하다는 지적을 받았다. 전송 중 데이터를 보호하기 위한 조치는?

A) 버킷 정책에 `aws:SecureTransport: false` 거부 조건 추가  
B) KMS 키 교체 활성화  
C) S3 버전 관리 활성화  
D) Glacier로 전환  

**정답: A**  
해설: `aws:SecureTransport`가 false인 요청을 Deny하면 TLS가 아닌 평문 HTTP 접근이 차단되어 전송 중 데이터가 보호됩니다. 키 교체·버전 관리·Glacier 전환은 전송 계층 보호와 무관합니다.

---

**문제 4.** Glue ETL 작업이 SSE-KMS로 암호화된 S3 데이터를 읽지 못하고 권한 오류가 난다. Glue 작업 역할 ARN은 키 정책에 없다. 올바른 해결은?

A) S3 버킷을 공개로 설정  
B) 데이터를 SSE-S3로 재암호화  
C) KMS 키 정책에 Glue 역할의 `kms:Decrypt`/`kms:GenerateDataKey` 허용 추가  
D) Glue 작업을 다른 리전으로 이동  

**정답: C**  
해설: SSE-KMS 데이터를 읽으려면 해당 IAM 역할이 KMS 키 정책(또는 grant)에서 복호화 권한을 받아야 합니다. 공개 설정은 보안 위반, SSE-S3 재암호화는 키 제어 상실, 리전 이동은 권한 문제와 무관합니다.

---
