# Day 2 - S3 데이터 보호: SSE-S3/SSE-KMS/DSSE, 버킷 키, 객체 잠금, 버전관리, 퍼블릭 액세스 차단

S3는 사실상 무한히 확장되는 객체 저장소이자, AWS에서 가장 흔한 데이터 유출 사고의 현장이다. "공개로 잘못 설정된 S3 버킷"은 보안 헤드라인의 단골이다. 보안 시험 관점에서 S3 데이터 보호는 두 축으로 나뉜다 — **저장 데이터 암호화(encryption at rest)**와 **접근 통제·노출 방지**. 오늘은 암호화·무결성·노출 방지 메커니즘을, 내일(day3)은 접근 통제 정책의 심화를 다룬다.

> 📚 **사례**: 2019년 Capital One 침해는 "S3 데이터 보호"가 암호화 하나로 끝나지 않음을 보여 준다. 공격자는 애플리케이션의 SSRF 취약점으로 EC2 인스턴스 메타데이터(IMDSv1)에서 역할의 임시 자격증명을 얻었고, 그 정상적인 자격증명으로 S3에서 데이터를 읽어 갔다. 버킷은 공개도 아니었고 저장 데이터는 암호화되어 있었지만, *정당한 권한을 가진 주체로 위장한 요청*이었기 때문에 암호화가 아무것도 막지 못했다. 서버측 암호화(SSE)는 디스크·백업 매체 도난과 AWS 내부 물리 계층을 방어하는 통제이지, 인가된 API 호출을 막는 통제가 아니다. 이 구분을 못 하면 "데이터가 암호화되어 있었는데 왜 유출됐나"라는 질문에 답할 수 없다. 실제 방어선은 (1) 역할 권한 최소화, (2) IMDSv2 강제, (3) SSE-KMS 키 정책으로 복호화 주체 제한, (4) VPC 엔드포인트 조건으로 접근 경로 제한이라는 네 겹이다.

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

### 봉투 암호화: 실제로 무슨 일이 일어나는가

"SSE-KMS로 암호화했다"는 말은 KMS 키가 객체 자체를 암호화했다는 뜻이 아니다. KMS의 CMK는 리전 하드웨어 보안 모듈 밖으로 나오지 않으므로 대용량 데이터를 직접 암호화하지 않는다. 실제 동작은 **봉투 암호화(envelope encryption)**다.

```
[ PutObject 시 ]
S3 ──GenerateDataKey(CMK)──→ KMS
     ← 평문 데이터 키(DK)  +  CMK로 암호화된 DK(EDK)
S3: DK로 객체 본문 암호화 → DK를 메모리에서 폐기 → 객체 옆에 EDK를 메타데이터로 저장

[ GetObject 시 ]
S3 ──Decrypt(EDK, CMK)──→ KMS      ← 여기서 kms:Decrypt 권한이 평가된다
     ← 평문 DK
S3: DK로 본문 복호화 → 응답 → DK 폐기
```

이 그림에서 읽어야 할 두 가지가 있다. 첫째, **객체를 읽을 때마다 KMS `Decrypt` 호출이 발생한다** — 이것이 잠시 뒤 다룰 비용·스로틀 문제의 원인이다. 둘째, 복호화 인가가 S3가 아니라 **KMS에서** 일어난다 — 그래서 `s3:GetObject`가 허용되어도 KMS 키 정책이 막으면 읽지 못한다. SSE-S3에는 이 두 번째 관문이 아예 없다.

> 🔍 **더 깊이**: KMS 키 정책에는 `kms:ViaService` 조건 키가 있어 "이 키는 S3를 통해서만 사용 가능"처럼 사용 경로를 제한할 수 있다. 예컨대 `"kms:ViaService": "s3.ap-northeast-2.amazonaws.com"`을 걸면, 어떤 주체가 `kms:Decrypt` 권한을 갖고 있어도 KMS를 직접 호출해 데이터 키를 뽑아낼 수 없고 오직 S3 요청의 일부로만 그 키가 쓰인다. 또 하나 자주 쓰이는 것이 `kms:EncryptionContext:aws:s3:arn` 조건으로, 특정 버킷·프리픽스의 객체에 대해서만 복호화를 허용해 하나의 CMK를 여러 버킷이 공유할 때 경계를 긋는다. "SSE-KMS를 썼는데도 키 사용을 더 좁히고 싶다"가 나오면 이 두 조건 키를 떠올린다.

