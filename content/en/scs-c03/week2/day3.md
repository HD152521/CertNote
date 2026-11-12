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

## 📝 Practice Questions

**Question 1.** A security team wants to ensure that CloudTrail is never disabled in any account of the organization. What is the most appropriate method?

A) Deploy CloudTrail protection to each account with IAM policies  
B) Apply an SCP that Denies `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` at the Root or a higher-level OU  
C) Monitor CloudTrail status with an AWS Config Rule  
D) Apply the SCP only to the management account  

**Answer: B**  
Explanation: An SCP is a preventive control that, once applied to an OU/Root, is inherited by all accounts below. If you Deny the CloudTrail disabling actions, no account, not even root, can turn it off. IAM deployment risks missing new accounts, and Config is only after-the-fact detection and cannot block. SCPs do not apply to the management account, so D is wrong.

---

**Question 2.** A `Deny ec2:*` SCP is attached to the Prod OU. In an account under the Prod OU, an IAM administrator created an `Allow ec2:*` IAM policy, and an additional SCP that also applies `Allow ec2:RunInstances` was applied to that account. Can it launch EC2 instances?

A) Yes, because the lower SCP overrides the upper OU SCP  
B) Yes, because the IAM policy Allows it  
C) No, because the explicit Deny of the upper OU is inherited and wins  
D) It depends on the conditions  

**Answer: C**  
Explanation: SCP inheritance makes restrictions cumulatively stronger. An explicit Deny at the upper OU is inherited downward and cannot be reopened from below with an SCP or IAM. An explicit Deny beats every Allow. A lower SCP does not override the upper one, and an IAM Allow cannot break through an SCP Deny either.

---

**Question 3.** Right after applying a Region-restriction SCP, users started failing to log in to the console and to get STS tokens. What is the most likely cause?

A) The SCP was applied to the management account  
B) Global services such as IAM and STS were not exempted with a `NotAction` exception, so they were blocked as well  
C) A Region restriction inherently blocks login  
D) MFA is not enabled  

**Answer: B**  
Explanation: Global services (IAM, STS, CloudFront, Route 53, and so on) are not tied to a specific Region endpoint and are routed internally to us-east-1 and similar. If they are not exempted with `NotAction` in the Region-restriction Deny, even login and token issuance are blocked and the account becomes unusable. This is a classic mistake with Region-restriction SCPs.

---

**Question 4.** Which statement about the difference between the preventive control of an SCP and the detective control of an AWS Config Rule is correct?

A) An SCP detects violations after the fact, and Config blocks violations in advance  
B) An SCP blocks violating actions in advance, and Config detects and alerts on violating states after the fact  
C) Both work the same way  
D) Config is always stronger than an SCP  

**Answer: B**  
Explanation: An SCP is a preventive control that denies the action itself and blocks it before the event occurs. A Config Rule is a detective control that evaluates the compliance of resources already created and detects and alerts on violations. Where blocking is possible, an SCP is more cost-effective, and Config complements the areas where detection is needed.

---

**Question 5.** An organization is running production workloads in the Management Account. From a security perspective, what is the most appropriate reason this is a problem?

A) The management account costs more  
B) SCPs do not apply to the management account, so it cannot be protected by guardrails, and if it is compromised the entire organization is at risk  
C) EC2 cannot be launched in the management account  
D) The management account does not support CloudTrail  

**Answer: B**  
Explanation: SCPs apply only to member accounts and have no effect on the management account. Therefore, placing workloads in the management account means they do not get the protection of SCP guardrails, and if the account that controls the entire organization is compromised, all member accounts are exposed to risk. The best practice is to use the management account only for billing and organization management.
