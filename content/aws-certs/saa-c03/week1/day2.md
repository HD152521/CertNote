# Day 2 - IAM 기초: 누구에게 무엇을 허용할 것인가

처음 AWS를 쓸 때 가장 빨리 부딪히는 벽은 권한이다. 로컬에서는 잘 동작하던 코드가 EC2에 올리는 순간 `AccessDenied`를 뱉고, 콘솔에서 잘 보이던 S3 버킷이 다른 사용자에게는 안 보인다. 이런 일이 반복되면 자연스럽게 IAM의 정체가 궁금해진다.

이 글은 IAM이 어떻게 동작하는지를 4개의 엔터티 — **User / Group / Role / Policy** — 를 중심으로 풀어낸다. 시험에서 가장 기본이면서 가장 자주 함정이 깔리는 영역이고, 실무에서도 "왜 이게 안 되지?"의 9할이 여기서 시작된다. IAM은 2010년 출시되었고, 그 전까지 AWS는 root 자격 증명 하나로 모든 걸 했다. 그게 얼마나 위험한 상태였는지 떠올려보면 IAM이 왜 모든 AWS 보안의 기반이 됐는지가 보인다.

## 인증과 인가, 그리고 IAM의 자리

IAM은 두 가지 질문에 답하는 시스템이다. 첫째 "이 요청자가 누구인가?"(Authentication, AuthN), 둘째 "그 사람이 이걸 해도 되는가?"(Authorization, AuthZ). 전자는 자격 증명(비밀번호, Access Key, STS 임시 토큰)으로, 후자는 정책(Policy)으로 해결한다. 모든 AWS API 호출은 **SigV4 서명 알고리즘**으로 서명된 HTTP 요청이고, AWS는 그 서명을 검증해 신원을 확인한 다음 정책을 평가해 허용/거부를 결정한다.

> 💡 **관련 이론**: 인증과 인가는 Saltzer & Schroeder가 1975년 논문 "The Protection of Information in Computer Systems"에서 제시한 보안 8대 원칙의 기반이다. 그중 핵심이 **최소 권한 원칙(Principle of Least Privilege)** 과 **Fail-safe Defaults**(기본은 거부). AWS IAM의 "Implicit Deny + Explicit Allow" 모델이 정확히 이 두 원칙을 구현한다. 권한 모델은 RBAC(Role-Based, NIST RBAC 표준 INCITS 359-2012)와 ABAC(Attribute-Based, NIST SP 800-162) 두 축으로 나뉘는데, IAM은 두 가지를 모두 지원하고 태그 기반 ABAC는 2018년에 정식 추가됐다.

> 🔍 **더 깊이**: SigV4 서명은 요청 본문, 헤더, 타임스탬프, 자격 증명 ID, 시크릿 키를 HMAC-SHA256으로 체이닝해 만든다. 핵심은 시크릿이 네트워크로 절대 나가지 않는다는 점. AWS 서버는 같은 시크릿으로 같은 서명을 다시 계산해서 비교한다. 또 타임스탬프가 ±15분을 벗어나면 거부되므로 replay 공격이 막힌다. EC2 안에서 IMDSv2가 임시 자격 증명을 발급하는 것도 결국 이 SigV4 서명에 쓸 키를 안전하게 전달하기 위함이다.

## IAM의 4대 엔터티

| 엔터티 | 정의 | 자격 증명 | 수명 |
|--------|------|----------|------|
| **User** | 사람/앱 같은 영구 신원 | 비밀번호, Access Key | 영구 (회전 필요) |
| **Group** | User들의 묶음. 정책 부여 단위 | 없음 (컨테이너) | - |
| **Role** | 임시로 빌릴 수 있는 신원 | STS Temp Credential | 15분 ~ 12시간 |
| **Policy** | JSON 권한 문서 | - | - |

여기서 흔히 오해하는 게 Group이다. **Group은 사람이 아니다.** 로그인할 수도 없고, 그 자체의 자격 증명도 없다. 그냥 User들을 묶어서 정책을 한 번에 부여하기 위한 컨테이너일 뿐이다. 그리고 Group은 다른 Group의 멤버가 될 수 없다 — 중첩 불가다. 이게 OS의 유닉스 그룹 모델과 가장 큰 차이다(유닉스는 사용자가 여러 그룹에 속할 수는 있지만 그룹의 그룹은 없음, IAM도 동일).

