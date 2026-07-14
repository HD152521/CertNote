# Day 1 - AWS Organizations Security Governance: SCP Design, Delegated Administrators, Central Security Account Model

Security in a single account ends with the intersection of IAM policies and resource policies. However, in organizations with tens to hundreds of accounts, the critical question becomes: "Who, how, and where enforces the upper limit of what each account administrator can do?" AWS Organizations is the *governance plane* that defines this upper limit, and its central tool is SCP (Service Control Policy). In the security exam, Organizations covers the "ceiling of permissions"; if IAM is about "granting permissions," SCP is about "permission boundary at scale."

## Organization Structure: Root, OU, Accounts

AWS Organizations is a tree structure. At the top is the **Root**, below it are nested **Organizational Units (OUs)**, and at the bottom are **Accounts**. Policies can be attached to any node (Root, OU, Account), and those policies automatically **inherit** to all nodes below.

```
Root
├── SCP: DenyRootUser, DenyRegionLockdown (applies to all)
├── OU: Security
│   ├── Account: Audit (central log/detection)
│   └── Account: Log Archive (immutable log retention)
├── OU: Infrastructure
│   └── Account: Networking, SharedServices
├── OU: Workloads
│   ├── OU: Prod  ── SCP: DenyDisableGuardDuty
│   └── OU: NonProd ── SCP: AllowSandboxRegions
└── OU: Suspended ── SCP: DenyAll (isolation)
```

The Management Account (formerly Master Account) is the apex of billing and control that created the organization. A critical trap: **do not run workloads in the Management Account, and SCPs do not apply to it**. Because SCPs cannot control members of the Management Account, running workloads there becomes a governance hole.

> 💡 **Related Theory**: This is *layered permission boundaries* extending *least privilege* to organizational scale. Like capability models in operating systems where parent processes can delegate only a subset of their own permissions to children, SCP defines "the upper limit of permissions to pass down," and IAM defines "the actual permissions granted within that limit." Only their **intersection** becomes effective permission.

## The Essence of SCP: Boundary, Not Grant

The most common misconception about SCP is that "SCP grants permissions." **SCP does not grant permissions.** SCP only defines the *maximum boundary* of permissions that IAM can grant. For any action to actually be allowed, all of the following must be satisfied:

1. SCP allows it (or does not explicitly deny it)
2. IAM policy (identity/resource) explicitly Allows it
3. No policy has explicit Deny

```
Effective Permission = SCP Boundary ∩ IAM Allow − (all Deny)
```

There are two SCP strategies. **Allow list strategy** removes `FullAWSAccess` and only passes explicitly permitted services (positive). **Deny list strategy** keeps `FullAWSAccess` but only denies risky actions (negative). Most practical deployments use Deny list because it's easier to operate — no need to add allow every time a new service launches.

## Core SCP Pattern: Region Lockdown

The most common pattern is blocking usage outside specific regions due to regulatory or data sovereignty requirements. Global services (IAM, Organizations, CloudFront, Route 53, etc.) must not be locked down, so we use `NotAction` to exclude them.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideApprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "organizations:*", "sts:*",
        "cloudfront:*", "route53:*", "waf:*", "wafv2:*",
        "shield:*", "support:*", "globalaccelerator:*"
      ],
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

The reason for including `us-east-1` in approved regions is that many global service API endpoints are called from there. Omitting this breaks console operations for CloudFront and ACM (global) — a common exam trap.

## Core SCP Pattern: Prevent Security Control Disabling

Prevent account administrators from turning off security baseline (GuardDuty, CloudTrail, Config, Security Hub). This blocks the attack scenario of "turn off detection and do bad things."

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectSecurityServices",
      "Effect": "Deny",
      "Action": [
        "guardduty:DeleteDetector",
        "guardduty:DisassociateFromMasterAccount",
        "guardduty:StopMonitoringMembers",
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "securityhub:DisableSecurityHub"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdminRole"
        }
      }
    }
  ]
}
```

Using `Condition` to specify only security admin roles as exceptions allows maintenance automation while preventing general users from disabling.

## Core SCP Pattern: Root User and Tag Enforcement

Blocking root user credential usage and enforcing required tags are also common patterns.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRootUserActions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
      }
    },
    {
      "Sid": "RequireCostCenterTagOnEC2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "Null": { "aws:RequestTag/CostCenter": "true" }
      }
    }
  ]
}
```

