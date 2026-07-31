# Day 2 - 권한 경계와 위임: 개발자에게 안전하게 권한을 넘기는 기술

조직이 커지면 보안팀 한 곳에서 모든 IAM 롤과 정책을 만들어줄 수 없다. 개발자들이 직접 Lambda 실행 롤, EC2 인스턴스 롤, CI/CD 배포 롤을 만들게 해야 속도가 난다. 그런데 여기에 치명적인 위험이 있다. **IAM 권한을 위임받은 개발자가 자기 자신에게 AdministratorAccess를 붙이는 롤을 만들어 권한 상승(privilege escalation)을 일으킬 수 있다.**

이 문제를 정면으로 해결하는 것이 **Permission Boundary(권한 경계)**다. day1에서 "권한의 상한선"으로 잠깐 본 그 개념을, 오늘은 위임 시나리오에서 실전으로 다룬다. Specialty 시험에서 권한 상승 차단은 거의 매 회차 출제되는 핵심 주제다.

## 권한 상승 공격의 해부

먼저 공격이 어떻게 일어나는지 이해해야 방어가 보인다. 개발자에게 `iam:CreateRole`, `iam:AttachRolePolicy`, `iam:PassRole` 권한을 줬다고 하자. 개발자의 의도는 "내 Lambda용 롤을 만들고 싶다"이다. 하지만 이 권한으로 다음이 가능하다.

```
1. 새 롤 생성:        iam:CreateRole
2. 관리자 정책 부착:   iam:AttachRolePolicy → arn:aws:iam::aws:policy/AdministratorAccess
3. 그 롤로 전환:      sts:AssumeRole 또는 Lambda에 PassRole
→ 결과: 개발자가 사실상 계정 관리자가 됨
```

이것이 전형적인 **IAM privilege escalation**이다. 위임받은 권한 자체는 합법이지만, 조합하면 자기 권한을 넘어선다.

> 💡 **관련 이론**: 이 공격은 보안 연구자 Spencer Gietzen(Rhino Security Labs)이 2018년 정리한 **21가지 AWS IAM 권한 상승 경로**의 대표 사례다. `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion`, `iam:PassRole + lambda:CreateFunction`, `iam:AttachUserPolicy` 등 여러 경로가 알려져 있다. 공통 원리는 "IAM을 조작할 수 있는 권한"이 곧 "모든 권한을 얻을 수 있는 권한"이라는 점이다. 그래서 IAM 자체를 다루는 권한은 반드시 경계로 묶어야 한다.

### 상승 경로는 하나가 아니다

"롤을 만들어 관리자 정책을 붙인다"는 것은 여러 경로 중 하나일 뿐이다. 방어를 설계하려면 **경로의 유형**을 알아야 하는데, 크게 세 갈래로 정리된다.

```
[ 권한 상승 경로의 세 갈래 ]

① 자기 자신의 권한을 직접 넓힌다
   iam:AttachUserPolicy / iam:PutUserPolicy
   iam:AttachRolePolicy / iam:PutRolePolicy
   iam:CreatePolicyVersion + iam:SetDefaultPolicyVersion
     └ 이미 붙어 있는 정책 문서의 "내용"을 바꿔치기한다.
       정책 부착 관계는 그대로라 감사 로그가 조용하다.

② 더 강한 신원을 새로 만들어 갈아탄다
   iam:CreateRole + iam:AttachRolePolicy + sts:AssumeRole
   iam:UpdateAssumeRolePolicy
     └ 기존 관리자 롤의 "신뢰 정책"에 자기를 추가한다.
       롤도 정책도 새로 안 만들어 눈에 잘 안 띈다.
   iam:CreateAccessKey (다른 사용자에게)
   iam:CreateLoginProfile / iam:UpdateLoginProfile (다른 사용자에게)
     └ 남의 신원으로 로그인할 수단을 만든다.

③ 강한 롤을 컴퓨트에 넘겨 대신 실행시킨다  ← iam:PassRole 계열
   iam:PassRole + lambda:CreateFunction + lambda:InvokeFunction
   iam:PassRole + ec2:RunInstances
   iam:PassRole + cloudformation:CreateStack
   iam:PassRole + glue:CreateDevEndpoint
     └ 자기가 그 롤이 되는 게 아니라, 그 롤로 도는 코드를 만든다.
       결과는 같다 — 그 롤의 모든 권한을 행사한다.
```

세 갈래를 관통하는 성질은 **"권한을 주는 권한"과 "권한을 쓰는 권한"이 IAM에서는 구분되지 않는다**는 것이다. `iam:AttachRolePolicy` 하나는 그 자체로 아무 데이터도 읽지 않지만, 실질적으로는 계정의 모든 데이터를 읽을 수 있는 권한과 같다. 그래서 IAM 위임을 설계할 때는 액션 목록을 보는 것이 아니라 **"이 조합으로 도달 가능한 최종 상태가 무엇인가"**를 봐야 한다.

