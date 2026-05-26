# Day 3 - IAM 심화: 명시적 Deny는 왜 항상 이기는가

AdministratorAccess 정책이 붙어 있는 사용자가 EC2 종료를 시도했는데 거부됐다. 콘솔에는 분명히 모든 권한이 보인다. 그런데 왜 안 될까? 실무에서 가장 자주 겪는 이 미스터리의 답은 IAM의 정책 평가 흐름을 한 번이라도 그려본 사람만이 풀 수 있다.

이 글은 IAM이 요청 하나를 받았을 때 내부에서 어떤 순서로 통과·차단을 결정하는지, 그리고 STS의 임시 자격 증명이 그 결정에 어떻게 끼어드는지를 다룬다. 어제의 4대 엔터티가 "정적인 구조"였다면, 오늘은 IAM의 "동적인 의사결정"이다.

## 정책 평가의 5단계 흐름

AWS는 모든 요청을 다음 순서로 평가한다.

```
  Request → 1) Explicit Deny 있나? → 있으면 즉시 Deny
            2) SCP/Boundary가 허용 안 함? → 즉시 Deny
            3) Explicit Allow 있나? → 있으면 Allow
            4) 그 외 → 암묵적 Deny
```

핵심은 첫 번째 줄이다. **명시적 Deny는 모든 것을 이긴다**. Allow가 100개 있어도, AdministratorAccess가 붙어 있어도, 어디선가 한 줄이라도 Deny가 명시되어 있으면 즉시 차단된다. 이게 IAM이 안전한 이유이자, 운영자가 가장 자주 부딪히는 벽이다.

> 💡 **관련 이론**: 이 규칙은 보안 설계의 고전적 원칙인 **Default Deny (Fail-Safe Default)** 와 직접 연결된다. Saltzer & Schroeder의 8대 보안 원칙 중 하나로, "권한이 명시적으로 허용되지 않은 것은 모두 금지"가 출발점이다. 방화벽 규칙, JWT 만료 검증, OAuth 2.0의 스코프 체크 모두 같은 패턴을 따른다.

다중 정책이 얽힌 상황에서는 더 복잡해진다. 같은 계정 내라면 **Identity + Resource + SCP + Boundary + Session** 모든 층이 Allow 또는 무관해야 하고, 어디서도 Deny가 나오면 안 된다. 크로스 계정이라면 양쪽 계정 모두 Allow가 필요하다.

```
[ 정책 평가 천장 구조 ]

   조직 SCP   ────────────────────────  Org 천장
        ↓
   Permission Boundary  ────────────── User/Role 천장
        ↓
   Identity Policy  ─────────────────── 실제 부여
        ↓
   Session Policy  ─────────────────── 세션 동안 천장
        ↓
   Resource Policy  ────────────────── 리소스 쪽 허용

   ※ Allow는 모든 층의 교집합. Deny는 어디서 나와도 차단.
```

## SCP, Boundary, Session Policy: 세 가지 천장의 차이

이 셋은 모두 "천장"이다. 부여가 아니라 제한이라는 점이 같다. 하지만 적용 단위가 다르다.

| 천장 | 적용 단위 | 시나리오 |
|------|-----------|----------|
| **SCP** | Organizations OU/계정 | 회사 전체 가드레일 |
| **Permission Boundary** | User/Role | 위임된 관리자 시나리오 |
| **Session Policy** | AssumeRole 세션 | 임시로 더 좁히기 |

**SCP (Service Control Policy)** 는 Organizations의 OU나 계정 단위에 붙는다. 그 계정의 모든 사용자와 Role에 적용되고, **루트 사용자도 우회할 수 없다**. 단, SCP는 Allow를 부여하지 않는다 — 허용 가능한 작업 목록의 천장만 정의한다.

**Permission Boundary** 는 개별 User나 Role에 천장을 씌운다. 가장 흔한 시나리오는 "개발팀 리더에게 IAM 사용자 생성 권한은 주되, 그가 만든 사용자가 admin 권한을 가지지 못하게 막고 싶을 때". 위임은 하되 그 위임받은 자가 자기보다 강한 권한을 만들 수 없게 막는 패턴이다.

**Session Policy** 는 AssumeRole을 호출할 때 인라인으로 전달하는 정책으로, 그 세션 동안만 추가로 더 좁힌다.

> 💡 **암기 팁**: 셋 다 **천장이지 부여가 아니다**. SCP는 *조직 천장*, Boundary는 *사용자 천장*, Session Policy는 *세션 천장*. 이 한 줄로 시험의 절반은 해결된다.

> ⚠️ **함정**: "Administrator 권한이 있는 사용자가 작업 실패" → 의심 순서는 ① SCP에 막혔는가 ② Permission Boundary에 막혔는가 ③ Resource Policy가 명시 Deny인가 ④ KMS 키 정책이 막는가. AdministratorAccess는 IAM 권한일 뿐, 그 위·아래의 천장과 키 정책을 우회하지 못한다.

## STS와 임시 자격 증명: 모든 임시 인증의 중심

