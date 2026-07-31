# Day 2 - 엔벨로프 암호화와 데이터 키: GenerateDataKey, 암호화 컨텍스트

어제 KMS key는 HSM 밖으로 나오지 않는다고 했다. 그런데 1GB짜리 파일을 암호화하려면 어떻게 할까? 1GB를 KMS API로 보내 암호화받을 수는 없다 — KMS의 `Encrypt` API는 최대 4KB까지만 받는다. 이 모순을 해결하는 것이 **봉투 암호화(envelope encryption)**다. 핵심 발상은 "데이터는 로컬에서 빠른 대칭 키로 암호화하고, *그 데이터 키만* KMS로 암호화한다"는 것이다. KMS는 작은 키 하나만 보호하면 되고, 큰 데이터 암호화는 로컬 CPU가 처리한다.

봉투 암호화는 SCS-C03에서 *반드시* 손에 익혀야 하는 개념이다. S3 SSE-KMS, EBS, RDS 암호화가 전부 내부적으로 이 메커니즘을 쓰며, 시험은 "데이터 키가 어디에 어떤 형태로 저장되는가", "복호화 흐름은 어떤 순서인가"를 집요하게 묻는다.

## 왜 4KB인가: 제약이 설계를 만든다

KMS의 `Encrypt` API가 4,096바이트에서 멈추는 것은 임의의 숫자가 아니라 서비스 설계의 결과다. KMS는 모든 암호 연산을 HSM 안에서 수행하고, 그 HSM 플릿은 전 세계 수많은 계정이 공유한다. 만약 임의 크기의 데이터를 받는다면 네트워크로 평문을 왕복시켜야 하고, HSM은 데이터 크기에 비례해 시간을 쓰며, 리전 전체의 처리량이 한 고객의 큰 파일에 묶인다. 그래서 KMS는 "큰 데이터는 아예 받지 않는다"는 경계를 그었다.

이 제약이 오히려 더 나은 아키텍처를 강제한다. 데이터를 KMS로 보내지 않으니 평문이 네트워크를 타지 않고, 암호화는 호출자의 CPU(AES-NI 하드웨어 가속)에서 수행되어 훨씬 빠르며, KMS는 초당 처리해야 할 바이트가 아니라 요청 수만 관리하면 된다. **제약이 곧 보안 속성이 된 사례**다.

```
[ 만약 봉투 암호화가 없다면 ]
  앱 ──1GB 평문──→ 네트워크 ──→ KMS ──→ 1GB 암호문 ──→ 앱
  · 평문이 네트워크를 왕복  · KMS가 병목  · 대역폭 낭비

[ 봉투 암호화 ]
  앱 ──"데이터 키 하나 주세요"(수십 바이트)──→ KMS
  앱 ←─(평문 DEK 32B, 암호화된 DEK 약 200B)──── KMS
  앱: 로컬 CPU(AES-NI)로 1GB 암호화 → 평문 DEK 즉시 폐기
  · 평문 데이터는 앱 밖으로 나가지 않음  · KMS 부하 일정
```

> 💡 **관련 이론**: 이 하이브리드 구조는 KMS의 발명이 아니라 암호학의 오래된 표준 패턴이다. TLS 핸드셰이크는 비대칭 연산으로 세션 키를 합의한 뒤 실제 레코드는 대칭 키로 암호화하고, PGP/GPG는 수신자의 공개키로 세션 키를 감싸고 본문은 대칭으로 암호화한다. 공통 논리는 "비싸고 제약이 큰 연산은 *키에만* 쓰고, 싸고 빠른 연산을 *데이터에* 쓴다"이다. AWS KMS의 봉투 암호화는 이 패턴에서 "비싼 쪽"을 비대칭 연산 대신 *HSM 경계 통과*로 바꾼 변형이다.

## 데이터 키(Data Key)와 GenerateDataKey

봉투 암호화의 출발점은 `GenerateDataKey` API다. 이 호출은 *두 가지*를 동시에 돌려준다.

1. **Plaintext data key** — 실제 데이터를 암호화하는 데 쓸 평문 AES 키.
2. **Encrypted data key (CiphertextBlob)** — 같은 데이터 키를 KMS key로 암호화한 버전.

```bash
aws kms generate-data-key \
  --key-id alias/app-data-key \
  --key-spec AES_256
# 반환:
# {
#   "Plaintext": "base64...(평문 데이터 키)",
#   "CiphertextBlob": "base64...(암호화된 데이터 키)",
#   "KeyId": "arn:aws:kms:...:key/abcd-..."
# }
```

봉투 암호화 워크플로우는 다음과 같다.

```
[암호화]
1. GenerateDataKey 호출 → (평문 키, 암호화된 키) 수신
2. 평문 데이터 키로 큰 데이터를 로컬 암호화 (빠른 AES)
3. 평문 데이터 키를 메모리에서 즉시 삭제(wipe)
4. 암호화된 데이터 + 암호화된 데이터 키를 함께 저장

[복호화]
1. 저장된 암호화된 데이터 키를 KMS Decrypt에 전달
2. KMS가 평문 데이터 키를 반환
3. 평문 데이터 키로 데이터를 로컬 복호화
4. 평문 데이터 키를 메모리에서 즉시 삭제
```