| 경로 유형 | 대표 액션 | 무엇을 막아야 하나 |
|-----------|-----------|--------------------|
| ① 자기 권한 확대 | `iam:AttachUserPolicy`, `iam:PutRolePolicy`, `iam:CreatePolicyVersion` | 권한 경계로 천장을 고정 + 경계 정책 자체를 수정 불가로 |
| ② 신원 위조·전환 | `iam:CreateRole`, `iam:UpdateAssumeRolePolicy`, `iam:CreateAccessKey`, `iam:CreateLoginProfile` | 생성 시 경계 강제 + 신뢰 정책 수정 대상을 네임스페이스로 제한 |
| ③ 롤 전달(PassRole) | `iam:PassRole` + 컴퓨트 서비스의 생성 액션 | `iam:PassedToService`·리소스 제한으로 "어떤 롤을 어디에 넘길 수 있나"를 못 박기 |

> ⚠️ **함정**: 세 갈래 중 ①의 `iam:CreatePolicyVersion` + `iam:SetDefaultPolicyVersion` 조합이 가장 놓치기 쉽다. 개발자에게 정책을 *부착*하는 권한만 신경 쓰고 정책 문서를 *수정*하는 권한은 무심코 남겨 두기 때문이다. 이 조합이 있으면 개발자는 자기에게 붙어 있는 권한 경계 정책의 새 버전을 만들어 `"Action": "*"`로 채운 뒤 기본 버전으로 지정할 수 있다. **경계가 경계를 지키지 못하는 상태**가 되는 것이다. 그래서 권한 경계 설계의 첫 문장은 언제나 "경계 정책 자신을 보호하는 Deny"여야 한다.

## iam:PassRole — 가장 오해받는 권한

세 갈래 중 ③이 유독 어려운 이유는 `iam:PassRole`이 **호출자에게 아무 권한도 주지 않기 때문**이다. 이 액션은 "네가 이 롤을 AWS 서비스에 넘겨도 좋다"는 허가일 뿐이고, 실제 권한을 행사하는 것은 그 롤을 받은 서비스다.

```
[ AssumeRole 과 PassRole 의 차이 ]

  ── sts:AssumeRole ──────────────────────────────
     사람/롤  ──"내가 그 롤이 되겠다"──▶  STS
                                        │
                                        ▼
                            임시 자격증명을 손에 쥔다
                            CloudTrail: AssumeRole 이벤트 남음
                            신뢰 정책(롤 쪽)의 허락이 필요

  ── iam:PassRole ────────────────────────────────
     사람/롤  ──"이 롤을 Lambda에 붙여 줘"──▶  Lambda
                                             │
                                             ▼
                            Lambda 함수가 그 롤로 실행된다
                            호출자는 자격증명을 직접 못 본다
                            신뢰 정책은 "lambda.amazonaws.com"을 허락
                            호출자에게는 iam:PassRole 권한이 필요
```

핵심 차이는 **신뢰 정책이 누구를 허락하느냐**다. AssumeRole 경로에서는 롤의 신뢰 정책이 *사람/롤*을 허락해야 하지만, PassRole 경로에서는 신뢰 정책이 *서비스 프린시펄*(`lambda.amazonaws.com`)을 허락한다. 그래서 "AssumeRole은 못 하는데 PassRole은 되는" 롤이 존재하고, 이 롤을 Lambda에 붙여 코드를 실행하면 결과적으로 그 롤의 권한을 전부 쓰게 된다.

