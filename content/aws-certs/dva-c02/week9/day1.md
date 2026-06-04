# Day 41 - KMS: 암호화 키를 직접 만지지 않고 다루는 기술

암호화를 처음 배우는 개발자가 가장 먼저 부딪히는 벽은 알고리즘이 아니라 **키를 어디에 둘 것인가**라는 질문이다. AES-256으로 데이터를 암호화하는 코드는 한 줄이면 되지만, 그 256비트 키를 어디 저장할지 정하는 순간 모든 게 복잡해진다. 키를 코드에 박으면 git에 영원히 남고, 환경변수에 두면 프로세스 덤프로 새고, 파일에 두면 그 파일을 또 누가 지키느냐는 무한 후퇴가 시작된다. "암호화의 진짜 문제는 암호화가 아니라 키 관리"라는 보안 업계의 오래된 격언은 정확히 이 지점을 가리킨다. AWS KMS(Key Management Service)는 바로 그 키 관리 문제를 "키를 절대 평문으로 밖에 내보내지 않는다"는 단 하나의 설계 원칙으로 풀어낸 서비스다.

DVA-C02 시험에서 KMS는 단독 주제로도 나오지만, 그보다 S3·EBS·RDS·DynamoDB·Secrets Manager 등 거의 모든 저장 서비스의 암호화 뒤에 KMS가 있기 때문에 더 중요하다. KMS의 동작 모델 — 특히 봉투 암호화(Envelope Encryption)와 키 정책의 3중 권한 구조 — 을 이해하면 시험의 보안 섹션 절반이 풀린다. 이번 글은 KMS가 왜 키를 밖으로 안 내보내도록 설계됐는지, 4KB 한도가 어디서 나온 숫자인지, 그리고 그 한도를 우회하는 봉투 암호화가 실제로 어떻게 동작하는지를 깊이 들여다본다.

## KMS가 풀려고 한 문제: 키는 절대 밖으로 나가면 안 된다

KMS의 핵심 설계 결정은 의외로 단순하다. **CMK(Customer Master Key)의 키 재료(key material)는 어떤 API로도 평문으로 추출할 수 없다.** `kms:Encrypt`를 호출하면 KMS가 내부에서 암호화해 ciphertext만 돌려주고, `kms:Decrypt`를 호출하면 내부에서 복호화해 plaintext만 돌려준다. 키 자체는 HSM(Hardware Security Module) 경계 안에서만 존재하고 그 경계를 넘지 않는다. 이게 KMS와 "키를 만들어 파일로 다운로드받는" 전통적 PKI 도구의 근본적 차이다.

> 💡 **관련 이론**: 이 설계는 암호학의 **키 격리(key isolation)** 원칙을 클라우드 규모로 구현한 것이다. FIPS 140-2 표준은 암호화 모듈의 보안 수준을 Level 1~4로 나누는데, "키가 모듈 경계를 평문으로 넘지 않을 것"은 Level 2 이상의 핵심 요구사항이다. KMS는 멀티테넌트 HSM 위에서 FIPS 140-2 Level 3 검증을 받은 HSM(2023년부터 일부 리전)을 사용한다. 키를 추출 불가로 만든 건 편의를 희생한 게 아니라, "추출할 수 없는 것은 유출될 수 없다"는 위협 모델의 직접적 귀결이다.

> 🔍 **더 깊이**: KMS API에는 `GetKeyMaterial` 같은 함수가 의도적으로 없다. 키를 가져오는 유일한 방향은 **반대 방향** — Imported Key Material 기능으로 사용자가 자기 키를 KMS *안으로* 넣을 수만 있다. 이때도 KMS의 공개키(`GetParametersForImport`로 받은 wrapping key)로 키를 암호화해 보내야 하고, 한 번 들어가면 다시 못 꺼낸다. AWS가 키를 못 보는 BYOK(Bring Your Own Key) 시나리오에서도 이 단방향성은 유지된다. 사용자가 외부 HSM에 원본을 보관하고 KMS의 복사본을 언제든 삭제할 수 있다는 게 컴플라이언스 고객에게 중요한 통제권이다.

