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

> 💡 **관련 이론**: Group은 "그릇"일 뿐 그 자체로는 자격증명이 없어서 **Group을 Principal로 지정할 수 없다.** 신입이 자주 틀리는 부분 — Role의 trust policy에 `"Principal": {"AWS": "arn:...:group/Devs"}`를 쓰면 동작하지 않는다. 그룹은 정책을 사용자에게 전달하는 통로일 뿐, AssumeRole의 대상이 될 수 없다.

> 🔍 **더 깊이**: Role을 "맡는다(assume)"는 것의 실체는 STS(Security Token Service)가 임시 자격증명 3종(AccessKeyId, SecretAccessKey, **SessionToken**)을 발급하는 것이다. 이 자격증명은 만료 시간(기본 1시간, 최대 12시간)이 있어서, 노출돼도 영향이 시간적으로 제한된다. 이것이 장기 키보다 안전한 근본 이유이며, Day 4에서 STS를 깊이 다룬다.

## 정책의 두 종류: Identity-based vs Resource-based

정책은 "어디에 붙느냐"로 두 종류로 나뉜다. 오늘은 개념만 잡고 Day 3에서 깊이 들어간다.

- **Identity-based policy(신원 기반)**: User·Group·Role에 붙는다. "이 주체가 무엇을 할 수 있는가"를 기술. Principal 요소가 없다(누구에게 붙는지가 곧 주체).
- **Resource-based policy(리소스 기반)**: 리소스(S3 버킷, KMS 키, SQS 큐 등)에 직접 붙는다. **Principal 요소가 필수** — "누가 이 리소스에 접근할 수 있는가"를 기술.

리소스 기반 정책의 결정적 효용은 **cross-account 접근**을 가능하게 한다는 점이다. 다른 계정의 주체에게 내 S3 버킷을 열어주려면 그 버킷의 리소스 기반 정책에 상대 계정을 명시한다.

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

> 🎯 **시나리오**: "한 보안팀이 모든 계정에서 CloudTrail 비활성화를 막고 싶다"는 요구. 정답은 사용자별 정책 수정이 아니라 **SCP에 `cloudtrail:StopLogging`·`cloudtrail:DeleteTrail` Deny**를 OU에 적용하는 것. 이러면 그 계정의 admin이나 root조차 CloudTrail을 끌 수 없다(management 계정 root는 SCP 예외). 명시적 Deny가 모든 Allow를 이기는 원리의 거버넌스 응용이다.

## 정책 디버깅 도구: 누가 무엇을 할 수 있는지 검증하기

평가 로직을 머리로만 따라가면 실수한다. AWS는 검증 도구를 제공한다.

```bash
# IAM Policy Simulator: 특정 주체가 특정 행위를 할 수 있는지 시뮬레이션
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/secret.txt

# 현재 호출자가 누구인지 (역할 디버깅의 시작점)
aws sts get-caller-identity

# 사용자에게 붙은 정책 목록 확인
aws iam list-attached-user-policies --user-name alice
aws iam list-user-policies --user-name alice  # 인라인 정책
```

> 📚 **사례**: 운영 환경에서 "왜 접근이 거부되는가"의 80%는 ① 암묵적 Deny(아무도 Allow 안 함) ② SCP의 숨은 Deny ③ Permissions Boundary 초과 ④ cross-account에서 한쪽만 허용 — 이 네 가지다. `aws sts get-caller-identity`로 "내가 지금 어떤 역할인지" 먼저 확인하는 습관이 디버깅 시간을 절반으로 줄인다. CloudTrail의 `AccessDenied` 이벤트에는 어떤 정책 때문인지 단서가 남는다.

## IAM Access Analyzer: 의도치 않은 외부 노출 탐지

IAM Access Analyzer는 리소스 정책을 분석해 **계정·조직 경계 밖으로 접근을 허용하는 리소스**를 자동으로 찾아낸다. S3 버킷, IAM 역할, KMS 키, Lambda 함수 등이 외부 principal에게 열려 있으면 finding을 생성한다.

이것은 도메인 2(탐지)와 도메인 4(IAM)의 교차점이다. 수백 개의 버킷·역할을 사람이 일일이 검토할 수 없으니, "신뢰 경계를 넘는 접근"을 자동으로 탐지하는 것이다. 정책 생성(policy generation) 기능은 CloudTrail 로그를 분석해 실제 사용된 권한만으로 최소 권한 정책을 만들어주기도 한다.

> 💡 **관련 이론**: Access Analyzer의 핵심은 **외부(external) vs 신뢰(trusted)** 구분이다. 같은 계정·조직 내 접근은 정상으로 보고, 그 경계를 넘는 것만 finding으로 올린다. "조직 영역(zone of trust)을 organization으로 설정"하면 조직 내 cross-account는 정상 처리되고 진짜 외부 노출만 잡힌다.

## 정리하며 — IAM은 알고리즘이다

오늘의 핵심 세 가지. 첫째, IAM의 빌딩블록 중 **Role(임시 자격증명)을 기본으로 쓰고 User(장기 키)는 피한다** — 이것이 모든 모범 사례의 출발점이다. 둘째, 정책 평가는 **암묵적 Deny → 명시적 Allow가 뒤집음 → 명시적 Deny가 모든 것을 이김**이라는 3원칙의 알고리즘이고, SCP·Permissions Boundary는 권한을 주지 않고 상한선만 긋는다. 셋째, cross-account는 **양쪽 계정 모두**의 허용이 필요하다.

내일은 정책을 더 깊이 판다. Identity vs Resource 정책의 미묘한 상호작용, Condition 키를 이용한 정밀 통제, 그리고 Permissions Boundary로 최소 권한을 설계하는 실전 패턴을 다룬다. 오늘 배운 평가 알고리즘이 그 모든 것의 토대가 된다.

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
