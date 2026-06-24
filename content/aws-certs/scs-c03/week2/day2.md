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

## 정리하며

권한 위임의 본질적 위험은 IAM 조작 권한이 권한 상승으로 이어진다는 점이다. Permission Boundary는 (1) 개발자에게 줄 권한의 상한을 정의하고, (2) 개발자가 만드는 모든 롤에 그 Boundary를 강제 부착시키며, (3) Boundary 변경·삭제를 차단하고, (4) 리소스 네임스페이스를 접두사로 격리하는 — 이 네 가지가 한 세트로 작동할 때 비로소 안전하다. 하나라도 빠지면 우회된다.

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
