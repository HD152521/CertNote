# Day 2 - IAM의 4대 엔터티: User, Group, Role, Policy

콘솔에서 처음 IAM 메뉴를 열면 사용자·그룹·역할·정책이라는 네 가지 항목이 나란히 보인다. 신규 개발자에게 이걸 설명할 때 가장 흔한 실수는 "User는 사람, Role은 서버"라고 단순화하는 것이다. 틀린 말은 아니지만, 이 모델로는 "왜 Lambda에 사용자 access key를 박으면 안 되는지", "왜 EC2 인스턴스에 attach한 Role이 SSO 사용자보다 안전한지"를 설명할 수 없다.

IAM은 클라우드에서 **누가(Principal) 무엇을(Action) 어떤 자원에(Resource) 어떤 조건에서(Condition) 할 수 있는지**를 결정하는 권한 부여(authorization) 엔진이다. 이 한 줄이 IAM 전체의 설계 철학을 압축한다. 오늘 우리가 볼 것은 그 엔진의 네 부품 — User, Group, Role, Policy — 이 어떻게 맞물려 동작하는지다.

## 왜 클라우드는 새로운 권한 모델이 필요했을까

전통적인 인증·인가 모델은 두 가지 패턴이 지배했다. **DAC**(Discretionary Access Control, 1970년대 Unix file permission)은 소유자가 권한을 줬다 뺐다 한다. **MAC**(Mandatory Access Control, 1973년 Bell-LaPadula model)은 시스템이 분류 레이블에 따라 강제로 통제한다. 그 위에 1992년 Ferraiolo & Kuhn의 **RBAC**(Role-Based Access Control)가 산업 표준이 되며 LDAP·Active Directory의 토대가 됐다.

클라우드가 등장하며 이 모델들이 깨졌다. 첫째, 자원이 **API로 동적으로 생기고 사라진다**. RBAC의 정적 role assignment로는 "방금 만든 S3 버킷에 접근할 권한"을 표현하기 어렵다. 둘째, 자원이 **여러 계정·서비스 간을 넘나든다**. AD의 도메인 경계로 묶을 수 없다. 셋째, **머신이 머신을 호출하는 빈도**가 사람의 로그인보다 압도적으로 많아졌다(Lambda → DynamoDB, EC2 → S3, ECS → Secrets Manager 등). 사람용 자격증명을 그대로 머신에 쓰면 키 유출 위험이 폭증한다.

AWS는 이 세 압력에 대응하며 IAM을 **ABAC**(Attribute-Based Access Control, 2014년 NIST SP 800-162로 표준화) 기반으로 진화시켰다. Condition key로 `aws:RequestTag`, `aws:PrincipalTag` 같은 속성을 검사하면 "Engineering 부서 태그가 붙은 사용자는 Engineering 태그가 붙은 자원에만 접근"이라는 동적 규칙이 가능해진다.

> 💡 **관련 이론**: RBAC vs ABAC의 trade-off는 분명하다. **RBAC**는 단순하고 감사가 쉽지만 자원 수가 늘면 role 폭발(role explosion) 문제가 생긴다(예: 100개 프로젝트 × 5개 역할 = 500개 role). **ABAC**는 정책 개수가 적게 유지되지만 디버깅이 어려워진다("왜 이 사용자가 거부됐는지"가 여러 속성의 조합에 달려 있다). 실무에서는 **상위 권한 구조는 RBAC(Group), 세부 자원 제어는 ABAC(Tag)**로 혼합하는 것이 일반적이다.

## User: 사람이거나, 사람처럼 행동하는 시스템

IAM User는 **장기 자격증명**(long-term credential)을 가진 엔터티다. 로그인 비밀번호로 콘솔에 들어오거나, Access Key ID + Secret Access Key로 CLI/SDK에 인증한다. 자격증명이 만료되지 않는다는 점이 가장 큰 위험이자 IAM Role과 갈리는 결정적 지점이다.

