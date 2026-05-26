# Day 2 - IAM의 운영자 사용설명서: 사용자·그룹·역할·정책 평가 알고리즘

S3 403, Lambda InvalidPermission, ECR pull denied, SSM SessionManager AccessDenied, RDS Connect Failed. 운영자 슬랙 채널에 매일 떠다니는 이 에러들의 공통점은 단 하나, 결국 IAM 정책 평가의 결과라는 것이다. 그래서 운영자에게 IAM은 "권한 부여 시스템"이라기보다 **"매일 일어나는 사고의 절반을 결정하는 의사결정 엔진"**이다. 누가, 무엇을, 어디에서, 어떤 조건으로 할 수 있는지를 결정하는 단 하나의 컴포넌트가 IAM이고, 그것이 잘못되면 권한이 너무 넓어 데이터가 새거나(Capital One), 너무 좁아 배포가 막힌다(흔한 금요일 밤).

오늘은 IAM의 4개 엔터티(User, Group, Role, Policy)를 운영자 시점에서 다시 그리고, 정책 평가 알고리즘이 실제로 어떤 순서로 결정을 내리는지, 그리고 거부가 발생했을 때 어디를 봐야 하는지를 정리한다. 이 알고리즘 한 그림이 시험 IAM 문제의 70%를 푼다.

## IAM의 4가지 엔터티: 운영자가 보는 차이

| 엔터티 | 본질 | 운영자 사용 시점 | 자격증명 수명 |
|--------|------|------------------|---------------|
| **User** | 영구 자격증명(access key + password) | 사람·자동화 스크립트가 직접 로그인 필요할 때 | 무한 (수동 회전 전까지) |
| **Group** | 사용자 묶음 + 정책 첨부 컨테이너 | 권한을 사람별이 아닌 직무별로 묶을 때 | N/A |
| **Role** | 일시적 자격증명을 발급해주는 임시 신분 | 서비스 간 호출, Cross-Account 접근, Federation | STS 임시 토큰 (15분~12시간) |
| **Policy** | 권한 정의 JSON 문서 | Effect/Action/Resource/Condition으로 표현 | N/A |

운영자 입장에서 가장 자주 쓰는 건 **Role**이다. 사용자는 인간 한 명에만 발급(혹은 IAM Identity Center로 대체)하고, EC2·Lambda·ECS Task·Cross-Account 신뢰는 전부 Role로 처리한다. 이유는 명확하다.

1. **Role의 자격증명은 STS가 발급하는 임시 토큰(기본 1시간, 최대 12시간)**이라 유출돼도 만료된다
2. **Role은 CloudTrail에 `AssumedRole` 이벤트로 추적**되므로 누가 언제 어떤 권한을 썼는지 명확
3. **Role은 access key 회전 부담이 없다** — 사용자에 붙은 access key는 회전을 운영자가 챙겨야 함
4. **Role은 Trust Policy로 "누가 assume할 수 있는가"를 명확히 제한** 가능

> 📚 **사례**: 2022년 9월 Uber 해커 사건. 18세 해커가 Uber 직원 한 명에게 MFA 푸시 폭격(MFA fatigue 공격)을 한 뒤, 슬랙 DM으로 "IT 부서다"라며 푸시 승인을 유도. 직원이 승인하자 VPN 접속 권한을 얻었고, 내부 PowerShell 스크립트에 하드코딩된 **PAM(Privileged Access Management) admin 자격증명**을 탈취했다. 그 자격증명으로 Uber의 AWS, GCP, OneLogin, GSuite, vSphere를 모두 손에 넣었다(스크린샷이 외부에 유출됨). 만약 이 PAM 자격증명이 access key가 아니라 **IAM Role + STS 임시 토큰 + 강제 MFA 조건 + IP CIDR 제한** 조합이었다면 침투 범위가 훨씬 좁아졌을 것이다. 운영자 교훈: **장기 자격증명은 자산이 아니라 부채다**. 또 다른 교훈: 한 자격증명으로 여러 시스템에 접근 가능하면 한 시스템 침투가 전부로 번진다.