### 복제·계층 이동 시 암호화는 어떻게 되는가

| 상황 | 동작 | 주의점 |
|------|------|--------|
| 교차 리전 복제(CRR) | 복제 대상 리전에서 **다시 암호화**된다 | 대상 리전 CMK와 복제 역할의 `kms:Decrypt`(소스) + `kms:GenerateDataKey`(대상) 필요 |
| Glacier 계층 이동 | S3가 내부적으로 재암호화 처리 | 사용자 조치 불필요 |
| 기존 객체의 암호화 방식 변경 | 자동으로 바뀌지 않음 | `CopyObject`(자기 자신 덮어쓰기) 또는 S3 Batch Operations로 재작성해야 함 |

> ⚠️ **함정**: "버킷 기본 암호화를 SSE-KMS로 바꿨다"고 해서 **기존 객체가 소급해 재암호화되지 않는다.** 기본 암호화는 *앞으로 들어올 객체*에만 적용된다. 기존 객체까지 바꾸려면 S3 Batch Operations로 Copy 작업을 돌려 전량 재작성해야 한다. 시험에서 "이미 저장된 수백만 객체를 SSE-KMS로 전환하라"가 나오면 정답은 배치 복사이지 기본 암호화 설정 변경이 아니다.

### DSSE-KMS: 왜 두 번 암호화하는가

DSSE-KMS(Dual-layer SSE)는 객체를 **두 개의 독립된 KMS 데이터 키 계층**으로 암호화한다. 미국 국방부(DoD) IL 등 일부 규제는 "두 개의 독립된 암호화 계층"을 명시적으로 요구한다. 성능·비용 오버헤드가 있으므로, 규제 요구가 명시되지 않았다면 SSE-KMS로 충분하다.

> ⚠️ **함정**: "두 계층 암호화 규제 준수"라는 키워드가 나오면 DSSE-KMS다. 단순히 "강한 암호화"나 "키 통제"라면 SSE-KMS다. DSSE를 모든 곳에 쓰면 불필요한 비용·지연이 생긴다.

### SSE-C: 키를 직접 들고 다니기

SSE-C는 고객이 매 요청에 암호화 키를 헤더로 제공하고, S3는 그 키로 암호화/복호화한 뒤 **키를 저장하지 않는다**(키의 HMAC만 검증용으로 보관). AWS에 키 관리를 절대 맡기지 않으려는 경우에만 쓴다. 키를 잃으면 데이터를 영영 복구할 수 없고, 반드시 HTTPS여야 한다(키가 헤더로 전송되므로).

```bash
# SSE-C 업로드 — 키를 매 요청 헤더로 직접 제공한다
aws s3api put-object \
  --bucket byok-bucket --key secret.dat --body ./secret.dat \
  --sse-customer-algorithm AES256 \
  --sse-customer-key fileb://./customer-key.bin

# 같은 키를 다시 제시하지 않으면 읽을 수 없다
aws s3api get-object \
  --bucket byok-bucket --key secret.dat ./out.dat \
  --sse-customer-algorithm AES256 \
  --sse-customer-key fileb://./customer-key.bin
```

> ⚠️ **함정**: SSE-C는 "AWS가 키를 갖지 않는다"는 요구를 만족시키지만, 그 대가로 **키 관리·회전·백업·감사가 전부 고객 책임**이 된다. 게다가 KMS를 거치지 않으므로 CloudTrail에 키 사용 기록이 남지 않고, 버킷 정책으로 "특정 키만 허용" 같은 통제도 불가능하다. 시험에서 "규제상 키를 AWS에 맡길 수 없다"라는 *명시적* 문구가 없으면 SSE-C는 대개 오답이다. 반대로 "온프레미스 HSM에서 키를 관리해야 한다"면 SSE-C 또는 KMS External Key Store 계열의 답을 본다.

