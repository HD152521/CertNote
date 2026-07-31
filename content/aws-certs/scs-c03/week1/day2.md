# Day 2 - IAM 핵심: 사용자·그룹·역할·정책과 정책 평가의 기본 흐름

IAM은 AWS 보안의 척추다. 어제 본 6개 도메인 어디를 가든, 결국 "이 주체(principal)가 이 리소스에 이 행위를 할 수 있는가"라는 질문으로 환원된다. KMS 복호화도, S3 GetObject도, cross-account 배포도 전부 IAM 평가 로직이라는 같은 엔진 위에서 결정된다. 그래서 IAM을 "정책 JSON 외우기"가 아니라 **평가 알고리즘을 이해하는 것**으로 접근해야 SCS-C03의 미묘한 시나리오를 푼다.

오늘은 IAM의 네 가지 빌딩블록(사용자·그룹·역할·정책)이 정확히 무엇인지, 그리고 한 요청이 들어왔을 때 AWS가 Allow/Deny를 결정하는 평가 흐름을 단계별로 따라간다. 평가 순서의 핵심 한 문장을 미리 던지면: **"명시적 Deny가 모든 것을 이긴다. 그 다음 명시적 Allow가 있어야 허용된다. 둘 다 없으면 암묵적 Deny."**

## IAM 빌딩블록: 사용자·그룹·역할·정책

| 요소 | 정의 | 자격 증명 | 핵심 용도 |
|------|------|----------|----------|
| **User(사용자)** | 영구적 신원, 사람 또는 앱 1개에 대응 | 장기 access key, 비밀번호 | 가급적 피한다(키 노출 위험) |
| **Group(그룹)** | 사용자 묶음, 정책 부착용 컨테이너 | 없음(자격증명 없음) | 사용자에게 정책을 일괄 부여 |
| **Role(역할)** | 누구든 일시적으로 "맡을 수 있는" 신원 | STS 임시 자격증명(만료됨) | EC2/Lambda, cross-account, 페더레이션 |
| **Policy(정책)** | 권한을 기술한 JSON 문서 | 해당 없음 | 위 요소에 부착되어 권한 정의 |

여기서 시험이 반복적으로 노리는 통찰이 있다. **장기 자격증명(IAM User access key)은 가능한 한 쓰지 말고, Role의 임시 자격증명을 쓰라**는 것이다. EC2가 S3에 접근해야 하면 User access key를 인스턴스에 넣는 게 아니라 **인스턴스 프로파일(IAM Role)**을 붙인다. Lambda가 DynamoDB에 접근하면 **실행 역할(execution role)**을 쓴다. 사람도 가급적 IAM User 대신 **IAM Identity Center(SSO)**로 로그인해 임시 자격증명을 받는다.

### 사용자 vs 역할 — 무엇이 실제로 다른가

두 개념의 차이를 "사람이냐 기계냐"로 외우면 시험에서 틀린다. 사람도 역할을 맡고, 기계도 사용자가 될 수 있다(그리고 그것이 바로 안티패턴이다). 진짜 차이는 **자격 증명의 수명과 발급 방식**이다.

| 축 | IAM User(사용자) | IAM Role(역할) |
|----|------------------|----------------|
| 자격 증명의 수명 | **영구** — 명시적으로 지우기 전까지 유효 | **만료** — 기본 1시간, 최대 12시간 |
| 발급 주체 | IAM이 한 번 발급, 이후 저장 | 요청할 때마다 **STS가 새로 발급** |
| 자격 증명 구성 | AccessKeyId + SecretAccessKey (2개) | AccessKeyId + SecretAccessKey + **SessionToken** (3개) |
| 부착되는 정책 | 권한 정책만 | 권한 정책 + **신뢰 정책(trust policy)** |
| "누가 쓸 수 있나" 통제 | 키를 가진 사람 누구나 | 신뢰 정책이 정한 주체만 |
| 유출 시 피해 | 회수 전까지 무기한 | 만료 시각 이후 자동 무력화 |
| 감사 추적 | 사용자 이름 하나 | 세션 이름으로 호출자 구분 가능 |
| 회전(rotation) | 사람이 주기적으로 해야 함 | 자동(매 발급이 곧 회전) |
| 개수 제한 | 계정당 사용자 수 상한 있음 | 역할도 상한은 있으나 훨씬 여유 |

이 표에서 가장 중요한 줄은 **"유출 시 피해"**다. 보안 설계의 핵심 질문은 "유출되지 않게 하는가"가 아니라 "유출됐을 때 얼마나 오래 유효한가"다. 액세스 키는 GitHub에 올라간 뒤 몇 년 동안 유효할 수 있지만, 임시 자격 증명은 최악의 경우에도 만료 시각이 있다.

같은 대비를 자격 증명 자체의 형태로 보면 이렇다.

| 구분 | 장기 액세스 키 | STS 임시 자격 증명 |
|------|----------------|--------------------|
| 접두사 | `AKIA...` | `ASIA...` |
| SessionToken | 없음 | **필수** (없으면 인증 실패) |
| 만료 | 없음 | 있음 (`Expiration` 필드) |
| 저장 위치(안티패턴) | 코드, `.env`, CI 시크릿, 인스턴스 내부 | 저장하지 않음 — 필요할 때 발급 |
| 저장 위치(권장) | 가능하면 만들지 않음 | 메모리, SDK 자격 증명 체인 |
| 회수 방법 | 키 비활성화·삭제 | 역할 정책 변경 또는 세션 무효화 |
| CloudTrail 표기 | `userIdentity.type = IAMUser` | `userIdentity.type = AssumedRole` |