따라서 `iam:PassRole`은 반드시 **어떤 롤을(Resource) 어떤 서비스에(Condition)** 넘길 수 있는지 못 박아야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PassOnlyLambdaExecutionRolesToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::111122223333:role/dev-lambda-*",
      "Condition": {
        "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" }
      }
    }
  ]
}
```

이 문장은 두 겹으로 좁힌다. `Resource`로 **넘길 수 있는 롤의 이름 공간**을 `dev-lambda-*`로 한정하고, `iam:PassedToService` 조건으로 **넘길 수 있는 목적지 서비스**를 Lambda로 한정한다. 둘 중 하나만 있으면 뚫린다 — `Resource`만 좁히면 그 롤을 EC2·CloudFormation에도 넘길 수 있고, 조건만 걸면 계정의 *모든* 롤을 Lambda에 붙일 수 있다.

> ⚠️ **함정**: `"Action": "iam:PassRole", "Resource": "*"`는 실무에서 놀랄 만큼 자주 발견되는 구성이다. 튜토리얼과 빠른 시작 문서가 이 형태를 쓰기 때문이다. 이 한 줄은 "계정 안의 아무 롤이나 아무 서비스에 붙일 수 있다"는 뜻이고, 계정에 관리자급 롤이 하나라도 있으면 **사실상 관리자 권한**이다. 시험에서 "최소 권한으로 PassRole을 부여하라"가 나오면 정답에는 반드시 리소스 제한이나 `iam:PassedToService` 조건이 들어 있다.

> 🔍 **더 깊이**: `iam:PassRole`은 CloudTrail에 **독립된 이벤트로 기록되지 않는다.** 롤 전달은 `lambda:CreateFunction`이나 `ec2:RunInstances` 같은 상위 API 호출의 *일부*로 평가되기 때문이다. 그래서 "누가 어떤 롤을 넘겼는가"를 감사하려면 `iam:PassRole` 이벤트를 찾을 것이 아니라, 컴퓨트 생성 이벤트의 `requestParameters`에서 롤 ARN 필드(`roleArn`, `iamInstanceProfile` 등)를 봐야 한다. 이 성질 때문에 PassRole 남용은 탐지가 늦기 쉽고, 그래서 *탐지보다 예방*(정책으로 좁히기)이 훨씬 중요한 권한이다.

## Permission Boundary의 작동 방식

Permission Boundary는 User나 Role에 부착하는 **두 번째 정책**이다. 이 주체가 가질 수 있는 권한의 **최대 한계**를 정의한다. 유효 권한은 day1에서 본 대로 교집합이다.

```
유효 권한 = Identity 정책(부여) ∩ Permission Boundary(상한)
```

핵심은 **Boundary 자체는 어떤 권한도 부여하지 않는다**는 것. 단지 "Identity 정책이 아무리 넓어도 여기까지만"이라는 천장이다.

```json
// 개발자에게 부착할 Permission Boundary 예시
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowedServices",
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "dynamodb:*",
        "lambda:*",
        "logs:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

이 Boundary가 부착된 개발자는, 설령 자기 IAM 정책에 `iam:*`나 `ec2:*`가 있어도 그것들을 못 쓴다. Boundary 교집합에서 빠지기 때문이다.

```
[ 권한 경계가 유효 권한을 깎는 모습 ]

   Identity 정책이 부여한 것            권한 경계가 허용하는 것
   ┌───────────────────────┐          ┌───────────────────────┐
   │ s3:*                  │          │ s3:*                  │
   │ dynamodb:*            │          │ dynamodb:*            │
   │ iam:*        ← 위험    │          │ lambda:*              │
   │ ec2:*                 │          │ logs:*                │
   └───────────────────────┘          └───────────────────────┘
               │                                  │
               └──────────── ∩ ───────────────────┘
                             │
                             ▼
                  실제 유효 권한
                  ┌───────────────────────┐
                  │ s3:*                  │
                  │ dynamodb:*            │
                  └───────────────────────┘
                  iam:*  → 경계에 없어 탈락  ✂
                  ec2:*  → 경계에 없어 탈락  ✂
                  lambda:*, logs:* → Identity에 없어 탈락 ✂
                     (경계는 권한을 "주지" 않는다)
```

이 그림의 마지막 줄이 시험에서 가장 자주 검증되는 지점이다. 경계에 `lambda:*`가 있어도 Identity 정책에 없으면 **Lambda를 쓸 수 없다.** 경계는 문을 여는 열쇠가 아니라 문틀의 크기다.

경계에는 몇 가지 적용 범위 제약이 있고, 이것이 그대로 시험 문항이 된다.

| 항목 | 권한 경계의 동작 |
|------|------------------|
| 부착 가능 대상 | IAM **사용자**와 **롤**. 그룹에는 부착할 수 없다 |
| 개수 | 주체당 **하나**. 여러 개를 겹쳐 붙일 수 없다 |
| 리소스 기반 정책 | 프린시펄을 직접 지정한 리소스 기반 정책의 허용은 경계 평가의 예외로 문서화되어 있다 |
| 서비스 연결 롤 | 경계를 붙일 수 없다 |
| 권한 부여 | 절대 못 함. 상한만 정한다 |
| 조건·리소스 제한 | 경계 정책 안에서도 Condition·Resource를 쓸 수 있다(단순 액션 목록이 아니어도 된다) |

> ⚠️ **함정**: "주체당 경계는 하나"라는 제약이 설계에 미치는 영향이 크다. 팀별로 다른 경계를 겹쳐 쓰고 싶어도 불가능하므로, 조직은 보통 **경계를 소수의 표준 템플릿(예: `dev-boundary`, `data-boundary`)으로 고정하고 차등은 Identity 정책 쪽에서 준다.** 경계를 사람마다 다르게 만들기 시작하면 관리 대상이 폭발하고, 결국 누군가 경계를 넓혀 달라는 요청을 승인하면서 통제가 무너진다. 경계는 *적게, 넓게, 거의 안 바뀌게* 설계하는 것이 원칙이다.

