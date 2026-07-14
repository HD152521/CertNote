# Day 2 - Control Tower and Landing Zone: Guardrails (Preventive/Detective), Account Factory, Compliance Baseline

If you assemble Organizations and SCP by hand, you must code all of the following: OU design, log accounts, Organization CloudTrail, Config aggregation, SCP sets, and new account bootstrapping. **AWS Control Tower** automates all of this as a *best-practices-based landing zone (Landing Zone)*, serving as a governance orchestrator. In the security exam, Control Tower appears as the answer to "How do we consistently establish and maintain a secure baseline across multiple accounts?" The core concepts are **Guardrails (Controls)**, **Account Factory**, and **Drift Detection**.

## Landing Zone: Pre-Configured Multi-Account Foundation

When you enable Control Tower, the following are automatically configured:

```
Management Account (Control Tower Orchestration)
├── OU: Security
│   ├── Account: Audit       (Security Hub/GuardDuty aggregation, cross-account audit role)
│   └── Account: Log Archive (immutable organization CloudTrail/Config log retention)
└── OU: Sandbox (or Workloads)
    └── Registered/newly created accounts
```

- **Organization CloudTrail**: Automatically applied to all accounts; logs aggregate to Log Archive account's S3.
- **AWS Config**: Activated in all enrolled accounts and regions; snapshots go to Log Archive.
- **Central Aggregation**: Audit account has cross-account audit role (AWSControlTowerExecution, etc.).
- **IAM Identity Center (formerly SSO)**: Centralizes multi-account login with users and permission sets.

Landing zones have *versions*. When AWS updates the baseline, landing zone updates reapply the new baseline to all accounts.

> 💡 **Related Theory**: This is *Policy as a Managed Baseline*, implementing the *secure-by-default* principle of security engineering at organizational scale. When new accounts are born in a "secure state by default," we structurally eliminate human error from people forgetting to apply security settings each time. It automatically enforces CIS Controls' "Secure Configuration."

## Guardrails (Controls): Preventive / Detective / Proactive

Control Tower's governance is expressed through **Controls** (formerly called Guardrails). There are three types.

**1) Preventive Controls** — Implemented via SCP. *Block violations at the source*. Result is immediate denial.

```json
{
  "Sid": "GRDISALLOWS3UNENCRYPTED",
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": ["AES256", "aws:kms"]
    },
    "Null": { "s3:x-amz-server-side-encryption": "false" }
  }
}
```

**2) Detective Controls** — Implemented via AWS Config rules. *Continuously evaluate* already-created resources for policy violations and mark them as non-compliant. Does not block, but *alerts*.

```yaml
# Config rule example: EBS volume encryption detection
ConfigRule:
  Source: AWS
  Identifier: ENCRYPTED_VOLUMES
  Scope: AWS::EC2::Volume
  # Non-compliant shown in Audit account dashboard/Security Hub
```

**3) Proactive Controls** — Implemented via CloudFormation Hooks. Check policy *before resource provisioning* at the IaC phase, preventing non-compliant resources from even being deployed (a "deployment gate" between prevention and detection).

Controls are classified by **governance level**:
- **Mandatory**: Always applied by Control Tower; cannot be disabled (e.g., CloudTrail log integrity, Config disable prevention).
- **Strongly recommended**: AWS best practices; recommended to enable.
- **Elective**: Optional based on organizational needs.

## Controls Apply to OUs, Not Individual Accounts

Core operational principle: **Controls are activated at the OU level, not the individual account level.** Group accounts with the same security requirements into an OU, and apply the control set to that OU. New accounts entering the OU automatically inherit the same baseline.

```
OU: Prod ── Preventive (region lock, root block) + Detective (encryption, public access, MFA)
OU: NonProd ── Relaxed set (sandbox regions allowed)
```

## Account Factory: Standardized Account Provisioning

Creating a new account manually in the console misses the baseline. **Account Factory** issues accounts using a predefined *blueprint*: proper OU placement, IAM Identity Center users/permission sets, network baseline (VPC), and all OU-attached controls are automatically inherited.

