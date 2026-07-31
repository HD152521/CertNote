# Day 1 - AWS KMS 기초: CMK 종류, 키 정책 vs IAM, 대칭/비대칭 키

암호화의 본질은 "데이터를 못 읽게 만드는 것"이 아니라 "키를 통제하는 것"이다. AES-256으로 암호화한 데이터는 키가 없으면 무의미한 바이트 덩어리지만, 키를 가진 누군가는 데이터를 평문으로 본다. 따라서 클라우드 보안에서 암호화 논의는 거의 항상 *키 관리*로 귀결된다 — 누가 키를 만들고, 누가 쓰며, 누가 그 사용을 감사하는가. AWS Key Management Service(KMS)는 이 세 가지를 IAM·키 정책·CloudTrail로 통제하는 관리형 키 관리 서비스다.

KMS의 핵심 개념은 **KMS key(예전 명칭 CMK, Customer Master Key)**다. 이 키는 KMS의 FIPS 140-2 검증된 HSM(Hardware Security Module) 경계 밖으로 *절대 평문으로 나오지 않는다*. 우리가 KMS에 보내는 것은 "이 데이터를 암호화/복호화해 달라"는 API 호출이고, KMS는 HSM 내부에서 연산만 수행해 결과를 돌려준다. 키 자체를 다운로드할 수 없다는 점이 KMS의 보안 모델 전체를 떠받친다.

## 키 계층(Key Hierarchy): 왜 키가 여러 층인가

암호 시스템을 설계할 때 "키 하나로 전부 암호화"는 최악의 구조다. 그 키가 유출되면 전부가 무너지고, 그 키를 회전하려면 전체 데이터를 재암호화해야 하며, 그 키를 쓰는 모든 주체가 같은 권한을 갖는다. 그래서 현대 키 관리는 **계층(hierarchy)**을 쓴다. 위층 키는 아래층 키만 보호하고, 실제 데이터는 맨 아래 키가 암호화한다.

```
[ AWS KMS 키 계층 ]

  ┌──────────────────────────────────────────────┐
  │  AWS KMS 도메인 키 (AWS 내부, 고객 비가시)      │
  │  · HSM 플릿 전체가 공유하는 최상위 보호 키       │
  │  · 리전별로 격리, AWS가 주기적으로 교체          │
  └────────────────────┬─────────────────────────┘
                       │ 암호화(wrap)
                       ▼
  ┌──────────────────────────────────────────────┐
  │  KMS key (CMK) — 고객이 보는 최상위 키          │
  │  · HSM 경계 밖으로 평문 유출 없음               │
  │  · 키 정책 + IAM + grant 로 사용 통제           │
  │  · CloudTrail 에 모든 사용 기록                 │
  └────────────────────┬─────────────────────────┘
                       │ 암호화(wrap)  ← GenerateDataKey
                       ▼
  ┌──────────────────────────────────────────────┐
  │  Data Key (DEK) — 실제 데이터를 암호화하는 키    │
  │  · 평문은 호출자 메모리에만 잠깐 존재            │
  │  · 암호문 형태로 데이터 옆에 저장                │
  └────────────────────┬─────────────────────────┘
                       │ 암호화
                       ▼
              [ 실제 데이터 (S3 객체 / EBS 블록 / RDS 페이지) ]
```

이 그림은 이번 주 전체의 지도다. Day 2는 아래 두 층(데이터 키 ↔ 데이터), Day 3은 가운데 층의 접근 통제(키 정책·grant), Day 4는 이 계층이 서비스별로 어떻게 구현되는지를 다룬다.

> 💡 **관련 이론**: NIST SP 800-57(Recommendation for Key Management)은 키를 용도별로 계층화하고 각 층에 서로 다른 **암호기간(cryptoperiod)**을 부여하라고 권고한다. 상위 키(KEK, Key Encryption Key)는 노출 표면이 작아 오래 쓸 수 있고, 하위 키(DEK, Data Encryption Key)는 노출 빈도가 높아 자주 갱신한다. KMS key는 KEK, 데이터 키는 DEK에 해당한다. 이 분리 덕분에 "KEK를 회전해도 데이터 재암호화가 필요 없다"(Day 4의 자동 회전)와 "KEK를 파기하면 모든 DEK가 잠긴다"(crypto-shredding)가 동시에 성립한다.

> 🔍 **더 깊이**: KMS key의 키 자료는 여러 AZ에 걸친 HSM 플릿에 내구성 있게 복제되지만, 그 복제본조차 도메인 키로 암호화된 상태다. AWS 운영자도 평문 키 자료에 접근할 수 없도록 설계됐고, HSM에 대한 관리 동작은 쿼럼 기반 다자 승인으로만 가능하다. 그래서 "KMS key를 백업하라"는 요구는 성립하지 않는다 — 내보낼 수 없기 때문이다. 대신 내구성은 AWS가 책임지고, 고객이 키 자료를 직접 보관하고 싶으면 `EXTERNAL`(BYOK)이나 외부 키 스토어(XKS)를 선택해 그 책임을 넘겨받는다.

## KMS key의 세 가지 종류

KMS key는 *누가 키를 소유·관리하느냐*에 따라 세 종류로 나뉜다. 시험은 이 구분과 각각의 키 정책 통제 가능 여부를 자주 묻는다.

