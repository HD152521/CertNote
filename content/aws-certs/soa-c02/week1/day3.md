# Day 3 - IAM 심화: Permission Boundary, SCP, Identity Center로 짓는 가드레일

어제 본 IAM 평가 알고리즘은 단일 계정에서의 권한 결정 흐름이다. 하지만 실제 회사는 계정이 한 개가 아니다. 운영용·개발용·데이터분석용·보안감사용·청구용으로 계정을 분리하고, 각 계정 안에는 부서별·역할별 사용자가 다시 분포한다. 한 회사에 100개의 AWS 계정이 있는 게 흔한 풍경이고(아마존 자신은 수만 개), 이 구조에서 "AdministratorAccess를 가진 개발자가 회사 IAM root에 가까운 권한을 가져버리는" 사고를 어떻게 막을까. 답이 오늘의 주제 — **SCP, Permission Boundary, IAM Identity Center**다.

이 세 도구는 같은 목적(권한 위임의 안전망)을 다른 layer에서 푼다. 운영자가 그 layer를 정확히 구분 못 하면 "왜 권한이 안 통하지" 또는 "어떻게 차단하지"에서 매번 헤맨다.

## 권한 위임의 수학: SCP ∩ Boundary ∩ Identity Policy

계정 A에 속한 사용자 U가 어떤 액션 X를 할 수 있는지의 최종 결정은 다음 수식으로 계산된다.

```
effective_permission(U, X) =
    SCP_on_account(A)
  ∩ permission_boundary(U)
  ∩ identity_policy(U)
  ∩ (resource_policy(X) OR identity_policy(U))
  ∩ session_policy(if assumed)
  - any_explicit_deny
```

각 ∩(교집합)이 의미하는 바는 "여기서 Allow된 것 중에서 다음 단계도 Allow된 것만 통과"다. SCP가 deny 하면 identity policy가 무엇이든 거부, boundary가 deny 하면 identity policy가 AdministratorAccess여도 거부.

이 구조의 운영자 가치는 **권한 위임 시 안전망**이다. 보안 팀이 SCP와 Boundary로 가드레일을 짜두고, 개발자에게는 그 안에서 마음껏 IAM Role을 만들게 위임할 수 있다.

> 💡 **관련 이론**: 이 모델은 capability-based security(권한 토큰 기반 보안)와 attribute-based access control(ABAC)의 결합. Saltzer & Schroeder의 "The Protection of Information in Computer Systems" (1975, CACM)에서 정의된 최소 권한 원칙(Principle of Least Privilege)을 분산 시스템 규모로 구현한 결과물. 정책의 교집합으로 효과 권한을 정의하는 건 lattice-based access control(Denning, 1976)의 변형이기도 하다. Bell-LaPadula 모델(1973)이 군사 보안의 mandatory access control을 정의한 이래, 이 "여러 정책의 교집합" 패러다임은 분산 시스템 보안의 표준이 됐다.

## SCP의 운영자 패턴 6가지

SCP(Service Control Policy)는 Organizations 단위 가드레일이다. **계정 내 IAM 권한과 무관하게 "이 계정에서는 이 액션 자체가 불가능"**을 만드는 도구. 운영자가 자주 쓰는 패턴:

### 1. 특정 리전 강제

```json
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "support:*", "route53:*", "cloudfront:*",
                "organizations:*", "sts:*", "waf:*", "globalaccelerator:*"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
    }
  }
}
```

이 SCP가 적용되면 ap-northeast-2와 us-east-1을 제외한 모든 리전에서 IAM·support·route53·cloudfront·organizations·sts 등을 제외한 모든 액션이 거부된다. 즉 운영자가 모르는 리전(예: sa-east-1, eu-central-2)에서 비트코인 채굴 EC2가 도는 사고를 막는 가장 강력한 도구. AWS 계정 탈취 후 흔한 시나리오가 "잘 안 쓰는 리전에서 c6i.32xlarge × 100대 띄우기"인데, 리전 잠금 SCP가 이 시나리오를 원천 차단한다.