> ⚠️ **함정**: "임시 자격 증명은 만료되니 유출돼도 안전하다"는 서술은 절반만 맞다. 만료 전까지는 **완전히 유효하다.** 1시간이면 자동화된 공격자가 버킷 하나를 통째로 내려받기에 충분한 시간이다. 그래서 임시 자격 증명을 쓰더라도 ① 그 역할의 권한을 최소로 좁히고 ② 탈취 경로(예: 메타데이터 서비스 노출)를 막고 ③ 이상 사용을 탐지하는 세 겹이 함께 있어야 한다. 시험에서 "임시 자격 증명을 쓰므로 추가 통제가 불필요하다"는 보기는 언제나 오답이다.

### ARN — 정책이 가리키는 주소 체계

정책을 읽으려면 ARN(Amazon Resource Name)의 구조가 손에 익어야 한다. 대부분의 정책 오류는 ARN을 잘못 적어서 생긴다.

```
[ ARN 구조 해부 ]

  arn : aws : s3 : ap-northeast-2 : 111122223333 : my-bucket/logs/app.log
   │     │     │         │                │              │
   │     │     │         │                │              └─ 리소스 (서비스마다 형식이 다름)
   │     │     │         │                └─ 계정 ID
   │     │     │         └─ 리전  (S3·IAM 등 글로벌 리소스는 비어 있음)
   │     │     └─ 서비스 네임스페이스
   │     └─ 파티션 (aws / aws-cn / aws-us-gov)
   └─ 고정 접두사

  ── 서비스별 실제 모양 ────────────────────────────────────────────
  S3 버킷      arn:aws:s3:::my-bucket              ← 리전·계정 칸이 비어 있다
  S3 객체      arn:aws:s3:::my-bucket/*            ← 버킷과 **다른 ARN**이다
  IAM 사용자   arn:aws:iam::111122223333:user/alice        ← 리전 없음
  IAM 역할     arn:aws:iam::111122223333:role/AppRole      ← 리전 없음
  맡은 역할 세션 arn:aws:sts::111122223333:assumed-role/AppRole/session-name
  KMS 키       arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...
  Lambda 함수  arn:aws:lambda:ap-northeast-2:111122223333:function:my-func
```

여기서 시험이 노리는 지점이 둘 있다. 첫째, **S3 버킷 ARN과 객체 ARN은 다른 리소스다.** `s3:ListBucket`은 버킷 ARN에, `s3:GetObject`는 객체 ARN(`/*`)에 적용된다. 둘을 섞으면 "권한을 줬는데 목록이 안 보인다" 또는 "목록은 보이는데 다운로드가 안 된다"가 된다. 둘째, **IAM 역할의 ARN과 그 역할을 맡은 세션의 ARN이 다르다.** 정책 조건에서 `aws:PrincipalArn`을 `arn:aws:iam::...:role/AppRole`로 비교하면 맞지만, CloudTrail에 찍히는 것은 `arn:aws:sts::...:assumed-role/AppRole/session`이다. 로그를 정책 조건으로 그대로 복사하면 매칭되지 않는다.

### 루트 사용자 — 절대 쓰지 않는 신원

계정을 만들 때 생기는 루트 사용자는 IAM 사용자가 아니다. IAM 정책으로 권한을 제한할 수 없고(SCP로만 멤버 계정 루트를 제약할 수 있다), 계정에 대한 완전한 권한을 갖는다.

| 루트로만 할 수 있는 일 | 비고 |
|------------------------|------|
| 계정 설정 변경(이메일·결제 수단·해지) | 위임 불가 |
| 지원 플랜 변경 | 위임 불가 |
| S3 버킷 정책·SQS 정책의 "잠긴" 상태 복구 | 자기 자신을 잠근 정책을 되돌릴 때 |
| 일부 리전 활성화·비활성화 | 계정 수준 설정 |

루트에 대한 표준 조치는 셋이다. **액세스 키를 만들지 않는다(있으면 즉시 삭제), MFA를 켠다, 자격 증명을 봉인한다.** 일상 작업은 어떤 경우에도 루트로 하지 않는다.

> 🎯 **시나리오**: "감사에서 '모든 계정의 루트 사용자에 MFA가 있고 액세스 키가 없음'을 상시 증명하라는 요구가 나왔다. 계정은 40개다." → 사람이 40번 로그인해 확인하는 보기는 탈락이다. 방향은 **탐지의 자동화**다. 각 계정에서 IAM 자격 증명 보고서를 뽑거나 Config 규칙으로 루트 MFA·루트 액세스 키 존재 여부를 상시 평가하고, 결과를 Security Hub로 집계해 한 화면에서 본다. 여기에 예방을 더한다면 SCP로 루트 사용자의 액션 자체를 차단하는 가드레일이 붙는다. Day 1에서 본 "예방 + 탐지" 조합이 IAM 영역에서 그대로 반복된다.

> 💡 **관련 이론**: Group은 "그릇"일 뿐 그 자체로는 자격증명이 없어서 **Group을 Principal로 지정할 수 없다.** 신입이 자주 틀리는 부분 — Role의 trust policy에 `"Principal": {"AWS": "arn:...:group/Devs"}`를 쓰면 동작하지 않는다. 그룹은 정책을 사용자에게 전달하는 통로일 뿐, AssumeRole의 대상이 될 수 없다.