이 "키가 안 나간다"는 제약이 곧 KMS의 가장 큰 한계로 이어진다. 모든 암호화·복호화가 KMS API 호출을 거쳐야 하므로, 큰 데이터를 직접 KMS로 암호화하면 ① 데이터를 네트워크로 KMS에 보냈다가 ② 다시 받아와야 한다. 그래서 KMS는 직접 암호화 가능한 데이터 크기를 **최대 4KB**로 제한한다.

> ⚠️ **함정**: "4KB"라는 숫자는 시험에 거의 매번 나온다. `kms:Encrypt`로 직접 암호화할 수 있는 평문은 최대 4096바이트다. 이걸 모르면 "10MB 파일을 KMS로 암호화하는 법"에서 `kms:Encrypt` 직접 호출을 고르는 함정에 빠진다. 정답은 항상 봉투 암호화다. 4KB가 한도인 이유는 KMS가 "작은 비밀(데이터 키, 패스워드, 토큰)을 보호하는 도구"이지 "대용량 데이터를 직접 암호화하는 도구"가 아니라는 설계 의도를 반영한다.

## 봉투 암호화: 키로 키를 암호화하는 두 단계 트릭

4KB 한도를 우회하는 방법은 우아하다. KMS에게 데이터를 직접 암호화해달라고 하지 말고, **일회용 데이터 키(DEK, Data Encryption Key)를 하나 만들어달라고** 한 뒤, 그 키로 큰 데이터를 로컬에서 직접 암호화하는 것이다. KMS의 마스터 키(CMK)는 오직 그 데이터 키를 보호(암호화)하는 데만 쓰인다. 키가 키를 감싼다는 의미에서 봉투(envelope) 암호화라 부른다.

```python
import boto3, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

kms = boto3.client('kms')

# 1) KMS에 데이터 키 한 개 요청 - 평문 DEK와 암호화된 DEK를 동시에 받는다
resp = kms.generate_data_key(
    KeyId='alias/myapp-key',
    KeySpec='AES_256'
)
plaintext_dek  = resp['Plaintext']        # 32바이트 평문 키 (암호화에 사용)
encrypted_dek  = resp['CiphertextBlob']   # CMK로 암호화된 키 (데이터와 함께 저장)

# 2) 평문 DEK로 큰 데이터를 로컬에서 직접 암호화 (KMS 호출 없음)
aesgcm = AESGCM(plaintext_dek)
nonce  = os.urandom(12)
ciphertext = aesgcm.encrypt(nonce, b'...10MB of data...', None)

# 3) 평문 DEK를 메모리에서 즉시 폐기 - 이게 핵심
del plaintext_dek

# 4) 저장: [암호화된 데이터 + nonce + 암호화된 DEK]
#    암호화된 DEK는 평문으로 풀려면 반드시 KMS Decrypt를 거쳐야 함
```

복호화는 정확히 거꾸로다. 저장된 암호화된 DEK를 `kms:Decrypt`로 풀어 평문 DEK를 잠깐 받은 뒤, 그것으로 데이터를 로컬에서 복호화하고, 평문 DEK를 다시 폐기한다.

> 💡 **관련 이론**: 이 패턴은 KMS만의 발명이 아니라 PGP/GPG가 1991년부터 써온 **하이브리드 암호화**와 같은 계보다. PGP는 이메일을 대칭키(세션 키)로 빠르게 암호화하고, 그 세션 키만 수신자의 RSA 공개키로 암호화해 붙인다. 대칭 암호화는 빠르지만 키 교환이 어렵고, 비대칭 암호화는 키 교환이 쉽지만 느리다 — 둘을 합쳐 "큰 데이터는 대칭, 작은 키는 비대칭(또는 보호된 마스터 키)으로" 처리하는 게 하이브리드 암호화다. 봉투 암호화는 이 아이디어를 클라우드 키 관리에 옮긴 것이고, S3 SSE-KMS, EBS 볼륨 암호화, RDS 암호화가 전부 내부적으로 이 방식을 쓴다.