### 2. 루트 사용자 액션 차단

```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:root"
    }
  }
}
```

루트 계정으로 일상 작업을 하지 못하게 강제. Organizations 관리 계정의 루트는 SCP가 적용되지 않으므로(management account 예외), member account 루트에만 적용된다. 2024년부터 AWS는 management account에서 member account 루트를 중앙 관리(`aws iam centralize-root-access`)할 수 있게 해줬다.

### 3. CloudTrail 비활성화 차단

```json
{
  "Effect": "Deny",
  "Action": [
    "cloudtrail:StopLogging",
    "cloudtrail:DeleteTrail",
    "cloudtrail:UpdateTrail",
    "cloudtrail:PutEventSelectors"
  ],
  "Resource": "*"
}
```

침투한 공격자가 흔적을 지우지 못하게. GuardDuty의 `Stealth:IAMUser/CloudTrailLoggingDisabled` finding도 이 시나리오를 탐지하지만, SCP는 탐지가 아니라 차단이다.

### 4. IMDSv2 강제

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringNotEquals": {
      "ec2:MetadataHttpTokens": "required"
    }
  }
}
```

신규 EC2 생성 시 IMDSv2를 강제. Config rule보다 더 강력 — 아예 만들 수도 없게 한다. Capital One 사건 직후 모든 회사가 도입한 SCP.

### 5. S3 암호화 강제

```json
{
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "*",
  "Condition": {
    "Null": {
      "s3:x-amz-server-side-encryption": "true"
    }
  }
}
```

S3 PutObject 시 SSE 헤더가 없으면 거부. 2023년부터 S3는 기본 SSE-S3가 자동 적용되지만, KMS 강제가 필요하면 이 SCP에 `StringNotEquals: aws:kms`를 추가.

### 6. 비싼 인스턴스 타입 차단(Sandbox OU)

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "ForAnyValue:StringNotLike": {
      "ec2:InstanceType": ["t3.*", "t4g.*", "m5.large", "m5.xlarge"]
    }
  }
}
```

개발 sandbox OU에 적용해 비싼 인스턴스 우발 실행을 차단. SCP는 정책 기반이므로 IaC에도 일관되게 적용된다.

> ⚠️ **함정**: SCP는 **권한을 허용하지 않는다**. SCP에 `Allow: s3:*` 있어도 IAM Policy에 그 권한이 없으면 거부. SCP는 가드레일(상한선)이지 권한 부여가 아니다. 또 SCP는 service-linked role에는 적용되지 않으며, AWS service principal(예: `lambda.amazonaws.com`)이 자기 서비스 동작으로 호출하는 API에도 적용되지 않는다.

> 🔍 **더 깊이**: SCP의 `FullAWSAccess`(기본 첨부 정책)을 제거하면 그 계정에서는 아무것도 못한다. OU에 SCP를 첨부하면 그 OU 아래 모든 계정에 적용. 따라서 운영 패턴은 **OU 계층으로 환경 분리(prod, dev, sandbox) → 각 OU에 적합한 SCP 첨부**. Sandbox OU엔 "EC2 t3.medium 이하만", Prod OU엔 "리전 잠금 + IAM 변경 제한" 같은 식. SCP는 계정당 최대 5개까지 직접 첨부 가능하고, 정책 문서 크기는 5120자 제한. 운영자는 여러 SCP를 OU 계층에 분산 첨부해 합성하는 게 표준.

> 📚 **사례**: 2023년 한 SaaS 회사에서 GitHub Actions의 OIDC role이 너무 넓은 권한을 가졌다가 PR 작성자의 코드 injection으로 IAM admin 권한을 탈취당했다. 그러나 production OU의 SCP가 `iam:CreateUser`, `iam:CreateAccessKey`를 deny하고 있어서 공격자가 영구 자격증명을 만들 수 없었고, 24시간 후 STS 토큰 만료로 자동 차단됐다. SCP가 사고 확산 차단의 마지막 보루였던 사례.

