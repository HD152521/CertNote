# Day 36 - KMS: 키 관리가 클라우드 보안의 뿌리인 이유

암호화는 클라우드 보안에서 가장 자주 입에 오르는 단어지만, 실제로 시스템이 무너지는 지점은 거의 항상 "암호화 자체"가 아니라 "키를 누가, 어떻게, 어디서 다루느냐"다. AES-256 자체는 양자 컴퓨터가 등장해도 향후 수십 년간 깨지지 않을 것으로 보이는 반면, AWS의 보안 사고 사례를 보면 90% 이상이 "키와 자격 증명이 잘못 노출"되어 발생한다. 2017년 Verizon Wireless의 S3 버킷 노출, 2019년 Capital One의 SSRF + IAM Role 탈취, 2022년 Uber의 MFA bombing 모두 핵심은 "암호화 알고리즘이 깨졌다"가 아니라 "키 관리 체계가 무너졌다"였다.

이런 배경에서 AWS는 2014년 11월 re:Invent에서 **KMS(Key Management Service)** 를 출시했다. 그 이전에는 각 서비스가 자체 암호화를 했고 키는 사용자가 직접 관리해야 했는데, 운영 부담이 커서 실제로는 많은 회사가 암호화를 "안 하거나" "켜둔 척하고 키를 평문으로 보관"하는 경우가 많았다. KMS는 이 문제를 "관리형 키 + 호출당 과금 + 표준 SDK 통합"으로 풀었고, 이후 거의 모든 AWS 서비스(S3, EBS, RDS, DynamoDB, Lambda, Secrets Manager 등)가 KMS와 통합되면서 사실상 AWS 보안의 뿌리가 됐다. 이 글에서는 KMS가 어떤 암호학적·운영적 trade-off를 선택했는지, 봉투 암호화가 왜 거의 유일한 정답인지, 그리고 시험과 실무 양쪽에서 자주 마주치는 시나리오들을 본다.

## KMS 키의 4가지 분류와 각각이 답하는 질문

KMS의 키를 "AWS Owned / AWS Managed / Customer Managed / CloudHSM" 네 가지로 가르는 분류는 단순한 옵션 나열이 아니라, "키 통제권을 누가 얼마나 가질지"라는 스펙트럼의 네 지점을 정의한 것이다. 왼쪽 끝(Owned)은 AWS가 모든 걸 결정하고 사용자는 신경 쓸 필요가 없는 대신 통제권도 0이고, 오른쪽 끝(CloudHSM)은 사용자가 FIPS 140-2 Level 3 인증을 받은 전용 HSM을 직접 운영하는 대신 운영 부담이 매우 크다.

| 분류 | 누가 만드나 | 누가 정책 작성하나 | 비용 | 회전 | 대표 사용처 |
|------|------------|------------------|------|------|-------------|
| AWS Owned | AWS | 사용자 노출 X | 무료 | AWS 자동 | DynamoDB 기본 암호화 |
| AWS Managed (`aws/<service>`) | AWS가 첫 사용 시 자동 생성 | AWS 고정 정책 | 무료 | 1년 자동 | S3 기본 SSE-KMS, EBS 기본 |
| Customer Managed (CMK) | 사용자 | 사용자 자유 | $1/월 + $0.03/10k 호출 | 옵션(1년 또는 90일~7년) | 컴플라이언스·세밀 통제 |
| CloudHSM (XKS로 KMS 연결) | 사용자 HSM | 사용자 | HSM 인스턴스 시간당 비용 | 수동 | 규제 산업 |

이 분류에서 가장 중요한 시험 키워드는 "누가 정책을 작성할 수 있느냐"다. AWS Managed Key는 콘솔에서 보이긴 하지만 키 정책을 수정할 수 없다. 그래서 "특정 IAM Role만 이 키로 복호화 허용" 같은 세분화가 필요하면 Customer Managed Key(CMK)로 바꿔야 한다. 실무에서 흔히 보는 안티패턴은 "S3 SSE-KMS를 켜놓고 기본 키(`aws/s3`)를 그대로 쓰면서 권한 분리가 안 되어 있다"는 케이스다. 모든 IAM 사용자가 같은 키로 복호화할 수 있다면 암호화의 의미가 절반은 사라진다.