> 🔍 **더 깊이**: `GenerateDataKey`가 평문 DEK와 암호화된 DEK를 **한 번의 호출로 동시에** 돌려주는 게 핵심이다. 만약 둘을 따로 받아야 한다면 평문 DEK를 받는 API가 필요한데, 그건 "키를 평문으로 내보낸다"는 KMS의 금기를 깬다. AWS는 이 모순을 "데이터 키는 CMK가 아니다"로 해결했다 — DEK는 CMK가 그 자리에서 생성한 일회용 종속 키이고, 평문 형태로 잠깐 나가도 곧 폐기되므로 CMK 자체의 격리는 깨지지 않는다. 평문 DEK가 절대 디스크에 닿으면 안 되는 이유가 여기 있다. 디스크에 남으면 암호화된 데이터 옆에 평문 키가 같이 저장돼 암호화가 무의미해진다. 그래서 `GenerateDataKeyWithoutPlaintext`라는 변종도 있는데, 암호화된 DEK만 받아 미리 저장해두고 나중에 복호화 시점에만 평문화하는 용도다.

> 📚 **사례**: S3 SSE-KMS에서 객체 수백만 개를 한꺼번에 다루는 워크로드는 객체마다 `GenerateDataKey`를 호출하면 KMS API 한도에 부딪힌다. AWS가 2020년 도입한 **S3 Bucket Key**는 이 문제를 봉투 암호화의 한 단계를 더 추가해 해결했다 — 버킷 수준에서 짧은 시간 캐싱되는 버킷 키를 만들어 객체별 DEK 생성 시 KMS 호출을 99%까지 줄인다. 봉투 암호화의 "키로 키를 감싼다"는 발상을 한 겹 더 쌓은 셈이고, 대량 객체 환경에서 KMS 비용을 극적으로 낮춘 실제 패턴이다.

## 키 유형: 누가 키를 소유하고 통제하는가

KMS의 키는 "누가 만들고 누가 정책을 통제하느냐"에 따라 세 가지로 나뉜다. 이 구분이 시험 함정의 단골 소재다.

| 유형 | 비용 | 키 정책 제어 | 자동 회전 | 사용처 |
|------|------|--------------|-----------|--------|
| **AWS Owned Key** | 무료 | 보이지 않음 | AWS가 관리 | 고객에게 노출 안 되는 내부 암호화 |
| **AWS Managed Key** (`aws/<service>`) | 무료 | 보기만 가능 | 자동 (1년) | S3·RDS 등 서비스 기본 암호화 |
| **Customer Managed Key (CMK)** | $1/월 + API | 완전 제어 | 옵션 (1년) | 세밀한 권한·감사가 필요한 경우 |

> ⚠️ **함정**: AWS Managed Key의 자동 회전 주기는 **365일(1년)** 이다. 2022년 5월 이전 자료에는 "3년(1095일)"로 적혀 있는데, AWS가 정책을 바꿔 이제는 1년이다. 시험 문제 은행에 옛 정보가 남아 있을 수 있으니 "AWS Managed Key 회전 주기"가 나오면 1년을 고른다. CMK의 자동 회전도 기본 1년이며, 2024년부터는 사용자 지정 주기(90~2560일)도 설정할 수 있게 됐다.

> 🔍 **더 깊이**: 키 회전이 "키를 새로 만든다"가 아니라는 점이 중요하다. CMK를 회전하면 **새 키 재료(backing key)가 추가**되지만, 키의 ARN·키 ID·alias는 그대로다. 새로 암호화하는 데이터는 새 backing key로, 이미 암호화된 데이터는 그것을 만든 옛 backing key로 자동 복호화된다 — KMS가 ciphertext 헤더에 어느 backing key를 썼는지 기록해두기 때문이다. 그래서 회전 후에도 옛 데이터를 다시 암호화할 필요가 없고, 애플리케이션 코드도 ARN만 참조하므로 바뀔 게 없다. 이게 "회전했는데 옛 데이터를 못 읽는 것 아니냐"는 흔한 오해에 대한 답이다.