```
Request (name/email/OU/network)
   → Account Factory (Service Catalog product)
   → New account + OU placement + control inheritance + SSO permissions + CloudTrail/Config enrollment
```

At scale, use **Account Factory for Terraform (AFT)** or Customizations for Control Tower (CfCT) to codify and pipeline account provisioning. Best practice is to automatically apply custom baselines (install security tools, enforce tags, additional SCPs) immediately after provisioning.

> 💡 **Related Theory**: Account Factory is the *Golden Path / Paved Road* pattern. In platform engineering, offering a "standardized secure path" reduces developer incentive to deviate and create risky configurations directly. It transforms security from "a barrier blocking you" to "a safe path built in by default."

## Drift Detection

Landing zones have a *declared state*. If someone manually moves an OU, modifies an SCP, or pulls an account out of an OU in the console, actual state diverges from declaration — this is **drift**. Control Tower detects drift, displays it on the dashboard, and remedies it (repair/re-register) to restore the declared state.

Common drift causes:
- Manual edit or deletion of SCP outside Control Tower
- Manual movement of accounts within managed OUs
- Manual deletion of roles and policies provided by mandatory controls

If drift exists, new control application or account provisioning may be blocked, so the critical exam message is: **Control Tower-managed resources should not be touched directly in the console**.

## Compliance Baseline Mapping

Control Tower controls map to CIS AWS Foundations Benchmark, AWS Well-Architected Security Pillar, PCI-DSS, and other standards. Examples:

- **CIS 1.x (IAM)**: Root MFA, root access key prohibition, MFA enforcement → Detective control + Preventive SCP.
- **CIS 2.x (Logging)**: CloudTrail all-region enable, log integrity, KMS encryption → Mandatory control.
- **CIS 3.x (Monitoring)**: Unauthorized API, console login failure alerts → CloudWatch/Config.
- **CIS 4.x (Networking)**: No 0.0.0.0/0 inbound SSH/RDP → Detective control.

Control Tower alone does not collect and report all evidence; formal audit reporting is the job of **Audit Manager** (covered tomorrow).

## Control Tower vs Manual Organizations

| Item | Manual Organizations | Control Tower |
|---|---|---|
| OU and log account design | Manual | Automatic (recommended structure) |
| Organization CloudTrail/Config | Manual setup | Automatic |
| Guardrails | Manual SCP/Config writing | Curated control library |
| New account bootstrap | Direct scripts | Account Factory |
| Drift management | Manual monitoring | Built-in drift detection |

Control Tower excels at rapidly establishing general best practices, but very specialized organization structures or region constraints may benefit from manual Organizations + IaC. Exams usually guide to "establish standard multi-account baseline quickly and consistently" → Control Tower.

## Trap Summary

- Controls apply to *OUs*, not *individual accounts*, so new accounts automatically inherit the baseline.
- Preventive=SCP (block), Detective=Config (evaluate/alert), Proactive=CFN Hooks (block before deploy). Don't confuse.
- Manual changes to Control Tower-managed resources cause *drift* → Re-apply needed.
- Mandatory controls cannot be disabled — do not attempt to bypass.
- Control Tower establishes baselines, but formal *compliance evidence collection* is Audit Manager's job.

## 📝 연습 문제

**문제 1.** 새로 등록된 워크로드 계정에 회사 보안 베이스라인이 자동 적용되도록 하려 한다. Control Tower에서 가장 적절한 방법은?

A) 각 신규 계정에 컨트롤을 개별 활성화한다  
B) 같은 요구를 가진 계정을 OU로 묶고 그 OU에 컨트롤 세트를 적용해, 계정이 OU에 들어오면 자동 상속되게 한다  
C) 신규 계정마다 SCP를 손으로 붙인다  
D) 관리 계정에만 컨트롤을 적용한다  

**정답: B**  
해설: Control Tower 컨트롤은 OU 단위로 활성화하는 것이 핵심 원칙이다. OU에 컨트롤을 걸면 그 OU에 배치되는 모든 계정(신규 포함)이 베이스라인을 자동 상속하므로 누락이 없다. 계정별 개별 활성화·수동 SCP는 확장성과 일관성이 떨어지고, 관리 계정에만 적용하면 워크로드 계정이 보호되지 않는다.