> 💡 **관련 이론**: 봉투 암호화의 보안 효과는 "평문 데이터 키의 수명을 최소화"하는 데 있다. 데이터 키 평문은 *암호화 연산 직후 메모리에서 삭제*되고, 디스크에는 *암호화된 데이터 키만* 데이터 옆에 저장된다. 따라서 디스크/스토리지가 탈취돼도 KMS key 없이는 데이터 키를 풀 수 없고, 데이터 키 없이는 데이터를 풀 수 없다. KMS key를 비활성화하거나 삭제하면 전 세계의 모든 데이터 키가 풀리지 않으므로 사실상 데이터 전체가 즉시 무력화된다(crypto-shredding).

### 저장 레이아웃: 암호문 옆에 무엇이 붙어 있는가

시험이 특히 자주 묻는 지점은 "암호화된 데이터 키가 *어디에* 저장되는가"다. 답은 **데이터와 같은 곳, 데이터 옆에**다. 별도의 키 저장소가 필요 없다는 것이 봉투 암호화의 운영적 장점이다.

```
[ 봉투 암호화된 객체 하나의 실제 구성 ]

┌─────────────────────────────────────────────────────┐
│  헤더 / 메타데이터                                     │
│   · Encrypted Data Key (CiphertextBlob)  ← KMS로만 풀림 │
│   · 사용한 KMS key ARN                                │
│   · 암호화 알고리즘 (예: AES-256-GCM)                  │
│   · IV / Nonce (평문, 매번 달라야 함)                  │
│   · Encryption Context (평문, AAD로 무결성 보호)        │
├─────────────────────────────────────────────────────┤
│  본문 (Ciphertext)                                    │
│   · 평문 DEK로 로컬 암호화된 실제 데이터                 │
├─────────────────────────────────────────────────────┤
│  Auth Tag (GCM 인증 태그)                             │
└─────────────────────────────────────────────────────┘

S3 SSE-KMS에서는 위 헤더가 객체 메타데이터에,
EBS에서는 볼륨 메타데이터에, RDS에서는 스토리지 계층에 들어간다.
어느 경우든 "암호화된 DEK는 데이터와 함께 이동한다."
```

이 구조에서 나오는 중요한 성질: **암호문을 복사하면 암호화된 데이터 키도 함께 복사된다.** 그래서 S3 객체를 다른 버킷으로 복사하거나 EBS 스냅샷을 복사할 때, 대상 쪽에서 *같은 KMS 키에 접근할 수 있어야* 데이터를 읽을 수 있다. Day 3의 교차계정 시나리오와 Day 4의 스냅샷 복사 시나리오가 모두 여기서 파생된다.

> 🔍 **더 깊이**: `GenerateDataKey`가 반환하는 `CiphertextBlob`은 단순한 "암호화된 32바이트"가 아니다. 그 안에는 어떤 KMS key로 감쌌는지를 가리키는 정보와 암호화 컨텍스트에 대한 바인딩이 함께 들어 있다. 그래서 복호화할 때 `--key-id`를 지정하지 않아도 KMS가 알아서 올바른 키를 찾아 푼다(대칭 키의 경우). 반대로 말하면 **암호문 자체가 어떤 키를 요구하는지 스스로 알고 있으며, 임의로 다른 키를 지정해도 풀리지 않는다.** 다만 비대칭 키의 `Decrypt`에는 `--key-id`와 `--encryption-algorithm`을 반드시 명시해야 한다 — 비대칭 암호문에는 그 메타데이터가 들어 있지 않기 때문이다.

### 실제 명령으로 따라가 보기

봉투 암호화는 개념만 보면 추상적이므로, KMS와 OpenSSL만으로 한 번 손으로 돌려보면 구조가 확실히 각인된다.

```bash
# ── 암호화 ──────────────────────────────────────────
# 1) 데이터 키 발급 (평문 + 암호문 동시 수신)
aws kms generate-data-key \
  --key-id alias/app-data-key \
  --key-spec AES_256 \
  --encryption-context "tenant=acme,purpose=invoice" \
  --output json > dk.json

# 2) 평문 키는 파일이 아니라 셸 변수로만 (디스크에 남기지 않는다)
PLAINTEXT_KEY=$(jq -r .Plaintext dk.json)

# 3) 암호화된 데이터 키는 데이터 옆에 저장할 것이므로 파일로 보관
jq -r .CiphertextBlob dk.json | base64 -d > bigfile.dat.key

# 4) 평문 키로 로컬 암호화 (실제 데이터는 KMS로 가지 않는다)
openssl enc -aes-256-cbc -pbkdf2 \
  -in bigfile.dat -out bigfile.dat.enc -pass "pass:$PLAINTEXT_KEY"

# 5) 평문 키 즉시 폐기
unset PLAINTEXT_KEY; rm -f dk.json

# ── 복호화 ──────────────────────────────────────────
# 6) 암호화된 데이터 키를 KMS에 제시 (컨텍스트가 정확히 같아야 함)
PLAINTEXT_KEY=$(aws kms decrypt \
  --ciphertext-blob fileb://bigfile.dat.key \
  --encryption-context "tenant=acme,purpose=invoice" \
  --query Plaintext --output text)

# 7) 로컬 복호화 후 평문 키 폐기
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in bigfile.dat.enc -out bigfile.dat -pass "pass:$PLAINTEXT_KEY"
unset PLAINTEXT_KEY
```