## 키 정책 + IAM + Grant: KMS의 3중 권한 모델

KMS 권한이 다른 AWS 서비스와 다른 결정적 지점은 **키 정책(Key Policy)이 권한의 최종 권위**라는 점이다. 대부분의 서비스는 IAM 정책만으로 접근을 통제하지만, KMS는 키 자체에 붙은 키 정책이 "이 키에 IAM 권한을 위임할지" 여부까지 결정한다.

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

이 statement가 키 정책에 **없으면**, IAM 정책에서 아무리 `kms:Decrypt`를 허용해도 효력이 없다. `root` principal을 허용한다는 건 "이 계정의 IAM 정책에 권한 위임을 인정한다"는 선언이고, 이게 빠지면 키 정책에 명시된 principal만 키를 쓸 수 있다.

> ⚠️ **함정**: "IAM 정책으로 `kms:*`를 줬는데 왜 접근이 안 되는가?"는 시험에 자주 나오는 시나리오다. 답은 키 정책에 IAM 위임 statement가 없기 때문이다. 기본 키 정책에는 이 statement가 자동으로 들어가지만, 커스텀 키 정책을 작성하면서 빠뜨리면 키를 만든 본인조차 못 쓰는 "키 잠금(key lockout)" 상태가 된다. 그래서 항상 "키 정책 + IAM 정책 둘 다 필요"가 정답이지 "IAM 정책만으로 충분"은 오답이다.

세 번째 축인 **Grant**는 코드로 임시·세밀한 권한을 부여하는 방법이다. Key Policy나 IAM을 건드리지 않고 "이 principal이 이 키로 `Decrypt`만, 이 조건에서만" 같은 일회성 권한을 발급한다.

> 🔍 **더 깊이**: Grant는 AWS 서비스가 사용자 대신 키를 써야 할 때 내부적으로 자주 쓰인다. 예를 들어 암호화된 EBS 볼륨을 EC2에 붙이면, EC2 서비스가 그 볼륨의 CMK에 대해 임시 Grant를 받아 부팅 시 복호화한다. 사용자가 키 정책을 직접 고칠 필요 없이, 서비스가 필요한 순간 최소 권한 Grant를 만들고 작업이 끝나면 폐기하는 패턴이다. Grant는 "최소 권한, 짧은 수명"을 코드로 강제하기 좋은 메커니즘이라 Lambda가 다른 사용자 대신 일시적으로 키를 써야 하는 시나리오에서도 등장한다.

## KMS API 한도와 비대칭 키

CMK 한 개의 암호화 API 처리량에는 리전·키 타입별 한도가 있다(대칭 키는 보통 초당 수만 건, us-east-1 등 큰 리전은 더 높다). 이 한도를 넘으면 `ThrottlingException`이 발생한다. 봉투 암호화가 KMS 호출을 줄여주는 두 번째 이유가 여기 있다 — 데이터마다 KMS를 호출하지 않고 DEK를 재사용·캐싱하면 API 호출 폭증을 막을 수 있다.

KMS는 대칭 키(AES-256) 외에 비대칭 키도 지원한다.

| Key Spec | 종류 | 용도 |
|----------|------|------|
| `SYMMETRIC_DEFAULT` (AES-256) | 대칭 | 일반 암호화 (대부분) |
| `RSA_2048` / `RSA_3072` / `RSA_4096` | 비대칭 | 암호화 + 서명/검증 |
| `ECC_NIST_P256` / `P384` | 비대칭 | 서명/검증만 (암호화 불가) |
| `HMAC_*` | 대칭 MAC | 메시지 인증 코드 생성/검증 |

> ⚠️ **함정**: ECC(타원곡선) 키는 **서명·검증만 되고 암호화는 안 된다**. ECDSA는 서명 알고리즘이지 암호화 알고리즘이 아니기 때문이다. "데이터를 비대칭 키로 암호화"가 필요하면 RSA를 골라야 한다. 또 비대칭 키는 공개키를 `GetPublicKey`로 내보낼 수 있어, 외부 시스템이 공개키로 암호화하고 KMS 안에서만 개인키로 복호화하는 시나리오가 가능하다 — 대칭 키와 달리 공개키는 격리 대상이 아니다.