> 🔍 **더 깊이**: 권한 경계가 조건까지 담을 수 있다는 점을 활용하면 "액션 목록" 이상의 통제를 만들 수 있다. 예를 들어 경계 안에 `aws:RequestedRegion` 조건을 넣어 "이 주체가 만드는 모든 것은 서울 리전 안에서만"을 강제하거나, `aws:ResourceTag/Env` 조건으로 "prod 태그가 붙은 리소스는 건드릴 수 없다"를 못 박을 수 있다. SCP와 겹쳐 보이지만 적용 대상이 다르다 — SCP는 계정 전체에, 경계는 위임받은 그 주체에만 적용되므로, **계정 안에서 사람마다 다른 상한**이 필요할 때는 경계가 유일한 답이다.

## 안전한 위임의 핵심: Boundary 강제 부착

이제 진짜 기술이다. 개발자에게 롤 생성 권한을 주되, **개발자가 만드는 모든 롤에 반드시 특정 Boundary가 붙도록 강제**해야 한다. 그렇지 않으면 개발자가 Boundary 없는 관리자 롤을 만들 수 있다.

```json
// 개발자에게 부착하는 Identity 정책 (위임 권한)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreateRoleOnlyWithBoundary",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:AttachRolePolicy", "iam:PutRolePolicy"],
      "Resource": "arn:aws:iam::*:role/dev-*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/dev-boundary"
        }
      }
    },
    {
      "Sid": "DenyBoundaryModification",
      "Effect": "Deny",
      "Action": ["iam:DeleteRolePermissionsBoundary", "iam:PutRolePermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/dev-boundary"
        }
      }
    }
  ]
}
```

두 Statement가 함께 작동한다.

1. **CreateRole 조건부 허용**: `iam:PermissionsBoundary` 조건키로, 개발자가 만드는 롤에 `dev-boundary`가 붙어 있을 때만 생성을 허용한다. Boundary 없는 롤은 만들 수 없다.
2. **Boundary 변경 차단**: 개발자가 만든 롤의 Boundary를 떼거나 다른 걸로 바꾸는 행위를 명시적 Deny로 막는다.

> ⚠️ **함정**: 1번 조건만 걸고 2번을 빠뜨리면 우회당한다. 개발자가 Boundary를 붙여 롤을 만든 뒤, 곧바로 `iam:DeleteRolePermissionsBoundary`로 그 경계를 떼버리면 무방비 롤이 된다. 그래서 **생성 강제(Sid 1) + 변경 차단(Sid 2)**이 한 쌍으로 가야 한다. 또한 `iam:CreatePolicyVersion`도 막지 않으면 Boundary 정책 자체를 수정해 구멍을 낼 수 있다.

### 실전용 위임 정책 전문

앞의 두 문장은 뼈대일 뿐이고, 실제로 배포 가능한 위임 정책은 **자기 방어 문장**까지 갖춰야 한다. 아래가 네 겹으로 잠근 완성형이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S1_CreateAndModifyOnlyBoundedRolesInNamespace",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRolePolicy"
      ],
      "Resource": "arn:aws:iam::111122223333:role/dev-*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/dev-boundary"
        }
      }
    },
    {
      "Sid": "S2_ReadOnlyIamAndCleanup",
      "Effect": "Allow",
      "Action": ["iam:Get*", "iam:List*", "iam:DeleteRole", "iam:TagRole", "iam:UpdateRoleDescription"],
      "Resource": "arn:aws:iam::111122223333:role/dev-*"
    },
    {
      "Sid": "S3_PassOnlyBoundedRolesToApprovedServices",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::111122223333:role/dev-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": [
            "lambda.amazonaws.com",
            "ecs-tasks.amazonaws.com"
          ]
        }
      }
    },
    {
      "Sid": "S4_ProtectTheBoundaryItself",
      "Effect": "Deny",
      "Action": [
        "iam:DeleteRolePermissionsBoundary",
        "iam:DeleteUserPermissionsBoundary",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:SetDefaultPolicyVersion",
        "iam:DeletePolicy"
      ],
      "Resource": "arn:aws:iam::111122223333:policy/dev-boundary"
    },
    {
      "Sid": "S5_DenySwappingBoundaryForAnotherOne",
      "Effect": "Deny",
      "Action": ["iam:PutRolePermissionsBoundary", "iam:PutUserPermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/dev-boundary"
        }
      }
    }
  ]
}
```

각 문장이 막는 구체적 우회 시도는 다음과 같다.

| Sid | 막는 우회 시도 | 빠뜨렸을 때의 결과 |
|-----|----------------|--------------------|
| S1 | 경계 없는 롤 생성, `dev-` 밖 롤 조작 | 개발자가 무방비 관리자 롤을 자유롭게 생성 |
| S3 | 강한 롤을 임의 서비스에 전달 | PassRole 경유로 다른 롤의 권한을 실행 |
| S4 | 경계 **정책 문서 자체**를 수정 | 경계를 `"Action": "*"`로 바꿔 천장을 없앰 |
| S5 | 경계를 **더 느슨한 다른 정책**으로 교체 | 자기가 만든 `weak-boundary`를 붙여 우회 |

> ⚠️ **함정**: S5의 `StringNotEquals`가 왜 `Deny`와 짝인지가 day1의 조건 연산자 이야기와 그대로 연결된다. "지정한 경계가 아니면 허용하지 않는다"를 `Allow` + `StringNotEquals`로 쓰면 *그 문장이 허용하지 않을 뿐* 다른 Allow가 있으면 통과한다. 금지는 반드시 Deny로 표현해야 한다.

> 🎯 **시나리오**: "보안팀이 위 정책을 배포했는데, 며칠 뒤 감사에서 `dev-` 접두사가 붙은 롤 하나가 S3 전체 삭제 권한을 갖고 있는 것이 발견됐다. 경계가 뚫린 것인가?" → 아니다. 이 상황은 **경계가 `s3:*`를 허용하고 있었기 때문**에 정상적으로 발생한 결과다. 경계는 "위험한 일을 막는 장치"가 아니라 "허용 목록의 천장"이고, 천장 안에서 개발자가 무엇을 하든 막지 않는다. 여기서 필요한 조치는 경계 정책에서 파괴적 액션(`s3:DeleteBucket`, `s3:DeleteObjectVersion` 등)을 Deny로 도려내거나, 태그·리소스 조건으로 prod 리소스를 제외하는 것이다. **"경계를 붙였으니 안전하다"는 명제는 경계의 내용을 검토하지 않으면 성립하지 않는다.**

### 경계를 운영하는 CLI

```bash
# 롤을 만들면서 경계를 함께 부착 (경계 없는 생성은 S1 조건에 막힌다)
aws iam create-role \
  --role-name dev-payments-lambda \
  --assume-role-policy-document file://trust-lambda.json \
  --permissions-boundary arn:aws:iam::111122223333:policy/dev-boundary