> ⚠️ **함정**: 위 흐름에서 가장 흔한 실무 사고는 **평문 데이터 키를 디스크에 쓰는 것**이다. `aws kms generate-data-key ... > key.json`처럼 응답 전체를 파일로 저장하면 평문 키가 디스크에 남고, 그 순간 봉투 암호화의 전제가 무너진다. 같은 이유로 평문 키를 로그·디버그 출력·에러 메시지·CloudWatch Logs에 찍으면 안 된다. KMS는 응답을 로깅하지 않지만(CloudTrail의 `responseElements`가 `null`), *애플리케이션이 스스로 유출하는 것*까지 막아주지는 못한다.

## GenerateDataKey vs GenerateDataKeyWithoutPlaintext

두 변형이 있고 시험이 구분을 묻는다.

- **`GenerateDataKey`**: 평문 + 암호문 키 *둘 다* 반환. 지금 당장 암호화해야 할 때.
- **`GenerateDataKeyWithoutPlaintext`**: 암호문 키만 반환(평문 미반환). "지금은 키만 만들어 저장해 두고, 나중에 실제 암호화 시점에 Decrypt로 평문을 얻겠다"는 지연 패턴. 키를 생성하는 주체와 실제로 암호화하는 주체가 다를 때 평문 키 노출을 줄인다.

전체 데이터 키 계열 API를 한 표로 정리하면 선택이 명확해진다.

| API | 반환값 | 최대 크기 | 언제 쓰는가 |
|-----|--------|----------|-------------|
| `Encrypt` | 암호문 | 대칭 4,096B (비대칭은 더 작음) | 작은 비밀 하나를 직접 암호화 |
| `GenerateDataKey` | 평문 키 + 암호문 키 | — | 지금 바로 데이터를 암호화할 때 (기본) |
| `GenerateDataKeyWithoutPlaintext` | 암호문 키만 | — | 키 생성 주체 ≠ 암호화 주체, 사전 발급 |
| `GenerateDataKeyPair` | 비대칭 키쌍(평문 프라이빗 + 암호문 프라이빗 + 퍼블릭) | — | 데이터 키 수준에서 서명/비대칭이 필요할 때 |
| `GenerateDataKeyPairWithoutPlaintext` | 암호문 프라이빗 + 퍼블릭 | — | 위와 같되 평문 프라이빗 미노출 |
| `GenerateRandom` | 난수 | 최대 1,024B | 키가 아닌 단순 난수(솔트·토큰) |
| `ReEncrypt` | 새 키로 감싼 암호문 | 입력은 KMS 암호문 | **평문을 노출하지 않고** 키를 갈아끼울 때 |

> 🔍 **더 깊이**: `ReEncrypt`는 시험에서 저평가되기 쉬운데 실무 가치가 크다. 이 API는 KMS 내부에서 "옛 키로 복호화 → 새 키로 재암호화"를 원자적으로 수행하므로, **평문이 단 한 순간도 호출자에게 돌아오지 않는다**. 그래서 "데이터 키를 새 CMK로 옮기되 데이터 평문에는 접근 권한이 없는 자동화 주체"에게 맡길 수 있다. 권한도 `kms:ReEncryptFrom`(출발 키)과 `kms:ReEncryptTo`(도착 키)로 방향이 나뉘어 있어, "이 키에서 저 키로만 이동 가능"을 정책으로 표현할 수 있다. 수동 키 회전(Day 4) 후 옛 암호문의 DEK를 새 키로 옮기는 배치 작업이 대표적 용례다.

> ⚠️ **함정**: `GenerateRandom`을 데이터 키 생성에 쓰는 보기가 종종 등장한다. 난수를 받아 직접 키로 쓰면 *KMS로 감싸지지 않은 평문 키*가 되므로 봉투 암호화의 구조 자체가 성립하지 않는다(그 키를 다시 `Encrypt`로 감싸는 추가 왕복이 필요하다). 데이터 키가 필요하면 `GenerateDataKey`가 정답이고, `GenerateRandom`은 솔트·논스·세션 토큰처럼 *키가 아닌* 무작위 값에 쓴다.

## 암호화 컨텍스트(Encryption Context): 추가 인증 데이터

암호화 컨텍스트는 KMS 암호화 연산에 붙이는 *키-값 쌍*으로, **AAD(Additional Authenticated Data)** 역할을 한다. 암호화되지는 않지만(평문으로 CloudTrail에 기록됨) *무결성이 보장*되어, 복호화 시 *정확히 동일한* 컨텍스트를 제시하지 않으면 복호화가 실패한다.