> 💡 **관련 이론**: 키 통제권의 스펙트럼은 NIST SP 800-57의 키 관리 라이프사이클(생성·배포·사용·교체·폐기)을 누가 책임지느냐의 문제다. AWS Owned는 5단계 전체를 AWS가, Customer Managed는 정책·교체·폐기를 고객이, CloudHSM은 생성부터 폐기까지 전부 고객이 책임진다. 컴플라이언스 감사관이 "키 생성 이벤트의 감사 추적"을 요구하면 AWS Owned/Managed는 답할 수 없고 CMK 이상부터만 CloudTrail에 명확히 남는다.

> 🔍 **더 깊이**: KMS 자체도 내부적으로 HSM 위에서 동작한다. 정확히는 AWS가 운영하는 **multi-tenant FIPS 140-2 Level 3** HSM 클러스터다(공식 화이트페이퍼 "AWS KMS Cryptographic Details" 참조). 즉 KMS CMK도 결국 HSM 안에 보관되며, 키 자료(key material)는 절대 HSM 밖으로 나오지 않는다. CloudHSM과의 차이는 multi-tenant냐 single-tenant냐, 그리고 컴플라이언스 인증을 AWS 명의로 받느냐 고객 명의로 받느냐다. 그래서 "내 키가 다른 고객과 같은 HSM에 있으면 안 된다"는 규제 요구가 없다면 CloudHSM이 굳이 필요하지 않다.

## 봉투 암호화: 왜 거의 모든 AWS 서비스가 이걸 쓰나

KMS의 가장 중요한 운영 패턴이자 시험에 가장 자주 나오는 개념은 **봉투 암호화(Envelope Encryption)** 다. 이름은 단순하지만 그 뒤에 숨은 트레이드오프를 이해하는 게 SAA 보안 도메인의 절반이다.

KMS의 `Encrypt` API는 한 번에 최대 **4KB** 까지만 데이터를 받는다. 그렇다면 4MB짜리 PDF나 4TB짜리 EBS 볼륨은 어떻게 암호화할까. "KMS API를 4KB씩 100만 번 부른다"가 답이라면 4TB EBS 한 번 암호화에 KMS 호출비만 $30,000을 넘게 되고, 처리량도 KMS API 한도(region당 초당 수천~수만)에 막혀 사실상 불가능하다. AWS는 이 문제를 봉투 암호화로 푼다.

```
[ 봉투 암호화 흐름 ]

1) 앱이 KMS GenerateDataKey(KeyId=CMK, KeySpec=AES_256) 호출
   ← {plaintext DEK (32바이트), encrypted DEK (~150바이트)}

2) 앱이 plaintext DEK로 4MB PDF를 AES-256-GCM으로 직접 암호화
   → ciphertext (4MB)

3) plaintext DEK를 메모리에서 즉시 제거 (zero-out)

4) ciphertext + encrypted DEK를 함께 S3에 저장

복호화:
1) S3에서 ciphertext + encrypted DEK 읽음
2) KMS Decrypt(encrypted DEK) → plaintext DEK
3) plaintext DEK로 ciphertext 복호화 → 원본 4MB PDF
4) plaintext DEK zero-out
```

핵심 통찰은 두 가지다. 첫째, **KMS 호출은 "키 한 번" 만 일어나고 실제 데이터 암호화는 앱이 빠른 대칭 키로 직접** 한다. 그래서 4MB든 4TB든 KMS 호출은 한 번뿐이다. 둘째, **plaintext DEK는 디스크에 절대 저장되지 않는다**. encrypted DEK만 데이터와 함께 저장되므로, 디스크가 통째로 유출돼도 KMS Decrypt 권한이 없으면 복호화할 수 없다.

S3, EBS, RDS, DynamoDB 모두 내부적으로 이 패턴을 쓴다. 사용자는 그냥 "SSE-KMS 켜겠습니다"만 하면 끝이지만, 내부에서는 객체마다(또는 청크마다) DEK를 생성하고 봉투로 감싸는 동작이 일어나고 있다. 2020년 4월 출시된 **S3 Bucket Keys** 는 봉투 암호화를 한 단계 더 최적화한 것으로, "객체마다 KMS GenerateDataKey를 부르지 말고, 버킷 단위로 짧은 시간(약 1주) 동안 같은 중간 키를 재사용하자"는 아이디어다. 이걸 켜면 SSE-KMS 사용 시 KMS 호출 비용이 최대 99% 감소한다. 시험에 "SSE-KMS 비용 절감"이라는 키워드가 보이면 Bucket Keys가 정답이다.