> 🔍 **더 깊이**: Role을 "맡는다(assume)"는 것의 실체는 STS(Security Token Service)가 임시 자격증명 3종(AccessKeyId, SecretAccessKey, **SessionToken**)을 발급하는 것이다. 이 자격증명은 만료 시간(기본 1시간, 최대 12시간)이 있어서, 노출돼도 영향이 시간적으로 제한된다. 이것이 장기 키보다 안전한 근본 이유이며, Day 4에서 STS를 깊이 다룬다.

## 정책의 두 종류: Identity-based vs Resource-based

정책은 "어디에 붙느냐"로 두 종류로 나뉜다. 오늘은 개념만 잡고 Day 3에서 깊이 들어간다.

- **Identity-based policy(신원 기반)**: User·Group·Role에 붙는다. "이 주체가 무엇을 할 수 있는가"를 기술. Principal 요소가 없다(누구에게 붙는지가 곧 주체).
- **Resource-based policy(리소스 기반)**: 리소스(S3 버킷, KMS 키, SQS 큐 등)에 직접 붙는다. **Principal 요소가 필수** — "누가 이 리소스에 접근할 수 있는가"를 기술.

리소스 기반 정책의 결정적 효용은 **cross-account 접근**을 가능하게 한다는 점이다. 다른 계정의 주체에게 내 S3 버킷을 열어주려면 그 버킷의 리소스 기반 정책에 상대 계정을 명시한다.

두 정책을 나란히 놓고 보면 차이가 한눈에 들어온다. 아래 두 문서는 **완전히 같은 접근을 서로 다른 쪽에서 표현한 것**이다.

```json
// ── Identity 정책 ── IAM 역할 "ReportReader"에 부착한다
// 읽는 법: "이 역할은 저 버킷을 읽을 수 있다"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadReportBucket",
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::monthly-reports",
      "arn:aws:s3:::monthly-reports/*"
    ]
  }]
}
// ▲ Principal 요소가 없다 — 정책이 붙은 대상이 곧 주체이므로 적을 필요가 없다
```

```json
// ── Resource 정책 ── S3 버킷 "monthly-reports"에 부착한다
// 읽는 법: "이 버킷은 저 역할에게 읽기를 허용한다"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowReportReader",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::111122223333:role/ReportReader"
    },
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::monthly-reports",
      "arn:aws:s3:::monthly-reports/*"
    ]
  }]
}
// ▲ Principal 요소가 필수다 — 누가 오는지를 리소스 쪽에서 알 방법이 없으므로
```

| 항목 | Identity 정책 | Resource 정책 |
|------|---------------|---------------|
| 부착 위치 | User / Group / Role | S3 버킷, KMS 키, SQS 큐, SNS 토픽, Lambda 함수, Secrets Manager 시크릿 등 |
| `Principal` 요소 | **없다**(있으면 문법 오류) | **필수** |
| `Resource` 요소 | 필수 | 보통 명시하되 자기 자신을 가리킴 |
| 관리 주체 | 주체가 속한 계정의 IAM 관리자 | **리소스를 소유한 계정** |
| 교차 계정 단독 성립 | 불가 — 상대 리소스 정책이 있어야 함 | 가능하지만 호출 측 Identity 정책도 필요 |
| 대표 사용처 | "이 팀은 이 리소스들을 쓴다" | "이 버킷은 이 계정에게만 열린다" |
| 지원 서비스 | 모든 서비스 | **일부 서비스만** 지원 |

마지막 줄이 시험에서 자주 걸린다. **모든 AWS 서비스가 리소스 기반 정책을 지원하지는 않는다.** S3·KMS·SQS·SNS·Lambda·Secrets Manager·EFS·API Gateway 등은 지원하지만, EC2 인스턴스나 DynamoDB 테이블에는 리소스 기반 정책을 붙일 수 없다. 그래서 "DynamoDB 테이블에 리소스 정책을 붙여 교차 계정 접근을 연다"는 식의 보기가 나오면 방식 자체를 의심해야 하고, 그런 서비스의 교차 계정 접근은 **역할을 맡는 방식(AssumeRole)**으로 푼다.

> 💡 **관련 이론**: 왜 두 방향의 정책이 다 필요할까. 관리 주체가 다르기 때문이다. Identity 정책은 **호출자 쪽 계정의 관리자**가 쓰고, Resource 정책은 **리소스를 소유한 계정**이 쓴다. 만약 Identity 정책만으로 남의 계정 리소스에 접근할 수 있다면, 내 계정의 관리자 권한만으로 남의 데이터를 읽을 수 있게 된다 — 계정이라는 격리 단위가 무의미해진다. 그래서 교차 계정에서는 양쪽이 모두 동의해야 한다(이 규칙은 Day 3과 Week 2에서 다시 정밀하게 다룬다). 리소스 정책은 불편한 추가 절차가 아니라 **계정 경계를 의미 있게 만드는 장치**다.

> 🔍 **더 깊이**: IAM 역할의 **신뢰 정책(trust policy)도 리소스 기반 정책**이다. "역할"이라는 리소스에 붙어서 "누가 이 역할을 맡을 수 있는가"를 `Principal`과 함께 기술하기 때문이다. 그래서 역할은 정책을 두 장 갖는다 — 신뢰 정책(누가 맡나)과 권한 정책(맡으면 뭘 하나). 이 둘을 헷갈리면 "역할에 S3 권한을 줬는데 역할을 맡을 수가 없다"거나 반대로 "역할은 맡아지는데 아무것도 못 한다"는 증상이 나온다. Day 4에서 신뢰 정책을 본격적으로 판다.