> 🔍 **더 깊이**: STS의 `AssumeRole`이 발급하는 임시 자격증명은 **AccessKeyId(ASIA로 시작) + SecretAccessKey + SessionToken** 3종 세트다. SessionToken은 JWT 비슷한 서명된 토큰이며, AWS API 호출 시 `X-Amz-Security-Token` 헤더에 같이 보내야 한다. 만료 시각이 토큰에 박혀 있어 클라이언트가 임의로 연장 못한다(다시 AssumeRole 호출 필요). 자격증명이 새도 만료 후엔 무용지물. 반면 IAM User의 access key(AKIA로 시작)는 영구 유효 — 명시적으로 비활성화하지 않는 한 5년이고 10년이고 살아있다. GuardDuty가 ASIA로 시작하는 토큰이 비정상 IP에서 사용되면 `CredentialAccess:IAMUser/AnomalousBehavior` finding을 띄우는 게 이 차이 때문이다.

## 정책 평가 알고리즘: 시험과 실무의 모든 거부를 설명하는 단 하나의 그림

운영자가 가장 자주 만나는 질문은 "왜 거부됐냐?"다. IAM 정책 평가 알고리즘은 다음 6단계로 결정한다. 이 흐름이 시험 문제의 70%를 푼다.

```
[1] 명시적 Deny가 있는가?  ─Yes─→  거부 (끝)
        │ No
        ▼
[2] SCP(Service Control Policy)에서 Allow가 있는가?  ─No─→  거부 (끝)
        │ Yes
        ▼
[3] Resource-based Policy의 Allow가 있는가?  ─Yes─→ (조건부 통과)
        │
        ▼
[4] Identity-based Policy의 Allow가 있는가?  ─No─→  거부 (단, 3에서 Allow면 통과)
        │ Yes
        ▼
[5] Permission Boundary가 있다면 그 안에서 Allow되는가?  ─No─→  거부
        │ Yes
        ▼
[6] Session Policy(STS AssumeRole 시 첨부)가 있다면 Allow?  ─No─→  거부
        │ Yes
        ▼
   허용 ✅
```

핵심 원칙:

- **명시적 Deny는 어디서 나오든 최종 거부**: SCP, identity policy, resource policy, boundary 어디서든 한 번이라도 Deny가 있으면 끝
- **암묵적 거부 = Deny와 다름**: 어떤 정책에도 명시되지 않은 권한은 암묵적으로 거부되지만, 다른 정책에서 Allow로 덮을 수 있음
- **Resource-based policy의 Allow는 identity policy 없이도 통과 가능**: S3 버킷 정책에서 다른 계정에 Allow를 주면, 그 계정의 사용자는 자기 IAM에 권한이 없어도 접근 가능(같은 계정 내에선 보통 둘 다 필요. 단, KMS는 같은 계정 내에서도 양쪽 다 필요)

> 💡 **관련 이론**: IAM 정책 평가는 본질적으로 **deny-overrides** 모델의 ABAC(Attribute-Based Access Control). RBAC(Role-Based)의 단순 매트릭스를 넘어서 `aws:RequestTag/Env`, `aws:PrincipalTag/Department`, `aws:SourceIp`, `aws:MultiFactorAuthAge`, `aws:CurrentTime` 같은 속성으로 조건부 허용을 표현한다. NIST SP 800-162가 ABAC의 표준 모델을 정의하며, IAM의 Condition 블록이 그 구현이다. SCP가 SCP > identity > resource > boundary > session 순으로 평가되는 건 **"권한은 조직 정책에 의해 제한된다"**는 원칙을 강제하기 위함. 학문적으로는 Sandhu et al.(1996, IEEE Computer)의 RBAC96 모델이 RBAC의 기초, Hu et al.(2014, NIST SP 800-162)이 ABAC의 표준을 정의했다.

> ⚠️ **함정**: 시험에서 "한 계정의 IAM 사용자가 다른 계정의 S3 버킷 객체에 PUT을 하려고 한다. 어떤 권한이 필요하냐?"는 문제가 자주 나온다. 답은 **양쪽 모두**다. ① 호출자 계정의 사용자에 `s3:PutObject` 허용 ② 대상 버킷의 Bucket Policy에서 그 사용자(또는 그 계정)에 `s3:PutObject` 허용. 둘 중 하나만 있으면 거부된다. 추가로 KMS 암호화 버킷이면 ③ KMS 키 정책에 `kms:GenerateDataKey` 허용까지 필요. 즉 cross-account + KMS는 3개의 정책이 다 통과해야 한다.