| 종류 | 누가 생성/관리 | 키 정책 편집 | 회전 | 과금 | 교차계정 공유 |
|------|---------------|-------------|------|------|--------------|
| AWS managed key (`aws/서비스명`) | AWS가 서비스 대신 생성 | 불가(읽기만) | 매년 자동(고정) | 키 자체 무료, 사용량 과금 | 불가 |
| Customer managed key (CMK) | 고객이 생성·소유 | 완전 통제 | 옵션(자동/수동) | 월 \$1/키 + 사용량 | 가능(키 정책으로) |
| AWS owned key | AWS가 다수 계정 공용 | 보이지 않음 | AWS 관리 | 무료 | 해당 없음 |

> 💡 **관련 이론**: 시험에서 "키 정책을 직접 편집해 세밀한 접근 통제를 적용하고, 키 회전 주기를 통제하며, 교차계정으로 공유하고 싶다"는 요구가 나오면 답은 거의 항상 **customer managed key**다. AWS managed key는 편의성은 높지만 키 정책이 AWS에 의해 고정돼 있어 거버넌스 요구를 충족하지 못한다. AWS owned key는 콘솔에서 보이지도 않으며 통제 대상이 아니다.

`aws/s3`, `aws/ebs`, `aws/rds` 같은 별칭(alias)을 가진 키가 AWS managed key다. 이들은 사용자가 별도 키를 지정하지 않고 "기본 암호화"를 켰을 때 자동으로 쓰인다. 반면 CMK는 사용자가 `kms create-key`로 만들고 `key-id`/`alias`로 명시적으로 참조한다.

키를 참조하는 식별자는 네 가지 형태가 있고, 정책과 CLI에서 어떤 형태를 쓰느냐가 실무 사고의 원인이 된다.

```
key ID    : 1234abcd-12ab-34cd-56ef-1234567890ab
key ARN   : arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...
alias name: alias/app-data-key
alias ARN : arn:aws:kms:ap-northeast-2:111122223333:alias/app-data-key

멀티 리전 키는 key ID가 mrk- 로 시작한다:
            mrk-1234abcd12ab34cd56ef1234567890ab
```

> ⚠️ **함정**: IAM 정책의 `Resource`에는 **key ARN만** 쓸 수 있고 별칭 ARN은 리소스로 동작하지 않는다. 별칭으로 접근을 제어하려면 `kms:ResourceAliases`(키에 붙은 별칭) 또는 `kms:RequestAlias`(요청에서 사용한 별칭) 조건 키를 써야 한다. 또한 별칭은 *언제든 다른 키를 가리키도록 변경*될 수 있으므로, 별칭 기반 통제는 "별칭 변경 권한"까지 함께 통제하지 않으면 우회 경로가 된다.

### 키 상태(Key State): 왜 갑자기 안 되는가

KMS 키는 상태 머신을 가지며, 상태에 따라 허용되는 API가 달라진다. 시험은 "암호화는 되는데 복호화가 안 된다", "키가 있는데 `KMSInvalidStateException`이 난다" 형태로 이 표를 묻는다.

| 상태 | 의미 | 암·복호화 가능? | 되돌릴 수 있나 |
|------|------|----------------|---------------|
| `Enabled` | 정상 | 가능 | — |
| `Disabled` | 관리자가 비활성화 | **불가**(`DisabledException`) | 예 — `enable-key`로 즉시 복구 |
| `PendingDeletion` | 삭제 예약(7~30일 대기) | **불가** | 예 — 대기 중 `CancelKeyDeletion` |
| `PendingImport` | `EXTERNAL` 키인데 키 자료 미반입 | **불가** | 예 — 키 자료 반입 |
| `Unavailable` | 커스텀 키 스토어(CloudHSM/XKS) 연결 끊김 | **불가** | 예 — 키 스토어 재연결 |

핵심은 **`Disabled`와 `PendingDeletion`은 API를 막을 뿐 키 자료를 지우지 않는다**는 것이다. 그래서 되돌릴 수 있다. 대기 기간이 끝나 실제 삭제되는 순간에만 키 자료가 파기되고, 그 시점부터 복호화는 물리적으로 불가능하다.

### CLI로 키를 만들고 확인하기

```bash
# 1) 고객 관리형 대칭 키 생성
aws kms create-key \
  --description "app-data-key" \
  --key-usage ENCRYPT_DECRYPT \
  --key-spec SYMMETRIC_DEFAULT \
  --tags TagKey=Environment,TagValue=prod

# 반환(발췌)
# {
#   "KeyMetadata": {
#     "KeyId": "1234abcd-12ab-34cd-56ef-1234567890ab",
#     "Arn": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...",
#     "KeyState": "Enabled",
#     "KeyUsage": "ENCRYPT_DECRYPT",
#     "KeySpec": "SYMMETRIC_DEFAULT",
#     "Origin": "AWS_KMS",
#     "MultiRegion": false,
#     "KeyManager": "CUSTOMER"        ← AWS managed key면 "AWS"
#   }
# }

# 2) 사람이 읽는 이름(별칭) 붙이기
aws kms create-alias \
  --alias-name alias/app-data-key \
  --target-key-id 1234abcd-12ab-34cd-56ef-1234567890ab

# 3) 특정 키가 고객 관리형인지 AWS 관리형인지 한 번에 판별
aws kms describe-key --key-id alias/aws/s3 \
  --query 'KeyMetadata.[KeyManager,KeyState,Origin]' --output text
# AWS   Enabled   AWS_KMS
```

