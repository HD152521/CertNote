# Day 2 - Permission Boundary and Delegation: The Safe Way to Grant Permissions to Developers

As organizations grow, the security team can't create every IAM role and policy in one place. Developers need to create their own Lambda execution roles, EC2 instance roles, and CI/CD deployment roles to move quickly. But here lies a critical risk: **a developer given IAM permissions can create a role with AdministratorAccess for themselves, causing privilege escalation**.

**Permission Boundary** tackles this problem head-on. In day1, we glanced at this concept as "a ceiling on permissions"—today we'll handle it practically in real delegation scenarios. Blocking privilege escalation is a core topic that appears in nearly every Specialty exam.

## Anatomy of a Privilege Escalation Attack

Before we can defend, we need to understand how the attack works. Suppose a developer is given `iam:CreateRole`, `iam:AttachRolePolicy`, and `iam:PassRole` permissions. Their intent is "I want to create a role for my Lambda." But with these permissions, the following becomes possible:

```
1. Create new role:           iam:CreateRole
2. Attach admin policy:        iam:AttachRolePolicy → arn:aws:iam::aws:policy/AdministratorAccess
3. Switch to that role:        sts:AssumeRole or PassRole to Lambda
→ Result: Developer becomes account administrator
```

This is a textbook **IAM privilege escalation**. The delegated permissions themselves are legitimate, but when combined, they exceed the developer's authority.

> 💡 **Related Theory**: This attack is exemplified in security researcher Spencer Gietzen's (Rhino Security Labs) 2018 documentation of **21 AWS IAM privilege escalation paths**. Known paths include `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion`, `iam:PassRole + lambda:CreateFunction`, `iam:AttachUserPolicy` and others. The common principle: "permissions to manipulate IAM" equals "permissions to obtain all permissions." That's why permissions handling IAM itself must be bounded.

## How Permission Boundary Works

Permission Boundary is a **second policy** attached to a User or Role. It defines the **maximum limit** of permissions this principal can have. The effective permission is the intersection, as we saw in day1.

```
Effective permission = Identity policy (grants) ∩ Permission Boundary (ceiling)
```

The key point: **the Boundary itself grants no permission**. It's simply a ceiling saying "no matter how broad the Identity policy is, access ends here."

```json
// Example Permission Boundary to attach to developers
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

A developer with this Boundary attached cannot use `iam:*` or `ec2:*` even if their own IAM policy includes them, because those fall outside the Boundary intersection.

## Core Safe Delegation: Mandatory Boundary Attachment

Now for the real technique. When giving developers role creation permissions, you must **force every role they create to have a specific Boundary**. Otherwise, developers can create admin roles without any Boundary.

```json
// Identity policy to attach to developer (delegation permissions)
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

The two Statements work together:

1. **Conditional CreateRole Allow**: Using the `iam:PermissionsBoundary` condition key, role creation is permitted only when `dev-boundary` is attached to the role the developer creates. Roles without Boundary cannot be created.
2. **Boundary Modification Block**: An explicit Deny prevents developers from removing or changing the Boundary on their created roles.

> ⚠️ **Common Trap**: If you only apply condition 1 and skip 2, it can be bypassed. A developer can create a role with the Boundary attached, then immediately use `iam:DeleteRolePermissionsBoundary` to strip it away, leaving an unprotected role. That's why **creation enforcement (Sid 1) + modification block (Sid 2)** must go together. Also, if you don't block `iam:CreatePolicyVersion`, developers can modify the Boundary policy itself to create loopholes.

## Isolation Through Namespacing

Notice how the `Resource` in the policy above is restricted to `role/dev-*`. Developers can only create roles with the `dev-` prefix. By **isolating resource namespaces through naming conventions**, developers cannot touch the security team's `security-` roles or `admin-` roles.

```
Developer's permission scope:
  Can create: role/dev-*, policy/dev-*
  Cannot access: role/security-*, role/admin-*, role/prod-*
```

> 🔍 **Deeper Insight**: This pattern is the standard design for **self-service IAM**. AWS calls it "delegating responsibility with permissions boundaries." A more sophisticated version combines `aws:PrincipalTag` and `aws:RequestTag` to extend this to ABAC (attribute-based access control), where "developers can only create roles tagged with their team's tag." We'll cover this in day4.

## Permission Boundary vs SCP: What's Different?

Both set ceilings, but their scope differs. Exams frequently compare them.

| Aspect | Permission Boundary | SCP |
|--------|---------------------|-----|
| Attached to | Individual User/Role | OU/Account |
| Scope | That single principal | Entire account (all principals except root) |
| Permission Grant | No (ceiling only) | No (ceiling only) |
| Managed by | Account admin / delegator | Organizations management account |
| Primary Use | Blocking privilege escalation during developer delegation | Organization-wide guardrail |
| Effect on root | No effect (admin can change) | Applies even to member account root |

Key difference: **Boundary is "this person's ceiling," SCP is "this account's ceiling."** Used together, they form multi-layered defense. Effective permission is the intersection of SCP ∩ Boundary ∩ Identity.

> 💡 **Related Theory**: Delegating authority while preventing the delegatee from exceeding the delegator is the **constrained delegation** problem in security. Operating system setuid bits, Kerberos constrained delegation, and capability-based security models all solve the same problem. The core invariant: "delegated authority ⊆ authority the delegator can delegate." Permission Boundary is the tool that declaratively enforces this invariant at the IAM level.

## Summary

The core risk of delegation is that IAM manipulation permissions lead to privilege escalation. Permission Boundary works safely when it (1) defines the ceiling for permissions developers receive, (2) forces that Boundary on every role they create, (3) blocks Boundary removal and changes, and (4) isolates resource namespaces by prefix—all four work as a unit. Omit even one and it can be bypassed.

Next, we'll zoom out and cover **AWS Organizations and SCP**, which control the entire account. While Boundary is an individual's ceiling, SCP is an account's ceiling, and together they complete multi-account governance.

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