## Multi-Region Key와 키 삭제의 안전장치

기본 CMK는 리전에 종속된다. ap-northeast-2에서 암호화한 데이터는 다른 리전의 KMS로는 복호화할 수 없다. 멀티 리전 워크로드(S3 Cross-Region Replication, DynamoDB Global Tables)에서 이게 걸림돌이 되므로, **Multi-Region Key**는 같은 키 ID를 가진 복제본을 여러 리전에 두어 한 리전에서 암호화한 것을 다른 리전에서 복호화할 수 있게 한다.

키 삭제에는 강력한 안전장치가 있다. `ScheduleKeyDeletion`을 호출하면 즉시 삭제되지 않고 **7~30일의 대기 기간(waiting period)** 이 시작된다. 이 기간 동안 키는 `PendingDeletion` 상태로 사용 불가지만 취소(`CancelKeyDeletion`)는 가능하다.

> 💡 **관련 이론**: 키를 즉시 못 지우게 한 건 "되돌릴 수 없는 파괴적 작업에 시간 지연을 둔다"는 안전 설계의 전형이다. CMK가 삭제되면 그 키로 암호화된 모든 데이터가 영구히 복호화 불가능해진다 — 백업도 소용없다. 이런 비가역적 작업에 7~30일의 유예를 둬 실수나 악의적 삭제를 되돌릴 창을 제공한다. S3 객체 버전 삭제의 MFA Delete, RDS의 최종 스냅샷 강제와 같은 철학이다. 즉시 삭제 옵션이 아예 없다는 점이 시험 포인트다.

## CloudHSM과의 경계: 언제 KMS로 부족한가

KMS는 멀티테넌트 HSM 위에서 동작한다 — 여러 고객의 키가 논리적으로는 격리되지만 물리적 HSM은 공유된다. 규제가 매우 강한 산업(특정 금융·정부)에서는 "내 키 전용 하드웨어"가 요구되기도 한다. 이때 쓰는 게 CloudHSM이다.

| 항목 | KMS | CloudHSM |
|------|-----|----------|
| 관리 | 완전 관리형 | 고객 관리(클러스터 운영) |
| 격리 | 멀티테넌트(논리적) | 싱글테넌트(전용 HW) |
| 표준 | FIPS 140-2 Level 2~3 | FIPS 140-2 Level 3 |
| API | AWS SDK | PKCS#11, JCE, KSP |
| 비용 | 키당 $1 + API | 인스턴스당 시간 과금 |

> 🔍 **더 깊이**: KMS는 CloudHSM을 **custom key store**로 연결할 수 있다. 이러면 키 재료는 사용자 전용 CloudHSM 클러스터에 보관되고, 평소엔 친숙한 KMS API로 호출하되 실제 암호 연산은 전용 HW에서 일어난다. "KMS의 편의 + CloudHSM의 전용 격리"를 합치는 패턴이다. 시험에서 "키를 AWS가 절대 볼 수 없어야 하고 전용 HW가 필요하다"는 규제 시나리오가 나오면 CloudHSM(또는 KMS custom key store)이 정답이고, 일반적인 "관리형 키 암호화"는 KMS다.

## CLI로 만져보기

```bash
# 1) CMK 생성 + alias 부여
aws kms create-key --description "myapp prod key"
aws kms create-alias --alias-name alias/myapp-key --target-key-id <key-id>

# 2) 자동 회전 활성화 (1년)
aws kms enable-key-rotation --key-id alias/myapp-key
aws kms get-key-rotation-status --key-id alias/myapp-key

# 3) 봉투 암호화용 데이터 키 발급
aws kms generate-data-key --key-id alias/myapp-key --key-spec AES_256

# 4) 4KB 이하 직접 암호화 (예: 설정 토큰)
aws kms encrypt --key-id alias/myapp-key --plaintext fileb://token.bin --output text --query CiphertextBlob

# 5) 키 삭제 예약 (최소 7일 대기)
aws kms schedule-key-deletion --key-id <key-id> --pending-window-in-days 7
```