> 🔍 **더 깊이**: 봉투 암호화는 AWS만의 패턴이 아니라 1990년대 PGP/GPG가 처음 대중화한 hybrid encryption의 일반화다. PGP는 메시지를 임의의 대칭 키로 암호화하고 그 대칭 키를 받는 사람의 RSA 공개키로 암호화한다. 정확히 같은 발상이고, KMS는 RSA 공개키 대신 KMS CMK를, "사용자 메일" 대신 "S3 객체"를 대입했을 뿐이다. Google Cloud KMS, Azure Key Vault도 동일한 패턴을 쓴다.

> ⚠️ **함정**: 봉투 암호화의 가장 흔한 실수는 "plaintext DEK를 로그나 디버그 출력에 남기는 것"이다. AWS Encryption SDK는 이걸 막기 위해 plaintext DEK를 `ByteArray` 자체로 노출하지 않고 wrapping object로 감싼다. 직접 KMS API를 호출해 봉투 암호화를 구현하면 plaintext DEK 변수를 어디서 어떻게 해제하는지 항상 신경 써야 한다. Python의 `gc`로 회수되는 시점까지 메모리에 남는 문제도 있어서 `bytearray` + `[:] = b'\x00' * len(...)` 패턴으로 명시적 zero-out하는 게 표준이다.

## 키 정책 + IAM 정책 + Grant: 3단 평가의 함정

KMS의 권한 평가는 "키 정책 → IAM 정책 → Grant" 세 가지가 함께 동작하는데, **다른 모든 AWS 서비스와 달리 키 정책이 1순위이고 키 정책이 명시적으로 허용하지 않으면 IAM 정책만으로는 절대 키를 쓸 수 없다**. 이게 KMS 보안 모델의 가장 중요한 비대칭성이고, 시험에 가장 자주 나오는 함정이다.

대부분의 AWS 서비스에서는 "IAM 정책에서 허용했으면 OK"다. S3는 버킷 정책과 IAM 정책이 union으로 동작하는 게 기본이다(명시적 Deny가 없으면). 하지만 KMS는 다르다. 키 정책에 명시적으로 "이 Principal은 이 키를 쓸 수 있다"고 적혀 있어야만, 그 다음에 IAM 정책이 추가 권한을 줄 수 있다. 키 정책에 아무것도 없으면 IAM 정책의 `kms:Decrypt`도 무용지물이다.

```
[ KMS 권한 평가 흐름 ]

요청자: arn:aws:iam::111:role/app-role 이 Decrypt 호출

1단계: Key Policy 평가
   ├─ Principal에 app-role 또는 root 또는 "AWS:*" 있는가?
   │  YES → 다음 단계
   │  NO  → DENY (IAM 정책 검사도 안 함)
   │
   └─ "Enable IAM permissions" 구문이 있는가?
      ("Principal":"AWS":"arn:aws:iam::111:root", "Action":"kms:*")
      YES → IAM 정책으로 권한 위임 OK

2단계: IAM Policy 평가 (1단계가 위임한 경우만)
   ├─ app-role의 IAM 정책에 kms:Decrypt Allow 있는가?
   │  YES → 다음 단계
   │  NO  → DENY

3단계: Grant 평가 (선택적)
   ├─ AWS 서비스가 grant를 만들어둔 적 있는가?
   │  (예: RDS 백업 시 KMS grant 자동 생성)
```

기본 키 정책에 자동으로 들어가는 `"Principal":"AWS":"arn:aws:iam::111:root", "Action":"kms:*"` 구문이 바로 "IAM 정책으로 위임"의 핵심이다. 이 구문이 없으면 키 정책에 모든 사용자를 일일이 적어야 한다. 그래서 키를 생성할 때 이 구문을 실수로 빼면, 나중에 IAM 정책으로 권한을 아무리 줘도 키를 쓸 수 없는 상태가 된다. 더 위험한 건 "키 정책에서 root 권한까지 제거"한 경우인데, 이러면 그 키는 **누구도 정책을 수정할 수 없는 좀비 키** 가 된다. AWS Support에 티켓을 열어야만 복구 가능하다.