# 기존 롤에 경계를 나중에 부착
aws iam put-role-permissions-boundary \
  --role-name dev-payments-lambda \
  --permissions-boundary arn:aws:iam::111122223333:policy/dev-boundary

# 경계가 실제로 붙어 있는지 확인 — PermissionsBoundary 필드를 본다
aws iam get-role --role-name dev-payments-lambda \
  --query 'Role.PermissionsBoundary'

# 경계 정책이 어떤 주체들에 걸려 있는지 역조회
aws iam list-entities-for-policy \
  --policy-arn arn:aws:iam::111122223333:policy/dev-boundary \
  --entity-filter Role

# 경계를 얹은 상태로 특정 액션이 통과하는지 계산 (배포 전 검증)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/dev-payments-lambda \
  --action-names iam:CreateRole s3:GetObject \
  --resource-arns "*"
```

경계가 붙어 있지 않은 롤을 찾아내는 것은 거버넌스의 기본 점검 항목이다. `get-role`의 `PermissionsBoundary`가 비어 있는 롤을 주기적으로 목록화하고, `dev-` 네임스페이스 안에 그런 롤이 있으면 그 자체를 사고로 취급한다.

> 🔍 **더 깊이**: 경계는 "붙였는가"만큼 "**너무 넓지 않은가**"가 중요하다. IAM Access Analyzer의 사용되지 않은 접근(unused access) 분석은 지난 기간 동안 실제로 호출되지 않은 액션·서비스를 찾아 주므로, 경계와 Identity 정책을 실증적으로 좁히는 근거가 된다. "이론상 필요할지도 모르니 넓게 열어 둔다"는 관행을 데이터로 반박하는 도구다. 시험에서 "과도하게 부여된 권한을 식별해 최소 권한으로 줄이려면"이라는 문항의 정답 방향이 이것이다.

## 네임스페이스로 격리하기

위 정책에서 `Resource`를 `role/dev-*`로 제한한 것에 주목하자. 개발자는 `dev-` 접두사 롤만 만들 수 있다. 이렇게 **이름 규칙(naming convention)으로 리소스 네임스페이스를 격리**하면, 개발자가 보안팀의 `security-` 롤이나 `admin-` 롤을 건드리지 못한다.

```
개발자 권한 범위:
  생성 가능: role/dev-*, policy/dev-*
  접근 불가: role/security-*, role/admin-*, role/prod-*