---

**문제 2.** "S3 객체를 암호화 없이 업로드하는 행위 자체를 차단"하려 한다. 어떤 유형의 컨트롤이며 어떻게 구현되는가?

A) 탐지적 컨트롤 — Config 규칙  
B) 예방적 컨트롤 — SCP로 비암호화 PutObject를 Deny  
C) 능동적 컨트롤 — CloudWatch 경보  
D) 필수 컨트롤 — GuardDuty  

**정답: B**  
해설: "행위 자체를 막는다"는 것은 예방적 컨트롤이며 SCP로 구현된다. 비암호화 헤더 조건의 PutObject를 Deny하면 시도 단계에서 차단된다. 탐지적 컨트롤(Config)은 이미 생성된 리소스를 평가·표시할 뿐 차단하지 않고, CloudWatch 경보는 알림이며, GuardDuty는 위협 탐지 서비스로 이 용도가 아니다.

---

**문제 3.** 운영자가 콘솔에서 Control Tower가 관리하는 OU 밖으로 계정을 옮겼다. 이후 새 컨트롤 적용이 실패한다. 원인과 올바른 대응은?

A) 정상 동작이며 무시한다  
B) 드리프트가 발생한 것 — 랜딩 존/계정을 재적용(re-register/repair)해 선언 상태로 되돌리고, 관리 리소스를 콘솔에서 직접 변경하지 않는다  
C) 컨트롤을 모두 비활성화한다  
D) 관리 계정을 재생성한다  

**정답: B**  
해설: Control Tower가 관리하는 리소스를 콘솔에서 직접 변경하면 선언 상태와 실제 상태가 어긋나는 드리프트가 발생하고, 이는 새 컨트롤 적용·계정 발급을 막을 수 있다. 올바른 대응은 재적용으로 선언 상태를 복구하고, 이후 관리 리소스를 수동으로 손대지 않는 운영 규율을 지키는 것이다. 무시·전체 비활성화·관리 계정 재생성은 모두 부적절하다.

---

**문제 4.** 50개 계정을 코드 기반 파이프라인으로 일관되게 발급하면서 발급 직후 커스텀 보안 베이스라인까지 자동 적용하려 한다. 가장 적절한 접근은?

A) 콘솔에서 계정을 하나씩 생성  
B) Account Factory for Terraform(AFT) 또는 Customizations for Control Tower로 계정 발급을 코드화하고 발급 후 커스터마이징을 파이프라인으로 자동 적용  
C) 루트 사용자로 각 계정에 로그인해 설정  
D) 단일 계정에 모든 워크로드를 통합  

**정답: B**  
해설: 대규모 표준화 발급은 AFT나 CfCT로 계정 팩토리를 코드화하고, 발급 직후 보안 도구 설치·태그·추가 SCP 같은 커스텀 베이스라인을 파이프라인으로 자동 적용하는 것이 모범(Paved Road)이다. 콘솔 수작업과 루트 로그인은 누락·위험이 크고, 단일 계정 통합은 blast radius와 격리 원칙에 어긋난다.

---

**문제 5.** 다음 중 Control Tower의 "필수(Mandatory) 컨트롤"에 대한 설명으로 옳은 것은?

A) 운영자가 언제든 끌 수 있는 선택 항목이다  
B) Control Tower가 항상 적용하며 해제할 수 없고, 로그 무결성·Config 비활성화 금지 등 베이스라인 보호의 핵심이다  
C) PCI 인증을 자동으로 발급해 준다  
D) 워크로드 계정에만 적용되고 보안 계정에는 적용되지 않는다  

**정답: B**  
해설: 필수 컨트롤은 Control Tower가 항상 적용하고 해제할 수 없는 베이스라인 보호로, CloudTrail 로그 무결성·Config 레코더 비활성화 금지 등이 포함된다. 끌 수 있는 것은 선택(Elective)·강력 권장(Strongly recommended) 컨트롤이다. 컨트롤은 인증 발급 도구가 아니며(증거 수집은 Audit Manager), 보안 계정에도 베이스라인이 적용된다.

---