> 🔍 **더 깊이**: `KeyManager` 필드가 `AWS`면 AWS managed key다. 이 키들은 콘솔에서 "AWS 관리형 키" 탭에 보이지만 키 정책 편집 버튼이 비활성화돼 있다. 흥미로운 점은 AWS managed key도 계정 안에 *실재하는 키*이고 CloudTrail에 사용 기록이 남는다는 것이다. 즉 감사 자체는 가능하다. 불가능한 것은 *정책 편집·교차계정 공유·회전 주기 변경*이다. "감사가 안 된다"와 "통제가 안 된다"를 혼동하지 말자 — AWS owned key는 아예 계정에 보이지 않으므로 감사도 통제도 불가능하다.

> 📚 **사례**: 2019년 Capital One 침해는 암호화의 한계를 가장 명확히 보여준 공개 사례다. 공격자는 WAF 구성의 SSRF 취약점으로 EC2 인스턴스 메타데이터 서비스(IMDSv1)에 도달해 인스턴스 역할의 임시 자격증명을 얻었고, 그 자격증명으로 S3 버킷의 데이터를 가져갔다. 대상 데이터는 저장 암호화가 적용돼 있었지만, 탈취된 역할이 **복호화 권한을 정당하게 보유**했기 때문에 암호화는 방어선이 되지 못했다. 교훈은 두 가지다. 첫째, 저장 암호화는 "디스크·백업 매체의 물리적 유출"과 "권한 없는 주체의 직접 스토리지 접근"을 막을 뿐, 권한을 탈취당한 경우를 막지 못한다. 둘째, 그래서 KMS의 가치는 암호화 자체가 아니라 *키 정책으로 복호화 주체를 좁히고*(Day 3의 `kms:ViaService`·조건 키) *CloudTrail로 이상 복호화를 탐지하는* 데 있다.

## 키 정책(Key Policy) vs IAM 정책: KMS만의 권한 모델

대부분의 AWS 서비스는 IAM 정책만으로 접근이 결정되지만, **KMS는 IAM과 키 정책이 함께 작동하는 이중 권한 모델**을 쓴다. 이것이 KMS 권한 디버깅을 어렵게 만드는 핵심이다.

- **키 정책(key policy)**: 모든 KMS key에 반드시 하나 붙는 리소스 기반 정책. 키에 대한 *권한의 1차 원천*이다.
- **IAM 정책**: 계정 내 프린시펄(사용자/역할)에 붙는 자격 기반 정책.

규칙: **키 정책이 IAM에 위임(delegation)하지 않으면, IAM 정책만으로는 키를 쓸 수 없다.** 키를 처음 만들 때 대부분 다음 구문이 기본 키 정책에 들어간다.

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

이 구문이 "이 계정의 IAM 정책이 KMS 권한을 부여할 수 있도록 허용한다"는 위임이다. `root`는 루트 사용자만을 뜻하는 게 아니라 *계정 전체에 권한 결정을 IAM으로 위임*한다는 의미다. 만약 이 구문을 지우면, 키 정책에 명시되지 않은 누구도(심지어 관리자도) 키를 쓸 수 없어 키가 "고아"가 될 수 있다.

> ⚠️ **함정**: "키 정책에서 `Enable IAM User Permissions` 구문을 삭제했더니 아무도 키에 접근 못 한다"는 시나리오. 이때는 키 정책에 직접 프린시펄을 추가하거나, 최후의 수단으로 AWS Support에 문의한다. 키 정책을 함부로 비우면 안 된다.

평가 흐름: KMS 요청은 (1) 키 정책이 명시적으로 허용하거나 IAM에 위임 + IAM이 허용, 그리고 (2) 어떤 정책에도 명시적 Deny가 없을 때 통과한다. 명시적 Deny는 언제나 우선한다.

```
[ KMS 요청 권한 평가 순서 ]

  kms:Decrypt 요청 (Principal = role/app)
        │
        ▼
  ① SCP(Organizations)에서 Deny?  ──── 예 ──→ 거부
        │ 아니오
        ▼
  ② 키 정책에 명시적 Deny?         ──── 예 ──→ 거부
        │ 아니오
        ▼
  ③ 키 정책이 프린시펄을 직접 Allow? ─── 예 ──→ ⑥으로
        │ 아니오
        ▼
  ④ 키 정책이 계정 root에 위임(kms:*)? ─ 아니오 ─→ 거부 (IAM 아무리 열어도 소용없음)
        │ 예
        ▼
  ⑤ IAM 자격 기반 정책이 Allow?      ── 아니오 ─→ 거부
        │ 예
        ▼
  ⑥ grant 또는 조건(Condition) 검사 통과? ─ 아니오 ─→ 거부
        │ 예
        ▼
       허용 → HSM에서 복호화 → CloudTrail 기록
```

④가 KMS의 고유 지점이다. 다른 서비스에서는 "IAM이 열려 있으면 접근된다"가 보통이지만, KMS에서는 **리소스 쪽이 먼저 문을 열어줘야** IAM이 의미를 갖는다. S3 버킷 정책도 리소스 기반이지만 S3는 같은 계정 안에서 IAM만으로도 접근이 성립한다 — KMS는 그 예외다.

### 실제 기본 키 정책의 전체 모습

콘솔에서 키를 만들면 아래와 같은 세 블록짜리 정책이 생성된다. 시험은 이 세 블록의 **역할 분리**를 묻는다.