## Permission Boundary 패턴

SCP가 계정 전체의 상한선이라면, Permission Boundary는 **특정 User/Role의 상한선**이다. 가장 흔한 패턴은 "개발자에게 IAM Role 생성 권한을 위임"하면서 boundary로 가드레일 강제.

```json
// 개발자 그룹에 첨부할 정책
{
  "Effect": "Allow",
  "Action": ["iam:CreateRole", "iam:AttachRolePolicy", "iam:PutRolePolicy"],
  "Resource": "arn:aws:iam::*:role/Dev-*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary":
        "arn:aws:iam::123456789012:policy/DeveloperBoundary"
    }
  }
}
```

이 조건으로 개발자가 만든 Role의 이름은 `Dev-`로 시작해야 하고, 반드시 `DeveloperBoundary`를 첨부해야 한다. 그 Role의 effective permission은 boundary 안에서만 유효.

### 권한 위임 패턴의 깊이

이 패턴이 왜 중요한가. 운영자가 모든 IAM Role을 직접 만들면 병목이고, 개발자에게 `iam:CreateRole`만 주면 위험. Boundary는 이 둘 사이의 균형. 보안 팀은 boundary 정책 하나를 잘 짜고, 개발자는 그 안에서 자유롭게 Role을 만든다.

CDK·Terraform 같은 IaC 도구가 자동으로 IAM Role을 생성하는 경우에도 같은 패턴이 적용된다. Terraform의 `aws_iam_role` 리소스에 `permissions_boundary` 속성을 강제로 넣고, 그 boundary policy를 회사가 관리.

> 📚 **사례**: 2022년 한 핀테크 회사에서 개발자가 `AdministratorAccess`를 가진 Lambda Role을 만들고, 그 Lambda 코드가 SSRF로 침투당해 회사 RDS 데이터 전체가 유출됐다. 사고 후 도입된 게 boundary 패턴 — `iam:CreateRole`은 허용하되 boundary로 RDS·KMS write 권한을 제거하고, 운영 환경 변경은 운영 팀 Role을 assume 해야만 가능하게. Lambda Role의 effective permission이 boundary로 제한되어, 침투당해도 RDS는 못 만지게 됐다.

> ⚠️ **함정**: Permission Boundary는 **Allow의 상한선**이지 Deny를 추가하지 않는다. boundary에 `Allow: s3:*`만 있으면, identity policy에 다른 권한이 있어도 S3만 통과한다. 또 boundary는 identity 측에만 적용되고 resource policy의 cross-account allow는 boundary로 막을 수 없다는 미묘한 차이가 있다.

## IAM Identity Center: 사용자 관리의 정답

IAM User를 회사 직원 수만큼 만드는 건 안티패턴이다. 이유:

1. **MFA 강제·access key 회전·offboarding을 계정마다 반복**
2. **Cross-Account 접근 시 사용자가 access key를 N개 관리**
3. **퇴사자 정리 누락이 사고 1순위**
4. **MFA 디바이스 관리가 사용자별로 산재**

대안이 **IAM Identity Center**(구 AWS SSO). 한 곳(외부 IdP 또는 자체 디렉터리)에서 사용자 관리, 한 번 로그인으로 모든 AWS 계정에 접근.

```
[직원 한 명]
   │
   ├─ Okta / Azure AD / Google Workspace (SAML 2.0 또는 SCIM)
   │       │
   │       ▼
   │  IAM Identity Center (한 번 로그인)
   │       │
   ├──────┼──────┬──────┬──────┐
   ▼       ▼      ▼      ▼      ▼
 Prod   Dev    Audit  Logs  Billing
 계정   계정    계정   계정   계정
   │
   각 계정에서 Permission Set으로 권한 부여 (자동 생성 IAM Role)
```