STS(Security Token Service)는 AWS의 임시 자격 증명 발급기다. Access Key처럼 영구적인 게 아니라, 만료 시간이 정해진 짧은 수명의 토큰을 발급한다. EC2 Role도, EKS IRSA도, SAML SSO도 결국은 STS의 변형이다.

| API | 용도 |
|-----|------|
| **AssumeRole** | 같은/다른 계정의 Role 빌리기 (기본) |
| **AssumeRoleWithSAML** | SAML 2.0 IdP (AD FS, Okta SAML 등) |
| **AssumeRoleWithWebIdentity** | OIDC IdP (Google, Cognito, EKS IRSA) |
| **GetFederationToken** | IAM 사용자 자격으로 임시 토큰 발급 |
| **GetSessionToken** | MFA 강제용 단기 토큰 |

기본 만료 시간은 AssumeRole이 1시간(15분~12시간 설정 가능), GetSessionToken은 12시간(루트는 1시간)이다.

> 💡 **관련 이론**: STS의 `AssumeRole`은 OAuth 2.0의 **Token Exchange (RFC 8693)** 와 개념적으로 거의 같다. 신뢰 관계를 통해 한 신원으로부터 다른 신원의 짧은 수명 토큰을 받아 동작하는 패턴이다. EKS IRSA는 더 노골적으로 OIDC를 쓰는데, Kubernetes ServiceAccount의 OIDC 토큰을 `AssumeRoleWithWebIdentity`로 교환해서 Pod별 IAM 권한을 받는다.

```
[ Cross-Account AssumeRole 흐름 ]

  Account A (Dev)
   └─ User: dev1
        │  sts:AssumeRole
        ▼
  Account B (Prod)
   └─ Role: ReadOnlyAuditor
        ├─ Trust: principal = arn:aws:iam::A:user/dev1
        └─ Permission: ec2:Describe*, s3:List*
```

크로스 계정 AssumeRole이 동작하려면 두 가지가 필요하다. 첫째, **계정 B의 Role**이 자신의 Trust Policy에 계정 A의 사용자(또는 루트)를 Principal로 명시해야 한다. 둘째, **계정 A의 사용자**가 그 Role에 대한 `sts:AssumeRole` 권한을 가지고 있어야 한다. 양쪽이 모두 맞아야 통과한다.

## 실제로 AssumeRole 호출해보기

```bash
# 다른 계정의 Role을 AssumeRole
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ReadOnlyAuditor \
  --role-session-name dev1-session \
  --duration-seconds 3600
```

응답은 이런 형태로 돌아온다.

```json
{
  "Credentials": {
    "AccessKeyId": "ASIA...",
    "SecretAccessKey": "...",
    "SessionToken": "...",
    "Expiration": "2026-06-01T12:00:00Z"
  },
  "AssumedRoleUser": {
    "Arn": "arn:aws:sts::111122223333:assumed-role/ReadOnlyAuditor/dev1-session"
  }
}
```

`AccessKeyId`가 `ASIA`로 시작하는 게 임시 자격 증명의 특징이다. 영구 키는 `AKIA`로 시작한다. 이 키 3종 세트를 환경 변수에 넣고 나면 그 세션 동안은 빌린 Role의 권한으로 동작한다.

```bash
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
aws s3 ls
```

세 번째 줄의 `AWS_SESSION_TOKEN`이 없으면 임시 자격 증명은 동작하지 않는다. 영구 키와의 가장 큰 차이가 이 세 번째 토큰이다.

## ABAC: 태그로 권한을 표현하기

권한 모델에는 두 가지 방향이 있다. RBAC(역할 기반)는 "이 사람은 개발자다 → 개발자 권한"으로 매핑한다. ABAC(속성 기반)는 "이 사용자의 `project` 태그가 리소스의 `project` 태그와 같으면 허용"처럼 속성으로 매핑한다.