### 네 가지 모드를 실전 기준으로 다시 세우기

| 판단 기준 | 정답 |
|-----------|------|
| 특별한 요구 없음, 운영 단순함이 최우선 | SSE-S3 |
| 키 사용을 별도 인가·감사해야 함, 교차계정 | SSE-KMS |
| 고트래픽으로 KMS 호출 비용·스로틀이 문제 | SSE-KMS + **Bucket Key** |
| "두 개의 독립된 암호화 계층" 규제 문구 | DSSE-KMS |
| "AWS가 키를 보유해서는 안 됨" 명시 | SSE-C |
| 업로드 전에 클라이언트에서 이미 암호화 | 클라이언트 측 암호화(S3 Encryption Client) |

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

```
[ Bucket Key 없이 ]                      [ Bucket Key 활성화 ]

객체1 → KMS GenerateDataKey              버킷 키(단기) ← KMS 1회 호출
객체2 → KMS GenerateDataKey                 │
객체3 → KMS GenerateDataKey                 ├─ 객체1 데이터 키 (S3가 로컬 파생)
  ...      (객체 수 = KMS 호출 수)          ├─ 객체2 데이터 키
                                            └─ 객체3 데이터 키  ...

 → CloudTrail에 객체마다 KMS 이벤트        → CloudTrail 이벤트도 버킷 키 단위로 줄어듦
 → 비용·스로틀 압박                        → 호출 최대 99% 감소
```

> 🔍 **더 깊이**: Bucket Key에는 감사 측면의 대가가 따른다. KMS 호출이 줄어든다는 말은 CloudTrail에 남는 `Decrypt` 이벤트도 줄어든다는 뜻이고, 로그의 `resources` 필드가 개별 객체가 아니라 버킷을 가리키게 된다. 즉 "어떤 객체를 누가 복호화했는가"의 해상도가 낮아진다. 객체 단위의 키 사용 감사가 규제 요건이라면 Bucket Key를 켜기 전에 그 요건과 충돌하는지 확인해야 한다. 비용·성능과 감사 해상도의 교환이며, 시험이 "비용·스로틀"을 말하면 Bucket Key가 정답이지만 "객체별 키 사용 감사"를 말하면 그렇지 않다.

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

### Governance vs Compliance vs Legal Hold

| 항목 | Governance 모드 | Compliance 모드 | Legal Hold |
|------|-----------------|-----------------|------------|
| 보존 기간 | 객체 버전별 지정 | 객체 버전별 지정 | **기간 없음**(해제할 때까지) |
| 우회 가능 주체 | `s3:BypassGovernanceRetention` 권한자 | **없음**(루트 계정 포함) | `s3:PutObjectLegalHold` 권한자가 해제 |
| 기간 단축 | 가능(우회 권한 필요) | **불가**(연장만 가능) | 해당 없음 |
| 실수 시 되돌리기 | 가능 | **불가능** | 가능 |
| 전형적 용도 | 사내 정책·랜섬웨어 완화 | SEC 17a-4 등 법정 보존 | 소송 대응(litigation hold) |

Governance와 Compliance의 실질적 차이는 "실수를 되돌릴 수 있는가"다. Compliance 모드로 7년을 걸어 두면 그 객체는 7년간 계정에 상주하며 스토리지 비용을 발생시키고, 잘못 올린 데이터도 지울 수 없다. 그래서 실무의 정석은 **테스트는 Governance로, 검증 후 프로덕션만 Compliance로** 가는 것이다. 시험이 "누구도 삭제할 수 없어야 한다"고 명시하지 않았는데 Compliance를 고르면 과잉 설계다.

```bash
# 버킷 생성 시 Object Lock 활성화 (버전 관리가 함께 켜진다)
aws s3api create-bucket \
  --bucket compliance-logs --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2 \
  --object-lock-enabled-for-bucket

# 버킷 기본 보존 규칙 — 이후 올라오는 객체에 자동 적용
aws s3api put-object-lock-configuration \
  --bucket compliance-logs \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": { "DefaultRetention": { "Mode": "COMPLIANCE", "Years": 7 } }
  }'

# 특정 객체 버전에 법적 보존 걸기
aws s3api put-object-legal-hold \
  --bucket compliance-logs --key audit/2026.log \
  --legal-hold Status=ON
```