## IAM 정책 JSON 구조

모든 정책은 Statement의 배열이고, 각 Statement는 다음 요소를 갖는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadSpecificBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::my-secure-bucket",
        "arn:aws:s3:::my-secure-bucket/*"
      ],
      "Condition": {
        "Bool": {"aws:SecureTransport": "true"}
      }
    }
  ]
}
```

- **Effect**: `Allow` 또는 `Deny`
- **Action**: 허용/거부할 API 행위(`s3:GetObject`). 와일드카드(`s3:*`) 가능
- **Resource**: 대상 ARN. 신원 기반에선 필수, 리소스 기반에선 보통 `*`(정책이 이미 그 리소스에 붙어 있음)
- **Principal**: 누가(리소스 기반·trust policy에서만 사용)
- **Condition**: 추가 제약(IP, MFA, 시간, 암호화 여부 등)

> ⚠️ **함정**: `"Resource": "*"`와 `"Action": "*"`를 함께 쓰면 사실상 admin이다. 시험에서 "최소 권한"을 물으면 와일드카드를 좁힌 보기가 정답이다. 특히 `s3:ListBucket`은 버킷 ARN(`arn:aws:s3:::bucket`)에, `s3:GetObject`는 객체 ARN(`.../*`)에 적용된다 — 두 ARN 레벨을 섞으면 동작하지 않는 게 흔한 실수다.

### NotAction·NotResource — 편해 보이지만 위험한 요소

`Action` 대신 `NotAction`을 쓰면 "여기 적은 것을 **제외한 모든 것**"이라는 뜻이 된다. 짧게 쓸 수 있어 유혹적이지만, 새 서비스가 출시될 때마다 그 범위가 **자동으로 넓어진다.**

```json
// ⚠️ 위험한 형태 — "IAM만 빼고 전부 허용"
{
  "Effect": "Allow",
  "NotAction": "iam:*",
  "Resource": "*"
}
// AWS가 새 서비스를 내놓을 때마다 이 정책은 자동으로 그 서비스까지 허용한다
```

```json
// ✅ 안전한 형태 — Deny와 결합하면 "여기 적은 것 외에는 전부 금지"
{
  "Effect": "Deny",
  "NotAction": ["s3:*", "cloudwatch:*", "logs:*"],
  "Resource": "*"
}
// 새 서비스가 나와도 자동으로 금지 쪽에 들어간다 — 안전한 방향으로 실패한다
```

원칙은 하나다. **`NotAction`·`NotResource`는 Allow와 쓰면 범위가 자동으로 넓어지고, Deny와 쓰면 자동으로 좁아진다.** 안전한 방향으로 실패하는 쪽(Deny 결합)만 쓴다. 이 성질은 Day 3의 리전 제한 SCP에서 다시 등장한다.

### 관리형 정책 vs 인라인 정책

정책을 "어떻게 저장하느냐"도 시험 대상이다.

| 구분 | AWS 관리형 | 고객 관리형 | 인라인 |
|------|------------|-------------|--------|
| 소유·수정 | AWS가 관리, 수정 불가 | 고객이 만들고 버전 관리 | 특정 주체에 박혀 있음 |
| 재사용 | 여러 주체에 부착 | 여러 주체에 부착 | **하나의 주체 전용** |
| 버전 관리 | AWS가 갱신 | 최대 5개 버전 보관·롤백 가능 | 없음 |
| 주체 삭제 시 | 정책은 남음 | 정책은 남음 | **함께 삭제됨** |
| 감사 용이성 | 높음 | 높음 | 낮음(숨어 있기 쉬움) |
| 권장 상황 | 빠른 시작·표준 역할 | 대부분의 실무 | "이 주체에만 반드시 붙어 있어야" 하는 예외 규칙 |

> ⚠️ **함정**: 조사할 때 인라인 정책을 빠뜨리는 실수가 흔하다. `aws iam list-attached-user-policies`는 **관리형 정책만** 보여 주고, 인라인 정책은 `aws iam list-user-policies`로 따로 조회해야 한다. "관리형 정책을 다 확인했는데 왜 이 권한이 있지?"의 답이 인라인 정책인 경우가 많다. 역할·그룹도 마찬가지로 두 명령이 따로 있다. 한 번에 전부 훑으려면 `aws iam get-account-authorization-details`를 쓴다.

> 💡 **관련 이론**: AWS 관리형 정책은 편리하지만 거의 항상 **필요보다 넓다.** `AmazonS3FullAccess`는 계정의 모든 버킷에 대한 모든 액션을 허용하고, `PowerUserAccess`는 IAM을 뺀 사실상 전부를 허용한다. AWS가 새 API를 추가하면 관리형 정책도 조용히 넓어진다. 그래서 실무 표준은 "AWS 관리형으로 시작해서 고객 관리형으로 좁혀 간다"이고, 시험에서 최소 권한을 묻는 문항의 정답이 AWS 관리형 정책 부착인 경우는 드물다.

## 정책 평가 기본 흐름: Allow/Deny를 결정하는 알고리즘

이것이 오늘의 핵심이다. 단일 계정 내에서 한 요청이 들어왔을 때 AWS가 결정하는 순서는 다음과 같다.

```
[ IAM 정책 평가 흐름 (단일 계정) ]

  요청(Principal + Action + Resource + Context)
        |
   1. 적용 가능한 모든 정책 수집
      (Identity-based, Resource-based, SCP, Permissions Boundary, Session policy)
        |
   2. 명시적 Deny가 하나라도 있는가?  ── 예 ──▶  DENY (최우선, 무조건)
        | 아니오
   3. SCP가 해당 Action을 허용하는가? ── 아니오 ──▶ DENY
        | 예
   4. Permissions Boundary가 허용하는가? ── 아니오 ──▶ DENY
        | 예
   5. 명시적 Allow가 하나라도 있는가? ── 아니오 ──▶ DENY (암묵적 거부)
        | 예
        ▼
      ALLOW
```

세 가지 원칙으로 압축된다.

1. **기본은 암묵적 Deny(implicit deny)**: 아무 정책도 허용하지 않으면 거부된다. 권한은 명시적으로 줘야 한다.
2. **명시적 Allow가 암묵적 Deny를 뒤집는다**: 어딘가에서 명시적으로 허용하면 기본 거부가 풀린다.
3. **명시적 Deny가 모든 것을 이긴다(explicit deny overrides)**: 어떤 정책이 허용해도, 다른 정책에 명시적 Deny가 있으면 무조건 거부.

> 💡 **관련 이론**: 이 평가 순서를 외울 때 핵심은 **"가드레일(SCP, Permissions Boundary)은 권한을 주지 않고 상한선만 긋는다"**는 점이다. SCP가 `s3:*`를 허용해도 그것만으로는 아무 권한도 안 생긴다 — 신원 기반 정책에 명시적 Allow가 있어야 한다. SCP는 "최대 허용 범위"를 정의할 뿐이다. 그래서 SCP에서 흔히 쓰는 패턴은 Allow가 아니라 Deny 가드레일이다.

> 🔍 **더 깊이**: cross-account의 경우 평가가 **양쪽 계정에서 각각** 일어난다. 계정 A의 주체가 계정 B의 버킷에 접근하려면 ① A 계정의 신원 기반 정책이 Allow **그리고** ② B 계정의 리소스 기반 정책이 A를 Allow — **둘 다** 필요하다(같은 계정 내에서는 둘 중 하나만 있어도 됨). 이 "양쪽 모두" 규칙이 cross-account 시나리오의 단골 함정이다.

## 평가 흐름을 시나리오로 읽기

추상적인 알고리즘을 구체적 상황에 대보자.

**상황 1: 개발자에게 admin 권한이 있는데 특정 S3 버킷만 막고 싶다.**
신원 기반 정책은 `AdministratorAccess`라 모든 것을 Allow한다. 여기에 명시적 Deny statement를 추가하면(예: 특정 버킷 ARN에 `"Effect": "Deny"`) 명시적 Deny가 Allow를 이겨서 그 버킷만 차단된다. SCP에도 같은 Deny를 넣으면 계정 전체에 강제된다.

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::sensitive-prod-bucket",
    "arn:aws:s3:::sensitive-prod-bucket/*"
  ]
}
```

**상황 2: SCP에서 `ec2:*`를 명시적으로 Deny했는데 사용자에게 `AmazonEC2FullAccess`가 있다.**
결과는 Deny. SCP의 명시적 Deny가 모든 것을 이긴다. 사용자 정책의 Allow는 무력화된다. 이것이 SCP를 거버넌스 가드레일로 쓰는 이유다.

**상황 3: 아무 정책도 그 액션을 언급하지 않는다.**
결과는 Deny다. 하지만 상황 2의 Deny와는 **성격이 다르다.** 상황 2는 누군가 명시적으로 막은 것이고, 상황 3은 아무도 허용하지 않은 것이다. 이 구분은 진단할 때 결정적이다 — 전자는 "어느 Deny 문장을 고쳐야 하나"를 찾는 문제이고, 후자는 "어떤 Allow를 추가해야 하나"를 찾는 문제다. 오류 메시지에 `explicit deny`라는 단어가 있는지 여부가 이 둘을 갈라 준다.

| 결과 | 원인 | 오류 메시지 단서 | 해결 방향 |
|------|------|------------------|-----------|
| 명시적 Deny | 어떤 정책이 `"Effect": "Deny"` | "with an explicit deny in a ..." | 그 Deny 문장을 찾아 수정하거나 예외를 만든다 |
| 묵시적 Deny | 아무도 Allow하지 않음 | explicit이라는 단어 없음 | Allow를 추가한다 |
| 가드레일 초과 | Allow는 있으나 상한 밖 | 경계·SCP를 지목 | 상한을 조정하거나 요구를 축소한다 |

세 가지를 하나의 판정 절차로 압축하면 이렇게 된다. 지금은 이 골격만 확실히 잡아 두면 충분하고, 여섯 종류의 정책이 동시에 얽히는 정밀 계산은 **Week 2에서 본격적으로 다룬다.**

```
[ Day 2 수준의 판정 골격 — 세 칸만 기억한다 ]

   요청 (주체 · 액션 · 리소스 · 상황)
        │
        ▼
   ┌─────────────────────────────────────────┐
   │ ① 어디든 명시적 Deny가 있나?             │
   │    SCP · 경계 · Identity · Resource      │
   └─────────────────────────────────────────┘
        │ 있다 ──▶ ❌ DENY (여기서 끝, 나머지 안 봄)
        │ 없다
        ▼
   ┌─────────────────────────────────────────┐
   │ ② 가드레일(SCP · 권한 경계)이 허용하나?  │
   │    이 층은 권한을 "주지 않고" 깎기만 한다 │
   └─────────────────────────────────────────┘
        │ 아니다 ──▶ ❌ DENY
        │ 그렇다
        ▼
   ┌─────────────────────────────────────────┐
   │ ③ 명시적 Allow가 있나?                   │
   │    같은 계정: Identity **또는** Resource │
   │    교차 계정: Identity **그리고** Resource│
   └─────────────────────────────────────────┘
        │ 없다 ──▶ ❌ DENY (묵시적 거부)
        │ 있다
        ▼
        ✅ ALLOW
```

이 세 칸이 IAM 판정의 뼈대다. Week 2에서는 여기에 세션 정책·RCP·VPC 엔드포인트 정책이 더해지고, 조건 키가 각 층에서 어떻게 평가되는지까지 정밀하게 계산하는 법을 익힌다. 지금 단계에서 확실히 해 둘 것은 **"Deny 우선 → 가드레일 통과 → Allow 존재"라는 순서와, 가드레일은 권한을 만들지 못한다는 성질** 두 가지다.

> 🎯 **시나리오**: "한 보안팀이 모든 계정에서 CloudTrail 비활성화를 막고 싶다"는 요구. 정답은 사용자별 정책 수정이 아니라 **SCP에 `cloudtrail:StopLogging`·`cloudtrail:DeleteTrail` Deny**를 OU에 적용하는 것. 이러면 그 계정의 admin이나 root조차 CloudTrail을 끌 수 없다(management 계정 root는 SCP 예외). 명시적 Deny가 모든 Allow를 이기는 원리의 거버넌스 응용이다.

## 정책 디버깅 도구: 누가 무엇을 할 수 있는지 검증하기

평가 로직을 머리로만 따라가면 실수한다. AWS는 검증 도구를 제공한다.

```bash
# ① 현재 호출자가 누구인지 — 모든 디버깅의 시작점
aws sts get-caller-identity

# ② 특정 주체가 특정 행위를 할 수 있는지 시뮬레이션 (실제로 호출하지 않는다)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/secret.txt

# ③ 사용자에게 붙은 정책 — 관리형과 인라인은 명령이 다르다
aws iam list-attached-user-policies --user-name alice   # 관리형
aws iam list-user-policies          --user-name alice   # 인라인
aws iam list-groups-for-user        --user-name alice   # 그룹 경유 권한

# ④ 역할 쪽도 마찬가지로 두 갈래
aws iam list-attached-role-policies --role-name AppRole
aws iam list-role-policies          --role-name AppRole

# ⑤ 실제 정책 문서를 꺼내 읽기 (기본 버전을 지정해야 한다)
aws iam get-policy --policy-arn arn:aws:iam::111122223333:policy/DataReader
aws iam get-policy-version \
  --policy-arn arn:aws:iam::111122223333:policy/DataReader \
  --version-id v3

# ⑥ 역할의 신뢰 정책 확인 — "누가 이 역할을 맡을 수 있나"
aws iam get-role --role-name AppRole \
  --query 'Role.AssumeRolePolicyDocument'

# ⑦ 계정 전체의 IAM 구성을 한 번에 덤프 (감사·조사용)
aws iam get-account-authorization-details --output json > iam-dump.json
```

정책을 새로 만들고 역할에 붙이는 흐름도 손에 익혀 두면 좋다. 아래는 EC2가 특정 버킷만 읽게 하는 최소 권한 구성의 전 과정이다.

```bash
# ① 신뢰 정책 — "EC2 서비스가 이 역할을 맡을 수 있다"
cat > trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name AppInstanceRole \
  --assume-role-policy-document file://trust.json

# ② 권한 정책 — "맡으면 이 버킷만 읽을 수 있다"
cat > permission.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::app-config"
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::app-config/*"
    }
  ]
}
EOF

aws iam put-role-policy --role-name AppInstanceRole \
  --policy-name ReadAppConfig \
  --policy-document file://permission.json

# ③ 인스턴스 프로파일로 감싸 EC2에 부착한다
aws iam create-instance-profile --instance-profile-name AppInstanceProfile
aws iam add-role-to-instance-profile \
  --instance-profile-name AppInstanceProfile \
  --role-name AppInstanceRole

# ④ 확인 — 인스턴스 안에서 이 명령이 assumed-role ARN을 반환해야 정상
#    aws sts get-caller-identity
```

이 다섯 줄짜리 권한 정책에 오늘 배운 것이 전부 들어 있다. `ListBucket`은 **버킷 ARN**에, `GetObject`는 **객체 ARN**에 걸었고, 와일드카드는 객체 경로에만 썼으며, 액세스 키는 어디에도 없다.

> ⚠️ **함정**: EC2에 역할을 붙일 때 부착하는 것은 역할 자체가 아니라 **인스턴스 프로파일**이다. 콘솔에서는 같은 이름으로 자동 생성돼 구분이 보이지 않지만, CLI·IaC로 만들 때는 프로파일을 따로 만들고 역할을 그 안에 넣어야 한다. "역할을 만들었는데 EC2에 붙일 수가 없다"는 증상의 대부분이 이 단계 누락이다. Lambda·ECS 태스크는 프로파일 없이 역할을 직접 지정한다는 점도 함께 기억해 둔다.

> 📚 **사례**: 운영 환경에서 "왜 접근이 거부되는가"의 80%는 ① 암묵적 Deny(아무도 Allow 안 함) ② SCP의 숨은 Deny ③ Permissions Boundary 초과 ④ cross-account에서 한쪽만 허용 — 이 네 가지다. `aws sts get-caller-identity`로 "내가 지금 어떤 역할인지" 먼저 확인하는 습관이 디버깅 시간을 절반으로 줄인다. CloudTrail의 `AccessDenied` 이벤트에는 어떤 정책 때문인지 단서가 남는다.

## IAM Access Analyzer: 의도치 않은 외부 노출 탐지

IAM Access Analyzer는 리소스 정책을 분석해 **계정·조직 경계 밖으로 접근을 허용하는 리소스**를 자동으로 찾아낸다. S3 버킷, IAM 역할, KMS 키, Lambda 함수 등이 외부 principal에게 열려 있으면 finding을 생성한다.

이것은 도메인 2(탐지)와 도메인 4(IAM)의 교차점이다. 수백 개의 버킷·역할을 사람이 일일이 검토할 수 없으니, "신뢰 경계를 넘는 접근"을 자동으로 탐지하는 것이다. 정책 생성(policy generation) 기능은 CloudTrail 로그를 분석해 실제 사용된 권한만으로 최소 권한 정책을 만들어주기도 한다.

> 💡 **관련 이론**: Access Analyzer의 핵심은 **외부(external) vs 신뢰(trusted)** 구분이다. 같은 계정·조직 내 접근은 정상으로 보고, 그 경계를 넘는 것만 finding으로 올린다. "조직 영역(zone of trust)을 organization으로 설정"하면 조직 내 cross-account는 정상 처리되고 진짜 외부 노출만 잡힌다.

## 정리하며 — IAM은 알고리즘이다

오늘의 핵심 세 가지. 첫째, IAM의 빌딩블록 중 **Role(임시 자격증명)을 기본으로 쓰고 User(장기 키)는 피한다** — 이것이 모든 모범 사례의 출발점이다. 둘째, 정책 평가는 **암묵적 Deny → 명시적 Allow가 뒤집음 → 명시적 Deny가 모든 것을 이김**이라는 3원칙의 알고리즘이고, SCP·Permissions Boundary는 권한을 주지 않고 상한선만 긋는다. 셋째, cross-account는 **양쪽 계정 모두**의 허용이 필요하다.

> 📚 **사례**: 실무에서 가장 흔한 IAM 사고는 정교한 침해가 아니라 **오래된 액세스 키**다. 개발자가 편의를 위해 만든 키가 스크립트·CI 설정·개인 노트북에 흩어져 남고, 그 개발자가 퇴사한 뒤에도 계속 유효하다. 이런 키는 소유자가 없어 회전되지 않고, 아무도 그것이 무엇을 하는지 몰라 지우지도 못한다. 대응의 순서는 정해져 있다 — ① 자격 증명 보고서로 계정의 모든 키와 마지막 사용 시각을 뽑고 ② 오래 안 쓴 키부터 **삭제가 아니라 비활성화**하고 ③ 아무 영향이 없음을 확인한 뒤 삭제한다. 비활성화 단계를 건너뛰면 무엇이 깨졌는지 되돌릴 수 없다. 근본 해법은 애초에 키를 만들지 않는 것 — 사람은 Identity Center로, 워크로드는 역할로 접근하게 하면 키를 만들 이유가 사라진다.

> 🎯 **시나리오**: "CI 파이프라인이 AWS에 배포하기 위해 액세스 키를 시크릿에 저장해 쓰고 있다. 보안팀이 장기 키를 없애라고 요구했다." → 키를 더 자주 회전하는 보기는 문제를 미룰 뿐이다. 방향은 **키 자체를 없애는 것**이다. CI 플랫폼이 OIDC를 지원하면 그 토큰으로 역할을 맡게 하고, 그렇지 않으면 배포 전용 역할을 두고 최소 권한으로 좁힌다. "회전 주기를 90일로 줄인다"와 "장기 키를 제거한다"가 함께 보기에 있으면 후자가 정답이다 — 전자는 노출 창을 줄일 뿐 없애지 못한다. 구체적인 OIDC 신뢰 정책 구성은 Day 4에서 다룬다.

내일은 정책을 더 깊이 판다. Identity vs Resource 정책의 미묘한 상호작용, Condition 키를 이용한 정밀 통제, 그리고 Permissions Boundary로 최소 권한을 설계하는 실전 패턴을 다룬다. 오늘 배운 평가 알고리즘이 그 모든 것의 토대가 된다.

## 한 줄 요약

IAM의 네 빌딩블록 중 **Group은 자격 증명이 없어 Principal이 될 수 없고**, User는 영구 자격 증명(`AKIA...`, 키 2개), Role은 STS가 발급하는 만료 자격 증명(`ASIA...`, SessionToken 포함 3개)을 쓴다 — 유출 시 피해가 시간으로 제한되는 것이 역할을 기본값으로 삼는 이유다. 정책은 붙는 위치로 갈리는데 **Identity 정책에는 `Principal`이 없고 Resource 정책에는 필수**이며, 리소스 정책은 일부 서비스만 지원한다. `NotAction`은 Allow와 결합하면 새 서비스가 나올 때마다 범위가 자동으로 넓어지므로 **Deny와만** 쓴다. 관리형 정책과 인라인 정책은 조회 명령이 달라 인라인을 빠뜨리는 조사가 흔하다. 평가는 **① 명시적 Deny 우선 → ② 가드레일(SCP·경계) 통과 → ③ 명시적 Allow 존재**의 세 칸이며, 같은 계정은 Identity 또는 Resource 중 하나로 충분하지만 **교차 계정은 양쪽 모두** 필요하다. 가드레일은 권한을 만들지 못하고 깎기만 하므로 `AdministratorAccess`도 상한을 넘지 못한다. 막혔을 때는 `aws sts get-caller-identity`로 "지금 내가 누구인지"부터 확인하고, 오류 메시지에 `explicit deny`가 있는지로 명시적 거부와 묵시적 거부를 갈라 본다.

---

## 📝 연습 문제

**문제 1.** 한 IAM 사용자가 `AdministratorAccess` 관리형 정책을 가지고 있다. 동시에 그 사용자가 속한 계정의 SCP에 `s3:*`에 대한 명시적 `Deny`가 있다. 이 사용자가 S3 객체를 읽으려 하면?

A) AdministratorAccess가 우선하므로 허용된다  
B) SCP의 명시적 Deny가 모든 Allow를 이기므로 거부된다  
C) 두 정책이 충돌하므로 평가 오류가 발생한다  
D) root 사용자만 S3에 접근할 수 있다  

**정답: B**  
해설: 정책 평가의 절대 원칙은 명시적 Deny가 어떤 Allow보다 우선한다는 것이다. SCP는 가드레일로서 해당 Action의 상한을 차단하므로, 사용자 정책에 admin 권한이 있어도 SCP의 Deny에 막혀 거부된다. 평가 충돌로 오류가 나는 것이 아니라 결정론적으로 Deny가 이기며, root 접근 여부는 이 판단과 무관하다.

---

**문제 2.** 계정 A의 IAM 역할이 계정 B의 S3 버킷에 객체를 쓰려고 한다. 접근이 성공하려면 반드시 충족돼야 하는 조건은?

A) 계정 A의 신원 기반 정책에만 Allow가 있으면 충분하다  
B) 계정 B의 버킷 정책에만 Allow가 있으면 충분하다  
C) 계정 A의 신원 기반 정책과 계정 B의 버킷 정책 양쪽 모두 Allow가 있어야 한다  
D) 두 계정이 같은 Organization에 속하면 정책 없이 자동 허용된다  

**정답: C**  
해설: cross-account 접근은 양쪽 계정에서 각각 평가가 일어나므로, 호출 측(A)의 신원 기반 정책 Allow와 리소스 측(B)의 리소스 기반 정책 Allow가 모두 필요하다. 같은 계정 내에서는 둘 중 하나만 있어도 되지만 계정 경계를 넘으면 둘 다 필수다. 같은 Organization이라는 사실만으로 자동 허용되지 않는다.

---

**문제 3.** IAM Group에 대한 설명으로 옳은 것은?

A) Group은 자체 자격 증명을 가지며 직접 로그인할 수 있다  
B) Role의 trust policy에서 Group을 Principal로 지정할 수 있다  
C) Group은 자격 증명이 없는 정책 부착용 컨테이너이며 Principal이 될 수 없다  
D) Group에 임시 자격 증명을 발급해 cross-account 접근에 사용한다  

**정답: C**  
해설: Group은 사용자에게 정책을 일괄 부여하기 위한 컨테이너일 뿐 자격 증명이 없고, 따라서 로그인하거나 Principal로 지정될 수 없다. AssumeRole의 대상이나 trust policy의 Principal로 Group을 쓰면 동작하지 않는다. 임시 자격 증명은 Role을 통해 STS가 발급하며 Group과는 무관하다.

---

**문제 4.** 한 개발자에게 `AmazonS3FullAccess`가 부여돼 있지만, 어떤 정책도 명시적으로 허용하지 않은 `dynamodb:GetItem`을 호출하려 한다. 결과와 그 이유로 옳은 것은?

A) 허용 — 명시적 Deny가 없으므로 기본적으로 허용된다  
B) 거부 — 어떤 정책도 해당 Action을 Allow하지 않아 암묵적 Deny가 적용된다  
C) 허용 — S3 권한이 있으면 DynamoDB도 자동으로 허용된다  
D) 거부 — DynamoDB는 IAM으로 통제되지 않기 때문이다  

**정답: B**  
해설: IAM의 기본 상태는 암묵적 Deny이며 권한은 명시적으로 부여돼야 한다. S3 권한은 DynamoDB Action과 무관하므로, `dynamodb:GetItem`을 허용하는 명시적 Allow가 없으면 암묵적 Deny로 거부된다. 명시적 Deny가 없다고 자동 허용되는 것은 아니며, DynamoDB도 당연히 IAM으로 통제된다.

---

**문제 5.** 보안팀이 모든 멤버 계정에서 누구도(admin·root 포함) CloudTrail을 비활성화하지 못하게 강제하려 한다. 가장 적절한 방법은?

A) 각 계정의 모든 IAM 사용자 정책에 CloudTrail Deny를 일일이 추가한다  
B) SCP에 `cloudtrail:StopLogging`과 `cloudtrail:DeleteTrail`에 대한 Deny를 작성해 OU에 적용한다  
C) CloudTrail에 리소스 기반 정책으로 Deny를 설정한다  
D) GuardDuty로 CloudTrail 비활성화를 탐지해 알림만 보낸다  

**정답: B**  
해설: SCP의 명시적 Deny는 멤버 계정의 admin과 root에까지 적용되는 조직 가드레일이므로, CloudTrail 중단·삭제 Action을 Deny로 묶으면 누구도 끌 수 없다. 사용자별 정책 추가는 누락 위험이 크고, CloudTrail은 리소스 기반 정책으로 이런 통제를 하지 않으며, GuardDuty 탐지는 사후 알림일 뿐 비활성화 자체를 막지 못한다.

---