Grant는 "임시 위임"이다. 예를 들어 RDS가 암호화된 인스턴스의 자동 백업을 만들 때 KMS 권한이 필요한데, IAM Role에 권한을 매번 추가하는 대신 RDS 서비스가 grant를 만들어서 자기 자신에게 임시로 권한을 부여한다. grant는 키 정책과 별개로 동작하고, 만든 주체가 명시적으로 retire하거나 키가 삭제될 때까지 살아 있다. CloudTrail의 `CreateGrant` 이벤트를 보고 "내가 만들지 않은 grant가 있는지" 정기 점검하는 게 보안 운영의 표준 체크리스트다.

> 📚 **사례**: 2019년 Capital One 사고는 KMS 권한 모델과 직접 관련은 없지만, 사고 분석 과정에서 "S3 객체가 SSE-KMS로 암호화돼 있었더라도 IAM Role이 KMS Decrypt 권한을 가지고 있었기 때문에 데이터가 그대로 읽혔다"는 점이 강조됐다. SSE-KMS는 "디스크가 통째로 유출되는 시나리오"는 막지만 "정당한 IAM Role이 탈취되는 시나리오"는 막지 못한다. 그래서 보안 깊이를 더하려면 키 정책에 `kms:ViaService` 조건을 걸어 "이 키는 S3 호출 경로로만 쓸 수 있다"고 제한하거나, `aws:SourceVpce`로 VPC Endpoint 경로만 허용하는 식의 추가 가드레일이 필요하다.

## Key Rotation과 키 삭제의 시간 제약

자동 키 회전은 보안 베스트 프랙티스로 자주 언급되지만, KMS의 회전 모델은 흔히 오해된다. KMS의 자동 회전은 **새 key material을 생성하지만 keyId는 그대로 유지** 한다. 즉 회전 후에도 같은 alias나 keyId로 암호화·복호화가 가능하고, 회전 전에 암호화된 데이터는 이전 key material로 자동 복호화된다(KMS가 내부적으로 모든 과거 key material을 보관). 그래서 회전했다고 해서 기존 데이터를 재암호화할 필요가 없다.

| 키 종류 | 자동 회전 | 주기 | 수동 회전 |
|---------|----------|------|----------|
| AWS Owned | 자동 | AWS 결정 | 불가 |
| AWS Managed | 자동 | 1년 | 불가 |
| Customer Managed (Symmetric) | 옵션 | **1년 또는 90~2,560일 (커스텀)** | 가능(별칭 갱신) |
| Customer Managed (Asymmetric) | 불가 | - | 별칭 갱신 |
| 외부 키(imported) | 불가 | - | 새 키 import |

**90~2,560일 커스텀 회전 주기** 는 2022년 11월 출시된 비교적 새로운 기능이다. 그 전엔 1년 고정이었는데, PCI DSS 같은 일부 규정이 "90일마다 회전"을 요구해서 추가됐다. 시험 문제에 "자동 회전 주기"라는 표현이 보이면 보통 "1년"이 정답이지만, 최신 시험에서는 "90일~2,560일 사이 커스텀"이 정답인 경우도 등장한다.

비대칭 키는 자동 회전이 불가능한 이유가 있다. 비대칭 키 회전은 공개키가 바뀐다는 뜻이고, 그러면 기존에 그 공개키로 서명을 검증하던 모든 시스템이 동시에 새 공개키로 교체돼야 한다. 이건 분산 시스템에서 사실상 불가능하므로 KMS는 비대칭 키 회전을 자동화하지 않고, 사용자가 새 키를 만들고 alias만 바꿔서 점진적으로 전환하는 패턴을 권장한다.

키 삭제도 비슷한 안전장치가 있다. KMS는 **즉시 삭제를 거부** 하고 항상 7~30일의 **pending deletion window** 를 둔다. 그 기간 동안 키는 비활성화 상태이고 어떤 암호화/복호화도 수행할 수 없지만, 운영자가 실수를 깨달으면 cancel-key-deletion으로 복구할 수 있다. 이 안전장치가 없었던 2014년 출시 초기에는 "실수로 키를 삭제해서 페타바이트 단위 데이터가 복호화 불가능해진" 사고가 여러 건 있었고, 그 결과로 추가된 기능이다.

