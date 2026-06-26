# Day 2 - 암호화: KMS와 서비스별 암호화

데이터는 저장 중(at rest)과 전송 중(in transit) 모두 보호되어야 합니다. AWS에서 암호화의 중심에는 KMS(Key Management Service)가 있고, S3·Redshift·Glue 등 데이터 서비스가 KMS와 통합되어 키를 관리합니다. 오늘은 키 종류, 서비스별 암호화 설정, 클라이언트 측 암호화를 정리합니다.

## 1. KMS 기초

KMS는 암호화 키를 생성·관리·제어하는 서비스입니다.

- **CMK(Customer Master Key) / KMS key**: 데이터를 암호화하는 데 쓰는 봉투 암호화(envelope encryption)의 루트 키.
  - **AWS 관리형 키**: 서비스가 자동 생성(`aws/s3` 등), 정책 제어 제한적.
  - **고객 관리형 키(CMK)**: 사용자가 생성, 키 정책·교체·접근 제어 완전 통제.
  - **AWS 소유 키**: AWS가 소유, 사용자에게 보이지 않음.
- **봉투 암호화**: KMS 키로 데이터 키(data key)를 암호화하고, 데이터 키로 실제 데이터를 암호화. 대용량 데이터에 효율적.

```text
KMS CMK ──암호화──> Data Key ──암호화──> 실제 데이터(S3 객체 등)
   (KMS에 보관)      (암호문으로 객체와 함께 저장)
```

> 💡 **관련 이론**: KMS는 데이터 자체를 암호화하지 않고 데이터 키를 관리합니다. 실제 대용량 데이터는 로컬에서 데이터 키로 암호화되므로 KMS API 호출 비용·지연을 줄입니다.

## 2. 저장 중 암호화 (at rest)

### S3
- **SSE-S3**: S3 관리 키(AES-256). 가장 단순, 키 제어 없음.
- **SSE-KMS**: KMS 키 사용. 키 정책·CloudTrail 감사 가능. **버킷 키(S3 Bucket Key)**로 KMS 호출 비용 절감.
- **DSSE-KMS**: 이중 계층 KMS 암호화(규정 준수 요건).
- **SSE-C**: 고객 제공 키. AWS가 키를 저장하지 않음.

### Redshift
- 클러스터 생성 시 KMS 또는 HSM으로 암호화. 스냅샷·노드 디스크 모두 암호화.

### Glue
- Glue 보안 구성(Security Configuration)으로 S3 데이터, CloudWatch 로그, 작업 북마크를 KMS로 암호화.

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

## 3. 전송 중 암호화 (in transit)

- **TLS/HTTPS**: S3·Redshift·Glue API는 TLS로 통신. `aws:SecureTransport` 조건으로 HTTP 차단 강제.
- **Redshift**: `require_ssl` 파라미터로 SSL 연결 강제.

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::lake-curated", "arn:aws:s3:::lake-curated/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

이 버킷 정책은 TLS가 아닌 연결을 모두 거부합니다.

> 💡 **관련 이론**: 저장 중 암호화와 전송 중 암호화는 별개의 보호 계층입니다. SSE-KMS로 저장은 암호화돼도 HTTP 평문 전송이면 중간자 공격에 노출되므로 둘 다 강제해야 합니다.

## 4. 키 관리: 정책·교체·접근

- **키 정책(Key Policy)**: KMS 키의 리소스 기반 정책. 누가 키를 사용/관리하는지 정의. 교차 계정 접근은 여기에 명시.
- **키 교체(Rotation)**: 고객 관리형 키는 자동 연간 교체 활성화 가능. 이전 키 자료는 복호화용으로 보존.
- **Grants**: 일시적·세분화된 키 사용 권한 위임(서비스 통합에 사용).

```json
{
  "Sid": "AllowGlueRoleUseOfKey",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/GlueETLRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*"
}
```

## 5. 클라이언트 측 암호화

클라이언트 측 암호화는 데이터가 AWS에 전송되기 **전에** 애플리케이션이 직접 암호화하는 방식입니다.

- **AWS Encryption SDK / S3 Encryption Client**로 구현.
- KMS 키 또는 자체 키로 데이터 키를 보호.
- AWS는 암호문만 받으므로 평문을 절대 보지 못함(가장 강한 기밀성).
- 단점: 키·복호화 책임이 클라이언트에 있어 운영 복잡도 증가.

서버 측 암호화(SSE)는 S3가 받은 뒤 암호화, 클라이언트 측은 보내기 전 암호화 — 위협 모델에 따라 선택합니다.

## 시험 포인트 요약

- SSE-S3(키 제어 없음) vs SSE-KMS(정책·감사·버킷 키) vs SSE-C(고객 키) vs 클라이언트 측 구분.
- 봉투 암호화: KMS 키 → 데이터 키 → 데이터. 대용량에 효율적.
- 전송 중: TLS, `aws:SecureTransport`로 HTTP 거부, Redshift `require_ssl`.
- 키 정책은 KMS 접근의 핵심(교차 계정·서비스 역할 허용 위치).
- S3 버킷 키로 SSE-KMS의 KMS 호출 비용 절감.

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

**문제 5.** KMS 봉투 암호화(envelope encryption)를 가장 정확히 설명한 것은?

A) KMS 키가 대용량 데이터를 직접 암호화한다  
B) KMS 키로 데이터 키를 암호화하고, 데이터 키로 실제 데이터를 암호화한다  
C) 데이터를 두 번 KMS로 암호화한다  
D) 클라이언트가 키를 전적으로 관리한다  

**정답: B**  
해설: 봉투 암호화는 KMS 키(루트)로 데이터 키를 보호하고, 그 데이터 키로 실제 데이터를 암호화해 대용량 처리 효율과 KMS 호출 절감을 동시에 얻습니다. A는 KMS의 동작과 다르고, C는 DSSE 개념과 혼동, D는 클라이언트 측 암호화 설명입니다.

---