```bash
# 암호화 시 컨텍스트 지정
aws kms encrypt \
  --key-id alias/app-data-key \
  --plaintext fileb://secret.txt \
  --encryption-context "purpose=invoice,tenant=acme"

# 복호화 시 동일 컨텍스트 필수
aws kms decrypt \
  --ciphertext-blob fileb://encrypted \
  --encryption-context "purpose=invoice,tenant=acme"
# 컨텍스트가 다르면 InvalidCiphertextException
```

암호화 컨텍스트의 두 가지 보안 용도:

1. **무결성 바인딩**: 암호문을 특정 맥락(예: 특정 테넌트, 특정 파일 ID)에 묶는다. 공격자가 다른 맥락에서 암호문을 재사용하지 못한다.
2. **세밀한 권한 통제**: 키 정책/IAM의 `kms:EncryptionContext:키이름` 조건으로 "이 컨텍스트일 때만 복호화 허용"을 강제할 수 있다.

```json
{
  "Effect": "Allow",
  "Action": "kms:Decrypt",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:EncryptionContext:tenant": "acme"
    }
  }
}
```

> ⚠️ **함정**: 암호화 컨텍스트는 *암호화되지 않는다*. 비밀번호나 PII를 컨텍스트에 넣으면 CloudTrail 로그에 평문으로 남는다. 컨텍스트에는 식별자·맥락 정보(테넌트 ID, 파일 경로)만 넣고 비밀은 넣지 않는다.

> 💡 **관련 이론**: S3 SSE-KMS는 객체별 암호화 컨텍스트로 버킷 ARN과 객체 키를 자동으로 사용한다. 이 때문에 같은 데이터 키를 다른 객체에 재사용해도 컨텍스트가 달라 교차 복호화가 막힌다. 시험에서 "암호화 컨텍스트가 다르면 복호화 실패" 패턴은 단골이다.

> 💡 **관련 이론**: 암호화 컨텍스트가 "AAD"라는 이름을 갖는 이유는 AEAD(Authenticated Encryption with Associated Data)라는 암호 모드 계열에서 왔다. NIST SP 800-38D가 정의한 AES-GCM이 대표적인데, 이 모드는 *암호화된 본문*과 *암호화되지 않은 부가 데이터*를 함께 인증 태그 계산에 넣는다. 그래서 부가 데이터를 한 글자라도 바꾸면 태그 검증이 실패하고 복호화가 거부된다. "숨기지는 않지만 바꿀 수도 없는 데이터"라는 성질이 여기서 나온다. 패킷 헤더(라우팅에 필요해 평문이어야 하지만 위조되면 안 됨)를 보호하려고 만들어진 개념이 KMS에서는 "이 암호문이 어느 테넌트·어느 객체의 것인지"를 못 박는 데 쓰이는 셈이다.

### 컨텍스트 매칭의 규칙

시험이 파고드는 세부 규칙이 몇 가지 있다.

- **키-값 쌍의 집합이 정확히 같아야 한다.** 하나라도 빠지거나 더해지면 실패한다.
- **순서는 무관하다.** `{a:1, b:2}`와 `{b:2, a:1}`은 같은 컨텍스트다.
- **키와 값 모두 대소문자를 구분한다.** `Tenant=acme`와 `tenant=acme`는 다른 컨텍스트다.
- 비대칭 키의 암·복호화에는 **암호화 컨텍스트를 쓸 수 없다.** AAD는 대칭(AEAD) 연산의 개념이기 때문이다.