가장 흥미로운 건 Role이다. Role은 "빌려쓰는 신원"이다. EC2 인스턴스가, Lambda 함수가, 다른 계정의 사용자가, 외부 IdP가 — 누구든지 신뢰 정책(Trust Policy)에 명시된 주체라면 이 Role을 잠시 빌려서 그 권한으로 동작할 수 있다. 빌릴 때는 `sts:AssumeRole` API가 호출되고, 결과로 **AccessKey + SecretKey + SessionToken** 3종 세트가 반환된다. 이 토큰들은 만료가 있고, 만료되면 다시 빌려야 한다. 이게 "장기 자격 증명을 안 두는" 보안 모델의 핵심이다.

```
[ IAM 엔터티 관계 ]

   +-------+      attach      +--------+
   | User  | <-------------- | Policy |
   +-------+                 +--------+
       |                        ^
   member of                    |
       v                    attach
   +-------+                    |
   | Group | <------------------+
   +-------+
                                |
   +-------+    AssumeRole      |
   | Role  | <---- via STS  ----+
   +-------+
       ^
       |   trust policy
   +-------+
   | EC2 / Lambda / 다른 계정 / OIDC
```

> 📚 **사례**: 2017년 OneLogin 침해 사건. 공격자가 AWS API 키를 탈취한 뒤 며칠간 고객 데이터를 빼냈다. 사후 분석에서 드러난 핵심 원인은 **장기 IAM User Access Key를 코드 저장소(Git)에 커밋했다가 노출됐고, 그 키에 광범위한 권한이 붙어 있었다**는 것. 만약 이 키가 Role 기반 임시 자격 증명이었다면 노출 시점에 이미 만료됐을 가능성이 높다. 이 사건은 "사람이든 앱이든 가능한 한 Role을 써라"는 베스트 프랙티스가 자리잡은 결정적 계기 중 하나다.

## Policy: JSON 한 장이 모든 걸 결정한다