```json
{
  "Version": "2012-10-17",
  "Id": "key-default-1",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow access for Key Administrators",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/KeyAdmin" },
      "Action": [
        "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
        "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
        "kms:Get*", "kms:Delete*", "kms:TagResource", "kms:UntagResource",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Allow use of the key",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/AppRole" },
      "Action": [
        "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
        "kms:GenerateDataKey*", "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

두 번째와 세 번째 블록의 액션 목록이 **겹치지 않는다**는 점을 보라. 키 관리자(Key Administrator)는 키를 만들고 정책을 바꾸고 삭제를 예약할 수 있지만 `Encrypt`/`Decrypt`는 없다. 키 사용자(Key User)는 암·복호화만 하고 정책은 못 바꾼다. 이것이 **직무 분리(Separation of Duties)**의 교과서적 구현이며, SCS 시험이 좋아하는 패턴이다.

> 💡 **관련 이론**: 직무 분리는 Saltzer & Schroeder의 1975년 보안 설계 원칙 중 "Separation of privilege"에 뿌리를 둔다. 한 주체가 단독으로 전체 손상을 일으킬 수 없게 권한을 쪼개는 것이다. KMS에서 이 원칙이 특히 중요한 이유는, 키 관리자 권한(`kms:PutKeyPolicy`)이 있으면 *자기 자신에게 복호화 권한을 추가*할 수 있기 때문이다. 즉 관리 권한과 사용 권한의 분리는 완전한 격벽이 아니라 "우회하려면 CloudTrail에 흔적이 남는 추가 단계를 강제하는" 통제다. 그래서 `kms:PutKeyPolicy` 호출에 대한 EventBridge 알람이 실무의 표준 짝이다.

### 세 가지 권한 메커니즘 비교

| 항목 | 키 정책 (Key Policy) | IAM 정책 | Grant |
|------|---------------------|----------|-------|
| 유형 | 리소스 기반 | 자격 기반 | 임시 권한 부여 객체 |
| 필수 여부 | **모든 키에 반드시 1개** | 선택 | 선택 |
| 적용 범위 | 그 키 하나 | 여러 키를 와일드카드로 | 그 키 + 특정 grantee |
| 교차계정 | **가능**(외부 계정 프린시펄 지정) | 불가(자기 계정 프린시펄만) | 가능 |
| 생성 방식 | 정책 문서 편집 | 정책 문서 편집 | `CreateGrant` API |
| 취소 방식 | 정책 재작성 | 정책 재작성 | `RevokeGrant` / `RetireGrant` |
| 조건 키 | 지원 | 지원 | 암호화 컨텍스트 constraint만 |
| 주 용도 | 키 소유·거버넌스 | 사람·앱의 일상 권한 | AWS 서비스 위임, 단기 작업 |

> ⚠️ **함정**: "IAM 정책으로 교차계정 KMS 권한을 준다"는 보기는 항상 오답이다. IAM 정책은 *자기 계정의 프린시펄에게* 권한을 줄 뿐, 다른 계정의 키를 열어줄 수 없다. 외부 계정에 문을 여는 것은 오직 리소스 기반 정책(키 정책)이다. Day 3의 "양측 모두 필요" 규칙이 여기서 나온다.

> 🎯 **시나리오**: "감사팀이 KMS 키의 존재와 설정은 확인해야 하지만, 어떤 상황에서도 데이터를 복호화할 수는 없어야 한다." → 감사 역할에는 `kms:DescribeKey`, `kms:GetKeyPolicy`, `kms:GetKeyRotationStatus`, `kms:ListResourceTags`만 부여하고 `kms:Decrypt`/`kms:ReEncrypt*`는 제외한다. 더 강하게는 키 정책이나 SCP에 감사 역할에 대한 `kms:Decrypt` **명시적 Deny**를 넣는다 — 나중에 누가 실수로 IAM에 권한을 추가해도 Deny가 이긴다. "읽기 전용 권한을 준다"고 `ReadOnlyAccess` 관리형 정책을 붙이는 보기는 함정이 될 수 있으니, 액션 단위로 확인하는 습관을 들이자.

## 대칭 키 vs 비대칭 키

KMS key는 키 사양(key spec)에 따라 대칭과 비대칭으로 나뉜다. 용도가 완전히 다르므로 시험에서 자주 구분을 묻는다.

**대칭 키(Symmetric, 기본값)** — AES-256. 같은 키로 암호화·복호화한다. 키 평문이 KMS 밖으로 나가지 않으므로 `Encrypt`/`Decrypt`/`GenerateDataKey` API로만 사용한다. EBS·S3·RDS 등 모든 AWS 서비스 통합 암호화는 대칭 키를 쓴다. **봉투 암호화(Day 2)의 기반**이기도 하다.

**비대칭 키(Asymmetric)** — RSA 또는 ECC 키 쌍. 퍼블릭 키는 다운로드 가능하고, 프라이빗 키는 KMS 내부에만 머문다.
- **암호화/복호화 용도**: 외부 시스템이 퍼블릭 키로 암호화 → KMS가 프라이빗 키로 복호화.
- **서명/검증 용도**: KMS가 프라이빗 키로 서명 → 누구나 퍼블릭 키로 검증.

```bash
# 대칭 키 생성 (기본)
aws kms create-key --description "app-data-key"

# 비대칭 서명용 키 생성
aws kms create-key \
  --key-spec RSA_2048 \
  --key-usage SIGN_VERIFY \
  --description "doc-signing-key"