| 자격증명 종류 | 만료 | 회전 책임 | 적합한 용도 |
|------|------|------|------|
| Console password | 정책으로 강제 | 사용자 | 사람의 콘솔 로그인 |
| Access Key (AK/SK) | 없음 (수동 회전) | 사용자/관리자 | CLI, SDK, 외부 시스템 |
| MFA token | 30초 (TOTP) | 자동 | 추가 인증 |
| STS 임시 자격증명 | 15분 ~ 12시간 | 자동 | Role assume, Federation |

> 🔍 **더 깊이**: IAM User의 access key는 IAM Access Analyzer가 "last used" 정보를 추적한다. `aws iam get-access-key-last-used --access-key-id AKIA...`로 마지막 사용 시간을 확인하고, 90일 이상 미사용 키는 비활성화하는 것이 보안 모범 사례다. AWS 자체 보안 가이드(`IAM Best Practices`)는 **사람용 자격증명을 IAM User 대신 AWS IAM Identity Center(구 SSO)**로 옮기라고 강력히 권장한다. SSO는 ID Provider(Okta, Azure AD 등)와 SAML 2.0 또는 OIDC로 연동하며, 최종적으로는 STS로 임시 자격증명을 발급하므로 장기 키가 아예 존재하지 않는다.

> 📚 **사례**: 2014년 6월 Code Spaces 사건. GitHub 코드 호스팅 회사였던 Code Spaces가 AWS root account 자격증명을 탈취당해 EC2·S3·EBS·AMI·스냅샷이 전부 삭제됐고, 18시간 만에 회사가 폐업했다. 직접 원인은 **MFA 미적용 + 단일 자격증명 의존**이었다. AWS는 이 사건 직후 root account에 MFA 강제, IAM User에 MFA 강제 정책 변수(`aws:MultiFactorAuthPresent`) 같은 안전장치들을 더 적극적으로 권장하기 시작했다.

## Group: 권한 묶음의 단위

IAM Group은 사람을 묶는 컨테이너지, 권한의 주체가 아니다. Group에 정책을 attach하면 그 그룹의 모든 User에게 권한이 전파된다. Group 자체는 자원을 호출하지 못한다(Group은 Principal이 될 수 없다).

```
[ Engineering Group ]
    ├── Alice (User)
    ├── Bob (User)
    └── Policy: AmazonS3ReadOnlyAccess
                 ↓
        Alice, Bob 모두 S3 읽기 가능
```

Group의 핵심 가치는 **권한의 재사용**과 **감사 가능성**이다. 50명 엔지니어에게 일일이 정책을 붙이면 누가 무슨 권한이 있는지 추적이 불가능하다. Group으로 묶으면 "Engineering Group이 가진 권한 = Alice의 권한"이 되어 변경 추적이 쉬워진다. 다만 Group은 nested(중첩)될 수 없고, User는 최대 10개 Group에 속할 수 있다. 단순한 구조가 의도다.

## Role: 임시 자격증명의 생산자

IAM Role은 IAM의 가장 강력한 무기이자 가장 자주 시험에 나오는 개념이다. **Role은 누구도 소유하지 않은 권한 묶음이고, 누군가가 그 Role을 "assume"하면 STS가 임시 자격증명을 발급**해준다. 임시 자격증명은 ① Access Key ID, ② Secret Access Key, ③ **Session Token**(이게 핵심) 3종 세트로 구성되며, 기본 1시간 후 자동 만료된다.

```
1. Lambda 함수가 시작됨
2. Lambda 런타임이 STS AssumeRole 호출
3. STS가 임시 자격증명 발급 (1시간 유효)
4. Lambda 코드가 그 자격증명으로 DynamoDB 호출
5. 1시간 후 만료되면 SDK가 자동으로 재발급
```

EC2 인스턴스에 attach한 Role은 더 미묘하게 동작한다. EC2는 IMDS(인스턴스 메타데이터 서비스)를 통해 자격증명을 노출한다. SDK가 `169.254.169.254/latest/meta-data/iam/security-credentials/<RoleName>`을 GET하면 임시 자격증명이 JSON으로 반환된다. 이 자격증명은 약 6시간 유효하지만 SDK는 만료 15분 전에 자동 갱신한다.

