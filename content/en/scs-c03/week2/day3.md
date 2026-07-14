# Day 3 - AWS Organizations and SCP: Account-Level Guardrail Design

How do you enforce "what no account in our organization should ever do" across hundreds of accounts? Deploying IAM policies to each account creates gaps every time a new account is added, and root users can't even be controlled via IAM policies. The answer to this problem is **AWS Organizations' SCP (Service Control Policy)**.

SCP is the top layer of the "permission ceiling" we saw in day1 and day2. It applies guardrails to the entire account, including the root user. It's the core of Specialty exam domain 1 (security governance), and you must precisely understand OU design, SCP evaluation, and inheritance rules.

## Organizations Structure: A Hierarchical Tree

Organizations organizes accounts into a tree structure.

```
Root (Organization root, only one)
 │
 ├── Management Account (payer account)
 │
 ├── OU: Security
 │    ├── Log Archive account
 │    └── Audit account
 │
 ├── OU: Production
 │    ├── prod-app-1 account
 │    └── prod-app-2 account
 │
 └── OU: Sandbox
      └── dev-1 account
```

SCP can be attached to the **Root, an OU, or an individual account** in this tree. And SCP attached at a higher level **inherits to all subordinate nodes**.

> ⚠️ **Common Trap**: **SCP does not apply to the Management Account.** Even if you attach an SCP to the Management Account in the tree, it has no effect. That's why the security best practice is to never run workloads in the Management Account—use it only for billing and organization management. If the Management Account is compromised, the entire organization is at risk. This is a frequent exam trap.

## SCP Grants No Permissions: It's Only a Filter

As we've emphasized in day1 and day2, SCP **does not grant permissions**. It only defines the **maximum available permissions** a account can use. To actually receive permissions, the account's internal IAM policies must still grant Allow.

```
Effective permission for principal in account = SCP-allowed range ∩ IAM policy-allowed range
```

Even if SCP allows `s3:*`, without an IAM policy you can't do anything. Conversely, even if IAM grants `ec2:*`, if SCP doesn't allow ec2, you can't use it.

## Two SCP Strategies: Allow List vs Deny List

There are two approaches to designing SCP:

### 1) Deny List Strategy (most common)

Keep the default policy `FullAWSAccess` (allow everything) and **explicitly Deny only the actions you forbid**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeaveOrg",
      "Effect": "Deny",
      "Action": ["organizations:LeaveOrganization"],
      "Resource": "*"
    },
    {
      "Sid": "RestrictRegions",
      "Effect": "Deny",
      "NotAction": ["iam:*", "sts:*", "cloudfront:*", "route53:*", "support:*"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

This policy (1) prevents accounts from leaving the organization, and (2) blocks operations in regions other than `ap-northeast-2` and `us-east-1`. However, global services (IAM, STS, CloudFront, etc.) are excepted using `NotAction`. Global services aren't bound to specific region endpoints, so they must be excluded from region restrictions.

> 🔍 **Deeper Insight**: When using region-restricting SCP, if you don't exempt global services like IAM, STS, CloudFront, Route 53, Support, and Organizations via `NotAction`, console login and STS token issuance can be blocked, making the **entire account unusable**. Global service APIs internally route to `us-east-1` or operate region-independently. Omitting these exceptions is common in both real-world scenarios and exams.

### 2) Allow List Strategy

Remove `FullAWSAccess` and **explicitly list only the actions you allow**. More strict but harder to manage because you must update SCP every time you use a new service.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:*", "ec2:*", "lambda:*", "logs:*"],
    "Resource": "*"
  }]
}
```

> 💡 **Related Theory**: Deny List corresponds to a blacklist, and Allow List to a whitelist. Whitelist (Allow List) is more secure from a security perspective, but conflicts with operational agility. AWS recommends **Deny List + critical prohibitions** in practice (region restrictions, root usage blocks, blocking security service disablement, etc.). Strong guardrails on what must never be broken are enforced with Deny, while the rest are finely controlled by IAM and Permission Boundary—a multi-layered strategy.

## SCP Evaluation Rules: Inheritance and Intersection

When SCP is applied at multiple levels, evaluation works like this:

```
For an action to be allowed, that action must be allowed at
every level on the path Root → OU → Account (AND/intersection).