IAM 정책은 JSON 문서로 작성하고, 핵심 필드는 5개다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowS3ReadOnSpecificBucket",
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::my-bucket",
      "arn:aws:s3:::my-bucket/*"
    ],
    "Condition": {
      "StringEquals": {"aws:SourceVpc": "vpc-0abc123"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

- **Effect**: `Allow` 또는 `Deny`. 둘 다 없으면 암묵적 거부.
- **Action**: 허용할 API. 와일드카드 `s3:*` 가능하지만 위험.
- **Resource**: 대상 ARN. `*`는 모든 리소스라는 뜻.
- **Condition**: IP, MFA, 시간, 태그, SourceVpc 등으로 추가 제약.
- **Principal**: 리소스 정책에서만 등장. 누구에게 허용하는지.

> ⚠️ **함정**: `"Resource": "*"`와 `"Action": "*"`를 같이 쓰면 AdministratorAccess와 동급이 된다. 시험에선 "감사 결과 과도한 권한이 발견됐다"는 식의 문제로 등장하고, 답은 거의 항상 "IAM Access Analyzer로 사용 안 되는 권한을 줄여라" 또는 "Permissions Boundary를 설정하라"다.

정책에는 6가지 종류가 있고, 시험에선 이걸 구별하는 게 핵심이다.

| 종류 | 첨부 대상 | 용도 |
|------|-----------|------|
| Identity-based (Managed/Inline) | User, Group, Role | "이 신원이 무엇을 할 수 있나" |
| Resource-based | S3 버킷, KMS 키, Lambda, SQS, SNS | "이 리소스에 누가 접근 가능한가" |
| Permissions Boundary | User, Role | 신원이 가질 수 있는 권한의 **상한선** |
| Service Control Policy (SCP) | Organizations OU/Account | 계정 전체의 권한 상한선 |
| Session Policy | AssumeRole 시 인라인 전달 | 임시 세션 동안만 권한 축소 |
| Access Control List (ACL) | S3, VPC (레거시) | 객체 단위 권한 (가능하면 회피) |

## 정책 평가 로직: 한 번이라도 명시적 거부면 끝

여러 정책이 동시에 적용될 때 AWS는 다음 순서로 평가한다.

```
1. 기본값: 거부 (Implicit Deny)
2. SCP 평가 → SCP에서 명시적 Deny면 → DENY (끝)
3. Resource-based 정책 평가
4. Identity-based 정책 평가
5. Permissions Boundary 평가
6. Session Policy 평가
7. 어딘가 명시적 Deny → DENY (끝)
8. 어딘가 Allow → ALLOW
9. 아무것도 없음 → DENY (Implicit Deny)
```

핵심 두 가지를 기억하면 된다. 첫째, **명시적 거부(Explicit Deny)는 어디에 있든 무조건 이긴다.** 둘째, **허용은 모든 레이어에서 동시에 허용되어야 한다.** SCP가 Deny면 IAM 정책이 아무리 Allow여도 안 된다. Permissions Boundary가 그 권한을 포함 안 하면 못 한다.

> 🔍 **더 깊이**: 같은 계정 안에서 Resource Policy와 Identity Policy가 둘 다 있을 때는 **합집합(union)** 이 적용된다. 즉 한 쪽만 Allow여도 통과한다. 그런데 **교차 계정(Cross-Account)** 일 때는 다르다. 양쪽 모두 Allow여야 한다(소유 계정의 Resource Policy + 호출 계정의 Identity Policy). 이게 시험 단골 함정이다. "S3 버킷 정책에서 다른 계정 User를 Allow했는데 왜 안 되냐"는 문제의 답은 "그 계정 안에서도 Identity Policy로 Allow해야 한다"는 것.

> 💡 **관련 이론**: 이 평가 로직은 형식적으로 보면 결정 트리(Decision Tree) 위에서의 명시적 우선순위 시스템이다. XACML(eXtensible Access Control Markup Language, OASIS 표준)이 비슷한 정책 결합 알고리즘(deny-overrides, permit-overrides 등)을 정의하고 있고, IAM은 그중 **deny-overrides** 를 기본으로 채택한다. 이는 보안에서 "안전 측 실패(fail-safe)"를 보장하는 가장 보수적인 선택이다.

## Root vs IAM User: 절대 root로 살지 않는다

AWS 계정을 만들면 처음 만들어지는 신원이 **root**다. root는 모든 권한을 가지고, 일부 작업(예: 계정 폐쇄, 결제 정보 변경, S3 MFA Delete 활성화)은 root만 할 수 있다. 그런데 일상 작업에 root를 쓰는 건 마치 리눅스에서 항상 `root`로 로그인하는 것과 같다.

실무 표준은 이렇다.

1. root에 **하드웨어 MFA 활성화**
2. root Access Key **삭제**
3. 일상 작업용 **IAM User** 또는 **IAM Identity Center(SSO)** 사용
4. root는 금고에 넣고 1년에 몇 번만 꺼냄

> 📚 **사례**: 2020년 한 스타트업이 root Access Key를 GitHub public repo에 실수로 push했다. 몇 분 만에 봇이 키를 스캔해 EC2 P3 인스턴스 수십 대를 띄워 암호화폐를 채굴했고, 24시간 만에 청구서가 $50,000을 넘었다. AWS는 보통 이런 사건을 인지하면 자동으로 키를 비활성화하고 청구도 면제해주지만, 모든 사례가 그렇진 않다. 교훈은 단순하다: root key는 **존재 자체가 위험**이다. GitHub은 이후 자체적으로 secret scanning을 도입해 AWS·GCP·Stripe 등의 키 패턴을 push 시점에 감지한다.

## IAM Identity Center(구 AWS SSO): 진짜 표준

현대 AWS 운영의 표준은 **IAM Identity Center**다. 회사의 IdP(Okta, Azure AD, Google Workspace)에서 SAML 2.0 또는 OIDC로 SSO 로그인하고, 권한 세트(Permission Set)를 통해 여러 계정에 임시 자격 증명을 발급받는다. 시험에서도 "여러 계정 다수 사용자 권한 관리"라는 시나리오면 거의 답은 IAM Identity Center다.

| 비교 | IAM User | IAM Identity Center |
|------|----------|---------------------|
| 자격 증명 | 영구 | 임시 (1-12시간) |
| 다계정 관리 | 어려움 | 쉬움 (Organizations 통합) |
| 외부 IdP 연동 | 별도 설정 | 기본 지원 |
| 회전 부담 | 사용자 책임 | 자동 |
| 시험 권장 | 개별 사용자 권장 X | ✅ |

## MFA: 두 번째 요인의 진짜 의미

MFA는 "내가 아는 것(비밀번호) + 내가 가진 것(토큰 생성기)"의 조합이다. AWS는 4가지 MFA를 지원한다.

- **가상 MFA**: Authy, Google Authenticator (TOTP, RFC 6238)
- **하드웨어 MFA**: YubiKey 등 FIDO U2F/WebAuthn
- **SMS MFA**: 더 이상 권장 안 함 (SIM swap 공격 취약)
- **U2F 보안 키**: 가장 안전. 피싱 내성 있음

TOTP는 30초마다 바뀌는 6자리 코드인데, 그 알고리즘은 RFC 6238에 정의되어 있다. 공유된 비밀(QR 코드 스캔 시 등록한 시드)과 현재 시각의 30초 윈도우를 HMAC-SHA1로 합쳐 해시하고, 그 결과의 일부분을 6자리 숫자로 자른다. 시험에선 "MFA를 강제하려면 어떻게?"라는 문제가 자주 나오는데, 답은 **정책의 Condition에 `aws:MultiFactorAuthPresent: true`를 거는 것**.

```json
"Condition": {
  "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
}
```

이 조건이 붙은 Deny statement는 "MFA를 안 거친 세션이면 무조건 거부"라는 의미가 된다. `BoolIfExists`를 쓰는 이유는 일부 서비스(예: IAM Role을 통한 서비스 간 호출)에서 이 키가 아예 존재하지 않을 수 있기 때문이다.

> 🔍 **더 깊이**: WebAuthn/FIDO2는 비대칭 키 기반이라 피싱에 본질적으로 강하다. 등록 시 디바이스에서 키 쌍을 생성하고, 공개키만 서버에 저장한다. 로그인 시 서버가 보낸 챌린지를 디바이스의 비밀키로 서명하는데, 그 서명에는 **origin(접속 도메인)** 이 포함된다. 따라서 피싱 사이트에서 받은 챌린지를 정상 서비스에 다시 던지는 공격이 자동으로 막힌다. SAA에선 깊게 안 물어보지만 "어떤 MFA가 가장 안전한가" 류 문제의 답은 FIDO/WebAuthn.

## EC2 Instance Profile과 IAM Role: 키 없이 권한 받는 법

EC2 안에서 S3에 접근하고 싶을 때 절대 하면 안 되는 게 Access Key를 코드에 하드코딩하는 것이다. 대신 **IAM Role을 EC2에 attach**한다. EC2는 IMDS(Instance Metadata Service, `169.254.169.254`)를 통해 그 Role의 임시 자격 증명을 받아오고, AWS SDK가 자동으로 그 키로 서명한다.

```bash
# EC2 안에서 (IMDSv2 사용)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```

이때 반환되는 자격 증명은 보통 1시간마다 자동 갱신된다. SDK는 만료 5분 전부터 미리 새 토큰을 받아오므로 애플리케이션 코드에서 신경 쓸 필요가 없다.

> 📚 **사례**: Capital One 사고(Day 1에서 봤음)의 직접 원인이 바로 이 IMDS의 IMDSv1 버전이었다. IMDSv1은 단순 GET이어서 SSRF로 외부 공격자가 접근 가능했다. IMDSv2는 PUT으로 토큰을 먼저 받아야 GET이 동작하므로 거의 대부분의 SSRF가 무력화된다. 2022년부터 모든 신규 EC2 AMI는 기본적으로 IMDSv2를 요구하도록 권장된다.

## 실무 베스트 프랙티스 정리

1. root는 봉인. MFA 필수.
2. 개별 IAM User 대신 **IAM Identity Center** 사용.
3. 사람·앱 모두 가능한 한 **Role + 임시 자격 증명**.
4. Access Key가 꼭 필요하면 **90일 회전**.
5. 정책은 **최소 권한**으로 시작해 필요할 때 확장.
6. **IAM Access Analyzer**로 미사용 권한 정기 정리.
7. **CloudTrail**로 모든 IAM 활동 감사.
8. **Permissions Boundary**로 개발자가 만드는 Role의 권한 상한 강제.

## 정리하며

IAM의 4대 엔터티(User/Group/Role/Policy)와 정책 평가 로직(명시 Deny > 명시 Allow > 묵시 Deny)이 오늘의 두 그림이다. 이 둘만 머리에 박혀 있어도 시험 IAM 영역의 70%는 풀린다. 다음 글에서는 STS와 정책 평가의 더 깊은 내부 — Permissions Boundary, ABAC 태그, Confused Deputy 문제 — 를 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 여러 AWS 계정을 운영하며, 사내 Okta로 단일 로그인을 하길 원한다. 가장 적합한 솔루션은?

A) 각 계정마다 IAM User를 만들고 같은 비밀번호 사용
B) IAM Identity Center(구 AWS SSO)로 Okta와 SAML 페더레이션
C) root 자격 증명을 공유
D) IAM Role을 직접 만들어 Okta 사용자에게 분배

