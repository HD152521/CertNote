# Day 2 - S3 데이터 보호: SSE-S3/SSE-KMS/DSSE, 버킷 키, 객체 잠금, 버전관리, 퍼블릭 액세스 차단

S3는 사실상 무한히 확장되는 객체 저장소이자, AWS에서 가장 흔한 데이터 유출 사고의 현장이다. "공개로 잘못 설정된 S3 버킷"은 보안 헤드라인의 단골이다. 보안 시험 관점에서 S3 데이터 보호는 두 축으로 나뉜다 — **저장 데이터 암호화(encryption at rest)**와 **접근 통제·노출 방지**. 오늘은 암호화·무결성·노출 방지 메커니즘을, 내일(day3)은 접근 통제 정책의 심화를 다룬다.

## 저장 데이터 암호화: 세 가지(사실상 네 가지) 모드

S3의 모든 새 객체는 기본적으로 **SSE-S3(AES-256)**로 암호화된다(2023년부터 기본 활성화). 시험은 네 가지 모드의 차이와 선택 기준을 묻는다.

| 모드 | 키 관리 주체 | 키 정책 통제 | 감사(CloudTrail) | 용도 |
|------|-------------|-------------|-----------------|------|
| **SSE-S3** | AWS(내부 관리) | 불가 | 키 사용 로그 없음 | 기본 암호화, 운영 단순 |
| **SSE-KMS** | KMS CMK | 키 정책으로 가능 | kms:Decrypt 등 기록 | 키 접근 통제·감사 필요 |
| **DSSE-KMS** | KMS CMK(이중) | 키 정책으로 가능 | 기록 | 규제상 이중 암호화 요구 |
| **SSE-C** | 고객 제공 키 | 고객 책임 | 키 자체 미저장 | AWS에 키를 맡기지 않는 경우 |

```bash
# SSE-KMS로 객체 업로드
aws s3api put-object \
  --bucket my-secure-bucket \
  --key reports/2026-q2.csv \
  --body ./report.csv \
  --server-side-encryption aws:kms \
  --ssekms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234
```

> 💡 **관련 이론**: SSE-S3와 SSE-KMS의 결정적 차이는 *암호화 자체*가 아니라 *키에 대한 접근 통제 분리*에 있다. SSE-S3는 데이터를 암호화하지만 키를 보는 사람과 데이터를 보는 사람이 모두 "S3 접근 권한자"로 동일하다 — 키 접근의 독립적 통제가 없다. SSE-KMS는 데이터 접근(s3:GetObject)과 키 접근(kms:Decrypt)을 **두 개의 독립된 인가 게이트**로 분리한다. 즉 S3 권한이 있어도 KMS 키 정책이 막으면 복호화할 수 없다. 이 *권한 분리(separation of duties)*가 SSE-KMS를 규제 환경에서 선호하게 만든다.

### DSSE-KMS: 왜 두 번 암호화하는가

DSSE-KMS(Dual-layer SSE)는 객체를 **두 개의 독립된 KMS 데이터 키 계층**으로 암호화한다. 미국 국방부(DoD) IL 등 일부 규제는 "두 개의 독립된 암호화 계층"을 명시적으로 요구한다. 성능·비용 오버헤드가 있으므로, 규제 요구가 명시되지 않았다면 SSE-KMS로 충분하다.

> ⚠️ **함정**: "두 계층 암호화 규제 준수"라는 키워드가 나오면 DSSE-KMS다. 단순히 "강한 암호화"나 "키 통제"라면 SSE-KMS다. DSSE를 모든 곳에 쓰면 불필요한 비용·지연이 생긴다.

### SSE-C: 키를 직접 들고 다니기

SSE-C는 고객이 매 요청에 암호화 키를 헤더로 제공하고, S3는 그 키로 암호화/복호화한 뒤 **키를 저장하지 않는다**(키의 HMAC만 검증용으로 보관). AWS에 키 관리를 절대 맡기지 않으려는 경우에만 쓴다. 키를 잃으면 데이터를 영영 복구할 수 없고, 반드시 HTTPS여야 한다(키가 헤더로 전송되므로).

## S3 버킷 키: KMS 비용·스로틀 완화

SSE-KMS의 문제는 객체마다 `GenerateDataKey`/`Decrypt`를 KMS에 호출해 비용과 KMS 요청 스로틀 한도를 압박한다는 점이다. **S3 Bucket Key**는 버킷 수준의 단기 키를 KMS에서 한 번 받아, 그 키로 버킷 내 여러 객체의 데이터 키를 S3가 로컬에서 파생한다. 결과적으로 KMS API 호출을 최대 99% 줄인다.