> 🔍 **더 깊이**: AWS는 정책 평가 시 **Zelkova**라는 SMT(Satisfiability Modulo Theories) 기반 정형 검증 엔진을 사용한다(Backes et al., 2018 CAV). 정책을 1차 논리식으로 변환한 뒤 Z3 같은 SMT 솔버로 "이 정책이 어떤 입력 조합에서 Allow를 내는가"를 수학적으로 풀어낸다. Access Analyzer가 "이 S3 버킷이 외부 계정에 노출됐다"를 정확히 알려주는 게 이 엔진 덕분. 단순 regex 매칭이 아니라 "모든 가능한 호출 조합 중 외부에 Allow가 나오는 경우가 존재하는가?"를 정형 증명한다.

## 정책의 6가지 종류: 어디서 누가 첨부하는가

| 정책 타입 | 첨부 대상 | 누가 만드는가 | 운영자 시점 |
|-----------|-----------|----------------|-------------|
| **Identity-based (Managed)** | User/Group/Role | AWS 또는 고객 | 가장 자주 쓰는 표준 |
| **Identity-based (Inline)** | User/Group/Role 1:1 | 고객 | 단발성·삭제 시 같이 사라짐 |
| **Resource-based** | S3, Lambda, SNS, SQS, KMS, ECR, EFS 등 | 리소스 소유자 | Cross-Account에 필수 |
| **Permission Boundary** | User/Role | 권한 위임 관리자 | "개발자가 만드는 Role의 최대 권한" 제한 |
| **SCP** | AWS Organizations OU/Account | Org admin | 전 계정 가드레일 |
| **Session Policy** | STS AssumeRole 호출 시 inline | 호출자 | 발급되는 임시 자격증명의 권한 축소 |

운영자가 가장 자주 헷갈리는 게 **Permission Boundary와 SCP**다. 둘 다 "권한의 상한선"을 정하지만 적용 위치가 다르다.

- **SCP**는 계정/OU 전체에 적용 — Organizations 관리자가 사용. SCP는 root 계정에도 적용된다(단, management account는 예외)
- **Permission Boundary**는 특정 User/Role에 적용 — 권한 위임의 가드레일. 사용자가 만든 정책의 effective permission을 boundary와 교집합으로 제한

또한 **SCP는 절대 Allow를 만들지 않는다**. SCP가 `Allow *`라고 적혀 있어도, 실제로는 "이 OU의 계정에서 이 권한들이 가능하다"는 화이트리스트일 뿐이다. 실제 권한 부여는 identity policy나 resource policy에서 일어난다. 운영자가 자주 하는 실수: SCP에 Allow를 추가하고 "이제 권한이 생겼겠지" 했는데 안 됨 → identity policy를 추가해야 함.

> 🔍 **더 깊이**: 운영자 흔한 패턴은 **개발자에게 IAM Role 생성 권한을 위임**하면서 권한 boundary를 강제하는 것. 예를 들어 개발자 그룹에 `iam:CreateRole`은 주되, `iam:PutRolePermissionsBoundary` 조건으로 항상 회사 표준 boundary policy를 첨부하게 강제한다. 그러면 개발자가 만든 Role의 effective permission은 "그가 첨부한 정책 ∩ boundary policy"이므로, AdministratorAccess를 첨부해도 boundary가 제한된 권한만 허용한다. 이게 "권한 위임 + 가드레일"의 표준 패턴.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["iam:CreateRole", "iam:PutRolePolicy"],
    "Resource": "*",
    "Condition": {
      "StringEquals": {
        "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DeveloperBoundary"
      }
    }
  }]
}
```

## 운영자가 매일 만나는 IAM 디버깅 패턴

S3 403이 떴다. 어디부터 봐야 하나? 운영자는 다음 순서로 본다.

```
[1단계] CloudTrail에서 실패 호출 찾기
        - eventName: GetObject, PutObject 등
        - errorCode: AccessDenied
        - errorMessage: "User: arn:aws:sts::... is not authorized to perform..."
        - requestParameters에서 bucket, key 확인
        - userIdentity로 호출자 정체 확인 (User? AssumedRole? FederatedUser?)

[2단계] 호출자가 IAM User인가, AssumedRole인가?
        - User면 직접 첨부 정책 + 그룹 정책 확인
        - Role이면 RoleSessionName으로 누가 assume 했는지 추적
        - sessionIssuer에서 원본 Role ARN 확인

[3단계] IAM Policy Simulator로 시뮬레이션
        - 호출자 + Action + Resource로 평가 결과 확인
        - 어떤 정책이 거부했는지 표시됨
        - Service Last Accessed 정보로 "이 권한이 실제로 쓰였는가" 확인