### Permission Set: Identity Center의 권한 컨테이너

Permission Set은 "한 사용자가 한 계정에서 가질 수 있는 권한 묶음"이다. 본질은 각 계정에 자동 생성되는 IAM Role(`AWSReservedSSO_<PSName>_<hash>`) + 그 Role을 사용자가 assume 할 수 있는 매핑.

```yaml
PermissionSet: AdministratorAccess
  - Managed Policy: AdministratorAccess
  - Session Duration: 4 hours
  - User: 안용식@company.com → 자동으로 모든 계정에서 사용 가능
  - Customer Managed Policy: 필요 시 추가
  - Permissions Boundary: 옵션
```

운영자는 사용자가 어떤 Permission Set을 어떤 계정에 가지는지만 관리. 사용자가 콘솔에 로그인하면 자신이 접근 가능한 계정 목록이 보이고, 클릭하면 그 계정의 STS 임시 자격증명을 받아 콘솔이 열린다. CLI에서는 `aws configure sso`로 프로파일을 만들고 `aws sso login`으로 브라우저 인증.

> 🔍 **더 깊이**: Identity Center가 발급하는 자격증명도 STS 임시 자격증명. 세션 길이는 Permission Set에서 1-12시간 설정 가능(콘솔 세션은 별도, IAM Role의 MaxSessionDuration). 사용자는 access key를 영구 보유하지 않는다. CLI에서도 `aws sso login` 명령으로 브라우저 인증을 거치고 임시 자격증명을 받는다. `~/.aws/sso/cache/`에 캐시된 토큰은 SSO 세션 기간(최대 90일) 동안 유효하지만, 매번 사용 시 STS 임시 자격증명을 새로 발급받는다. 이게 모든 자동화의 표준이 돼야 한다.

> 📚 **사례**: 한 회사가 200명 직원에 100개 AWS 계정을 운영하던 시절, 직원당 평균 8개의 access key를 가지고 있었다. 회전·offboarding 누락으로 매월 보안 알람 수십 건. Identity Center 도입 후 access key는 거의 사라지고, 직원이 퇴사하면 IdP에서 한 번 비활성화로 모든 계정 접근이 즉시 차단됐다. 추가로 IdP에서 그룹 단위로 권한을 부여(예: "data-engineers 그룹은 모든 dev 계정에서 PowerUser, prod 계정에서 ReadOnly")해 권한 변경 부담도 사라졌다.

## ABAC: 태그 기반 권한 부여