**정답: B**
해설: 다계정 + 외부 IdP 시나리오는 거의 항상 IAM Identity Center. SAML 2.0 또는 SCIM으로 Okta와 연동되고, Permission Set으로 다계정 권한을 통합 관리한다. A는 자격 증명 폭증, C는 보안 사고로 직행, D도 가능하지만 사용자가 늘면 Trust Policy 관리가 폭발한다. Identity Center는 권한 세트를 Permission Set이라는 추상화로 묶어 다계정 운영을 단순화한다.

---

**문제 2.** EC2 인스턴스가 S3에 접근해야 한다. 가장 안전한 방법은?

A) Access Key를 환경 변수로 설정
B) Access Key를 코드에 하드코딩
C) IAM Role을 EC2에 attach
D) root 자격 증명 사용

**정답: C**
해설: Instance Profile(IAM Role을 EC2에 붙이는 메커니즘)이 정답. SDK가 IMDSv2를 통해 임시 자격 증명을 자동 갱신해서 키 회전 부담이 없다. A는 누출 위험, B는 가장 빠른 사고 경로(GitHub 스캔봇이 분 단위로 잡음), D는 절대 금기. 추가로 IMDSv2 강제, hop limit 1 같은 설정으로 SSRF 방어도 같이 챙겨야 한다.