```

> 💡 **관련 이론**: 비대칭 키를 언제 쓰는가? AWS 외부 시스템(또는 KMS 호출 권한이 없는 주체)이 암호화는 해야 하지만 복호화 권한은 주지 않을 때, 또는 디지털 서명/검증이 필요할 때다. 만약 모든 주체가 KMS API를 호출할 수 있고 AWS 서비스 통합 암호화가 목적이라면 대칭 키가 더 단순하고 비용 효율적이다. 시험에서 "KMS 호출 권한이 없는 파트너가 데이터를 암호화해 보낸다" → 비대칭 키.

### 키 사양(Key Spec)과 지원 연산 한눈에 보기

| Key Spec | Key Usage | 지원 API | 특징 / 시험 포인트 |
|----------|-----------|----------|-------------------|
| `SYMMETRIC_DEFAULT` (AES-256-GCM) | `ENCRYPT_DECRYPT` | `Encrypt`/`Decrypt`/`GenerateDataKey`/`ReEncrypt` | 기본값. **AWS 서비스 통합 암호화는 전부 이것만 지원** |
| `RSA_2048` / `RSA_3072` / `RSA_4096` | `ENCRYPT_DECRYPT` 또는 `SIGN_VERIFY` | 위 + `Sign`/`Verify`/`GetPublicKey` | 퍼블릭 키 배포 가능. 평문 길이 제한이 작다 |
| `ECC_NIST_P256/P384/P521` | `SIGN_VERIFY` **전용** | `Sign`/`Verify`/`GetPublicKey` | ECDSA 서명. **암호화 용도 불가** |
| `ECC_SECG_P256K1` | `SIGN_VERIFY` 전용 | 위와 동일 | 블록체인(secp256k1) 계열 서명 |
| `HMAC_256` 등 | `GENERATE_VERIFY_MAC` | `GenerateMac`/`VerifyMac` | 대칭 MAC. 암·복호화 아님 |

> ⚠️ **함정**: 세 가지가 자주 헷갈린다. ① **ECC 키는 암호화에 쓸 수 없다** — 서명 전용이다. "타원곡선으로 데이터를 암호화" 보기는 KMS에서 오답이다. ② **비대칭 키는 AWS 서비스 통합 암호화(S3·EBS·RDS 등)에 쓸 수 없다** — 이들 서비스는 `GenerateDataKey`를 호출하는데 비대칭 키는 이 API를 지원하지 않는다. ③ **`KeyUsage`는 생성 후 변경할 수 없다** — 암호화용으로 만든 RSA 키를 서명용으로 바꿀 수 없으니 새 키를 만들어야 한다.

> 🔍 **더 깊이**: 비대칭 암호화의 평문 길이 한계는 수학적 제약이다. RSA-OAEP는 모듈러스 크기에서 패딩 오버헤드를 뺀 만큼만 담을 수 있어서, RSA_2048 + `RSAES_OAEP_SHA_256` 조합의 평문 상한은 190바이트에 불과하다(RSA_4096이면 446바이트). 대칭 키의 `Encrypt` 상한 4,096바이트보다도 훨씬 작다. 그래서 비대칭 키로 "파일을 암호화"하는 설계는 존재하지 않고, 실제로는 *비대칭으로 대칭 키를 감싸고 대칭 키로 데이터를 암호화*하는 하이브리드 구조를 쓴다. 이것이 TLS 핸드셰이크와 PGP가 수십 년간 써온 패턴이며, 봉투 암호화(Day 2)의 사촌이다.

```bash
# 서명 — 프라이빗 키는 KMS 안에만 있고, 서명 결과만 나온다
aws kms sign \
  --key-id alias/doc-signing-key \
  --message fileb://contract.pdf \
  --message-type RAW \
  --signing-algorithm RSASSA_PSS_SHA_256 \
  --query Signature --output text > contract.sig

# 검증 — KMS로도 되고, 퍼블릭 키를 받아 외부에서도 된다
aws kms verify \
  --key-id alias/doc-signing-key \
  --message fileb://contract.pdf \
  --message-type RAW \
  --signing-algorithm RSASSA_PSS_SHA_256 \
  --signature fileb://contract.sig
# { "KeyId": "...", "SignatureValid": true, "SigningAlgorithm": "RSASSA_PSS_SHA_256" }

# 퍼블릭 키 배포 — 파트너는 이것만 있으면 KMS 없이 검증/암호화 가능
aws kms get-public-key \
  --key-id alias/doc-signing-key \
  --query PublicKey --output text | base64 -d > pubkey.der