> ⚠️ **함정**: "키를 즉시 막아야 한다"는 시나리오의 정답은 "삭제"가 아니라 **비활성화(disable)** 다. 비활성화는 즉시 적용되고 모든 암호화/복호화가 차단되며, 나중에 enable로 복구할 수도 있다. 삭제는 7~30일 뒤에 실행되므로 "즉시 차단"의 답이 될 수 없다. 시험에 "유출 의심 키를 즉시 사용 중지"라는 표현이 나오면 disable이 답이다.

> 📚 **사례**: 2017년 한 핀테크 회사가 운영자가 "테스트 키"라고 생각하고 삭제 요청을 했는데, 실제로는 프로덕션 EBS 볼륨 30개에 사용 중인 CMK였다. 7일 pending window 사이에 CloudTrail의 `ScheduleKeyDeletion` 이벤트를 보고 알람이 울렸고, 6일째에 발견해서 cancel-key-deletion으로 복구했다. 이 사고 이후 회사 내부 정책으로 "프로덕션 키 삭제 요청 시 자동으로 PagerDuty + Slack #security 채널 알림"이 표준화됐다. KMS API 호출은 모두 CloudTrail에 남으므로 EventBridge rule로 `ScheduleKeyDeletion` / `DisableKey` / `PutKeyPolicy` 같은 위험 이벤트를 모두 잡아야 한다.

## Multi-Region Keys와 크로스 계정·크로스 리전

KMS 키는 기본적으로 region-bound다. 한 region에서 만든 키는 다른 region에서 직접 쓸 수 없다. 그래서 멀티 리전 DR을 설계할 때 "us-east-1에서 암호화한 S3 객체를 ap-northeast-2로 복제했더니, 복제본을 복호화할 키가 없어서 못 읽는다"는 문제가 흔히 발생한다.

이 문제를 풀기 위해 AWS는 2021년 6월 **Multi-Region Keys** 를 출시했다. 핵심은 "같은 key material을 여러 region에 복제하되 각 region에서는 같은 keyId(접두사 `mrk-`)로 보이게" 만든 것이다. us-east-1에서 암호화한 데이터를 ap-northeast-2의 동일 keyId로 복호화할 수 있고, 정책도 각 region에서 독립적으로 관리할 수 있다. 단 key material은 동기 복제되므로 한 region의 회전이 다른 region에도 자동 적용된다.

크로스 계정 사용 시에는 키 정책과 IAM 정책 양쪽에서 명시적 허용이 필요하다. 키 소유 계정의 키 정책에 `"Principal":"AWS":"arn:aws:iam::222:root"`로 다른 계정 root를 허용하고, 다른 계정에서는 IAM Role/User에 `kms:Decrypt` 권한을 부여한다. 두 정책의 교집합만 실제 권한이 된다.

```
[ 멀티 리전 + 크로스 계정 시나리오 ]

계정 A (us-east-1, 키 소유)
   ├─ Multi-Region CMK (mrk-1234)
   │   Key Policy: 계정 B root에 Decrypt 허용
   │
   └─ ap-northeast-2 replica (mrk-1234 동일 keyId)
       Key Policy: ap-northeast-2 전용 (독립 관리)

계정 B (ap-northeast-2, 사용자)
   ├─ IAM Role: kms:Decrypt 허용 + Resource = mrk-1234
   │
   └─ S3 객체 복호화 → KMS endpoint(VPC Endpoint 권장)
                       → 같은 keyId로 호출 가능
```

VPC Endpoint(KMS는 Interface Endpoint)를 쓰면 KMS API 호출이 인터넷을 거치지 않고 AWS 내부 네트워크로만 다니게 된다. 보안 요구사항이 엄격한 환경에서는 필수이고, `aws:SourceVpce` 조건을 키 정책에 추가하면 "이 키는 이 VPC Endpoint를 통해서만 쓸 수 있다"고 강제할 수도 있다.