[4단계] Access Analyzer로 cross-account 노출 확인
        - 의도하지 않은 외부 노출이 있는지 검증
        - Policy validation으로 정책 문법·보안 점검

[5단계] 그래도 모르면 CloudTrail Event detail의 errorMessage 정독
        - 2023년부터 AWS는 "어떤 정책이 거부했는지" 메시지에 명시
```

> 📚 **사례**: 운영 중인 EC2가 갑자기 S3 PutObject에서 403. 운영자가 CloudTrail을 보니 호출자는 `AssumedRole/EC2-S3Role/i-0abc...`. Identity policy를 보니 `s3:PutObject Allow`. Bucket Policy도 Allow. SCP도 통과. 그런데 거부. 이유는 **버킷에 SSE-KMS 암호화가 켜져 있고, 그 KMS 키의 Key Policy에 EC2 Role이 없어서**였다. S3 PUT 시 KMS 키로 암호화하려면 `kms:GenerateDataKey` 권한이 필요하고, 그 권한은 Key Policy + IAM Policy 양쪽에서 허용돼야 한다(KMS는 cross-account 아니라도 양쪽 다 필요). 운영자가 IAM Policy만 보고 헤매기 쉬운 함정. 게다가 CloudTrail에 KMS 거부 이벤트는 별도로 찍히므로 KMS 쪽 Trail까지 봐야 한다.

> ⚠️ **함정**: errorCode `AccessDenied`라고 무조건 IAM 문제가 아니다. S3 버킷의 BlockPublicAccess가 켜져 있으면 public 정책을 만들어도 BPA가 우선 차단해 403을 낸다. SCP가 SCP에서 Deny하면 IAM에 Allow가 있어도 거부. RAM 공유받은 리소스에 owner 측에서 권한 변경 시 거부 등. 거부의 출처를 정확히 찾으려면 CloudTrail의 `errorMessage` 텍스트를 그대로 읽어야 한다.

## STS의 핵심 API 3종

운영자가 알아야 할 STS API:

| API | 용도 | 운영자 시점 |
|-----|------|-------------|
| `AssumeRole` | 같은 계정/다른 계정 Role을 assume | Cross-Account 접근, EC2/Lambda Role |
| `AssumeRoleWithSAML` | SAML 2.0 IdP에서 assume | AD FS, Okta SAML 페더레이션 |
| `AssumeRoleWithWebIdentity` | OIDC IdP에서 assume | Cognito, GitHub Actions OIDC, EKS IRSA |

GitHub Actions에서 AWS에 배포할 때 access key를 secret에 박는 게 표준이었지만, **OIDC 페더레이션**으로 바꾸면 access key 자체가 없어진다. GitHub이 발급한 OIDC 토큰을 AWS STS가 검증하고 임시 자격증명을 발급하는 방식. 이게 2022년부터 GitHub Actions의 권장 패턴이고, 2023년 re:Invent에서도 AWS가 공식 추천.

```yaml
# GitHub Actions OIDC 예시
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeploy
    aws-region: ap-northeast-2
    role-session-name: ${{ github.actor }}-${{ github.run_id }}