정책에서는 값 비교뿐 아니라 "컨텍스트 사용 자체를 강제"하는 것도 가능하다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDecryptOnlyForOwnTenant",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...",
      "Condition": {
        "StringEquals": { "kms:EncryptionContext:tenant": "acme" }
      }
    },
    {
      "Sid": "DenyAnyCallWithoutTenantContext",
      "Effect": "Deny",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "*",
      "Condition": {
        "Null": { "kms:EncryptionContext:tenant": "true" }
      }
    }
  ]
}
```

첫 블록은 "acme 테넌트 컨텍스트일 때만 허용", 두 번째 블록은 "`tenant` 컨텍스트가 아예 없는 호출은 무조건 거부"다. 두 번째 블록이 없으면 개발자가 컨텍스트를 빠뜨린 채 암호화해도 조용히 통과하고, 그렇게 만들어진 암호문은 테넌트 격리 밖에 놓인다. **조건을 거는 것과 조건의 존재를 강제하는 것은 다르다** — SCS가 좋아하는 구분이다.

> 🎯 **시나리오**: "여러 테넌트의 데이터를 하나의 KMS 키로 암호화하되, 테넌트 A의 워크로드가 사고나 버그로 테넌트 B의 암호문을 복호화하는 일이 구조적으로 불가능해야 한다. 테넌트마다 KMS 키를 만드는 것은 키 수가 수천 개가 되어 관리·비용상 불가능하다." → 단일 CMK + **암호화 컨텍스트에 `tenant=<id>`** + 각 테넌트 역할의 IAM에 `kms:EncryptionContext:tenant` 조건을 자기 테넌트 값으로 고정. 여기에 위의 `Null` 조건 Deny를 더해 컨텍스트 누락을 봉쇄한다. 이 설계는 키 하나로 논리적 격리를 얻으므로 "테넌트당 키" 대비 비용과 운영 부담이 훨씬 낮다. 시험에서 "테넌트가 수천 개"라는 조건이 붙으면 키 분리가 아니라 컨텍스트 분리가 정답 방향이다.

> ⚠️ **함정**: 반대로 "테넌트별로 *암호학적* 격리와 개별 crypto-shredding(특정 테넌트만 데이터를 즉시 파기)이 요구된다"면 컨텍스트만으로는 부족하다. 컨텍스트 격리는 *정책이 강제하는 논리적 격리*라서, 키를 쓸 수 있는 관리자는 컨텍스트를 바꿔가며 모두 풀 수 있다. "테넌트 하나를 삭제하면 그 데이터가 즉시 복호화 불가여야 한다"는 요구가 있으면 테넌트별 키가 정답이다. 요구 문장에서 *격리 수준*과 *파기 단위*를 구분해 읽어야 한다.

## S3 버킷 키(Bucket Key): KMS 호출 비용 최적화

S3 SSE-KMS에서 객체마다 `GenerateDataKey`/`Decrypt`를 호출하면 KMS API 비용과 요청 한도가 부담이다. **S3 Bucket Key**를 켜면 S3가 버킷 수준에서 단기 버킷 키를 받아 그것으로 다수 객체의 데이터 키를 로컬 파생한다. KMS API 호출이 최대 99% 줄어 비용·throttling을 완화한다.

> 🎯 **시나리오**: "SSE-KMS를 쓰는데 객체 수가 폭증하면서 KMS `kms.amazonaws.com` throttling(`ThrottlingException`)과 비용이 급증한다." → S3 Bucket Key 활성화. 봉투 암호화의 계층을 하나 더 둬서 KMS 호출 횟수를 줄이는 패턴이다.

```
[ Bucket Key 없음 — 객체마다 KMS 왕복 ]
  PUT obj1 → S3 → KMS GenerateDataKey (호출 1)
  PUT obj2 → S3 → KMS GenerateDataKey (호출 2)
  PUT obj3 → S3 → KMS GenerateDataKey (호출 3)   ... 객체 수 = 호출 수

[ Bucket Key 사용 — 버킷 수준 키를 짧게 재사용 ]
  PUT obj1 → S3 → KMS GenerateDataKey (호출 1) → 버킷 키 확보
  PUT obj2 → S3 → 버킷 키로 로컬 파생 (KMS 호출 없음)
  PUT obj3 → S3 → 버킷 키로 로컬 파생 (KMS 호출 없음)
        ...  버킷 키 유효기간 만료 후에만 다시 KMS 호출
```

> 🔍 **더 깊이**: Bucket Key는 공짜 최적화가 아니라 *감사 해상도를 비용과 맞바꾸는* 선택이다. Bucket Key를 켜면 KMS로 가는 요청의 암호화 컨텍스트가 객체 ARN 단위가 아니라 **버킷 ARN 단위**가 되고, CloudTrail의 KMS 이벤트도 객체마다가 아니라 버킷 키를 새로 받을 때만 남는다. 즉 "어떤 객체가 언제 복호화됐는가"를 KMS 로그로 추적하던 통제가 약해진다. 객체 수준 접근 추적이 규제 요건이라면 S3 서버 액세스 로그나 CloudTrail 데이터 이벤트(S3 객체 수준)로 그 가시성을 따로 확보해야 한다. 시험에서 "객체 단위 KMS 감사 로그가 반드시 필요하다"는 제약이 붙으면 Bucket Key는 정답이 아니다.

> ⚠️ **함정**: Bucket Key는 **버킷 정책이나 IAM에서 객체 키 경로별로 `kms:EncryptionContext:aws:s3:arn` 조건을 걸어둔 설계와 충돌**할 수 있다. 컨텍스트가 버킷 ARN으로 바뀌면서 객체 경로 기반 조건이 더 이상 매칭되지 않기 때문이다. "Bucket Key를 켰더니 갑자기 AccessDenied가 난다"는 증상의 전형적 원인이다. 활성화 전에 키 정책·버킷 정책의 컨텍스트 조건을 먼저 점검해야 한다.

## CloudTrail로 봉투 암호화 흐름 읽기

봉투 암호화가 실제로 어떻게 돌아가는지는 CloudTrail의 두 이벤트 쌍으로 확인할 수 있다. 이 쌍을 읽는 능력이 SCS의 조사(investigation) 문항에서 그대로 쓰인다.

```json
// ① 객체를 저장할 때 — S3가 사용자 대신 데이터 키를 발급받는다
{
  "eventName": "GenerateDataKey",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc" },
  "sourceIPAddress": "s3.amazonaws.com",
  "requestParameters": {
    "encryptionContext": {
      "aws:s3:arn": "arn:aws:s3:::reports-bucket/2026/03/invoice-001.pdf"
    },
    "keySpec": "AES_256",
    "keyId": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-..."
  }
}