## 정리하며

KMS가 풀려던 문제는 "키를 절대 평문으로 밖에 내보내지 않으면서도 암호화를 편하게 쓰게 하기"였다. 그 제약에서 4KB 한도가 나왔고, 그 한도를 우회하는 봉투 암호화가 AWS 전체 저장 암호화의 표준이 됐다. 권한은 키 정책이 최종 권위이며 IAM 위임 statement가 빠지면 키가 잠긴다는 점, 키 삭제에 7~30일 유예가 있다는 점, ECC는 서명만 되고 암호화는 RSA라는 점 — 이 미세한 차이들이 시험 함정의 핵심이다.

다음 글에서는 KMS 위에 한 겹 더 얹혀, 비밀의 저장과 **자동 회전**까지 책임지는 Secrets Manager와, 더 가볍고 계층적인 Parameter Store를 본다.

---

## 📝 연습 문제

**문제 1.** 10MB 파일을 KMS로 암호화하려 한다. 올바른 방법은?

A) `kms:Encrypt` API로 파일을 직접 암호화
B) `GenerateDataKey`로 데이터 키를 받아 로컬에서 암호화하는 봉투 암호화
C) 파일을 4KB 조각으로 나눠 각각 `kms:Encrypt` 호출
D) KMS로는 불가능, 직접 AES 키를 만들어 파일에 저장

**정답: B**

해설: `kms:Encrypt`로 직접 암호화할 수 있는 평문은 **최대 4KB**다. 10MB는 이 한도를 크게 넘으므로 봉투 암호화를 써야 한다 — `GenerateDataKey`로 평문 DEK와 암호화된 DEK를 동시에 받아, 평문 DEK로 큰 데이터를 로컬에서 암호화하고 평문 DEK는 즉시 폐기한다. C)처럼 조각내 매번 KMS를 호출하면 API 한도와 비용 폭증을 부른다. D)는 키 관리를 사용자가 떠안는 안티패턴. 4KB 한도는 KMS가 "작은 비밀을 보호하는 도구"라는 설계 의도의 반영이다.

---

**문제 2.** Customer Managed Key에 대해 IAM 정책으로 `kms:Decrypt`를 허용했는데도 복호화가 거부된다. 가장 가능성 높은 원인은?

A) CMK가 비대칭 키여서
B) 키 정책에 IAM 권한 위임(root principal Allow) statement가 없어서
C) 키 회전이 비활성화돼서
D) 리전이 us-east-1이 아니어서

**정답: B**

해설: KMS는 키 정책이 권한의 최종 권위다. 키 정책에 `Principal: {"AWS": "...:root"}` 형태의 IAM 위임 statement가 없으면, IAM 정책에서 아무리 `kms:Decrypt`를 허용해도 효력이 없다. 기본 키 정책에는 이 statement가 자동으로 들어가지만 커스텀 정책 작성 시 빠뜨리기 쉽다. 그래서 KMS 접근은 항상 "키 정책 + IAM 정책 둘 다 필요"가 정답이다. A) 비대칭이어도 Decrypt 자체는 가능. C) 회전은 권한과 무관. D) 리전 강제는 CloudFront ACM 인증서 이야기지 KMS 복호화와 무관.

---

**문제 3.** AWS Managed Key(`aws/s3` 등)의 자동 키 회전 주기는?

A) 90일
B) 1년(365일)
C) 3년(1095일)
D) 회전하지 않음

**정답: B**

해설: AWS Managed Key의 자동 회전은 **1년(365일)** 이다. 2022년 5월 이전에는 3년(1095일)이었으나 AWS가 정책을 변경했다. 옛 학습 자료나 문제 은행에 "3년"이 남아 있을 수 있으니 주의한다. CMK의 기본 자동 회전도 1년이며, 2024년부터 사용자 지정 주기(90~2560일) 설정도 가능해졌다. 회전은 새 backing key를 추가할 뿐 ARN·키 ID·alias는 그대로라, 회전 후에도 옛 데이터를 다시 암호화할 필요가 없다.