> 💡 **관련 이론**: Multi-Region Keys는 "공유 key material + region별 독립 정책"이라는 비대칭 모델이다. CAP 정리 관점에서 보면 key material 자체는 강한 일관성을 포기하고 eventual consistency로 복제된다(복제 지연 수십 초~수 분). 그래서 한 region에서 새로 만든 데이터를 즉시 다른 region에서 복호화하려고 하면 드물게 "키를 찾을 수 없음" 에러가 발생할 수 있다. AWS는 retry + exponential backoff로 처리하라고 권장한다.

## CLI로 직접 만져보기

```bash
# CMK 생성 (대칭, 암호화/복호화용)
aws kms create-key \
  --description "saa-app-encryption-key" \
  --key-spec SYMMETRIC_DEFAULT \
  --key-usage ENCRYPT_DECRYPT \
  --tags TagKey=Environment,TagValue=production

# 별칭 부여 (key ID는 UUID라 운영에 부적합)
aws kms create-alias \
  --alias-name alias/saa-app \
  --target-key-id 1234abcd-12ab-34cd-56ef-1234567890ab

# 자동 회전 활성화 (1년 기본)
aws kms enable-key-rotation --key-id alias/saa-app

# 커스텀 회전 주기 (90일)
aws kms enable-key-rotation \
  --key-id alias/saa-app \
  --rotation-period-in-days 90

# 봉투 암호화용 DEK 생성
aws kms generate-data-key \
  --key-id alias/saa-app \
  --key-spec AES_256
# → Plaintext (base64 32바이트) + CiphertextBlob (encrypted DEK)

# 키 정책에 kms:ViaService 조건 추가 (S3에서만 사용 가능하게)
aws kms put-key-policy --key-id alias/saa-app \
  --policy-name default \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Sid":"AllowS3Only",
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::111:role/app-role"},
      "Action":["kms:Decrypt","kms:GenerateDataKey"],
      "Resource":"*",
      "Condition":{"StringEquals":{"kms:ViaService":"s3.ap-northeast-2.amazonaws.com"}}
    }]
  }'

# 키 비활성화 (즉시 사용 차단)
aws kms disable-key --key-id alias/saa-app

# 키 삭제 예약 (7~30일 대기)
aws kms schedule-key-deletion \
  --key-id alias/saa-app \
  --pending-window-in-days 30

# 잘못 예약했을 때 취소
aws kms cancel-key-deletion --key-id alias/saa-app

# Multi-Region 키 생성
aws kms create-key \
  --multi-region \
  --description "mrk for DR" \
  --region us-east-1

# 다른 region에 replica 생성
aws kms replicate-key \
  --key-id mrk-1234abcd... \
  --replica-region ap-northeast-2
```

## 정리하며

KMS는 AWS 보안의 뿌리이고, SAA 시험에서 보안 도메인(30%)의 가장 큰 비중을 차지한다. 핵심은 다음 다섯 가지로 압축된다. ① 4가지 키 분류는 "통제권 vs 운영 부담"의 스펙트럼이고, 정책을 자유롭게 쓰려면 CMK여야 한다. ② 봉투 암호화는 "키 한 번 + 데이터 직접 암호화"로 대용량 데이터를 효율적으로 처리하는 표준 패턴이고, S3 Bucket Keys는 이를 한 단계 더 최적화한 것이다. ③ KMS 권한은 키 정책 1순위이고, "Enable IAM permissions" 구문이 없으면 IAM 정책만으로는 키를 쓸 수 없다. ④ 자동 회전은 1년(또는 90~2,560일 커스텀), 비대칭 키는 자동 회전 불가. ⑤ 키 삭제는 7~30일 pending window가 있고, "즉시 차단"이 필요하면 disable이 답이다.

다음 글에서는 KMS 위에 한 층 더 올라간 비밀 관리 서비스 — Secrets Manager와 Parameter Store, 그리고 전용 HSM이 필요한 경우의 CloudHSM을 본다. KMS가 "키"를 다루는 도구라면 Secrets Manager는 "비밀번호·API 키 같은 자격증명"을 다루는 도구이고, 자동 회전과 RDS 통합이 그 핵심 가치다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 S3 SSE-KMS로 객체를 암호화하는데, KMS 호출 비용이 너무 높아 월 $50,000을 넘었다. 보안을 유지하면서 비용을 가장 크게 줄이는 방법은?