```bash
aws s3api put-bucket-encryption \
  --bucket my-secure-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

> 🎯 **시나리오**: "SSE-KMS를 쓰는 고트래픽 버킷에서 KMS ThrottlingException과 비용 급증"이 나오면 정답은 **S3 Bucket Key 활성화**다. 키 정책이나 IAM을 바꾸는 게 아니라, KMS 호출 횟수 자체를 줄이는 것이 핵심. DSSE-KMS는 Bucket Key와 호환되지 않는다는 점도 기억할 것.

## 객체 잠금(Object Lock): WORM과 불변성

S3 Object Lock은 **WORM(Write Once Read Many)** 모델로, 지정 기간 또는 무기한 동안 객체 버전의 **삭제·덮어쓰기를 차단**한다. 랜섬웨어 방어, 규제 보존(SEC 17a-4 등), 감사 로그 불변 보관에 쓰인다. Object Lock은 **버전 관리가 켜진 버킷에서만** 동작하며, **버킷 생성 시에 활성화**하는 것이 원칙이다(기존 버킷은 지원 요청 필요).

두 가지 보존 모드:
- **Governance 모드**: `s3:BypassGovernanceRetention` 권한을 가진 특별한 주체는 보존을 우회·삭제할 수 있다. 운영 유연성을 남긴다.
- **Compliance 모드**: **루트 계정조차** 보존 기간 내에는 삭제·변경할 수 없다. 진정한 불변성. 규제 준수에 쓰지만, 잘못 설정하면 되돌릴 수 없으니 신중해야 한다.

추가로 **Legal Hold**(법적 보존)는 보존 기간과 무관하게 명시적으로 해제할 때까지 객체를 잠근다.

```bash
aws s3api put-object-retention \
  --bucket compliance-logs \
  --key audit/2026.log \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2033-01-01T00:00:00Z"}'