// ② 객체를 읽을 때 — S3가 암호화된 데이터 키를 풀어달라고 요청한다
{
  "eventName": "Decrypt",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc" },
  "sourceIPAddress": "s3.amazonaws.com",
  "requestParameters": {
    "encryptionContext": {
      "aws:s3:arn": "arn:aws:s3:::reports-bucket/2026/03/invoice-001.pdf"
    }
  }
}
```

여기서 조사자가 읽어야 하는 신호들:

| 관찰 | 해석 |
|------|------|
| `sourceIPAddress`가 `s3.amazonaws.com` | S3가 대신 호출 — 정상적인 SSE-KMS 경로 |
| `sourceIPAddress`가 사용자 IP + `eventName: Decrypt` | 누군가 KMS를 **직접** 호출 — `kms:ViaService`로 막을 대상 |
| 짧은 시간에 `Decrypt`가 수천 건, 컨텍스트의 객체 경로가 순차적 | **대량 반출(exfiltration) 정황** — 정상 앱은 이런 패턴을 만들지 않는다 |
| `GenerateDataKey`는 없고 `Decrypt`만 급증 | 쓰기 없이 읽기만 — 백업 스캔이거나 데이터 수집 |
| 같은 컨텍스트에 대해 `Decrypt`가 반복 실패(`InvalidCiphertextException`) | 잘못된 컨텍스트/키를 시도 — 오류이거나 탐색 행위 |

> 🎯 **시나리오**: "S3에 저장된 고객 데이터가 유출된 정황이 있다. 어떤 객체가 실제로 열렸는지 확인하라." → S3 서버 액세스 로그나 CloudTrail 데이터 이벤트가 꺼져 있어도, **SSE-KMS를 썼다면 KMS의 `Decrypt` 이벤트에 남은 `aws:s3:arn` 암호화 컨텍스트로 열린 객체를 특정할 수 있다**. 이것이 "SSE-S3 대신 SSE-KMS를 쓰라"는 권고의 감사 측면 근거다. SSE-S3에는 KMS 호출 자체가 없어서 이 흔적이 남지 않는다. 단, 앞서 말했듯 Bucket Key를 켜두면 컨텍스트가 버킷 단위가 되어 이 추적력이 떨어진다.

> 📚 **사례**: 2013년 Adobe의 대규모 계정 유출은 "암호화했다"와 "제대로 암호화했다"가 다르다는 것을 보여준 공개 사례다. 유출된 비밀번호 데이터는 평문이 아니라 암호화된 상태였지만, ECB(Electronic Codebook) 모드로 처리되어 **같은 평문이 항상 같은 암호문 블록이 됐다.** 연구자들은 복호화 없이도 암호문 패턴만 비교해 동일한 비밀번호를 쓴 계정을 무더기로 묶어냈고, 함께 유출된 비밀번호 힌트와 대조해 상당수를 복원했다. 여기서 봉투 암호화가 왜 IV/논스와 AEAD 모드를 함께 저장하는지가 드러난다. 데이터 키가 같아도 IV가 매번 다르면 같은 평문이 다른 암호문이 되고, 인증 태그가 있으면 암호문 변조도 탐지된다. AWS Encryption SDK 같은 검증된 라이브러리를 쓰라는 권고는 바로 이 부분 — 모드·IV·태그 처리 — 을 직접 구현하다 생기는 실수를 없애기 위한 것이다.

## DEK 캐싱과 AWS Encryption SDK

애플리케이션 레벨 암호화에는 **AWS Encryption SDK**를 쓰는 것이 권장된다. 이 SDK는 봉투 암호화를 직접 구현해 주고, 암호문 메시지 안에 *암호화된 데이터 키와 알고리즘 정보*를 함께 패키징한다. 또한 **데이터 키 캐싱(DEK caching)**으로 같은 데이터 키를 짧은 기간 재사용해 KMS 호출을 줄이되, 캐시 TTL·최대 사용 횟수·바이트 한도로 노출을 제한한다.

```
Encryption SDK 메시지 = [헤더(암호화된 데이터 키 + 컨텍스트)] + [암호화된 본문]
→ 복호화 측은 헤더의 암호화된 데이터 키만 KMS로 풀면 됨
```

> 💡 **관련 이론**: 봉투 암호화를 직접 코딩하면 평문 키 wipe 누락, 잘못된 IV 재사용 같은 실수가 생긴다. AWS Encryption SDK·DynamoDB Encryption Client·S3 Encryption Client 같은 검증된 라이브러리를 쓰는 것이 시험과 실무 모두의 모범이다. "직접 AES를 구현" 같은 보기는 거의 항상 오답이다.

DEK 캐싱은 **보안과 비용의 명시적 트레이드오프**이므로 세 가지 한도를 반드시 함께 설정한다.

| 캐시 한도 | 무엇을 제한하나 | 왜 필요한가 |
|-----------|----------------|-------------|
| 최대 수명(TTL) | 데이터 키가 메모리에 머무는 시간 | 키가 노출됐을 때 피해 창을 시간으로 제한 |
| 최대 메시지 수 | 한 키로 암호화할 메시지 개수 | 키 하나가 커버하는 데이터 범위를 제한 |
| 최대 바이트 수 | 한 키로 암호화할 총 바이트 | 암호학적 한계(같은 키의 과다 사용) 회피 |

> ⚠️ **함정**: DEK 캐싱은 "KMS 호출을 줄인다"는 이유만으로 무조건 켜는 최적화가 아니다. 캐시된 평문 데이터 키는 **프로세스 메모리에 살아 있는 평문 키**이고, 캐시 수명이 길수록 메모리 덤프·코어 파일·컨테이너 이미지 스냅샷을 통한 노출 창이 커진다. 또한 하나의 데이터 키가 여러 메시지를 덮으므로 "이 키가 풀리면 이만큼이 풀린다"는 폭발 반경도 커진다. 규제상 "메시지마다 고유한 데이터 키"가 요구되는 환경에서는 캐싱을 끄는 것이 정답이다.

> 🔍 **더 깊이**: AWS Encryption SDK는 **여러 키링(keyring)으로 하나의 데이터 키를 동시에 감쌀 수 있다.** 예를 들어 서울 리전 CMK와 도쿄 리전 CMK로 같은 데이터 키를 각각 감싸 두 개의 암호화된 데이터 키를 메시지 헤더에 넣으면, 어느 한 리전이 사용 불가여도 다른 리전 키로 복호화할 수 있다. 멀티 리전 키(Day 1)가 *같은 키 자료를 여러 리전에 복제*하는 접근이라면, 멀티 키링은 *서로 다른 키로 같은 DEK를 여러 번 감싸는* 접근이다. 전자는 AWS 서비스 통합 암호화(S3·EBS)에서 쓰이고, 후자는 애플리케이션 레벨 암호화에서 더 유연하다. DR 요구가 애플리케이션 데이터에 걸려 있다면 후자를 떠올릴 수 있어야 한다.

## Crypto-Shredding: 파기를 암호로 구현하기

봉투 암호화의 가장 강력한 부작용은 **데이터를 지우지 않고도 데이터를 파기할 수 있다**는 것이다. 페타바이트 규모의 백업, 여러 리전의 복제본, 오프라인 테이프까지 흩어진 데이터를 물리적으로 전부 삭제하는 것은 사실상 불가능하다. 그러나 그 데이터를 푸는 데 필요한 KMS key 하나를 파기하면, 모든 사본이 동시에 복구 불가능한 바이트 덩어리가 된다.

```
[ 정상 상태 ]
  KMS key ──푼다──→ 암호화된 DEK ──푼다──→ 데이터  ✅ 읽힘