> 🔍 **더 깊이**: AssumeRole의 내부 동작은 다음과 같다. (1) Principal이 `sts:AssumeRole` API를 호출하며 `RoleArn`을 지정한다. (2) STS는 Role의 **Trust Policy**(누가 이 Role을 assume할 수 있는지 정의)를 평가한다. (3) 통과하면 Role의 **Permission Policy**(이 Role이 무엇을 할 수 있는지)를 부여한다. (4) STS가 임시 자격증명을 발급하며 JWT-like 구조의 Session Token에 권한·만료 시간을 서명해 담는다. (5) 이후 API 호출은 Signature V4로 서명되고, AWS는 Session Token을 디코드해 권한을 확인한다. **Trust Policy와 Permission Policy 둘 다 통과해야 한다는 점**이 자주 헷갈리는 부분이다.

| Role 사용 시나리오 | Trust Policy의 Principal |
|------|------|
| EC2 인스턴스 프로파일 | `ec2.amazonaws.com` (Service) |
| Lambda 실행 역할 | `lambda.amazonaws.com` (Service) |
| Cross-Account 접근 | `arn:aws:iam::123456789012:root` (다른 계정) |
| Federation (SAML, OIDC) | `arn:aws:iam::...:saml-provider/...` |
| AWS Identity Center | `sso.amazonaws.com` |

> 💡 **암기 팁**: User는 "장기 자격증명을 가진 사람", Role은 "임시 자격증명을 발급해주는 권한 묶음". 시험 시나리오에 **"EC2 인스턴스가 S3에 접근"**이 보이면 99% Role 답. **"키를 코드에 하드코딩"**이 보이면 절대 정답이 아니다.

## Policy: JSON으로 표현된 권한의 명세서