### 랜섬웨어를 막는 실제 배치

랜섬웨어 대응에서 Object Lock이 중요한 이유는, 공격자가 데이터를 암호화하는 것보다 **백업을 지우는 것**을 먼저 시도하기 때문이다. 백업이 살아 있으면 몸값을 낼 이유가 없다.

```
[ 침해된 계정에서도 살아남는 백업 배치 ]

  프로덕션 계정 A                        백업 계정 B (별도 자격증명 경계)
  ┌──────────────┐   교차계정 복제       ┌────────────────────────────┐
  │ 운영 버킷     │ ───────────────────→ │ 백업 버킷                   │
  │ 버전 관리 ON  │                      │ 버전 관리 ON                │
  └──────────────┘                      │ Object Lock COMPLIANCE      │
                                        │ MFA Delete                  │
        ▲                               │ 계정 A는 삭제 권한 없음      │
        │                               └────────────────────────────┘
   공격자가 계정 A를 완전히 장악해도
   계정 B의 보존된 버전은 건드릴 수 없다
```

핵심은 **자격증명 경계를 분리**하는 것이다. 백업이 같은 계정 안에 있으면 계정을 장악한 공격자가 결국 접근한다. 별도 계정 + Object Lock Compliance + 버전 관리의 조합이라야 "권한이 완전히 무너져도 데이터는 남는다"가 성립한다.

> 📚 **사례**: 랜섬웨어 사고 대응 보고에서 반복적으로 지적되는 실패 패턴은 "백업은 있었는데 백업도 같이 암호화·삭제되었다"는 것이다. 클라우드에서 이 실패는 대개 백업 버킷이 운영과 같은 계정에 있고, 관리자 역할 하나가 양쪽 모두에 삭제 권한을 가진 구조에서 발생한다. AWS가 Object Lock을 버킷 *생성 시점*에만 켜도록 설계한 것도 같은 맥락이다 — 나중에 켤 수 있다면 공격자가 끄고 나서 지울 수 있기 때문이다. 통제의 강도는 "언제 끌 수 있는가"로 결정된다.

## 버전 관리(Versioning): 삭제·덮어쓰기로부터의 회복

버전 관리는 객체를 덮어쓰거나 삭제할 때 이전 버전을 보존한다. 삭제 시에는 실제 데이터를 지우는 대신 **delete marker**를 최신 버전으로 올린다 — 이전 버전은 그대로 남아 복구 가능하다. 버전 관리는 한 번 켜면 *비활성화(disable)*는 불가능하고 *일시중단(suspend)*만 가능하다.

**MFA Delete**를 추가하면 버전 영구 삭제나 버전 관리 상태 변경에 MFA를 요구한다 — 탈취된 자격증명만으로는 버전을 지울 수 없게 한다(루트 계정으로만 설정 가능).

> ⚠️ **함정**: 버전 관리 버킷에서 "객체를 지웠는데 스토리지 비용이 줄지 않는다"면, 이전 버전들이 남아 있기 때문이다. **수명주기 정책(lifecycle policy)**으로 비현행 버전(noncurrent version)을 일정 일수 후 만료시켜야 한다. delete marker도 자동 정리 대상으로 설정할 수 있다.