---

**문제 3.** IAM 정책 평가 시 다음 중 옳은 것은?

A) Allow가 하나라도 있으면 무조건 허용
B) 명시적 Deny는 모든 Allow를 무력화
C) 기본값은 Allow
D) Resource-based 정책이 Identity 정책보다 우선

**정답: B**
해설: IAM의 핵심 원리. Deny > Allow > Implicit Deny. A는 SCP나 Permissions Boundary가 막을 수 있으므로 틀림. C는 정반대(Fail-safe defaults). D는 같은 계정 내에서는 합집합이고 교차 계정에서는 둘 다 Allow여야 하므로 단순 우선순위가 아님. XACML 표준에서도 deny-overrides가 가장 보수적인 결합 알고리즘이다.

---

**문제 4.** Group에 대한 설명으로 옳은 것은?

A) Group은 로그인할 수 있다
B) Group은 다른 Group의 멤버가 될 수 있다
C) Group은 자체 자격 증명이 없다
D) Group에 직접 Access Key를 발급할 수 있다

**정답: C**
해설: Group은 단순 컨테이너로 자격 증명도 없고 로그인도 불가. 중첩도 안 됨. 정책을 효율적으로 부여하기 위한 그룹화 단위일 뿐이다. 이 점 때문에 권한 모델은 일반적으로 "User → Group → Policy" 단방향 구조이고, 더 복잡한 계층이 필요하면 SCP(Organizations)나 Permissions Boundary로 해결한다.

---

**문제 5.** Cross-Account로 다른 계정의 사용자에게 S3 버킷 접근을 허용하려 한다. 무엇이 필요한가?

A) 버킷 정책에서 Allow만 해주면 됨
B) 호출자 계정의 IAM 정책에서 Allow만 해주면 됨
C) 양쪽 모두 Allow가 필요
D) Organizations 가입이 필수

**정답: C**
해설: Cross-account는 **두 계정 모두에서 명시적 Allow**가 필요. 소유 계정의 Resource Policy + 호출 계정의 Identity Policy. 같은 계정이면 한 쪽만 있어도 합집합으로 통과되지만 cross-account는 교집합처럼 동작한다. 이건 IAM 평가 로직에서 가장 자주 틀리는 부분이다.

---

**문제 6.** MFA를 강제하는 가장 적절한 방법은?

A) 사용자에게 MFA를 켜라고 부탁
B) 정책의 Condition에 `aws:MultiFactorAuthPresent: true` 추가
C) root 자격 증명만 MFA 사용
D) Access Key 회전 주기 단축

**정답: B**
해설: IAM 정책의 Condition이 답. `BoolIfExists`를 같이 써서 MFA 키가 없는 세션(서비스 호출 등)을 정확히 다뤄야 한다. A는 강제력이 없고, C는 일반 사용자를 보호하지 못하며, D는 MFA가 아닌 키 회전 정책일 뿐이다. 보안 정책은 항상 "사람의 선의"가 아닌 "기술적 강제"로 구현해야 한다.

---

**문제 7.** 한 신입 개발자가 새 IAM Role을 만들 수 있지만, 그 Role에 `iam:*`이나 `*:*` 같은 광범위 권한을 못 붙이게 막고 싶다. 가장 적절한 방법은?

A) 신입의 IAM 권한을 모두 회수
B) Permissions Boundary로 Role의 권한 상한을 강제
C) 신입을 root로 승격
D) CloudTrail로 사후 감지

**정답: B**
해설: Permissions Boundary는 "이 신원이 가질 수 있는 권한의 상한선"이다. 신입이 Role을 만들 때 Boundary를 첨부하도록 정책으로 강제하면, 그 Role의 실효 권한은 Boundary와 Identity Policy의 교집합으로 한정된다. A는 업무가 멈추고, C는 권한 폭발, D는 사후 대응일 뿐 예방이 아니다. 실무에서 자율성과 안전을 동시에 잡는 표준 패턴이다.