```

> 📚 **사례**: 2010년 소니 PlayStation 3의 코드 서명 체계가 뚫린 사건은 "프라이빗 키를 시스템 밖에서 다루면 무슨 일이 벌어지는가"의 고전적 예다. 소니의 서명 구현은 ECDSA 서명에 필요한 난수(nonce)를 매번 같은 값으로 사용했고, 서로 다른 두 서명만 비교하면 대수적으로 프라이빗 키를 복원할 수 있었다. 결과적으로 누구나 소니 명의의 유효한 서명을 만들 수 있게 됐다. KMS의 `Sign` API는 난수 생성·패딩·알고리즘 선택을 HSM 내부에서 처리하고 프라이빗 키를 절대 내보내지 않는다. "서명을 직접 구현" 대신 KMS `Sign`을 쓰라는 시험의 권고는 이런 부류의 구현 실수를 구조적으로 제거하기 위한 것이다.

> 🎯 **시나리오**: "펌웨어 이미지에 코드 서명을 하되, 개발자 노트북이나 CI 러너에 서명 키가 저장되면 안 되고, 누가 언제 무엇에 서명했는지 감사 로그가 남아야 한다." → `SIGN_VERIFY` 용도의 비대칭 KMS 키를 만들고, CI 역할에 `kms:Sign`만 부여한다(`kms:GetPublicKey`는 배포 파이프라인에). 프라이빗 키는 HSM을 벗어나지 않고, 모든 `Sign` 호출이 CloudTrail에 프린시펄·시각과 함께 기록된다. 검증 측에는 퍼블릭 키만 배포하므로 검증자는 서명을 위조할 수 없다. "키를 Secrets Manager에 넣고 CI가 꺼내 쓴다"는 보기는 키가 평문으로 프로세스 메모리에 존재하게 되므로 요구를 만족하지 못한다.

## 키 출처(Key Material Origin): 키가 어디서 생성되는가

CMK를 만들 때 키 자료(key material)의 출처를 정할 수 있다.

- **AWS_KMS**(기본): KMS HSM이 키 자료를 생성. 가장 단순.
- **EXTERNAL**: 고객이 직접 키 자료를 생성·반입(BYOK, Bring Your Own Key). 키 라이프사이클을 직접 통제하지만 백업·재반입 책임도 고객이 진다. 자동 회전 불가.
- **AWS_CLOUDHSM**: CloudHSM 클러스터(커스텀 키 스토어)에 키 자료 저장. 전용 HSM에 대한 규제 요구가 있을 때.
- **EXTERNAL_KEY_STORE(XKS)**: 외부 키 관리자(온프레미스 HSM 등)에 키를 두고 KMS는 프록시 역할.

> 🎯 **시나리오**: "규제 때문에 키 자료를 우리가 직접 생성해 통제해야 하고, AWS가 키를 생성하면 안 된다." → key material origin을 `EXTERNAL`로 설정한 BYOK, 또는 더 강한 요구면 CloudHSM 커스텀 키 스토어/XKS. 단, EXTERNAL 키는 *자동 회전이 불가능*하다는 트레이드오프를 기억하라.

| 요구 문장 | 정답 Origin | 이유 |
|-----------|------------|------|
| "운영 부담 없이 표준 암호화" | `AWS_KMS` | 기본값, 자동 회전 가능 |
| "키 자료를 우리가 생성해 반입" | `EXTERNAL` (BYOK) | 고객이 키 자료 생성·백업 책임 |
| "전용(single-tenant) HSM에 키를 둬야 함" | `AWS_CLOUDHSM` | CloudHSM 커스텀 키 스토어 |
| "키가 AWS 밖(온프레미스 HSM)에 있어야 함" | `EXTERNAL_KEY_STORE` (XKS) | KMS는 프록시, 실제 키는 외부 |

> ⚠️ **함정**: BYOK(`EXTERNAL`)에는 잘 나오는 함정이 두 개 있다. ① 반입한 키 자료에 **만료 시각을 설정할 수 있는데**, 만료되면 키 상태가 `PendingImport`로 떨어져 복호화가 즉시 중단된다 — "갑자기 복호화가 멈췄다"는 시나리오의 원인이 될 수 있다. ② 키 자료를 잃어버리면 AWS가 복구해 줄 수 없다. BYOK를 고르는 순간 *키 자료의 백업 책임이 고객에게 넘어온다*는 것이 이 옵션의 본질이다. "AWS가 키를 생성하면 안 된다"는 규제 문구가 없는데 BYOK를 고르는 것은 불필요한 운영 리스크를 떠안는 선택이다.

> 🔍 **더 깊이**: XKS(External Key Store)에서는 KMS가 암호 연산을 직접 수행하지 않고, XKS 프록시를 통해 외부 키 관리자에게 요청을 전달한다. 이 구조의 대가는 **가용성 결합**이다. 외부 HSM이나 프록시가 다운되면 그 키를 쓰는 모든 AWS 서비스의 암·복호화가 실패한다 — S3 읽기, EBS 볼륨 접근, RDS 기동까지 함께 멈춘다. "키에 대한 궁극적 통제"를 얻는 대신 "AWS의 가용성 SLA 밖으로 나간다"는 트레이드오프를 이해하는 것이 시험이 원하는 판단이다. 규제 문구에 "keys must remain outside the cloud provider"류의 표현이 있을 때만 XKS를 고른다.

## 멀티 리전 키(Multi-Region Keys)

기본적으로 KMS key는 *단일 리전*에 묶이며, 한 리전의 키로 암호화한 데이터는 다른 리전에서 복호화할 수 없다(키가 그 리전을 떠나지 못하므로). 멀티 리전 키는 *같은 키 자료와 키 ID*를 여러 리전에 복제한 primary/replica 키로, 한 리전에서 암호화한 데이터를 다른 리전의 동일 키로 복호화할 수 있다. DynamoDB 글로벌 테이블·교차 리전 DR 시나리오에 쓴다. 단, 키 정책은 리전별로 독립 관리된다.

> ⚠️ **함정**: 일반(단일 리전) KMS 키로 암호화한 EBS 스냅샷을 다른 리전으로 복사하려면, 대상 리전의 키로 *재암호화*가 필요하다. 멀티 리전 키가 아니면 키 자체가 리전을 넘지 못한다.

> ⚠️ **함정**: 멀티 리전 키는 "글로벌 키"가 아니다. primary와 replica는 *같은 키 자료와 같은 키 ID*를 공유하지만, **키 정책·grant·별칭·태그는 리전별로 완전히 독립**이다. 서울 리전 replica의 키 정책을 열어놨다고 버지니아 primary가 열리지 않고, 반대도 마찬가지다. "멀티 리전 키를 썼는데 다른 리전에서 AccessDenied"는 정책을 복제하지 않은 것이 원인인 전형적 시나리오다. 또한 자동 회전은 primary에서만 켜고, 회전된 키 자료가 replica로 전파된다.

> 🎯 **시나리오**: "DynamoDB 글로벌 테이블을 서울·도쿄 2개 리전에서 운영하고, 두 리전 모두 고객 관리형 키로 저장 암호화하며, DR 상황에서 어느 쪽에서든 데이터를 읽을 수 있어야 한다." → 멀티 리전 키를 서울에 primary로 만들고 도쿄에 replica를 생성한 뒤, **두 리전의 키 정책을 동일하게 구성**한다. 단일 리전 키 두 개를 각각 만드는 방식은 리전 간 복제된 항목의 암호문을 상대 리전에서 풀 수 없으므로 실패한다. 반대로 "리전 간에 데이터가 오갈 일이 전혀 없다"면 멀티 리전 키는 오히려 키 자료의 노출 표면을 넓히는 선택이므로 단일 리전 키가 옳다.

## CloudTrail로 KMS 사용 읽기

KMS의 통제가 실제로 작동하는지는 로그로만 증명된다. 모든 KMS API는 CloudTrail 관리 이벤트로 기록되며, **평문 데이터와 평문 키는 절대 기록되지 않는다**. 대신 "누가·언제·어떤 키를·어떤 맥락으로" 썼는지가 남는다.

```json
{
  "eventTime": "2026-03-14T02:11:07Z",
  "eventSource": "kms.amazonaws.com",
  "eventName": "Decrypt",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc123",
    "sessionContext": { "sessionIssuer": { "userName": "AppRole" } }
  },
  "sourceIPAddress": "10.0.12.44",
  "requestParameters": {
    "encryptionContext": { "tenant": "acme", "purpose": "invoice" },
    "encryptionAlgorithm": "SYMMETRIC_DEFAULT"
  },
  "responseElements": null,
  "resources": [
    { "ARN": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...",
      "accountId": "111122223333", "type": "AWS::KMS::Key" }
  ],
  "readOnly": true,
  "eventType": "AwsApiCall"
}
```

이 한 건에서 읽어야 할 것들:

- `userIdentity.arn`이 `assumed-role/AppRole/i-0abc123` → **EC2 인스턴스 역할**이 호출했다. 사람이 아니라 워크로드다. 만약 여기에 `IAMUser`나 낯선 인스턴스 ID가 보이면 조사 대상이다.
- `requestParameters.encryptionContext` → 어떤 테넌트의 데이터를 풀었는지가 그대로 보인다. Day 2에서 다루듯 **컨텍스트는 암호화되지 않기 때문에** 로그에서 읽을 수 있고, 그래서 비밀을 넣으면 안 된다.
- `responseElements: null` → 복호화 결과(평문)는 로그에 없다. KMS는 민감한 응답을 기록하지 않는다.
- `sourceIPAddress`가 VPC 사설 IP → VPC 엔드포인트를 통한 호출이다. 인터넷 IP가 보이면 키가 예상 밖 경로로 쓰이고 있다는 신호다.

> 🔍 **더 깊이**: KMS 이벤트에는 다른 서비스가 *대신* 호출한 경우를 식별하는 단서가 있다. S3가 SSE-KMS로 객체를 저장할 때 남는 `GenerateDataKey` 이벤트에는 호출 주체가 사용자 역할로 나오되 `sourceIPAddress`가 `s3.amazonaws.com` 같은 서비스 이름으로 기록되고, 요청 파라미터의 암호화 컨텍스트에 버킷 ARN과 객체 키가 들어간다. 즉 "이 복호화가 S3를 통한 것인가, 사람이 직접 `aws kms decrypt`를 때린 것인가"를 로그만으로 구분할 수 있다. 이 구분을 *사후 탐지*가 아니라 *사전 차단*으로 바꾸는 조건 키가 Day 3의 `kms:ViaService`다.

> 📚 **사례**: 2014년 Code Spaces는 공격자가 AWS 콘솔 자격증명을 탈취한 뒤 백업을 포함한 리소스를 대량 삭제해 며칠 만에 폐업했다. 이 사건 이후 클라우드 보안에서 "삭제·파기 계열 권한의 분리"와 "되돌릴 수 있는 시간 창"이 표준 요구가 됐다. KMS의 설계에도 그 흔적이 있다 — 키는 즉시 삭제되지 않고 최소 7일에서 최대 30일의 대기 기간을 강제로 거치며, 그동안 `CancelKeyDeletion`으로 되돌릴 수 있고, 대기 기간 동안 사용 시도가 계속 CloudTrail에 남는다. 사고 대응 관점에서 이 대기 기간은 "공격자가 crypto-shredding으로 데이터를 파괴하려 할 때 방어자가 개입할 수 있는 유일한 창"이다. 그래서 `ScheduleKeyDeletion` 이벤트에 대한 실시간 알람은 KMS 운영의 기본 항목이다.

KMS 권한은 *누가*뿐 아니라 *어떤 경로로, 어떤 맥락에서* 호출했는지까지 조건(`kms:ViaService`, `kms:EncryptionContext:*`, `kms:CallerAccount` 등)으로 좁힐 수 있다. 그 조건 키들은 Day 3에서 실제 정책 문서로 다룬다.

## 한 줄 요약

KMS는 "키를 HSM 밖으로 꺼내지 않은 채 연산만 제공"하고, 그 사용을 *키 정책(필수, 리소스 기반) + IAM(위임 시) + grant(임시)*로 통제하며 CloudTrail로 모든 사용을 기록한다. 키는 KMS key(KEK) → 데이터 키(DEK) → 데이터로 이어지는 계층을 이루고, 이 계층 덕분에 회전은 투명하고 파기는 즉각적이다. 거버넌스가 필요하면 customer managed key, 외부 암호화/서명이 필요하면 비대칭 키가 출발점이다. 그리고 Capital One 사례가 보여주듯 **암호화는 권한 탈취를 막지 못한다** — 키 정책으로 복호화 주체를 좁히고 로그로 이상 사용을 잡는 것이 KMS의 진짜 방어력이다.

---

## 📝 연습 문제

**문제 1.** 보안팀이 "키 정책을 직접 편집해 세밀한 접근 통제를 적용하고, 키 회전 주기를 통제하며, 다른 계정과 키를 공유해야 한다"고 요구한다. 어떤 종류의 키를 써야 하는가?

A) AWS owned key  
B) AWS managed key (`aws/s3`)  
C) Customer managed key  
D) S3 관리형 키(SSE-S3)  

**정답: C**  
해설: 키 정책 편집, 회전 주기 통제, 교차계정 공유는 모두 고객이 소유·관리하는 customer managed key에서만 가능하다. AWS managed key는 키 정책이 AWS에 의해 고정돼 편집할 수 없고 교차계정 공유도 안 된다. AWS owned key는 콘솔에 보이지도 않으며 통제 대상이 아니다. SSE-S3는 KMS 키가 아니라 S3가 관리하는 별도 방식으로 키 정책 개념이 없다.

---

**문제 2.** 관리자가 KMS 키의 기본 키 정책에서 `Enable IAM User Permissions`(Principal이 계정 root, Action `kms:*`) 구문을 실수로 삭제했다. IAM 관리자 권한을 가진 사용자도 키를 사용할 수 없게 되었다. 원인으로 가장 정확한 것은?

A) IAM 정책이 KMS보다 항상 우선하므로 무관하다  
B) 키 정책이 IAM에 권한을 위임하지 않으면 IAM 정책만으로는 키에 접근할 수 없기 때문  
C) 키가 자동으로 비활성화되었기 때문  
D) CloudTrail이 비활성화되었기 때문  

**정답: B**  
해설: KMS는 키 정책과 IAM이 함께 작동하는 이중 모델을 쓴다. 키 정책의 `Enable IAM User Permissions` 구문이 "이 계정의 IAM 정책으로 권한 결정을 위임한다"는 핵심 위임이다. 이를 삭제하면 키 정책에 직접 명시되지 않은 어떤 프린시펄도(관리자 포함) 키를 쓸 수 없다. IAM이 KMS보다 항상 우선한다는 설명은 틀렸으며, 키 비활성화나 CloudTrail은 이 증상과 무관하다.

---

**문제 3.** AWS 외부의 파트너 시스템이 데이터를 암호화해 우리 계정으로 보내야 한다. 파트너에게는 KMS API 호출 권한이나 복호화 권한을 주면 안 된다. 가장 적절한 키 구성은?

A) 대칭 customer managed key를 만들고 파트너에게 `kms:Encrypt` 권한 부여  
B) 비대칭 KMS 키(암호화/복호화 용도)를 만들어 퍼블릭 키를 파트너에게 배포, 복호화는 KMS 내부 프라이빗 키로 수행  
C) S3 presigned URL을 파트너에게 발급  
D) AWS managed key를 공유  

**정답: B**  
해설: 파트너에게 KMS 호출 권한을 주지 않고 암호화만 시키려면 비대칭 키가 적합하다. 퍼블릭 키를 배포하면 파트너는 KMS API 없이 로컬에서 암호화할 수 있고, 프라이빗 키는 KMS 밖으로 나가지 않아 복호화는 우리 계정의 KMS만 수행한다. 대칭 키로 `kms:Encrypt`를 주면 파트너가 KMS API를 호출해야 하므로 요구를 위반한다. presigned URL이나 managed key 공유는 이 요구와 맞지 않는다.

---

**문제 4.** 단일 리전 customer managed key로 암호화한 EBS 스냅샷을 us-east-1에서 us-west-2로 복사해 사용하려 한다. 가장 정확한 설명은?

A) 같은 키 ID로 어느 리전에서나 복호화되므로 추가 작업이 없다  
B) 스냅샷 복사 시 대상 리전의 키로 재암호화가 필요하다(단일 리전 키는 리전을 넘지 못함). 교차 리전 운영이 잦으면 멀티 리전 키를 고려한다  
C) 비대칭 키로 변환하면 자동 해결된다  
D) AWS owned key로 바꿔야 한다  

**정답: B**  
해설: 일반 KMS 키는 키 자료가 해당 리전을 떠나지 못하므로, 다른 리전에서 스냅샷을 쓰려면 대상 리전의 키로 재암호화해야 한다. 교차 리전 복호화를 동일 키로 하려면 같은 키 자료를 여러 리전에 복제하는 멀티 리전 키가 설계상 정답이다. 비대칭 변환이나 AWS owned key 전환은 이 문제를 해결하지 못한다.

---