A) SSE-KMS를 끄고 SSE-S3로 전환
B) S3 Bucket Keys 활성화
C) 모든 객체를 클라이언트 측에서 직접 봉투 암호화
D) AWS Managed Key(`aws/s3`)로 전환

**정답: B**

해설: S3 Bucket Keys는 2020년 4월 출시된 기능으로, 객체마다 KMS GenerateDataKey를 부르는 대신 버킷 단위로 짧은 시간(약 1주) 동안 같은 중간 키를 재사용한다. KMS 호출 횟수를 최대 99% 줄여 비용을 극적으로 낮추면서 SSE-KMS의 보안 특성(키별 정책, CloudTrail 감사 등)을 그대로 유지한다. A는 보안 수준 다운그레이드(키 정책으로 권한 분리 불가). C는 운영 부담이 크고 동일한 효과를 얻지 못함. D는 보안에 영향은 적지만 비용 절감 효과도 미미하다.

---

**문제 2.** 한 IAM Role이 IAM 정책으로 `kms:Decrypt` 권한을 받았는데, KMS 키 정책에는 해당 Role이 명시되어 있지 않다. 또한 키 정책에 "Enable IAM permissions" 구문(root + kms:*)도 없다. 이 Role은 Decrypt를 호출할 수 있는가?

A) 가능. IAM 정책이 권한을 부여하므로
B) 불가능. 키 정책이 1순위이고 명시적 허용이 없으면 IAM 정책만으로는 안 됨
C) 가능. KMS는 IAM과 union으로 평가
D) 가능. 단 CloudTrail에 경고만 남음

**정답: B**

해설: KMS는 다른 AWS 서비스와 달리 키 정책이 1순위다. 키 정책에 명시적으로 Principal이 허용되거나, "Enable IAM permissions" 구문(`"Principal":"AWS":"arn:aws:iam::ACCT:root", "Action":"kms:*"`)이 있어야 IAM 정책으로 권한을 위임할 수 있다. 둘 다 없으면 IAM 정책의 `kms:Decrypt`도 무효다. 이게 KMS 보안 모델의 가장 큰 비대칭성이고 시험 단골 함정이다. C는 KMS 외 대부분의 서비스에 해당하는 규칙이지 KMS는 다르다.

---

**문제 3.** 한 SecOps 팀이 KMS 키가 유출됐다고 의심한다. 영향을 즉시 차단하면서 추후 분석을 위해 키 자료는 보존하고 싶다. 가장 적절한 조치는?

A) `schedule-key-deletion --pending-window-in-days 7`
B) `disable-key` 후 침해 분석, 필요 시 새 키로 마이그레이션
C) 키 정책에서 모든 Principal을 제거
D) AWS Support에 즉시 삭제 요청

**정답: B**

해설: 키 비활성화(disable-key)는 즉시 적용되고 모든 암호화/복호화를 차단한다. 키 자료는 KMS 내부에 보존되므로 나중에 enable로 복구하거나 침해 범위를 분석하는 데 쓸 수 있다. A는 7일 동안 비활성화되긴 하지만 결국 삭제로 이어져 분석 자료가 사라질 위험이 있다. C는 가능하지만 "root 권한"까지 잘못 제거하면 좀비 키가 되어 정책 수정 불가, AWS Support 개입이 필요해진다. D는 즉시 삭제 자체가 지원되지 않는다(최소 7일 pending).

---

**문제 4.** 4TB EBS 볼륨을 KMS로 암호화한다. KMS API 호출은 몇 번 일어나는가?

A) 4TB / 4KB = 약 10억 번
B) 볼륨 크기와 무관하게 매우 적은 횟수 (봉투 암호화)
C) 4TB / 64MB(EBS 블록) = 약 65,536번
D) 매 read/write마다 1번

**정답: B**

해설: EBS는 봉투 암호화를 쓴다. 볼륨 생성 시 KMS에서 DEK를 한 번 받아오고, 그 DEK로 EBS 호스트가 직접 데이터 블록을 암호화/복호화한다. KMS 호출은 볼륨 attach 시점 등 제한적으로만 일어난다. 그래서 4TB든 40TB든 KMS 호출 비용은 거의 동일하다. A는 봉투 암호화의 정의를 이해하지 못한 계산이고, C·D도 마찬가지로 모든 블록마다 KMS를 호출하지 않는다.