```

이때 IAM Role의 Trust Policy는 다음처럼 GitHub repo + branch까지 좁혀야 한다.

```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
    }
  }
}
```

> 🔍 **더 깊이**: EKS IRSA(IAM Roles for Service Accounts)는 같은 메커니즘이다. EKS 클러스터가 OIDC provider 역할을 하고, Kubernetes ServiceAccount에 매핑된 IAM Role을 Pod이 assume한다. Pod 안의 토큰 마운트 경로(`/var/run/secrets/eks.amazonaws.com/serviceaccount/token`)에서 OIDC JWT를 읽고 `AssumeRoleWithWebIdentity`로 자격증명을 받는다. AWS SDK가 이 흐름을 자동 처리(`webIdentityTokenFile` 환경변수). 2023년부터 **Pod Identity**라는 더 단순한 메커니즘도 나왔는데, 이건 OIDC 대신 EKS Pod Identity Agent를 사용해 IMDS-like 인터페이스로 자격증명을 제공한다. IRSA는 cluster-OIDC 페더레이션, Pod Identity는 EKS native — 둘은 공존 가능.

## 운영자가 알아야 할 IAM 모범 사례 10가지

1. **루트 계정은 일상 사용 금지**: MFA 강제, access key 삭제, 1년에 1-2번 청구·계정 폐쇄 등에만 사용
2. **모든 IAM User에 MFA 필수**: Condition `aws:MultiFactorAuthPresent: true`로 정책에서 강제
3. **사람은 IAM Identity Center, 머신은 IAM Role**: User 직접 생성은 최후의 수단
4. **Access Key 90일 회전**: Credential Report로 확인, Config rule `access-keys-rotated`
5. **권한은 최소 권한 원칙**: AdministratorAccess는 비상시만, 평소엔 직무별 분리. IAM Access Advisor의 "Service Last Accessed"로 안 쓰는 권한 식별
6. **Permission Boundary로 위임**: 개발자가 만든 Role의 권한 상한 강제
7. **CloudTrail은 모든 리전 + Log File Validation 활성화**: 변조 탐지
8. **Access Analyzer로 외부 노출 자동 탐지**: Organization 단위로 켜기
9. **사용 안 하는 자격증명은 90일 후 비활성화** (Last Accessed 정보 활용)
10. **STS Region Endpoint 강제**: `aws:UseRegion` 조건으로 us-east-1 강제 호출 차단. SDK에서 `AWS_STS_REGIONAL_ENDPOINTS=regional` 설정

> ⚠️ **함정**: "IAM User의 access key를 secret manager에 저장하면 안전하다"는 오해. Secret Manager는 access key 자체를 회전시킬 수 있지만(Lambda 회전 기능), 키가 유출되면 회전 전까지는 유효하다. **장기 자격증명이 존재한다는 사실 자체가 공격면**이다. 답은 access key를 안 만드는 것 — Role + STS로 대체. 2024년 AWS는 IAM User의 access key 생성 시 콘솔에서 경고를 띄우기 시작했고, IAM Identity Center가 사실상의 표준이 됐다.

> 💡 **관련 이론**: 이런 분산된 권한 평가의 디버깅 어려움은 **policy explosion** 문제로 알려져 있다. Sandhu et al.(1996, IEEE Computer)의 RBAC96 모델 이후 ABAC, ReBAC(Relationship-Based, Zanzibar) 등 다양한 모델이 나왔지만, 어느 모델이든 정책 수가 늘면 평가 결과 추적이 폭발적으로 어려워진다. AWS는 이를 풀려고 Access Analyzer(Zelkova 엔진)를 만들었다. 같은 문제를 Google은 Zanzibar(2019 USENIX ATC)로, Microsoft Azure는 RBAC + ABAC 조건 표현식으로 풀었다.

## 정리하며

오늘 정리한 정책 평가 알고리즘은 SOA-C02 IAM 문제의 70%를 푼다. 핵심은 단순하다.

- **Deny가 이긴다** (어디서 나오든)
- **Allow가 한 번은 있어야 한다** (identity 또는 resource policy 어디든)
- **Cross-Account는 양쪽 다 Allow**
- **Boundary와 SCP는 상한선 — Allow를 더 만들지는 않음**
- **STS는 임시 자격증명 — 영구 access key의 회전 부담 없음**

내일은 이 위에 더 깊은 도구들 — Identity Center 페더레이션, ABAC 패턴, 권한 디버깅 — 을 다룬다.

---

## 📝 연습 문제

**문제 1.** 계정 A의 IAM 사용자가 계정 B의 S3 버킷에 PutObject를 하려고 한다. 어떤 권한 설정이 필요한가?

A) 계정 A 사용자의 identity policy에 `s3:PutObject` Allow만 있으면 된다
B) 계정 B 버킷의 Bucket Policy에 계정 A 사용자 Allow만 있으면 된다
C) 양쪽 모두 — 계정 A 사용자 identity policy Allow + 계정 B 버킷 정책 Allow
D) 계정 A의 IAM Role을 만들고 계정 B에서 AssumeRole 해야 한다

**정답: C**
해설: Cross-Account 접근은 호출자 측 identity policy와 대상 측 resource policy 양쪽 모두에서 Allow가 필요하다. 한쪽만 있으면 거부. 같은 계정 내에서는 보통 identity policy 또는 resource policy 중 하나만으로 충분하지만, KMS 키 정책은 같은 계정 내에서도 양쪽 다 필요한 예외가 있다. SSE-KMS 버킷이면 KMS 키 정책에 `kms:GenerateDataKey`도 추가 필요.

---

**문제 2.** 운영자가 개발자에게 IAM Role 생성 권한을 위임하면서 그 Role이 가질 수 있는 최대 권한을 제한하려고 한다. 가장 적합한 도구는?

A) SCP
B) Permission Boundary
C) Session Policy
D) Inline Policy

**정답: B**
해설: Permission Boundary는 User/Role 단위로 적용되는 권한 상한선. SCP는 계정·OU 단위라 더 큰 범위에 적용된다. 운영자는 개발자 그룹에 `iam:CreateRole` 권한을 주되 `iam:PermissionsBoundary` Condition으로 회사 표준 boundary 첨부를 강제하면, 개발자가 만든 Role의 effective permission은 자기 정책 ∩ boundary로 제한된다. Session Policy는 STS AssumeRole 호출 시 일시적으로 발급되는 자격증명에만 적용.

---

**문제 3.** 한 EC2 인스턴스의 IAM Role에 `s3:PutObject Allow`가 있는데, KMS 암호화된 버킷에 PUT 시 AccessDenied가 난다. 가장 가능성 있는 원인은?

A) 버킷 정책에 PutObject가 없다
B) KMS 키 정책에 EC2 Role의 `kms:GenerateDataKey` 권한이 없다
C) EC2 인스턴스의 IMDSv2가 비활성화돼 있다
D) S3 SSE 알고리즘이 잘못 설정됐다

**정답: B**
해설: KMS 암호화된 객체를 PUT하려면 호출자가 `kms:GenerateDataKey`를, GET하려면 `kms:Decrypt`를 가져야 한다. 그 권한은 IAM Policy와 KMS Key Policy 양쪽에서 허용돼야 한다. IAM은 통과해도 Key Policy에 없으면 거부. 운영자가 가장 자주 헤매는 함정 중 하나. CloudTrail에서 `kms:GenerateDataKey` AccessDenied 이벤트가 별도로 찍히므로 그쪽 로그도 봐야 한다.

---

**문제 4.** 운영자가 GitHub Actions에서 AWS로 배포할 때 access key를 GitHub Secret에 박는 대신 OIDC 페더레이션을 쓰려고 한다. 어떤 STS API를 사용하는가?

A) AssumeRole
B) AssumeRoleWithSAML
C) AssumeRoleWithWebIdentity
D) GetSessionToken

**정답: C**
해설: GitHub Actions는 OIDC IdP로 동작하므로 `AssumeRoleWithWebIdentity`를 호출한다. AWS STS는 GitHub이 발급한 OIDC 토큰을 검증하고 임시 자격증명을 발급한다. AssumeRoleWithSAML은 AD FS/Okta SAML 페더레이션, AssumeRole은 IAM 자격증명 기반. Trust Policy에는 GitHub의 OIDC provider ARN과 repo/branch sub claim을 명시한다.

---

**문제 5.** IAM 정책 평가에서 명시적 Deny가 어디에서 나오든 항상 거부되는 이유는?

A) AWS의 정책 평가 알고리즘이 deny-overrides 모델을 따르기 때문
B) Deny는 SCP에서만 발생하므로
C) Permission Boundary가 자동으로 Deny를 우선시하므로
D) IAM은 RBAC 모델이므로

**정답: A**
해설: IAM 정책 평가는 본질적으로 deny-overrides 모델의 ABAC 구현. 어느 레이어(SCP, identity, resource, boundary, session)에서든 명시적 Deny가 한 번 나오면 최종 결과는 거부. 이 원칙이 권한 설계의 안전성을 보장한다.

---

**문제 6.** 운영자가 EC2 인스턴스의 IAM Role 자격증명을 SDK로 가져오려고 한다. 어디서 가져오는가?

A) /etc/aws/credentials 파일
B) IMDS(http://169.254.169.254/latest/meta-data/iam/security-credentials/)
C) 환경변수 AWS_ACCESS_KEY_ID
D) STS GetSessionToken API

**정답: B**
해설: EC2 인스턴스 프로파일에 첨부된 IAM Role의 임시 자격증명은 IMDS에서 가져온다. AWS SDK는 자동으로 IMDS를 폴링해 자격증명을 갱신한다(기본 6시간 전 갱신). IMDSv2를 쓰면 PUT으로 세션 토큰을 먼저 받아야 한다. Role 자격증명은 STS가 발급한 것이지만 GetSessionToken은 IAM User용. EC2 측에서 보면 IMDS 경로가 표준.