ABAC의 장점은 확장성이다. 새 프로젝트가 생겨도 새 정책을 만들 필요가 없다. 사용자에게 태그만 붙이면 된다. 멀티팀·멀티프로젝트 환경에서 정책 수의 폭증을 막는 효과적인 패턴이다.

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/project": "${aws:PrincipalTag/project}"
    }
  }
}
```

이 정책 한 줄이 "내 project 태그와 같은 project 태그를 가진 리소스만 접근 허용"을 의미한다.

## IAM Access Analyzer: 외부 노출의 자동 탐지

IAM 정책을 사람이 매번 다 검토할 수는 없다. Access Analyzer는 두 가지를 자동으로 해준다.

- **외부 노출 탐지**: S3, IAM Role, KMS, Lambda, SQS, Secrets Manager, EBS Snapshot 등에서 외부 계정/공개에 노출된 리소스를 자동 식별.
- **미사용 권한 분석**: 부여됐지만 실제로는 쓰이지 않는 권한을 식별해서 최소 권한으로 다듬을 수 있도록 추천.

> ⚠️ **함정**: Access Analyzer는 리소스 기반 정책의 외부 노출과 미사용 권한을 본다. EC2 보안 그룹의 `0.0.0.0/0` 같은 네트워크 노출은 Access Analyzer가 아니라 **Trusted Advisor / Inspector** 가 본다. 종종 시험에서 이걸 헷갈리게 만든다.

## 정리

IAM의 진짜 어려움은 정책 문서가 아니라 평가 흐름에 있다. **Explicit Deny → SCP/Boundary 통과 → Explicit Allow → 그 외 암묵 Deny** 라는 4단계, 그리고 SCP/Boundary/Session Policy가 모두 "천장"이지 "부여"가 아니라는 사실. 여기에 STS의 임시 자격 증명이 EC2 Role, EKS IRSA, SAML SSO의 공통 기반이라는 것까지 잡으면 IAM의 동적 모델은 거의 완성된다.

다음 글에서는 IAM의 천장이 조직 수준으로 확장된 모습 — **AWS Organizations, SCP, Control Tower, IAM Identity Center** — 를 다룬다. 멀티 계정 거버넌스라는 더 큰 그림이 IAM 위에 어떻게 얹히는지를 본다.

---

## 📝 연습 문제

**문제 1.** 한 사용자에게 AdministratorAccess가 부여되어 있는데 EC2 종료 시도가 거부된다. 원인으로 가장 가능성 높은 것은?

A) IAM 사용자에게 MFA가 비활성화됨
B) SCP에 `ec2:TerminateInstances` Deny가 걸려 있음
C) EC2 보안 그룹이 차단함
D) 키 페어가 만료됨

**정답: B**
해설: 계정 전체 SCP는 천장이라 IAM Admin도 막을 수 있다. Permission Boundary나 명시 Deny 정책도 후보. 보안 그룹은 네트워크 통제이지 API 권한과 무관하고, 키 페어는 SSH용이다.

---

**문제 2.** EKS Pod별로 IAM 권한을 분리해서 부여하려면 가장 적합한 STS API는?

A) AssumeRole
B) AssumeRoleWithSAML
C) AssumeRoleWithWebIdentity (OIDC)
D) GetSessionToken

**정답: C**
해설: EKS IRSA(IAM Roles for Service Accounts)는 ServiceAccount의 OIDC 토큰을 `AssumeRoleWithWebIdentity`로 교환해서 Pod 단위 IAM 권한을 받는다. 클러스터에 IAM 노드 권한을 한꺼번에 주는 게 아니라 Pod 단위로 잘게 분리하는 표준 패턴이다.

---

**문제 3.** 회사가 위임된 관리자(개발팀 리더)에게 IAM 사용자 생성 권한은 주되, 그 사용자가 admin 권한을 가지지 못하게 막고 싶다. 가장 적절한 도구는?

A) SCP
B) Permission Boundary
C) Session Policy
D) MFA

**정답: B**
해설: Permission Boundary는 사용자/Role의 최대 권한을 천장으로 막는다. 위임된 관리자가 만든 사용자에게 자기보다 강한 권한이 가지 못하도록 미리 천장을 씌우는 패턴의 표준 답. SCP도 가능하지만 사용자 단위 위임 시나리오는 Boundary가 정답.

---

**문제 4.** Cross-account S3 접근에 대한 설명으로 옳은 것은?

A) 한쪽 계정만 허용해도 동작한다
B) 양쪽 계정 모두 허용 필요 (Identity + Resource)
C) Organizations 가입 필요
D) STS 사용 불가

**정답: B**
해설: 크로스 계정은 양쪽 계정 모두 명시 허용이 있어야 한다. 호출자 계정의 IAM 정책과 대상 계정의 버킷 정책 둘 다 통과해야 접근이 성공한다.

---

**문제 5.** IAM Access Analyzer가 탐지할 수 있는 항목이 아닌 것은?

A) 외부에 노출된 S3 버킷
B) 외부에 노출된 IAM Role
C) 사용되지 않는 권한
D) EC2 보안 그룹의 0.0.0.0/0 규칙

**정답: D**
해설: 보안 그룹 분석은 Trusted Advisor와 Inspector의 영역이다. Access Analyzer는 리소스 기반 정책의 외부 노출과 미사용 IAM 권한을 본다. 자주 헷갈리게 출제되는 함정.

---

**문제 6.** AssumeRole로 받은 임시 자격 증명을 환경 변수로 사용할 때 반드시 필요한 변수 세트는?

A) AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
B) AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
C) AWS_ROLE_ARN, AWS_REGION
D) AWS_PROFILE만 있으면 충분

**정답: B**
해설: 임시 자격 증명은 반드시 세 번째 토큰인 `AWS_SESSION_TOKEN`을 함께 전달해야 한다. 영구 Access Key(AKIA로 시작)는 두 개만 있어도 되지만, 임시 키(ASIA로 시작)는 SessionToken이 없으면 검증 실패한다.

---

**문제 7.** 다음 중 정책 평가에서 가장 먼저 결정되는 요소는?

A) Resource 기반 정책의 Allow
B) Identity 기반 정책의 Allow
C) 어떤 정책에서든 Explicit Deny
D) Permission Boundary의 천장

**정답: C**
해설: 평가 흐름의 첫 단계가 Explicit Deny 검사다. 어디서 나오든 Deny가 있으면 즉시 거부되고, 이후 단계는 평가되지 않는다. Default Deny 보안 원칙의 구현.