Policy는 권한을 JSON으로 적은 문서다. Effect / Action / Resource / Condition / Principal 5개 필드가 핵심이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-bucket/users/${aws:username}/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-northeast-2"
        },
        "Bool": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    }
  ]
}
```

이 정책은 "MFA 인증되고 서울 리전 요청일 때만, 자기 사용자명에 해당하는 S3 prefix에서 GET/PUT 허용"이라는 의미다. `${aws:username}`은 **policy variable**로, 평가 시점에 호출자의 사용자명으로 치환된다. 이게 ABAC의 핵심 메커니즘이다.

| Policy 종류 | 어디에 붙는가 | 평가 우선순위 |
|------|------|------|
| Identity-based | User / Group / Role | 표준 평가 |
| Resource-based | S3 bucket, SQS queue, Lambda 등 | Identity와 합집합 |
| Permission Boundary | User / Role | 상한선 (cap) |
| SCP (Service Control Policy) | OU / Account (Organizations) | 절대 상한선 |
| Session Policy | AssumeRole 시점 | 그 세션에만 적용 |

> 🔍 **더 깊이**: AWS IAM 평가 로직은 명확한 우선순위가 있다. (1) **Explicit Deny**가 있으면 무조건 거부(가장 강력). (2) **SCP**(Organizations 수준)에 Allow가 없으면 거부. (3) **Permission Boundary**가 있고 그 안에 Allow가 없으면 거부. (4) **Identity-based 또는 Resource-based 정책**에 Allow가 있어야 허용. 즉 **"Allow는 합집합으로 추가되지만, Deny는 어느 한 곳이라도 있으면 즉시 차단"**이라는 비대칭성이 핵심이다. 이 비대칭 때문에 SCP는 "절대 못 하게 만들기"에 적합하다(예: root user의 액션 차단, 특정 리전 사용 금지).

> ⚠️ **함정**: `"Resource": "*"`와 `"Action": "*"`가 같이 있는 정책은 거의 항상 `AdministratorAccess` 수준이다. CloudFormation 템플릿이나 SAM 정의에서 개발자가 "권한 문제 빨리 해결하려고" 이런 정책을 박는 경우가 흔한데, IAM Access Analyzer가 이걸 감지하고 알림을 보낸다. 시험에서도 "least privilege" 키워드가 보이면 `*` 정책은 거의 항상 오답이다.

> 📚 **사례**: 2017년 Verizon의 DCS(데이터 통합 회사) 협력업체 NICE Systems가 S3 버킷 공개 설정으로 1,400만 명의 통화 기록을 노출시켰다. 버킷 정책에 `"Principal": "*"`와 `"Effect": "Allow"`가 같이 있었다. 이 사고 이후 AWS는 (1) 모든 신규 버킷에 **Block Public Access** 기본 활성화, (2) S3 콘솔에 공개 버킷 빨간 경고 배지, (3) **IAM Access Analyzer**(2019년 12월 출시)로 외부에 노출된 리소스 자동 탐지 등 일련의 안전장치를 추가했다.

## Identity-based vs Resource-based: 같은 권한을 두 방향에서

같은 "Alice가 my-bucket에 PutObject 가능"을 두 방법으로 표현할 수 있다.

```json
// Identity-based (Alice의 User에 attach)
{
  "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}

// Resource-based (my-bucket의 Bucket Policy)
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::123456789012:user/Alice"},
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

차이는 **cross-account 시나리오**에서 드러난다. 같은 계정 안이라면 둘 중 하나만 있으면 충분하지만, 다른 계정의 Alice에게 권한을 줄 때는 **양쪽 모두 있어야 한다**. 우리 계정의 bucket policy로 Alice를 허용하고, Alice의 계정에서도 Alice의 User에 우리 버킷 접근을 허용해야 한다. 한쪽만 있으면 cross-account에선 거부된다.

S3·KMS·SQS·SNS·Lambda·Secrets Manager·ECR 등이 Resource-based policy를 지원한다. DynamoDB·EBS·CloudWatch 같은 서비스는 지원하지 않으므로 cross-account 접근을 위해선 항상 IAM Role을 거쳐야 한다.

## Permission Boundary와 SCP: 권한의 상한선

큰 조직에서 자주 쓰는 두 가지 안전장치다. **Permission Boundary**는 IAM User/Role의 권한 상한선을 정한다. Identity-based policy로 AdministratorAccess가 붙어도, Permission Boundary가 ReadOnlyAccess라면 실제 효과는 ReadOnly다.

**SCP**(Service Control Policy)는 AWS Organizations의 OU/Account 수준에서 절대 상한선을 정한다. SCP가 "us-east-1, us-west-2 외 리전 거부"라면, 그 OU 안의 어떤 사용자/역할도 다른 리전에서 동작할 수 없다. SCP는 **권한을 부여하지 않고 제한만 한다**(deny-only filter라고 생각하면 정확).

> 💡 **암기 팁**: SCP는 회사 차원의 헌법, Permission Boundary는 개인의 신분증, Identity-based policy는 실제 활동 권한. 어느 하나가 차단하면 활동 불가.

## CLI로 권한 시뮬레이션

`aws iam simulate-principal-policy`는 시험엔 잘 안 나오지만 실무에서 디버깅에 황금이다.

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/MyRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/path/to/file.txt
```

응답에 `EvalDecision: allowed | explicitDeny | implicitDeny`가 나온다. `implicitDeny`는 "어디서도 명시적으로 Allow를 안 줬다"는 뜻이고, `explicitDeny`는 "어딘가에 Deny가 있다"는 뜻이다. 후자는 SCP나 Permission Boundary나 Resource Policy를 살펴야 한다.

## 정리하며

오늘 본 네 부품은 클라우드 권한 모델의 ABC다. **User**는 사람의 장기 자격증명, **Group**은 권한 묶음의 단위, **Role**은 누구든 assume해서 임시 자격증명을 받는 권한 보관소, **Policy**는 JSON으로 표현된 권한의 명세서. 이 네 가지가 IAM 평가 엔진의 입력이 되고, 엔진은 SCP → Permission Boundary → Identity-based → Resource-based → Session Policy 순서로 평가해 결과를 낸다.

다음 글에서는 이 위에 올라가는 STS(임시 자격증명 발급소), 정책 조건(Condition), Resource-based policy의 cross-account 패턴을 깊이 본다. Capital One 사고가 IMDSv1에서 IAM Role 자격증명이 새어나간 사건이었다는 점을 떠올리면, IAM 심화가 단지 이론이 아니라 실제 사고 방지의 핵심임이 분명해진다.

---

## 📝 연습 문제

**문제 1.** 한 개발자가 EC2 인스턴스에서 S3에 접근하려고 한다. 가장 안전한 방법은?

A) IAM User의 Access Key를 EC2 user-data에 넣어 환경변수로 설정
B) IAM Role을 EC2 인스턴스 프로파일로 attach
C) AWS root account의 키를 사용
D) EC2 인스턴스 안에 ~/.aws/credentials 파일에 키를 저장

**정답: B**
해설: IAM Role을 attach하면 EC2가 IMDS를 통해 자동으로 임시 자격증명을 받고 SDK가 만료 전 자동 갱신한다. 장기 키가 어디에도 저장되지 않으므로 키 유출 위험이 사라진다. A·C·D는 모두 장기 키가 EC2 안에 남아 인스턴스가 탈취되면 키도 같이 새어나간다. 특히 IMDSv2를 함께 적용하면 SSRF 공격에 대한 방어도 추가된다.

---

**문제 2.** 다음 정책 평가 결과를 예측하라. Identity-based policy에 `s3:GetObject` Allow가 있고, SCP에 `s3:*` Deny가 있다.

A) Allow (Identity-based가 더 구체적)
B) Allow (SCP는 Allow가 없을 때만 작동)
C) Deny (Explicit Deny가 항상 우선)
D) 평가 불가

**정답: C**
해설: IAM 평가의 핵심 원칙은 "**Explicit Deny가 어디에 있든 무조건 차단**"이다. SCP의 Deny는 IAM Identity의 Allow를 덮어쓴다. 이 비대칭성 때문에 SCP는 "회사 차원에서 절대 못 하게 만들기"에 적합하다. 예를 들어 "root account의 모든 액션 차단", "비승인 리전 사용 차단", "MFA 없는 액션 차단" 같은 가드레일을 SCP로 구현한다. 만약 SCP에 Deny가 없고 Allow도 없다면 implicit deny(허용 안 됨)가 된다.

---

**문제 3.** 다음 중 IAM Role을 사용해야 하는 시나리오가 아닌 것은?

A) Lambda 함수가 DynamoDB를 호출
B) EC2 인스턴스가 S3에 파일 업로드
C) 외부 SaaS가 우리 AWS 계정의 S3에 백업 데이터를 쓰기
D) 사람이 처음으로 AWS 콘솔에 로그인

**정답: D**
해설: 콘솔 로그인은 IAM User 또는 SSO(Identity Center) 사용자로 한다. A·B는 서비스가 다른 서비스에 접근하는 표준 패턴으로 Role(인스턴스 프로파일 또는 Lambda 실행 역할)을 쓴다. C는 cross-account 시나리오로 SaaS의 IAM 계정이 우리 계정의 Role을 assume하는 방식이 표준이다. AWS는 SaaS Role 설정 시 **External ID**(공유 비밀)를 함께 요구해 confused deputy 문제를 방지한다.

---

**문제 4.** 한 회사가 모든 개발자에게 AdministratorAccess를 주고 싶지만 us-east-1과 ap-northeast-2 외 리전은 못 쓰게 하고 싶다. 가장 적합한 도구는?

A) IAM User에 attach한 ReadOnly 정책
B) AWS Organizations의 SCP로 `aws:RequestedRegion` 조건으로 다른 리전 거부
C) VPC 보안 그룹으로 다른 리전 차단 (불가능)
D) Permission Boundary로 리전 제한

**정답: B**
해설: SCP는 OU/Account 수준에서 적용되므로 그 안의 모든 IAM Principal에 일괄 적용된다. `"Condition": {"StringNotEquals": {"aws:RequestedRegion": ["us-east-1", "ap-northeast-2"]}}`로 외부 리전 액션을 차단하면 AdministratorAccess가 있어도 다른 리전 사용이 불가능하다. D의 Permission Boundary도 가능은 하지만 모든 User/Role에 개별 attach가 필요해 운영 부담이 크다. A는 ReadOnly로 만들면 개발 자체가 불가능. C는 SG는 리전 통제 도구가 아니다.

---

**문제 5.** Cross-Account 시나리오: 계정 A의 Alice가 계정 B의 my-bucket에 접근해야 한다. 필요한 설정은?

A) 계정 A의 Alice User 정책에만 Allow를 추가
B) 계정 B의 my-bucket 정책에만 Allow를 추가
C) 계정 A의 Alice 정책과 계정 B의 my-bucket 정책 양쪽 모두에 Allow를 추가
D) 계정 A를 계정 B의 Organizations에 추가

**정답: C**
해설: Cross-account 접근은 "양쪽 합의"가 필요하다. 계정 A의 IAM이 "Alice가 외부 자원 접근 OK"를 허용해야 하고, 계정 B의 Resource Policy가 "외부 Alice의 접근 OK"를 허용해야 한다. 한쪽만 있으면 거부된다. 만약 my-bucket이 KMS 암호화돼 있다면 KMS Key Policy에도 cross-account 권한이 필요하다(보통 IAM 권한 + KMS Key Policy + S3 Bucket Policy 3가지가 모두 필요한 경우가 흔하다).

---

**문제 6.** Permission Boundary와 Identity-based policy의 관계로 옳은 것은?

A) Permission Boundary는 Identity-based policy를 덮어쓴다
B) 둘 다 Allow한 것의 교집합만 실제 허용된다
C) 둘 중 하나만 Allow하면 허용된다
D) Permission Boundary는 IAM Group에만 적용된다

**정답: B**
해설: Permission Boundary는 권한의 **상한선**이고, Identity-based policy는 실제 부여된 권한이다. **두 곳 모두에서 Allow돼야 실제로 허용**된다. 즉 교집합. 예를 들어 Identity-based가 `s3:*` Allow, Permission Boundary가 `s3:GetObject` Allow만 있다면 실제 가능한 액션은 GetObject 하나뿐이다. Permission Boundary는 큰 조직에서 "권한 위임"을 안전하게 하기 위한 도구다. CI/CD 시스템이 다른 개발자에게 IAM Role을 만들어주되, 만들어진 Role이 가질 수 있는 권한의 상한선을 PB로 강제한다.

---

**문제 7.** 한 개발자가 "코드가 ValidationException과 함께 'Cross-account pass role is not allowed'을 반환한다"고 호소한다. 가장 가능성 높은 원인은?

A) Lambda 함수의 timeout이 너무 짧다
B) `iam:PassRole` 권한이 없거나, 다른 계정의 Role을 passRole 시도
C) S3 버킷이 다른 리전에 있다
D) DynamoDB 테이블 throttling

**정답: B**
해설: `iam:PassRole`은 "다른 서비스에게 이 Role을 부여한다"는 메타 권한이다. 예를 들어 Lambda 함수를 생성할 때 `Role: arn:...`을 지정하는데, 이 Role을 Lambda에게 "넘겨주는" 행위가 PassRole이다. PassRole은 같은 계정 내에서만 허용되며, cross-account로는 안 된다. 시험에 자주 나오는 함정: 개발자가 EC2 인스턴스에 Role을 attach하려면 EC2 권한뿐 아니라 `iam:PassRole`도 있어야 한다. 이 권한을 좁게 제한할 때는 `Resource`로 attach 가능한 Role ARN을 명시한다.