```json
{
  "Rules": [
    {
      "ID": "expire-noncurrent-and-markers",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90,
        "NewerNoncurrentVersions": 3
      },
      "Expiration": { "ExpiredObjectDeleteMarker": true },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

`NewerNoncurrentVersions`는 "최신 비현행 버전 N개는 남기고 그보다 오래된 것부터 만료"라는 뜻이다. 복구 가능성과 비용을 동시에 잡는 설정이다. `AbortIncompleteMultipartUpload`는 실패한 멀티파트 업로드 조각이 조용히 쌓여 비용을 갉아먹는 것을 막는다 — 콘솔의 객체 목록에는 보이지 않으므로 원인을 못 찾는 대표적 비용 누수다.

> 🎯 **시나리오**: "버전 관리 버킷에서 데이터 복구 가능성은 유지하되 스토리지 비용을 통제하라"가 나오면, 정답은 수명주기 규칙으로 **비현행 버전을 N일 후 만료 + 최신 몇 개는 보존 + 만료된 delete marker 정리 + 미완료 멀티파트 중단**의 조합이다. 버전 관리를 끄는 답(애초에 disable 자체가 불가능하고 suspend만 가능하다)이나 수동 삭제 스크립트는 오답이다. 단, **Object Lock이 걸린 객체는 보존 기간 내 수명주기로도 삭제되지 않는다** — 보존과 비용 최적화가 충돌하면 보존이 이긴다.

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

```bash
# 계정 수준 BPA — 이 계정의 모든 버킷에 상위 가드레일을 건다
aws s3control put-public-access-block \
  --account-id 111122223333 \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# 현재 상태 확인 — 감사 때 가장 먼저 찍어 보는 명령
aws s3api get-public-access-block --bucket my-secure-bucket
aws s3api get-bucket-policy-status --bucket my-secure-bucket   # IsPublic: true/false
```

`get-bucket-policy-status`가 돌려주는 `IsPublic` 값은 "S3가 이 버킷 정책을 공개로 판정하는가"를 알려 준다. 정책을 눈으로 읽어 공개 여부를 판단하지 말고 이 API에 물어보는 것이 감사의 정석이다.

### 아무도 우회할 수 없게: 계정 소유 조건

BPA가 "밖으로 나가는 공개"를 막는다면, `s3:ResourceAccount`와 `aws:PrincipalOrgID`는 "안에서 밖으로 새는 것"과 "밖에서 안으로 들어오는 것"을 막는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideOrgPrincipals",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::corp-sensitive",
        "arn:aws:s3:::corp-sensitive/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": { "aws:PrincipalOrgID": "o-abcd1234ef" },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::corp-sensitive",
        "arn:aws:s3:::corp-sensitive/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

`aws:PrincipalIsAWSService`를 함께 보는 이유는, CloudTrail이나 복제 같은 AWS 서비스 주체가 이 버킷에 쓰는 정당한 경로까지 조직 조건에 걸려 막히는 사고를 피하기 위해서다. 조직 경계 Deny를 걸 때 서비스 주체 예외를 빠뜨려 로그 전달이 끊기는 것은 실무에서 매우 흔한 자책골이다.

## 로그로 읽는 S3 접근: 관리 이벤트 vs 데이터 이벤트

침해 조사에서 가장 자주 나오는 질문은 "그래서 데이터를 실제로 읽어 갔는가"다. 이 질문에 답하려면 로그가 미리 켜져 있어야 한다.

| 기록 대상 | 어디에 남는가 | 기본값 |
|-----------|---------------|--------|
| `CreateBucket`, `PutBucketPolicy`, `PutBucketAcl` 등 **구성 변경** | CloudTrail 관리 이벤트 | **켜짐** |
| `GetObject`, `PutObject`, `DeleteObject` 등 **객체 접근** | CloudTrail **데이터 이벤트** | **꺼짐**(별도 설정·과금) |
| 요청자·응답 코드·바이트 수 등 상세 | S3 서버 액세스 로그 | 꺼짐 |

```bash
# 특정 버킷의 객체 읽기/쓰기를 데이터 이벤트로 기록
aws cloudtrail put-event-selectors \
  --trail-name org-trail \
  --advanced-event-selectors '[{
    "Name": "Log S3 data events for sensitive bucket",
    "FieldSelectors": [
      {"Field": "eventCategory", "Equals": ["Data"]},
      {"Field": "resources.type", "Equals": ["AWS::S3::Object"]},
      {"Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::corp-sensitive/"]}
    ]
  }]'