## What SCP Cannot Control

Exams always ask about the *limitations* of SCP. SCP cannot control:

- **Management Account Members**: As mentioned, the Management Account is exempt from SCP.
- **Service-Linked Roles (SLR)**: SLRs automatically created and used by AWS services are not affected by SCP.
- **External Cross-Account Access via Resource-Based Policies**: SCP limits *principals* within the organization, so access allowed by resource policy from outside is handled separately.
- **Permission Grant**: Again, SCP is a ceiling, not a floor.

Additionally, SCP pairs with **RCP (Resource Control Policy)**. If SCP is the upper limit of "what can this organization's principal do," RCP is the upper limit of "who can access this organization's resources." For example, you can use RCP organization-wide to prevent S3 buckets from being exposed to principals outside the organization.

## Delegated Administrator

Concentrating all security operations in the Management Account is an antipattern. The Management Account should only handle billing and organization control, while actual security service operations are delegated to a separate **Delegated Administrator Account** (typically an Audit/Security account).

```bash
# Register GuardDuty delegated administrator (run from Management Account)
aws organizations register-delegated-administrator \
  --account-id 222233334444 \
  --service-principal guardduty.amazonaws.com

# Security Hub, Config, Macie, IAM Access Analyzer, Detective,
# Firewall Manager, etc. can all be delegated with the same pattern
```

Benefits of the delegated administrator model:
- Reduces the attack surface of the Management Account (minimize blast radius).
- Security team operates security services without Management Account's billing and organization permissions (separation of duties).
- Each security service becomes a hub that automatically enrolls and manages organization-wide members.

> 💡 **Related Theory**: This is the organizational implementation of *Separation of Duties* and *least privilege*. NIST SP 800-53's AC-5 (Separation of Duties) requires that no single subject control the entire process. Separating Management Account (billing/organization) from Delegated Administrators (security operations) means compromise of one account doesn't surrender complete control.

## Central Security Account Model

AWS's recommended multi-account security architecture (SRA, Security Reference Architecture) concentrates security functions into two dedicated accounts:

- **Security Tooling (Audit) Account**: Delegated Administrator for GuardDuty, Security Hub, Config, Macie, and Detective. Organization-wide detection findings aggregate here. Automated response (Lambda, EventBridge) is also orchestrated from here.
- **Log Archive Account**: **Immutable** log repository where Organization CloudTrail, Config snapshots, VPC Flow Logs, and CloudWatch logs flow in. Protected with object lock (S3 Object Lock), MFA Delete, dedicated KMS key, and strict bucket policy.

```
Workload Accounts ──(Organization CloudTrail)──▶ Log Archive (immutable S3, Object Lock)
       │
       └──(GuardDuty/Config/SecurityHub members)──▶ Audit (delegated admin, aggregation/response)
```

Organization CloudTrail activated from the Management Account automatically applies to all member accounts, and member account administrators cannot disable or view it (read-only). This is the governance starting point for "preventing detection bypass."

## Trap Summary

- SCP does *not grant* permissions. Without IAM Allow, even if SCP permits, access is denied.
- SCP does *not apply to Management Account members* → No workloads in Management Account.
- Missing global services and `us-east-1` exception in region-lock SCP breaks console, CloudFront, and ACM.
- Preventing security service disabling SCP requires *maintenance role exception* or automation breaks.
- Move security operations to *delegated administrator* and use Management Account only for billing and organization.

## 📝 연습 문제

**문제 1.** 한 OU에 `FullAWSAccess`가 그대로 붙어 있고, IAM 사용자에게 `s3:GetObject` Allow가 부여돼 있다. 그런데 상위 Root에 붙은 SCP가 `s3:*`를 Deny한다. 이 사용자는 S3 객체를 읽을 수 있는가?

A) 읽을 수 있다 — IAM Allow가 SCP보다 우선하므로  
B) 읽을 수 없다 — SCP의 명시적 Deny가 IAM Allow를 무력화하므로  
C) 읽을 수 있다 — OU에 FullAWSAccess가 있으므로  
D) 계정 관리자만 읽을 수 있다  

**정답: B**  
해설: 유효 권한은 SCP 경계와 IAM Allow의 교집합에서 모든 Deny를 뺀 것이다. 상위 노드의 SCP가 명시적으로 거부하면 하위 어디서 Allow가 있어도 액세스가 불가능하다. IAM Allow가 SCP보다 우선한다는 것은 오해이며, FullAWSAccess는 거부를 무력화하지 못한다. 계정 관리자라도 SCP Deny는 동일하게 적용된다(단 관리 계정 멤버는 예외).

