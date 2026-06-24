# Day 2 - 엔벨로프 암호화와 데이터 키: GenerateDataKey, 암호화 컨텍스트

어제 KMS key는 HSM 밖으로 나오지 않는다고 했다. 그런데 1GB짜리 파일을 암호화하려면 어떻게 할까? 1GB를 KMS API로 보내 암호화받을 수는 없다 — KMS의 `Encrypt` API는 최대 4KB까지만 받는다. 이 모순을 해결하는 것이 **봉투 암호화(envelope encryption)**다. 핵심 발상은 "데이터는 로컬에서 빠른 대칭 키로 암호화하고, *그 데이터 키만* KMS로 암호화한다"는 것이다. KMS는 작은 키 하나만 보호하면 되고, 큰 데이터 암호화는 로컬 CPU가 처리한다.

봉투 암호화는 SCS-C03에서 *반드시* 손에 익혀야 하는 개념이다. S3 SSE-KMS, EBS, RDS 암호화가 전부 내부적으로 이 메커니즘을 쓰며, 시험은 "데이터 키가 어디에 어떤 형태로 저장되는가", "복호화 흐름은 어떤 순서인가"를 집요하게 묻는다.

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

## GenerateDataKey vs GenerateDataKeyWithoutPlaintext

두 변형이 있고 시험이 구분을 묻는다.

- **`GenerateDataKey`**: 평문 + 암호문 키 *둘 다* 반환. 지금 당장 암호화해야 할 때.
- **`GenerateDataKeyWithoutPlaintext`**: 암호문 키만 반환(평문 미반환). "지금은 키만 만들어 저장해 두고, 나중에 실제 암호화 시점에 Decrypt로 평문을 얻겠다"는 지연 패턴. 키를 생성하는 주체와 실제로 암호화하는 주체가 다를 때 평문 키 노출을 줄인다.

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

## S3 버킷 키(Bucket Key): KMS 호출 비용 최적화

S3 SSE-KMS에서 객체마다 `GenerateDataKey`/`Decrypt`를 호출하면 KMS API 비용과 요청 한도가 부담이다. **S3 Bucket Key**를 켜면 S3가 버킷 수준에서 단기 버킷 키를 받아 그것으로 다수 객체의 데이터 키를 로컬 파생한다. KMS API 호출이 최대 99% 줄어 비용·throttling을 완화한다.

> 🎯 **시나리오**: "SSE-KMS를 쓰는데 객체 수가 폭증하면서 KMS `kms.amazonaws.com` throttling(`ThrottlingException`)과 비용이 급증한다." → S3 Bucket Key 활성화. 봉투 암호화의 계층을 하나 더 둬서 KMS 호출 횟수를 줄이는 패턴이다.

## DEK 캐싱과 AWS Encryption SDK

애플리케이션 레벨 암호화에는 **AWS Encryption SDK**를 쓰는 것이 권장된다. 이 SDK는 봉투 암호화를 직접 구현해 주고, 암호문 메시지 안에 *암호화된 데이터 키와 알고리즘 정보*를 함께 패키징한다. 또한 **데이터 키 캐싱(DEK caching)**으로 같은 데이터 키를 짧은 기간 재사용해 KMS 호출을 줄이되, 캐시 TTL·최대 사용 횟수·바이트 한도로 노출을 제한한다.

```
Encryption SDK 메시지 = [헤더(암호화된 데이터 키 + 컨텍스트)] + [암호화된 본문]
→ 복호화 측은 헤더의 암호화된 데이터 키만 KMS로 풀면 됨
```

> 💡 **관련 이론**: 봉투 암호화를 직접 코딩하면 평문 키 wipe 누락, 잘못된 IV 재사용 같은 실수가 생긴다. AWS Encryption SDK·DynamoDB Encryption Client·S3 Encryption Client 같은 검증된 라이브러리를 쓰는 것이 시험과 실무 모두의 모범이다. "직접 AES를 구현" 같은 보기는 거의 항상 오답이다.

## 한 줄 요약

봉투 암호화는 *데이터는 로컬 데이터 키로, 데이터 키는 KMS key로* 암호화하는 2단 구조다. `GenerateDataKey`가 평문/암호문 키 쌍을 주고, 평문 키는 즉시 폐기하며 암호문 키를 데이터와 함께 저장한다. 암호화 컨텍스트(AAD)는 암호문을 맥락에 묶고 세밀한 권한 조건을 가능하게 한다. KMS key를 무력화하면 모든 데이터 키가 잠겨 데이터가 즉시 무용화된다.

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