```

> 💡 **관련 이론**: Object Lock은 *불변 인프라(immutable infrastructure)*와 *append-only 감사 로그*의 저장소 구현이다. 랜섬웨어 공격자가 노리는 것은 "백업까지 암호화하거나 삭제해 복구를 막는" 것인데, Compliance 모드 Object Lock은 권한이 탈취되어도(루트조차) 보존 기간 내 데이터를 물리적으로 보호한다. 이것이 "권한 기반 통제(IAM)"를 넘어선 "데이터 자체의 불변성 보장"이며, 심층 방어(defense in depth)의 마지막 층이다.

## 버전 관리(Versioning): 삭제·덮어쓰기로부터의 회복

버전 관리는 객체를 덮어쓰거나 삭제할 때 이전 버전을 보존한다. 삭제 시에는 실제 데이터를 지우는 대신 **delete marker**를 최신 버전으로 올린다 — 이전 버전은 그대로 남아 복구 가능하다. 버전 관리는 한 번 켜면 *비활성화(disable)*는 불가능하고 *일시중단(suspend)*만 가능하다.

**MFA Delete**를 추가하면 버전 영구 삭제나 버전 관리 상태 변경에 MFA를 요구한다 — 탈취된 자격증명만으로는 버전을 지울 수 없게 한다(루트 계정으로만 설정 가능).

> ⚠️ **함정**: 버전 관리 버킷에서 "객체를 지웠는데 스토리지 비용이 줄지 않는다"면, 이전 버전들이 남아 있기 때문이다. **수명주기 정책(lifecycle policy)**으로 비현행 버전(noncurrent version)을 일정 일수 후 만료시켜야 한다. delete marker도 자동 정리 대상으로 설정할 수 있다.

## 퍼블릭 액세스 차단(Block Public Access, BPA): 최후의 안전벨트

S3 데이터 유출의 대부분은 의도치 않은 공개 설정이다. **Block Public Access**는 ACL과 버킷 정책의 공개 설정을 *무력화*하는 상위 차단 스위치로, 네 가지 옵션이 있다:

```
BlockPublicAcls          → 새로운 공개 ACL 부여를 차단
IgnorePublicAcls         → 기존 공개 ACL을 무시
BlockPublicPolicy        → 공개 버킷 정책 적용을 차단
RestrictPublicBuckets    → 공개 정책이 있어도 교차계정/익명 접근을 제한
```

계정 수준과 버킷 수준 모두에서 설정할 수 있으며, **계정 수준 BPA가 버킷 설정을 덮어쓴다**(더 강한 쪽이 이긴다). 신규 계정은 기본적으로 4개 모두 켜져 있다.

> 🎯 **시나리오**: "버킷 정책에 공개 읽기를 허용했는데도 익명 접근이 안 된다"면, 십중팔구 BPA가 켜져 있다. BPA는 정책 평가보다 *우선 적용*되는 가드레일이다. 정말 공개가 필요한 정적 웹사이트라도, 가능하면 BPA를 유지하고 **CloudFront + OAC(Origin Access Control)**로 우회해 S3를 비공개로 두는 것이 권장 패턴이다. 직접 공개는 마지막 수단이다.

> 🔍 **더 깊이**: S3는 객체 무결성을 위해 업로드 시 체크섬(MD5, CRC32, CRC32C, SHA-1, SHA-256)을 검증할 수 있고, `Content-MD5`나 `x-amz-checksum-*` 헤더로 전송 중 손상을 탐지한다. 또한 모든 요청을 HTTPS로 강제하려면 버킷 정책에 `aws:SecureTransport: false`를 Deny하는 조건을 넣는다(day3에서 암호화 강제와 함께 다룸). 암호화·무결성·노출방지·접근통제의 네 층이 모두 갖춰져야 "S3 데이터 보호"가 완성된다.

---

## 📝 연습 문제

**문제 1.** SSE-S3 대신 SSE-KMS를 선택해야 하는 가장 본질적인 이유는?

A) SSE-KMS가 더 강한 암호화 알고리즘을 쓰기 때문  
B) 데이터 접근(s3:GetObject)과 키 접근(kms:Decrypt)을 독립된 인가 게이트로 분리해 키 사용을 별도 통제·감사할 수 있기 때문  
C) SSE-KMS가 더 저렴하기 때문  
D) SSE-S3는 버전 관리를 지원하지 않기 때문  

**정답: B**  
해설: 두 모드 모두 AES-256을 쓰므로 알고리즘 강도는 같다. 차이는 키 접근 통제의 분리다. SSE-KMS는 KMS 키 정책으로 복호화 권한을 S3 권한과 별개로 통제하고, CloudTrail에 키 사용을 기록해 감사할 수 있다. SSE-KMS는 KMS 호출 비용이 추가되므로 더 저렴하지 않으며, 버전 관리는 암호화 모드와 무관하다.

---

**문제 2.** SSE-KMS를 사용하는 고트래픽 버킷에서 KMS ThrottlingException과 비용 급증이 발생한다. 가장 적절한 해결책은?

A) 암호화를 SSE-S3로 변경  
B) S3 Bucket Key를 활성화해 객체별 KMS 호출을 버킷 수준 키 파생으로 대체  
C) KMS 키를 비활성화  
D) DSSE-KMS로 전환  

**정답: B**  
해설: S3 Bucket Key는 버킷 수준 단기 키를 KMS에서 한 번 받아 객체별 데이터 키를 S3가 로컬에서 파생하므로 KMS API 호출을 최대 99% 줄인다 — 스로틀과 비용을 동시에 완화한다. SSE-S3로 바꾸면 키 통제·감사를 잃고, DSSE-KMS는 오히려 KMS 호출이 늘며 Bucket Key와 호환되지 않는다. 키 비활성화는 복호화를 막아버린다.

---

**문제 3.** 규제상 "권한 있는 누구도(루트 계정 포함) 보존 기간 내에는 객체를 삭제·변경할 수 없어야 한다"는 요구가 있다. 올바른 구성은?

A) 버킷 정책으로 Delete를 Deny  
B) 버전 관리 + Object Lock의 Governance 모드  
C) 버전 관리 + Object Lock의 Compliance 모드  
D) MFA Delete만 활성화  

**정답: C**  
해설: Compliance 모드 Object Lock은 루트 계정조차 보존 기간 내 삭제·변경할 수 없는 진정한 불변성을 제공한다. Governance 모드는 `BypassGovernanceRetention` 권한자가 우회할 수 있어 "누구도"라는 요구에 미달한다. 버킷 정책 Deny는 권한 변경으로 우회 가능하고, MFA Delete는 MFA를 가진 루트가 여전히 삭제할 수 있다.

---

**문제 4.** 버킷 정책에 익명 공개 읽기(`Principal: *`, `s3:GetObject`)를 허용했는데도 외부에서 접근이 거부된다. 가장 가능성 높은 원인은?

A) SSE-KMS 암호화 때문  
B) 계정/버킷 수준의 Block Public Access가 활성화되어 공개 정책을 무력화하고 있다  
C) 버전 관리가 꺼져 있어서  
D) 객체 잠금이 걸려 있어서  

**정답: B**  
해설: Block Public Access는 ACL·버킷 정책의 공개 설정보다 우선 적용되는 상위 가드레일이다. BPA의 `BlockPublicPolicy`/`RestrictPublicBuckets`가 켜져 있으면 공개 버킷 정책이 무시되어 익명 접근이 거부된다. 암호화·버전 관리·객체 잠금은 익명 읽기 차단의 원인이 아니다. 권장 패턴은 BPA를 유지하고 CloudFront+OAC로 비공개 S3를 서빙하는 것이다.

---

**문제 5.** 버전 관리가 켜진 버킷에서 객체를 다수 삭제했는데 스토리지 비용이 줄지 않는다. 가장 적절한 조치는?

A) 버전 관리를 비활성화한다  
B) 수명주기 정책으로 비현행 버전(noncurrent version)과 만료된 delete marker를 일정 일수 후 만료·정리한다  
C) BPA를 활성화한다  
D) Object Lock Compliance를 적용한다  

**정답: B**  
해설: 버전 관리 버킷에서 삭제는 실제 데이터를 지우지 않고 delete marker를 추가하며, 이전 버전들은 그대로 남아 비용을 차지한다. 수명주기 정책으로 비현행 버전을 만료시키고 만료된 delete marker를 정리해야 실제 스토리지가 회수된다. 버전 관리는 비활성화할 수 없고(suspend만 가능), BPA·Object Lock은 비용 회수와 무관하며 Object Lock은 오히려 삭제를 막는다.

---