---

**문제 2.** 규제 요구로 워크로드를 ap-northeast-2 외부에서 생성하지 못하게 SCP로 막으려 한다. 가장 올바른 설계는?

A) 모든 액션을 ap-northeast-2 외에서 Deny하고 예외 없음  
B) `NotAction`으로 IAM·CloudFront·Route 53 등 글로벌 서비스를 예외하고 `aws:RequestedRegion`이 허용 리전이 아닐 때 Deny하며 us-east-1을 허용 목록에 포함  
C) 각 계정의 IAM 정책에서 리전을 제한  
D) NACL로 타 리전 트래픽을 차단  

**정답: B**  
해설: 리전 잠금 SCP는 글로벌 서비스를 `NotAction`으로 예외하고 `aws:RequestedRegion` 조건으로 비허용 리전을 거부하되, 다수 글로벌 API가 호출되는 us-east-1을 허용 목록에 넣어야 콘솔·ACM·CloudFront가 깨지지 않는다. 예외 없는 전면 Deny는 글로벌 서비스를 함께 죽인다. IAM 정책은 계정마다 분산돼 거버넌스로 부적합하고, NACL은 API 리전 통제와 무관하다.

---

**문제 3.** 보안 팀이 GuardDuty를 조직 전역에서 운영하되 관리 계정의 결제·조직 권한은 받지 않게 하려 한다. 올바른 방법은?

A) 관리 계정에 보안 팀 IAM 사용자를 만든다  
B) Audit 계정을 GuardDuty 위임 관리자로 등록(register-delegated-administrator)하고 보안 팀은 그 계정에서 운영  
C) 각 워크로드 계정에서 GuardDuty를 개별 운영  
D) 루트 사용자를 공유한다  

**정답: B**  
해설: 위임 관리자 모델은 관리 계정의 공격 표면을 줄이고 직무를 분리한다. Audit 계정을 GuardDuty 위임 관리자로 등록하면 보안 팀이 결제·조직 권한 없이 조직 전역 탐지를 운영할 수 있다. 관리 계정에 사용자를 두면 blast radius가 커지고, 계정별 개별 운영은 집계·일관성을 잃으며, 루트 공유는 직무 분리와 정면 충돌한다.

---

**문제 4.** 다음 중 SCP로 통제할 수 *없는* 대상은?

A) 워크로드 계정 관리자의 ec2:RunInstances 권한 상한  
B) 멤버 계정에서 CloudTrail 로깅 중지 시도  
C) 관리 계정에 속한 IAM 사용자의 액션  
D) 멤버 계정의 특정 리전 사용 차단  

**정답: C**  
해설: SCP는 관리 계정(Management Account)의 멤버에게는 적용되지 않는다. 따라서 관리 계정 IAM 사용자의 액션은 SCP로 제한할 수 없고, 이 때문에 관리 계정에 워크로드를 두지 말라는 원칙이 나온다. 나머지는 모두 SCP의 정상 통제 범위로, 권한 상한·보안 서비스 비활성화 방지·리전 차단은 SCP의 전형적 용도다.

---

**문제 5.** AWS SRA가 권장하는 중앙 보안 계정 모델에서 불변 로그 보관을 전담하는 계정과 그 보호 수단의 조합으로 가장 적절한 것은?

A) Audit 계정 — Security Hub로 로그를 보관  
B) Log Archive 계정 — S3 Object Lock, MFA Delete, 전용 KMS 키, 엄격한 버킷 정책으로 불변성 확보  
C) 관리 계정 — 모든 로그를 직접 저장  
D) 각 워크로드 계정 — 로컬에 로그 보관  

**정답: B**  
해설: SRA는 탐지 집계·대응을 담당하는 Audit(Security Tooling) 계정과, 변경 불가 로그를 보관하는 Log Archive 계정을 분리한다. Log Archive는 S3 Object Lock(WORM), MFA Delete, 전용 KMS 키, 최소 권한 버킷 정책으로 로그의 위·변조·삭제를 막는다. Audit 계정은 보관이 아니라 분석·대응 허브이고, 관리 계정은 결제·조직 전용이며, 워크로드 로컬 보관은 탈취 시 함께 삭제될 위험이 있어 부적합하다.

---