However, if any single level explicitly Denies → blocked.
```

In other words, SCP inheritance **becomes cumulatively narrower (only subtracts)**. If the parent OU allows only `s3:*`, adding `ec2:*` allowance in the child OU is pointless—the parent already removed ec2.

```
Root SCP:       FullAWSAccess (allow everything)
  └ Prod OU SCP:    Deny ec2:*   (block EC2)
      └ app-1 account SCP: attempt Allow ec2:RunInstances
        → Result: Blocked. Parent OU's Deny wins.
```

> ⚠️ **Common Trap**: If asked "can a child account reopen permissions via SCP that were blocked by the parent?", answering "yes" is wrong. SCP inheritance means **restrictions only get stricter**. What the parent blocks cannot be opened by the child. Only IAM policy "grants" permissions; SCP only lowers the ceiling that IAM can exercise.

## OU Design Pattern: Functional Separation

A mature organization's standard OU structure (AWS Landing Zone / Control Tower recommended) looks like this:

| OU | Purpose | Representative SCP |
|----|---------|-------------------|
| Security | Isolate logging/audit accounts | Block CloudTrail disablement |
| Infrastructure | Shared network/DNS | Restrict network changes |
| Workloads/Prod | Production workloads | Region restriction, block root |
| Workloads/SDLC | Development/staging | Cost ceiling, instance type limits |
| Sandbox | Experimental accounts | Budget guardrails, isolated billing |
| Suspended | Accounts pending deletion | Deny almost everything |

The core design principle is **"blast radius isolation."** By placing prod and dev in different OUs, loose SCP for dev accounts won't leak into prod.

> 🔍 **Deeper Insight**: AWS Control Tower is a managed landing zone that automatically sets up this OU structure and SCP, CloudTrail, and Config. Control Tower's "guardrails" are internally implemented as a combination of SCP (preventive control) and AWS Config Rules (detective control). Preventive guardrails = SCP (blocks), detective guardrails = Config (detects violations and alerts). Exams often test distinguishing "preventive vs detective."

## Essential Guardrails You Should Block with SCP

These are SCP rules you almost always implement in production.

1. **Block organization exit**: Deny `organizations:LeaveOrganization`
2. **Block CloudTrail disablement**: Deny `cloudtrail:StopLogging`, `cloudtrail:DeleteTrail`
3. **Block security service disablement**: Deny disabling GuardDuty, Config, Security Hub
4. **Restrict root usage**: Deny if `aws:PrincipalArn` is root in `Condition`
5. **Region restrictions**: Address data sovereignty regulatory requirements
6. **Block IAM user creation**: Deny `iam:CreateUser` if enforcing Identity Center

> 💡 **Related Theory**: These guardrails are classified as **preventive controls** in security control taxonomy. In NIST's control classification (preventive/detective/corrective), preventive controls are the most cost-effective because they block before incidents occur. SCP is AWS's most powerful preventive control mechanism, implementing the principle "if something can be blocked, block it rather than detect it."

## Summary

SCP is the spine of multi-account governance. The key points are: (1) it grants no permissions, only sets ceilings, (2) it doesn't apply to the Management Account, (3) inheritance cumulatively narrows—child levels can't reopen what parent levels closed, (4) region restrictions must except global services, (5) OUs are designed by blast radius isolation. If Permission Boundary is an individual's ceiling, SCP is an account's ceiling, and together they form multi-layered guardrails.

Next we'll shift perspective to the "granting" side: how to safely provide access to people in multi-account environments using IAM Identity Center and federation, and how to extend attribute-based access control with ABAC tagging.

---

## 📝 연습 문제

**문제 1.** 한 보안팀이 조직의 모든 계정에서 CloudTrail이 절대 비활성화되지 않도록 강제하려 한다. 가장 적절한 방법은?

A) 각 계정에 IAM 정책으로 CloudTrail 보호를 배포한다  
B) Root 또는 상위 OU에 `cloudtrail:StopLogging`과 `cloudtrail:DeleteTrail`을 Deny하는 SCP를 적용한다  
C) AWS Config Rule로 CloudTrail 상태를 모니터링한다  
D) 관리 계정에만 SCP를 적용한다  

**정답: B**  
해설: SCP는 OU/Root에 한 번 적용하면 하위 모든 계정에 상속되는 예방적 통제다. CloudTrail 비활성화 액션을 Deny하면 어떤 계정에서도, root조차도 끄지 못한다. IAM 배포는 새 계정 누락 위험이 있고, Config는 사후 탐지일 뿐 차단하지 못한다. 관리 계정에는 SCP가 적용되지 않으므로 D는 틀리다.

---

**문제 2.** Prod OU에 `Deny ec2:*` SCP가 걸려 있다. Prod OU 하위의 한 계정에서 IAM 관리자가 `Allow ec2:*` IAM 정책을 만들고, 그 계정에 추가 SCP로 `Allow ec2:RunInstances`도 적용했다. EC2 인스턴스를 시작할 수 있는가?

A) 가능하다, 하위 SCP가 상위 OU SCP를 덮어쓰므로  
B) 가능하다, IAM 정책이 Allow하므로  
C) 불가능하다, 상위 OU의 명시적 Deny가 상속되어 이기므로  
D) 조건에 따라 다르다  

**정답: C**  
해설: SCP 상속은 누적적으로 제한이 강해진다. 상위 OU의 명시적 Deny는 하위로 상속되며, 하위에서 SCP나 IAM으로 다시 열 수 없다. 명시적 Deny는 모든 Allow를 이긴다. 하위 SCP가 상위를 덮어쓰지 않으며, IAM Allow도 SCP Deny를 뚫지 못한다.

---

**문제 3.** 리전 제한 SCP를 적용한 직후 사용자들이 콘솔 로그인과 STS 토큰 발급에 실패하기 시작했다. 가장 가능성 높은 원인은?

A) SCP가 관리 계정에 적용되었다  
B) IAM·STS 같은 글로벌 서비스를 `NotAction` 예외로 처리하지 않아 함께 차단되었다  
C) 리전 제한은 원래 로그인을 막는다  
D) MFA가 활성화되지 않았다  

**정답: B**  
해설: 글로벌 서비스(IAM, STS, CloudFront, Route 53 등)는 특정 리전 엔드포인트에 묶이지 않고 내부적으로 us-east-1 등으로 라우팅된다. 리전 제한 Deny에서 이들을 `NotAction`으로 예외하지 않으면 로그인과 토큰 발급까지 막혀 계정이 사용 불능이 된다. 이는 리전 제한 SCP의 대표적 실수다.

---

**문제 4.** SCP의 예방적 통제(preventive control)와 AWS Config Rule의 탐지적 통제(detective control)의 차이로 옳은 것은?

A) SCP는 위반을 사후 감지하고, Config는 위반을 사전 차단한다  
B) SCP는 위반 행위를 사전에 차단하고, Config는 위반 상태를 사후 감지·알림한다  
C) 둘 다 동일하게 작동한다  
D) Config가 SCP보다 항상 강력하다  

**정답: B**  
해설: SCP는 액션 자체를 거부해 사건 발생 전에 차단하는 예방적 통제다. Config Rule은 이미 만들어진 리소스의 준수 여부를 평가해 위반을 감지·알림하는 탐지적 통제다. 막을 수 있으면 막는 SCP가 비용 효율적이며, 탐지가 필요한 영역을 Config가 보완한다.

---

**문제 5.** 한 조직이 관리 계정(Management Account)에서 프로덕션 워크로드를 운영하고 있다. 보안 관점에서 이것이 문제인 이유로 가장 적절한 것은?

A) 관리 계정은 비용이 더 비싸다  
B) 관리 계정에는 SCP가 적용되지 않아 가드레일로 보호할 수 없고, 손상 시 조직 전체가 위험해진다  
C) 관리 계정에서는 EC2를 띄울 수 없다  
D) 관리 계정은 CloudTrail을 지원하지 않는다  

**정답: B**  
해설: SCP는 멤버 계정에만 적용되고 관리 계정에는 효과가 없다. 따라서 관리 계정에 워크로드를 두면 SCP 가드레일의 보호를 받지 못하며, 조직 전체를 통제하는 계정이 손상될 경우 모든 멤버 계정이 위험에 노출된다. 모범 사례는 관리 계정을 결제·조직 관리 전용으로만 사용하는 것이다.