---

**문제 4.** 데이터를 **비대칭 키로 암호화**해야 하는 요구사항이 있다. 적합한 KMS Key Spec은?

A) `ECC_NIST_P256`
B) `RSA_2048`
C) `HMAC_256`
D) `SYMMETRIC_DEFAULT`

**정답: B**

해설: 비대칭 암호화가 필요하면 RSA 키여야 한다. ECC(타원곡선) 키는 **서명·검증만 가능하고 암호화는 불가능**하다 — ECDSA가 서명 알고리즘이기 때문이다. C) HMAC은 메시지 인증 코드(MAC) 생성·검증용 대칭 키. D) SYMMETRIC_DEFAULT는 대칭(AES-256)이라 "비대칭" 요구를 충족하지 못한다. 비대칭 RSA 키는 공개키를 `GetPublicKey`로 내보내 외부에서 암호화하고 KMS 안에서만 복호화하는 패턴에 쓰인다.

---

**문제 5.** 실수로 삭제하면 안 되는 프로덕션 CMK가 있다. 키를 삭제 요청했을 때 KMS의 동작은?

A) 즉시 영구 삭제된다
B) 7~30일 대기 기간 후 삭제되며, 대기 중 취소할 수 있다
C) 백업본이 자동 생성되어 언제든 복구 가능하다
D) IAM 관리자 승인 후 즉시 삭제된다

**정답: B**

해설: `ScheduleKeyDeletion`은 즉시 삭제하지 않고 **7~30일의 대기 기간**을 둔다. 이 기간 동안 키는 `PendingDeletion` 상태(사용 불가)이지만 `CancelKeyDeletion`으로 취소할 수 있다. CMK가 삭제되면 그 키로 암호화된 모든 데이터가 영구 복호화 불가가 되므로(백업도 소용없음), 비가역적 작업에 유예를 두는 안전 설계다. 즉시 삭제 옵션은 존재하지 않는다. C) KMS는 키 백업을 자동 생성하지 않는다.

---

**문제 6.** S3 SSE-KMS로 매일 수백만 개의 객체를 암호화하는 워크로드가 KMS API throttling에 걸린다. 비용과 호출을 줄이는 가장 적합한 방법은?

A) CMK를 비대칭 키로 변경
B) S3 Bucket Key 활성화
C) 키 회전 주기를 늘림
D) 객체를 4KB 이하로 분할

**정답: B**

해설: S3 Bucket Key는 봉투 암호화에 버킷 수준 캐시 키를 한 겹 더 추가해 객체별 `GenerateDataKey` KMS 호출을 최대 99%까지 줄인다. 대량 객체 환경에서 KMS 비용과 throttling을 모두 해소하는 표준 패턴이다. A) 비대칭 키는 처리량이 더 낮아 역효과. C) 회전 주기는 호출 빈도와 무관. D) 4KB 분할은 호출 수를 오히려 폭증시킨다. "S3 + KMS 비용/한도 절감"이 보이면 Bucket Key가 정답이다.

---

**문제 7.** 규제 요구사항상 키를 **전용 하드웨어**에 보관하고 AWS도 키 재료에 접근할 수 없어야 한다. 적합한 선택은?

A) KMS Customer Managed Key
B) KMS AWS Managed Key
C) CloudHSM(또는 KMS custom key store로 연결)
D) Secrets Manager

**정답: C**

해설: KMS는 멀티테넌트 HSM(논리적 격리) 위에서 동작한다. "전용 하드웨어 + AWS도 키 접근 불가"라는 강한 규제 요구는 싱글테넌트 전용 HW인 CloudHSM(FIPS 140-2 Level 3)으로 충족한다. KMS의 custom key store로 CloudHSM을 연결하면 친숙한 KMS API를 쓰면서 키는 전용 HW에 보관할 수 있다. A·B) KMS 키는 멀티테넌트라 "전용 HW" 요구를 못 채운다. D) Secrets Manager는 비밀 저장 서비스이지 키 격리 HW가 아니다.