```

> ⚠️ **함정**: "S3 데이터 유출이 의심된다. CloudTrail에서 누가 무엇을 읽었는지 확인하라"는 문항의 숨은 전제는 **데이터 이벤트가 미리 켜져 있었는가**다. 켜 두지 않았다면 관리 이벤트만 남아 "정책이 언제 바뀌었는가"는 알아도 "어떤 객체가 읽혔는가"는 알 수 없다. 데이터 이벤트는 이벤트 수가 많아 비용이 크므로, 전 버킷이 아니라 민감 버킷·프리픽스로 범위를 좁혀 켜는 것이 정답 패턴이다. CloudTrail 데이터 이벤트가 "누가 API를 호출했나"라면, S3 서버 액세스 로그는 "어떤 요청이 어떤 응답을 받았나"에 가깝다 — 조사에서는 둘을 교차 검증한다.

> 🔍 **더 깊이**: S3는 객체 무결성을 위해 업로드 시 체크섬(MD5, CRC32, CRC32C, SHA-1, SHA-256)을 검증할 수 있고, `Content-MD5`나 `x-amz-checksum-*` 헤더로 전송 중 손상을 탐지한다. 또한 모든 요청을 HTTPS로 강제하려면 버킷 정책에 `aws:SecureTransport: false`를 Deny하는 조건을 넣는다(day3에서 암호화 강제와 함께 다룸). 암호화·무결성·노출방지·접근통제의 네 층이 모두 갖춰져야 "S3 데이터 보호"가 완성된다.

## 한 장으로 보는 S3 데이터 보호 계층

```
┌─ 노출 방지 ─────────────────────────────────────────────┐
│  계정 BPA (4스위치)  →  버킷 BPA  →  Object Ownership   │
│  "공개는 애초에 불가능하다"                              │
└─────────────────────────────┬───────────────────────────┘
┌─ 접근 통제 ─────────────────┴───────────────────────────┐
│  IAM 정책 ∩ 버킷 정책 ∩ VPCe 정책   (명시적 Deny 우선)   │
│  조건 키: aws:SecureTransport / aws:SourceVpce /         │
│           aws:PrincipalOrgID / s3:ResourceAccount        │
└─────────────────────────────┬───────────────────────────┘
┌─ 저장 암호화 ───────────────┴───────────────────────────┐
│  SSE-S3 │ SSE-KMS(+Bucket Key) │ DSSE-KMS │ SSE-C       │
│  KMS 키 정책 = 두 번째 인가 관문                          │
└─────────────────────────────┬───────────────────────────┘
┌─ 불변성·복구 ───────────────┴───────────────────────────┐
│  버전 관리 → Object Lock(Governance/Compliance)          │
│  + 별도 계정 복제 + MFA Delete + 수명주기                 │
└─────────────────────────────┬───────────────────────────┘
┌─ 가시성 ────────────────────┴───────────────────────────┐
│  CloudTrail 관리/데이터 이벤트 · 서버 액세스 로그 ·        │
│  Macie(민감도) · IAM Access Analyzer(외부 노출)          │
└─────────────────────────────────────────────────────────┘
```

각 층은 **독립적으로 실패**하도록 설계되어야 한다. 같은 관리자 역할이 다섯 층을 모두 끌 수 있다면 그것은 다섯 층이 아니라 한 층이다. Object Lock을 버킷 생성 시에만 켤 수 있게 한 것, 백업을 별도 계정에 두는 것, MFA Delete를 루트만 설정하게 한 것은 모두 이 독립성을 만들기 위한 장치다.

## 한 줄 요약

S3 데이터 보호는 **암호화(무엇으로 잠그나) · 불변성(지울 수 있나) · 노출 방지(공개될 수 있나) · 가시성(읽힌 걸 아나)** 네 축이다. 암호화 모드 선택은 "키 접근을 별도로 통제·감사할 필요가 있는가"로 갈리고(SSE-S3 vs SSE-KMS), 비용·스로틀은 Bucket Key로, 규제의 이중 계층 문구는 DSSE-KMS로 받는다. 불변성은 버전 관리 위에 Object Lock을 얹되 Governance와 Compliance의 차이는 "실수를 되돌릴 수 있는가"다. 그리고 이 모든 것 위에 Block Public Access가 마지막 안전벨트로 앉는다 — 정책 평가보다 먼저 적용되는 유일한 가드레일이기 때문이다.

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