확장성을 위해 IAM은 ABAC(속성 기반 접근 제어)를 지원한다. 핵심 아이디어: **권한을 사용자 ID나 Role ID로 부여하지 말고, 태그로 부여**.

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Department": "${aws:PrincipalTag/Department}"
    }
  }
}
```

이 정책 하나로 "직원은 자기 부서가 태그된 EC2만 시작/중지 가능"이 표현된다. 100명의 직원 × 1000개 EC2의 모든 권한 조합을 정책 폭증 없이 단 하나의 정책으로 처리. Identity Center의 경우 IdP의 사용자 속성(예: AD의 department)을 PrincipalTag로 자동 매핑할 수 있어, IdP 단에서 직원 부서를 바꾸면 AWS 권한도 자동 변경된다.

> 💡 **관련 이론**: ABAC는 NIST SP 800-162에서 표준화. RBAC가 N×M(role × permission) 매트릭스의 폭증으로 어려워지는 문제를 attribute의 동적 평가로 해결. IAM은 ABAC의 모든 핵심 요소(subject attribute, resource attribute, environment attribute)를 Condition으로 표현 가능. Google Zanzibar(2019)도 같은 문제를 ReBAC(Relationship-Based)으로 풀었는데, 이건 "이 리소스가 어떤 그룹의 멤버인가"를 그래프로 표현한다. AWS는 태그 기반 ABAC, Google은 관계 그래프, Microsoft Azure는 Resource Hierarchy 기반으로 같은 문제에 다른 답을 낸다.

## Service-Linked Role: 운영자가 만들지 못하는 특수 Role

AWS의 일부 서비스(ECS, Auto Scaling, ELB, Lex, GuardDuty 등)는 자기 서비스가 다른 AWS 리소스를 호출할 때 사용하는 전용 Role을 자동 생성한다. 이게 **Service-Linked Role(SLR)**.

특징:
- **이름이 정해져 있다**: `AWSServiceRoleFor*`
- **운영자가 정책을 수정할 수 없다**: AWS가 관리
- **Trust policy도 고정**: 해당 서비스만 assume 가능
- **서비스가 그 Role을 사용 안 할 때만 삭제 가능**

> ⚠️ **함정**: 운영자가 SLR을 삭제하려고 하면 의존성 검사 후 사용 중이면 거부됨. 시험에서 "ECS 클러스터를 만들었는데 자동으로 생성된 Role을 수정하려고 한다"는 시나리오는 SLR을 묻는 것 — 답은 "수정 불가, 서비스가 관리". SCP로도 SLR의 동작은 막지 못한다(service principal 호출이라 정책 평가 우회).

## CloudTrail에서 IAM 디버깅하는 운영자의 사고

거부 에러를 CloudTrail에서 추적하는 표준 패턴:

```sql
-- CloudTrail Lake / Athena
SELECT eventTime, eventName, errorCode, errorMessage,
       userIdentity.type, userIdentity.arn,
       requestParameters.bucketName
FROM cloudtrail_logs
WHERE errorCode = 'AccessDenied'
  AND eventTime > '2025-05-25T00:00:00Z'