```

> 🔍 **더 깊이**: 이 패턴은 **self-service IAM**의 표준 설계다. AWS는 이를 "delegating responsibility with permissions boundaries"라 부른다. 더 정교한 버전은 `aws:PrincipalTag`와 `aws:RequestTag`를 결합해 "개발자가 자기 팀 태그가 붙은 롤만 만들 수 있게" 하는 ABAC(속성 기반 접근 제어)로 확장한다. 이건 day4에서 다룬다.

## Permission Boundary vs SCP: 무엇이 다른가

둘 다 "상한선"이지만 적용 범위가 다르다. 시험에서 자주 비교된다.

| 구분 | Permission Boundary | SCP |
|------|---------------------|-----|
| 부착 대상 | 개별 User/Role | OU/Account |
| 적용 범위 | 그 주체 한 명 | 계정 전체(root 제외 모든 주체) |
| 권한 부여 | 안 함(상한만) | 안 함(상한만) |
| 관리 주체 | 계정 관리자/위임자 | Organizations 관리 계정 |
| 주 용도 | 개발자 위임 시 권한 상승 차단 | 조직 차원 가드레일 |
| root에 영향 | 영향 없음(관리자가 변경 가능) | 멤버 계정 root에도 적용 |

핵심 차이: **Boundary는 "이 사람의 상한", SCP는 "이 계정 전체의 상한"**이다. 둘은 함께 쓰여 다층 방어를 이룬다. 유효 권한은 SCP ∩ Boundary ∩ Identity의 교집합이다.

> 💡 **관련 이론**: 권한을 위임하면서도 위임받은 자가 위임자를 넘지 못하게 하는 것은 보안에서 **제한된 위임(constrained delegation)** 문제다. 운영체제의 setuid 비트, Kerberos의 제약 위임, Capability 기반 보안 모델이 모두 같은 문제를 푼다. 핵심 불변식은 "위임받은 권한 ⊆ 위임자가 위임 가능한 권한"이다. Permission Boundary는 이 불변식을 IAM 차원에서 선언적으로 강제하는 도구다.

### 다섯 정책 타입 한눈에 비교

시험은 두 개가 아니라 **다섯 개를 한꺼번에** 비교시키는 경우가 많다. 표 하나로 정리해 둔다.

| 구분 | SCP | 권한 경계 | Identity 정책 | 리소스 정책 | 세션 정책 |
|------|-----|-----------|---------------|-------------|-----------|
| 부착 대상 | Root/OU/계정 | 사용자·롤 | 사용자·그룹·롤 | 리소스(버킷·키·큐) | AssumeRole 호출 시 전달 |
| 관리 주체 | 조직 관리 계정 | 계정 IAM 관리자 | 계정 IAM 관리자 | **리소스 소유 계정** | AssumeRole 호출 코드 |
| 권한 부여 | X (상한) | X (상한) | **O** | **O** | X (상한) |
| 수명 | 영구 | 영구 | 영구 | 영구 | 그 세션 동안만 |
| 멤버 계정 root | 적용됨 | 해당 없음 | 해당 없음 | 적용됨 | 해당 없음 |
| 관리 계정 | **적용 안 됨** | 정상 적용 | 정상 적용 | 정상 적용 | 정상 적용 |
| 서비스 연결 롤 | 적용 안 됨 | 부착 불가 | (서비스가 관리) | 정상 적용 | 해당 없음 |
| 교차 계정에서 | 호출자 계정에 적용 | 호출자 계정에 적용 | 호출자 쪽 필수 | **리소스 쪽 필수** | 호출자 세션에 적용 |
| 대표 용도 | 조직 가드레일 | 위임 시 권한 상승 차단 | 실제 권한 부여 | 교차 계정 개방 | 임시 권한 최소화 |

이 표에서 **"권한 부여" 행에 O가 두 개뿐**이라는 사실이 day1의 핵심을 다시 확인시킨다. 나머지 셋은 아무리 넓게 써도 새 권한을 만들지 못한다. "경계에 `s3:*`를 넣었으니 S3를 쓸 수 있다"는 오답이 여기서 걸러진다.

### 경계가 범인인지 확인하는 절차

AccessDenied가 났을 때 권한 경계를 용의선상에 올리는 신호와 확인 순서가 있다.

```
[ "경계 때문인가" 를 5분 안에 판정하기 ]

① 오류 메시지에 "permissions boundary" 문구가 있나
     있다 → 확정. ④로 건너뛴다
     없다 → ②

② 그 주체에 경계가 붙어 있기는 한가
     aws iam get-role --role-name X --query 'Role.PermissionsBoundary'
     비어 있다 → 경계는 범인이 아니다. SCP·리소스 정책으로 이동

③ 막힌 액션이 Identity 정책에는 있는데 경계에는 없나
     → 있으면 경계가 범인 (전형적 증상: "정책을 붙였는데 안 된다")

④ 시뮬레이터로 재현
     aws iam simulate-principal-policy \
       --policy-source-arn <주체 ARN> \
       --action-names <막힌 액션> --resource-arns <대상>
     → MatchedStatements 에서 어느 문서가 걸렀는지 확인

⑤ 조치는 두 갈래
     · 그 액션이 정말 필요하다 → 경계 정책을 넓힌다(승인 필요)
     · 필요하지 않다          → 경계가 제 일을 한 것. 요구를 재검토