---

**문제 5.** 한 회사가 us-east-1과 ap-northeast-2 두 region에서 active-active 운영을 한다. 한 region에서 SSE-KMS로 암호화한 S3 객체를 다른 region에 복제(CRR)했을 때 즉시 복호화 가능하게 만들고 싶다. 가장 적합한 솔루션은?

A) 두 region에 각각 별개의 CMK를 만들고, 복제 시 재암호화
B) Multi-Region Keys로 같은 keyId(mrk-)를 양쪽에 동기화
C) us-east-1 키를 ap-northeast-2에서도 직접 호출
D) S3 Bucket Keys 활성화

**정답: B**

해설: Multi-Region Keys(2021년 출시)는 정확히 이 시나리오를 위해 설계됐다. 같은 key material을 여러 region에 동기 복제하면서 같은 keyId(접두사 `mrk-`)로 노출한다. CRR로 복제된 객체는 복제본 region의 같은 keyId로 즉시 복호화 가능하다. A는 동작하지만 재암호화 비용·복잡도가 크다. C는 KMS 키는 region-bound라 직접 호출 불가. D는 비용 최적화 기능일 뿐 멀티 리전 문제와 무관.

---

**문제 6.** 한 핀테크 회사가 컴플라이언스 감사로 "키 생성·삭제·정책 변경의 모든 이벤트가 5초 내 SecOps에 알림"을 요구받았다. KMS는 모든 API를 CloudTrail에 기록한다. 가장 적합한 자동화 패턴은?

A) CloudTrail → S3 → 일별 배치 분석
B) CloudTrail → EventBridge rule (CreateKey/ScheduleKeyDeletion/PutKeyPolicy 등) → SNS → SecOps
C) CloudWatch Logs Insights 수동 쿼리
D) Config rule로만 검사

**정답: B**

해설: CloudTrail 이벤트는 거의 실시간으로 EventBridge로 전달되고, EventBridge rule이 특정 KMS API 이벤트를 패턴 매칭해서 SNS/Lambda/Slack/PagerDuty 같은 대상으로 즉시 발송할 수 있다. 5초 내 알림이라는 요구를 만족하는 표준 패턴이다. A는 지연이 너무 크고, C는 자동화가 아니라 수동, D는 상태 점검은 가능하지만 이벤트 기반 알림은 아니다.

---

**문제 7.** 한 SaaS 회사가 멀티 테넌트 시스템을 운영하면서 "각 고객의 데이터는 고객 전용 키로 암호화되어, 한 IAM Role이 다른 고객 데이터를 절대 복호화하지 못해야 한다"는 요구를 받았다. 가장 적합한 설계는?

A) 모든 고객에 공통 CMK 1개 + IAM 정책으로 분리
B) 고객마다 별도 CMK + 키 정책에 해당 고객 전용 IAM Role만 허용 + kms:EncryptionContext로 고객 ID 강제
C) S3 SSE-S3로 충분
D) CloudHSM 단일 키 + 애플리케이션 레벨 분리

**정답: B**

해설: 테넌트별 독립 키는 "blast radius"를 테넌트 단위로 격리하는 표준 패턴이다. 키 정책에서 해당 테넌트의 IAM Role만 허용하면 다른 테넌트 Role이 잘못 호출해도 키 정책 단계에서 거부된다. 추가로 `kms:EncryptionContext`(AAD)에 테넌트 ID를 강제로 넣게 하면 같은 키를 가진 Role끼리도 컨텍스트가 다르면 복호화가 실패해 이중 가드레일이 된다. A는 단일 키라 권한 분리에 실수 한 번이면 모든 테넌트 노출. C는 키 분리 자체가 안 되고, D는 운영 부담이 과도하다.

---

해설 보강: KMS는 시험에서 가장 자주 나오는 보안 서비스이고 실무에서는 모든 다른 AWS 서비스의 암호화가 KMS를 거치므로, 봉투 암호화·키 정책 평가·회전·삭제 안전장치 네 가지를 정확히 이해하면 보안 도메인의 절반은 해결된다. 다음 글의 Secrets Manager·Parameter Store·CloudHSM은 모두 KMS와 함께 동작하므로, KMS 권한 모델을 헷갈리면 다음 주제 전체가 뒤엉킨다.