ORDER BY eventTime DESC
LIMIT 100;
```

이 쿼리 결과에서 봐야 할 4가지:

1. **userIdentity.type**: IAMUser, AssumedRole, AWSService, Root, FederatedUser
2. **userIdentity.arn**: 정확한 호출자
3. **eventName + requestParameters**: 어떤 액션을 어떤 리소스에
4. **errorMessage**: AccessDenied의 정확한 이유(어떤 정책에 막혔는지)

> 🔍 **더 깊이**: errorMessage가 "explicit deny in identity-based policy"라고 적혀 있으면 identity policy에서 Deny. "explicit deny in resource-based policy"는 resource policy(bucket policy 등). "implicit deny"는 어디에도 Allow가 없음. "explicit deny in service control policy"는 SCP. 이 한 줄로 어디를 봐야 할지 정해진다. 이 메시지는 2022년부터 표준화돼 모든 거부 응답에 포함된다.

## 정리하며

오늘의 그림은 IAM 권한이 **다층 가드레일**로 짜여진다는 것. SCP가 계정 차원, Boundary가 User/Role 차원, Identity Policy가 실제 권한 부여, Resource Policy가 대상 측 허용. 어느 한 층의 Deny가 모두를 이긴다. Identity Center는 이 위에 인증·SSO를 얹어 사용자 관리의 N개 계정 폭증을 해결.

내일은 이 계정 분리를 가능하게 하는 **AWS Organizations와 멀티 계정 거버넌스**로 들어간다. 100개 계정을 어떻게 일관되게 관리할 것인가.

---

## 📝 연습 문제

**문제 1.** SCP에 `Allow: s3:*`이 있고 IAM Policy에 `Deny: s3:DeleteObject`가 있으며 Bucket Policy엔 `Allow: s3:DeleteObject`가 있다. 결과는?

A) Allow — Bucket Policy의 Allow가 우선
B) Allow — SCP의 Allow가 우선
C) Deny — IAM Policy의 명시적 Deny가 우선
D) 평가 불가 — 정책이 모순

**정답: C**
해설: 어느 정책 레이어든 명시적 Deny가 한 번이라도 있으면 최종 결과는 거부. SCP는 가드레일이지 권한 부여가 아니므로 Allow가 있어도 IAM의 Deny를 무력화하지 못한다. Bucket Policy의 Allow도 마찬가지.

---

**문제 2.** 운영자가 개발자 그룹에게 IAM Role 생성 권한을 위임하면서, 만든 Role은 반드시 `DevBoundary` 정책을 첨부해야 하게 만들고 싶다. 정답은?

A) SCP에 `Allow: iam:CreateRole` 추가
B) 개발자 그룹 정책에 `iam:CreateRole` Allow + Condition `iam:PermissionsBoundary` 강제
C) Permission Boundary를 SCP로 첨부
D) Service-Linked Role로 생성

**정답: B**
해설: 개발자 그룹에 `iam:CreateRole`을 주되, Condition으로 `iam:PermissionsBoundary` 값을 회사 표준 boundary로 강제. 이러면 개발자가 만든 Role에는 반드시 boundary가 붙고, 그 Role의 effective permission은 boundary 안에서만 유효.

---

**문제 3.** 회사가 200명 직원에 50개 AWS 계정을 운영한다. 사용자 관리 부담을 최소화하려면?

A) 각 계정에 IAM User를 200명씩 생성
B) 한 마스터 계정에 IAM User 생성하고 다른 계정은 Cross-Account Role로
C) IAM Identity Center 도입, Okta/Azure AD 페더레이션
D) Service Catalog로 자동화

**정답: C**
해설: Identity Center로 IdP에서 한 번 사용자 관리, Permission Set으로 계정별 권한 매핑. 직원 퇴사 시 IdP에서 한 번 비활성화로 모든 계정 접근 차단. Access Key는 거의 사라지고 모든 자격증명이 STS 임시 토큰.

---

**문제 4.** 운영자가 모든 계정에서 ap-northeast-2와 us-east-1만 사용 가능하게 강제하려고 한다. 가장 적합한 도구는?

A) IAM Permission Boundary
B) Service Control Policy (SCP)
C) AWS Config Rule
D) CloudTrail Log

**정답: B**
해설: SCP는 계정·OU 단위 가드레일이라 전 계정에 일괄 적용 가능. `aws:RequestedRegion` Condition으로 허용 리전 제외 모든 액션을 Deny. IAM, Route 53, CloudFront 같은 글로벌 서비스는 NotAction으로 예외 처리. Config Rule은 탐지만 가능하고 차단은 못 한다.

---

**문제 5.** ECS 클러스터를 처음 만들 때 자동 생성된 `AWSServiceRoleForECS`의 권한을 수정하려고 한다. 결과는?

A) 가능. IAM 콘솔에서 정책 편집
B) 가능. 단, SCP 통과 필요
C) 불가능. Service-Linked Role은 AWS가 관리
D) 가능. 단, 루트 계정에서만

**정답: C**
해설: Service-Linked Role은 AWS 서비스가 자기 동작을 위해 자동 생성·관리하는 Role. 운영자가 정책을 수정할 수 없다. 사용 중일 땐 삭제도 거부됨. 시험에서 SLR 관련 문제의 답은 거의 "수정 불가".

---

**문제 6.** Identity Center의 Permission Set이 적용된 사용자가 AWS CLI에서 STS 토큰을 받으려면 어떤 명령을 사용하는가?

A) `aws iam create-access-key`
B) `aws sts assume-role`
C) `aws sso login`
D) `aws configure`

**정답: C**
해설: Identity Center를 쓰는 사용자는 `aws configure sso`로 프로파일을 만들고 `aws sso login`으로 브라우저 인증을 한다. 그러면 SDK가 자동으로 STS 임시 자격증명을 발급받아 캐시한다. `aws sts assume-role`은 IAM Role을 직접 assume하는 일반 명령으로, Identity Center에서는 내부적으로 사용되지만 사용자가 직접 호출할 필요는 없다.