```

⑤의 두 번째 갈래를 기본값으로 두는 것이 중요하다. 경계가 막았다는 것은 **위임 설계가 정한 범위 밖의 일을 하려 했다**는 뜻이고, 대부분의 경우 정답은 경계를 넓히는 것이 아니라 그 작업을 경계 안에서 다시 설계하거나 별도 승인 경로로 옮기는 것이다.

> ⚠️ **함정**: 경계 때문에 막힌 증상에서 가장 잘못된 대응이 "개발자에게 `AdministratorAccess`를 임시로 붙여 주고 나중에 떼기"다. 경계가 붙어 있으면 `AdministratorAccess`를 붙여도 여전히 막히므로(교집합), 급해진 관리자가 결국 **경계를 떼어 버리는** 수순으로 간다. 그리고 그 경계는 대개 다시 붙지 않는다. 그래서 경계를 배포할 때는 반드시 "경계를 넓히는 정식 요청 경로"를 함께 만들어야 한다. 우회 경로가 없는 통제는 결국 통제 자체가 제거되는 방식으로 우회된다.

## 정리하며

권한 위임의 본질적 위험은 IAM 조작 권한이 권한 상승으로 이어진다는 점이다. Permission Boundary는 (1) 개발자에게 줄 권한의 상한을 정의하고, (2) 개발자가 만드는 모든 롤에 그 Boundary를 강제 부착시키며, (3) Boundary 변경·삭제를 차단하고, (4) 리소스 네임스페이스를 접두사로 격리하는 — 이 네 가지가 한 세트로 작동할 때 비로소 안전하다. 하나라도 빠지면 우회된다. 여기에 (5) `iam:PassRole`을 리소스와 `iam:PassedToService`로 좁히는 문장까지 더해야 세 번째 상승 갈래까지 닫힌다.

> 📚 **사례**: 2019년 Capital One 침해는 "위임의 범위"가 곧 "피해의 범위"라는 것을 보여 준 사건이다. 공격자는 잘못 구성된 WAF를 통해 SSRF로 EC2 인스턴스 메타데이터에 접근해 해당 인스턴스 역할의 임시 자격증명을 얻었고, 그 자격증명으로 S3 버킷 목록을 조회한 뒤 데이터를 내려받았다. 미국·캐나다 신용카드 신청자 약 1억 명 규모의 정보가 영향을 받았다. 여기서 결정적이었던 것은 **그 인스턴스 롤이 필요 이상으로 넓은 S3 권한을 갖고 있었다는 점**이다. 공격 경로(SSRF)를 막는 것도 중요하지만, 그 경로가 열렸을 때 손에 쥐어지는 권한이 좁았다면 피해는 훨씬 작았다. 권한 경계는 정확히 이 지점에 작동한다 — 워크로드 롤에 경계를 걸어 천장을 낮추면, 그 롤이 탈취되더라도 경계 밖으로는 나갈 수 없다. 시험에서 "자격증명 탈취 시 피해를 최소화하려면"이 나오면 답은 탐지가 아니라 *권한 축소*다.

> 📚 **사례**: 조직 안에서 훨씬 흔한 것은 악의 없는 **셀프서비스 IAM의 표류**다. 처음에는 "개발자가 Lambda 롤을 직접 만들게 하자"로 시작해 좁은 위임 정책을 배포하지만, 배포가 막힐 때마다 예외가 하나씩 추가된다. `iam:PassRole`의 `Resource`가 `*`로 바뀌고, 경계에 `iam:*`가 임시로 들어갔다가 남고, 급한 팀에게는 경계 없는 롤이 발급된다. 몇 분기가 지나면 원래의 통제가 형태만 남는다. 이 표류를 막는 실무 장치는 세 가지다 — **경계 정책을 IaC로 관리해 변경이 코드 리뷰를 거치게 하고**, `check-no-new-access`류의 정책 차분 검사를 배포 파이프라인에 게이트로 걸고, 경계가 없는 롤 목록을 주기적으로 뽑아 예외를 가시화하는 것.

## 한 줄 요약

IAM 위임의 위험은 "IAM을 조작하는 권한 = 모든 권한"이라는 등식에서 나오며, 상승 경로는 ① 자기 정책 확대, ② 새 신원 생성·신뢰 정책 수정, ③ `iam:PassRole`로 강한 롤을 컴퓨트에 넘기기의 세 갈래다. 권한 경계는 주체당 하나만 붙는 **상한**으로, Identity 정책과의 교집합만 남기며 권한을 부여하지는 않는다. 안전한 위임은 (1) `iam:PermissionsBoundary` 조건으로 생성 시 경계 강제, (2) 경계 제거·교체 Deny, (3) 경계 정책 문서 자체의 버전 조작 Deny, (4) `role/dev-*` 네임스페이스 격리, (5) `iam:PassRole`을 리소스와 `iam:PassedToService`로 제한 — 다섯이 한 세트로 가야 성립한다. 경계는 개인의 천장, SCP는 계정의 천장이며 둘은 대체재가 아니다. 막혔을 때는 오류 메시지 → 경계 부착 여부 → Identity와 경계의 차집합 → 시뮬레이터 순으로 좁히고, 기본 대응은 경계를 넓히는 것이 아니라 요구를 경계 안에서 다시 설계하는 것이다.

다음 글에서는 한 단계 위로 올라가, 계정 전체를 통제하는 **AWS Organizations와 SCP**를 다룬다. Boundary가 개인의 천장이라면 SCP는 계정의 천장이고, 둘이 만나 멀티 계정 거버넌스를 완성한다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 개발자에게 `iam:CreateRole`과 `iam:AttachRolePolicy` 권한을 부여하려 한다. 권한 상승을 막으면서 위임하려면 반드시 추가해야 하는 것은?

A) 개발자 계정에 MFA를 강제한다  
B) CreateRole 시 특정 Permission Boundary 부착을 조건으로 강제하고, Boundary 변경을 Deny한다  
C) CloudTrail로 롤 생성을 사후 모니터링한다  
D) 개발자에게 읽기 전용 권한만 준다  

**정답: B**  
해설: 권한 상승의 핵심 차단 메커니즘은 `iam:PermissionsBoundary` 조건키로 Boundary 부착을 강제하고, 동시에 그 Boundary를 떼거나 바꾸는 액션을 명시적 Deny로 막는 것이다. MFA나 사후 모니터링은 상승 자체를 사전 차단하지 못하고, 읽기 전용은 위임 목적(롤 생성)을 달성하지 못한다.

---

**문제 2.** Permission Boundary가 부착된 개발자가 자기가 만든 롤에서 Boundary를 제거하려 한다. 이를 막는 가장 직접적인 방법은?

A) SCP로 모든 IAM 액션을 차단한다  
B) 개발자 정책에 `iam:DeleteRolePermissionsBoundary`를 명시적 Deny로 추가한다  
C) 롤을 읽기 전용으로 만든다  
D) Boundary를 더 넓게 설정한다  

**정답: B**  
해설: Boundary 강제 생성만으로는 부족하며, 생성 후 Boundary를 제거하는 `iam:DeleteRolePermissionsBoundary`와 변경하는 `iam:PutRolePermissionsBoundary`를 명시적 Deny로 막아야 우회를 차단한다. SCP로 모든 IAM을 막으면 위임 자체가 불가능해지고, 나머지는 문제를 해결하지 못한다.

---

**문제 3.** Permission Boundary와 SCP의 차이로 옳은 것은?

A) Boundary는 권한을 부여하고, SCP는 권한을 제한한다  
B) Boundary는 개별 주체의 상한이고, SCP는 계정 전체의 상한이다  
C) 둘 다 멤버 계정의 root 사용자에게 동일하게 적용된다  
D) SCP는 개발자가 직접 관리할 수 있다  

**정답: B**  
해설: Permission Boundary는 특정 User/Role 한 명의 권한 상한이고, SCP는 OU/Account에 적용되어 계정 전체 주체의 상한을 정한다. 둘 다 권한을 부여하지 않고 상한만 정한다. SCP는 멤버 계정 root에도 적용되지만 Boundary는 그렇지 않으며, SCP는 Organizations 관리 계정에서만 관리한다.

---

**문제 4.** 개발자에게 `role/dev-*` 패턴의 롤만 만들 수 있도록 `Resource`를 제한한 이유로 가장 적절한 것은?

A) 롤 생성 속도를 높이기 위해  
B) 개발자가 보안팀이나 운영팀의 롤(예: role/admin-*)을 건드리지 못하게 네임스페이스를 격리하기 위해  
C) 롤 개수를 줄이기 위해  
D) Boundary를 생략할 수 있게 하기 위해  

**정답: B**  
해설: 리소스를 이름 접두사로 제한하면 개발자가 자기 네임스페이스(`dev-`) 밖의 권한 높은 롤을 생성하거나 수정하는 것을 막는다. 이는 self-service IAM에서 격리를 구현하는 표준 패턴이며, Boundary를 대체하지는 않고 함께 쓰인다.

---

**문제 5.** 개발자가 만든 롤의 유효 권한을 계산하려 한다. 그 롤에는 Identity 정책 `s3:*, ec2:*`, Permission Boundary `s3:*, dynamodb:*`가 있고, 계정 SCP는 `s3:*`만 허용한다. 이 롤의 유효 권한은?

A) `s3:*, ec2:*, dynamodb:*` 전부  
B) `s3:*`만  
C) `s3:*, dynamodb:*`  
D) 아무 권한 없음  

**정답: B**  
해설: 유효 권한은 SCP ∩ Boundary ∩ Identity의 교집합이다. SCP는 `s3:*`만, Boundary는 `s3:*`와 `dynamodb:*`, Identity는 `s3:*`와 `ec2:*`를 허용한다. 세 집합 모두에 공통으로 존재하는 것은 `s3:*`뿐이다. `ec2`는 SCP·Boundary에 없고, `dynamodb`는 SCP·Identity에 없어 모두 탈락한다.