[ KMS key 삭제 후 ]
  KMS key (파기됨)  ✗   암호화된 DEK (그대로 존재)   데이터 (그대로 존재)
  → DEK를 풀 방법이 사라짐 → 데이터는 영원히 열리지 않음
  → 백업·스냅샷·다른 리전 복제본까지 한 번에 무력화
```

> 🎯 **시나리오**: "GDPR 삭제 요청에 따라 특정 고객의 데이터를 모든 백업과 아카이브에서 제거해야 하는데, 백업은 불변(immutable) 정책으로 잠겨 있어 개별 레코드를 지울 수 없다." → 고객별(또는 테넌트별) KMS key로 암호화하는 구조를 미리 설계해 두고, 삭제 요청 시 해당 키를 `ScheduleKeyDeletion`으로 파기한다. 백업 자체는 그대로 남지만 그 고객의 레코드는 어떤 사본에서도 복호화되지 않는다. 이것이 crypto-shredding이며, 불변 백업과 삭제권을 동시에 만족시키는 사실상 유일한 설계다. 단, **이 설계는 사후에 도입할 수 없다** — 이미 공용 키로 암호화된 데이터는 키를 지우면 다른 고객 데이터까지 함께 죽는다. 요구가 나오기 전에 키 분리 단위를 정해 두는 것이 핵심이다.

> ⚠️ **함정**: crypto-shredding의 대가는 **되돌릴 수 없다는 것**이다. 그래서 KMS는 삭제에 7~30일의 대기 기간을 강제하고, 그 기간 중 키 사용 시도를 CloudTrail에 남긴다. 시험에서 "즉시 무력화하되 오탐이면 복구 가능해야 한다"면 삭제가 아니라 `disable`이고(Day 3), "영구히 복구 불가능하게 파기하라"일 때만 `ScheduleKeyDeletion`이다. 두 요구를 구분하는 문장은 대개 *reversible / recoverable / permanently* 같은 단어에 숨어 있다.

## 한 줄 요약

봉투 암호화는 *데이터는 로컬 데이터 키로, 데이터 키는 KMS key로* 암호화하는 2단 구조다. KMS의 4KB 제한은 결함이 아니라 이 구조를 강제하는 설계이며, 덕분에 평문 데이터는 네트워크를 타지 않고 KMS는 요청 수만 관리한다. `GenerateDataKey`가 평문/암호문 키 쌍을 주고, 평문 키는 즉시 폐기하며 암호문 키를 *데이터 옆에* 저장한다 — 그래서 암호문을 복사하면 키 접근 권한도 따라와야 한다. 암호화 컨텍스트(AAD)는 암호문을 맥락에 묶어 무결성을 보장하고 `kms:EncryptionContext:*` 조건으로 테넌트 격리를 가능하게 하되, 암호화되지 않으므로 비밀을 담아서는 안 된다. 그리고 KMS key를 파기하면 모든 사본의 데이터 키가 동시에 잠기는 crypto-shredding이 성립한다.

---

## 📝 연습 문제

**문제 1.** 애플리케이션이 수 GB의 파일을 KMS로 암호화하려 한다. 가장 적절한 방식은?

A) 파일 전체를 `kms:Encrypt` API로 보내 암호화받는다  
B) `GenerateDataKey`로 데이터 키를 받아 로컬에서 파일을 암호화하고, 평문 데이터 키는 폐기, 암호화된 데이터 키를 파일과 함께 저장한다  
C) 파일을 4KB 조각으로 나눠 각각 `kms:Encrypt` 호출  
D) KMS key 평문을 다운로드해 로컬에서 사용  

**정답: B**  
해설: KMS의 `Encrypt` API는 최대 4KB만 처리하므로 큰 데이터에는 봉투 암호화를 쓴다. `GenerateDataKey`로 받은 평문 데이터 키로 로컬에서 빠르게 대칭 암호화한 뒤 평문 키를 폐기하고, KMS로 암호화된 데이터 키만 데이터와 함께 저장한다. 파일을 4KB로 쪼개 호출하는 방식은 비현실적이고, KMS key 평문은 HSM 밖으로 다운로드할 수 없다.

---

**문제 2.** 암호화 컨텍스트(encryption context)에 대한 설명으로 가장 정확한 것은?

A) 컨텍스트 값은 암호화되어 안전하므로 비밀번호를 넣어도 된다  
B) 복호화 시 동일한 컨텍스트를 제시해야 하며, 컨텍스트는 암호화되지 않고 CloudTrail에 평문으로 기록되므로 비밀을 넣으면 안 된다  
C) 컨텍스트는 선택사항이며 복호화에 영향을 주지 않는다  
D) 컨텍스트는 데이터 키를 대체한다  

**정답: B**  
해설: 암호화 컨텍스트는 AAD로서 무결성이 보장되어, 복호화 시 암호화 때와 정확히 동일하지 않으면 실패한다. 그러나 값 자체는 암호화되지 않고 CloudTrail에 평문으로 남으므로 비밀번호·PII를 넣으면 안 되고, 테넌트 ID 같은 맥락 식별자만 넣는다. 컨텍스트는 데이터 키를 대체하는 것이 아니라 권한 조건과 무결성 바인딩에 쓰인다.

---

**문제 3.** SSE-KMS를 쓰는 S3 버킷에 객체가 급증하면서 KMS `ThrottlingException`과 KMS 요청 비용이 크게 늘었다. 가장 효과적인 완화책은?

A) 버킷을 SSE-S3로 전환해 암호화를 끈다  
B) S3 Bucket Key를 활성화해 버킷 수준에서 데이터 키를 파생, 객체별 KMS 호출을 대폭 줄인다  
C) 객체마다 다른 KMS 키를 만든다  
D) KMS 키를 비활성화한다  

**정답: B**  
해설: S3 Bucket Key는 S3가 버킷 수준 단기 키로 다수 객체의 데이터 키를 로컬 파생하게 해 KMS API 호출을 최대 99%까지 줄여 throttling과 비용을 완화한다. SSE-S3 전환은 KMS 기반 통제·감사를 포기하는 것이고, 객체마다 다른 키는 호출을 오히려 늘리며, 키 비활성화는 데이터를 못 읽게 만든다.

---

**문제 4.** 키를 생성하는 컴포넌트와 실제 암호화를 수행하는 컴포넌트가 분리되어 있고, 키 생성 시점에는 평문 데이터 키가 노출되지 않기를 원한다. 어떤 API가 적합한가?

A) `GenerateDataKey` (평문 포함 반환)  
B) `GenerateDataKeyWithoutPlaintext` — 암호문 키만 받아 저장하고, 실제 암호화 시점에 `Decrypt`로 평문을 얻는다  
C) `Encrypt`  
D) `GenerateRandom`  

**정답: B**  
해설: `GenerateDataKeyWithoutPlaintext`는 암호문 데이터 키만 반환하므로 키 생성 시점에 평문이 노출되지 않는다. 나중에 실제 암호화 주체가 `Decrypt`로 평문 키를 얻어 사용하는 지연 패턴에 적합하다. `GenerateDataKey`는 평문을 즉시 반환하고, `Encrypt`는 작은 데이터 직접 암호화용, `GenerateRandom`은 단순 난수 생성으로 봉투 패턴과 다르다.

---
