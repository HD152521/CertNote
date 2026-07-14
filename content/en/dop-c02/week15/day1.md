# Day 1 - Multi-Account Enterprise CI/CD: Governance and Platform Engineering Principles for 50+ Accounts

As organizations grow from one account to two, then five, then dozens of AWS accounts, they reach the same inflection point. "If the platform team has to manually cut an account, architect a pipeline, and hand-code security baselines every time a developer creates a new service, the team will spend all its time on someone else's infrastructure setup. How do we enforce standards without making developers wait?" This tension — the tug-of-war between governance (control) and self-service (speed) — is the essence of multi-account enterprise CI/CD. Today, we examine a realistic organization: 50+ microservices, 60+ AWS accounts, 100 developers, 5 platform engineers. We dissect how to resolve that tension through structure — Landing Zone and Account Factory, Tooling account Hub-Spoke, Service Catalog self-service, Permission Boundary and SCP authority boundaries — alongside the distributed systems and organizational theory beneath.

In the DOP exam, this domain appears repeatedly in scenarios like "apply identical baselines to hundreds of accounts automatically", "prevent developer-created IAM Roles from exceeding company policy", "provide standard pipelines to 50 services via self-service". Each answer hinges on understanding whether to touch StackSets·AFT·Service Catalog·Permission Boundary·SCP, and recognizing which anti-patterns carry operational burden despite working.

## Why Partition Accounts — Bulkhead and Blast Radius in Organizational Theory

The starting premise of multi-account strategy is this: **AWS accounts are the strongest isolation boundaries for IAM, billing, service limits, and security.** Within one account, two workloads can be separated by IAM policy — but that separation depends on people writing policies correctly. Split into accounts, and isolation becomes **the default (default-deny by boundary)** — resources in another account are invisible unless an explicit cross-account trust exists.

This is the organizational application of the **bulkhead pattern** from distributed systems. Just as bulkheads limit a breach to one compartment of a ship, prod account breach or service limit exhaustion in one account doesn't spill into others. In security terms: **blast radius reduction**. If IAM credentials in one account leak, their reach is confined to that account alone.

> 💡 **Related theory**: Account boundaries embody the essence of **fault isolation**. The microservices resilience principles Netflix codified in the 2010s — circuit breaker, bulkhead, backpressure — filter down to the infrastructure layer in multi-account structure. From CS perspective, this mirrors **shared-nothing architecture**. Database sharding isolates one shard's failure from others; account sharding isolates one workload's security, limit, or cost blast. The trade-off: isolation demands explicit trust relationships (AssumeRole, Resource Policy) for cross-account communication, observation, and deployment. Most of multi-account CI/CD complexity flows from this "isolate, then safely reconnect" work.

> 🔍 **Deeper**: AWS's multi-account guidance first crystallized in 2018's **Landing Zone** solution, absorbed into the managed service **Control Tower** in 2019. Before that, every organization designed "how many accounts and how to split" from scratch, yielding inconsistent structures. Control Tower's standard — three core accounts (Management for billing/org, Log Archive for centralized logs, Audit for security ops), with workloads grouped by OU — became the de facto industry standard. Exam questions like "What does Log Archive do?" and "Why is Audit the GuardDuty/Security Hub delegated admin?" all presume this standard structure.

## Account Structure — OU Trees Inherit Policies

Dozens of accounts laid flat demand policy per account. Instead, **OU (Organizational Unit) trees** let SCPs inherit — like Unix directory permission inheritance.

```
Root
├─ Security OU
│   ├─ Log Archive Account      ← All CloudTrail/Config logs, central immutable storage
│   ├─ Audit Account            ← Security Hub/GuardDuty delegated admin
│   └─ Forensics Account        ← Incident isolation and investigation only
├─ Infrastructure OU
│   └─ Tooling/CICD Account     ← Pipeline Hub
├─ Workloads OU
│   ├─ Dev OU      → {service}-dev accounts
│   ├─ Staging OU  → {service}-staging accounts
│   ├─ PreProd OU
│   └─ Prod OU     → {service}-prod accounts (regulated workloads isolated)
├─ Sandbox OU                   ← Developer experimentation, strict SCP guardrails
└─ Suspended OU                 ← Accounts pending deletion, full Deny
```

The key is **policy placement**. "Prod forbids region outside ap-northeast-2" — attach once to Prod OU's SCP, and all prod accounts below inherit it. A new prod account entering the OU automatically receives the policy; no per-account oversight misses occur.

> ⚠️ **Gotcha**: SCP **does not grant permissions — it only sets a ceiling.** Write `Allow *` in SCP; if IAM policy doesn't separately allow it, nothing happens. SCP's true role is Deny guardrails — "forbid Root use", "forbid CloudTrail disable", "forbid region outside X". Exam pitfall: "We gave S3 permission via SCP but it doesn't work" — answer: "SCP doesn't grant; IAM policy must grant actual permission." The effective permission is the intersection of SCP (ceiling) and IAM policy (grant). Also: SCP doesn't apply to Management account itself — so keep that account workload-free, touching only billing and org structure.

## Landing Zone and Account Factory — Spawn Accounts from Code

100 developers, 50 services, each needing 5 environments (sandbox·dev·staging·pre-prod·prod) = hundreds of accounts. Impossible to create by hand. **Account Factory** automates account creation itself.

Control Tower's built-in Account Factory is Service Catalog-based; for stronger IaC control, use **AFT (Account Factory for Terraform)**. AFT takes account requests (e.g., ServiceNow ticket → CodeCommit `request.json`), provisions via pipeline, and automatically layers standard baselines — VPC, IAM Role, Config, CloudTrail, GuardDuty, Backup, KMS CMK — on top.

> 💡 **Related theory**: Account Factory lifts **immutable infrastructure** thinking to the account level. Just as servers are replaced, not patched, accounts become "products of a standard template". This is also the **declarative vs imperative** paradigm. Imperative ("create account, create VPC, enable Config") leaves order, failure handling, drift to humans. Declarative ("this account must match this standard") lets tooling reconcile desired vs observed state. Terraform·CloudFormation's core is exactly this reconciliation loop. AFT applies it to account creation: "account standard state" lives in Git, enabling audit, replay, rollback. The result: provisioning becomes **idempotent**.

## Tooling Account Hub-Spoke — Centralize Pipeline, Loan Permissions

50 services each running CodePipeline in their own account scatters pipeline definitions, artifacts, ECR, CodeArtifact, and standardization crumbles. **Enterprise standard: concentrate pipelines in Tooling (CICD) account; real deployments happen cross-account in Spoke workload accounts (Hub-Spoke).**

```
Tooling Account (Hub)
├─ CodePipeline × 50 (per service)
├─ CodeBuild (build/test)
├─ ECR (container images central)
├─ CodeArtifact Domain (packages central)
├─ Artifact S3 + KMS Multi-Region Key
└─ Cross-Account Deploy Roles (trust relationships to Spoke)
        │
        │ sts:AssumeRole
        ▼
Each Spoke (Workload Account)
├─ CrossAccountDeployRole   ← trusts Tooling
├─ CloudFormationExecutionRole ← owns resource creation permissions
└─ Application resources (ECS/Lambda/RDS/...)
```

Permission design here is subtle. The Tooling pipeline assumes Spoke's `CrossAccountDeployRole`, which in turn hands off to `CloudFormationExecutionRole`. This **dual-Role structure is key** — the pipeline doesn't hold powerful deploy permissions directly; it borrows a scoped Spoke Role only when needed.

> 🔍 **Deeper**: Why use **Multi-Region Key** for KMS? It connects to the trap of cross-account artifact sharing. If Tooling's S3 holds KMS-encrypted artifacts, Spoke's CloudFormation reading them requires (1) S3 bucket policy allowing Spoke **and** (2) **KMS key policy allowing Spoke's decryption**. Miss either and "Access Denied" bites. Beginners fix S3 and forget KMS, breaking deployments. The exam gotcha: "KMS error on cross-account deploy" → nearly always "add target account/Role decryption to KMS key policy." Multi-region DR adds another layer: Multi-Region Key lets both regions reference the same key ID, simplifying policy management.

> 📚 **Case study**: **Atlassian** (2017) and multiple fintech firms (2020s) migrating from monolithic single-account to Hub-Spoke multi-account hit a shared lesson: "Give the Tooling pipeline too much power, and if that account breaches, it becomes a super-channel deploying to every workload account." Mature orgs **explicitly restrict Tooling's deployment Role to named Spoke Roles** (only certain Spoke Roles assumable) and mirror Spoke's trust policy with `aws:PrincipalArn` conditions ("only this specific pipeline Role"). Tooling account compromise is a supply-chain attack target — SolarWinds (2020) showed build-pipeline breach's destructiveness — and Tooling Role minimization is the defense line.

## Service Catalog — Self-Service and Standardization At Once

The core tool for resolving governance-vs-speed tension is **Service Catalog**. Platform team publishes vetted pipeline templates (CDK Pipelines, language- and deployment-type variants) in a Portfolio; developers self-serve by selecting a Product to auto-generate their service's pipeline. Developers get speed, platform team keeps "only approved templates run" standard.

| Domain | Self-Service | Governance |
|--------|--------------|------------|
| New account | AFT auto-provision | SCP auto-inherit |
| New pipeline | Service Catalog Product | Template validation/signing |
| Add secret | Secrets Manager | KMS Key Policy standard |
| New IAM Role | Developer free to create | Permission Boundary enforce |
| Console Write access | Just-In-Time elevation | Default read-only |

> 💡 **Related theory**: This table is the implementation of **Platform Engineering** and **Golden Path**. Golden Path: "the path most recommended, best-trodden, where following it brings security, observability, deployment for free." Core insight: "incentive beats mandate." Don't force standards on developers; make the standard path easiest and fastest, and developers voluntarily choose it. This is behavioral economics' **nudge** theory. Service Catalog turns Golden Path into one click; Permission Boundary and SCP guardrail against deviation. "Incentive + guardrail" is self-service governance's essence.

## Permission Boundary — Safety Rail for Authority Delegation

The riskiest self-service part is allowing "developers to create their own IAM Roles". Let them, and a developer self-assigns AdministratorAccess (privilege escalation). **Permission Boundary** blocks this hole.

Permission Boundary sets "the maximum authority this Role/User may hold." Even if IAM policy says `Allow *`, Boundary overrides it — if you cross Boundary, you have no permission. SCP is the ceiling at account/OU level; Boundary is the ceiling at individual principal level.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"aws:RequestedRegion": ["ap-northeast-2"]}
    }
  }]
}
```

The trick: when granting "Role creation permission" to developers, add an IAM policy **Condition**: "new Roles only create-able if they attach **this Boundary**" (`iam:PermissionsBoundary` condition key). Result: every developer-created Role stays within Boundary, so self-service Role creation stays safe.

> ⚠️ **Gotcha**: **SCP, Permission Boundary, IAM policy, Resource policy, Session policy evaluation order and relationship** — miss this and the exam crumbles. Core principle: (1) Explicit Deny wins first, always. (2) Same-account effective permission = **SCP ∩ Permission Boundary ∩ Identity policy** (all three must allow). (3) Cross-account needs Resource policy too. Permission Boundary attached but still no access? Either "Boundary allows but Identity policy doesn't" or vice versa — Boundary **restricts, not grants**, so even if Boundary says `Allow *`, Identity must separately allow the action.

## Security·Compliance Baseline — Deploy Auto to All Accounts via StackSets

Hundreds of accounts get GuardDuty·Config·CloudTrail·Backup one-by-one? Impossible; compliance holes guaranteed. **CloudFormation StackSets** deploy one template to many accounts and regions simultaneously.

**Service-Managed StackSets + Auto-Deployment** is the answer. Target an OU; enable Auto-Deployment; **new accounts entering that OU auto-get baseline deployed** — erasing per-account baseline install misses.

```bash
aws cloudformation create-stack-set \
  --stack-set-name SecurityBaseline \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-body file://baseline.yaml
```

Atop this: GuardDuty·Security Hub·Config each use **delegated admin** (Delegated Administrator) pattern, aggregating to Audit account — StackSets enable each account, Audit sees all Findings central. "Identical security tooling + central aggregation" standard combination.

> 🔍 **Deeper**: StackSets has two permission models. **Self-Managed** requires each target account to have `AWSCloudFormationStackSetExecutionRole` and admin account to have `AWSCloudFormationStackSetAdministrationRole`, with manual trust wiring — use when not on Organizations or deploying to external accounts. **Service-Managed** integrates Organizations; AWS auto-manages Roles, supports OU targeting and Auto-Deployment. Exam trigger: "auto-apply to new accounts in Organizations" → always Service-Managed + Auto-Deployment. Self-Managed for legacy·non-org·granular Role control only.

## Governance Gates — Control Points in the Pipeline

Standard pipelines gate code reaching prod through multiple checks. Each gate blocks a class of risk.

```
PR open
  └─ CodeGuru Reviewer + SAST(Snyk/Inspector)   ← code quality/vuln before merge
PR merged to main
  └─ CodeBuild unit/integration tests
Build artifact
  └─ Inspector container/package scan + Signer signature  ← supply chain integrity
Deploy to dev (auto)
Deploy to staging (auto + smoke test)
Deploy to pre-prod (manual approval)
  └─ SSM Change Calendar check (block freeze windows)
Deploy to prod
  └─ Canary (CodeDeploy/Lambda Alias) + auto-rollback (CloudWatch Alarm)
```

> 🎯 **Scenario**: "Regulated fintech runs 50 microservices. Needs: ①developers create new service pipelines directly but can't deviate from company standard ②all accounts auto-get GuardDuty/Config, including new accounts ③developer-created IAM Roles can't exceed policy ceiling ④prod deploys block during freeze windows." → ① Service Catalog Portfolio + CDK Pipelines template, self-service + validated. ② Service-Managed StackSets (Auto-Deployment Enabled) on Workloads OU + GuardDuty/Security Hub/Config delegated admin on Audit account. ③ Role create permission with `iam:PermissionsBoundary` condition force-attach Boundary. ④ SSM Change Calendar gate on prod stage. Plus: Prod OU SCP for region/Root guardrails, Tooling cross-account deploy Role target only named Spoke Roles.

## Cost Visibility — Tags Are Accounting Units

60 accounts, no visibility on who spends what → cost control fails. **Core chain: tag enforcement → Cost Allocation Tag → Cost Categories.** Config Rule flags non-compliant (missing required tags: `team`, `service`, `env`) resources; Auto-Remediation blocks or alerts. Tags guaranteed, Cost Explorer + Cost Categories sort spend by team/service; Cost Anomaly Detection ML-catches sudden spikes.

## Summary

Today we covered five. First, **splitting accounts into bulkhead/blast radius reduction** is organizational distributed-systems resilience, OU trees inherit SCP policy one-shot. Second, **Landing Zone/AFT spawn accounts from code**, lifting immutable-infra and declarative thinking to account level. Third, **Tooling Hub-Spoke centralizes pipelines, lending permissions cross-account AssumeRole; KMS key policy omission is gotcha #1.** Fourth, **Service Catalog (Golden Path) + Permission Boundary + SCP simultaneously satisfy self-service and governance** — incentive and guardrail. Fifth, **Service-Managed StackSets + Auto-Deployment + delegated admin auto-apply security baseline to all and new accounts** — the answer.

Next: expanding this standard to on-prem datacenters, **hybrid CI/CD** at depth.

---

## 📝 연습 문제

**문제 1.** 조직이 단일 계정에서 수십 개 계정으로 분리하는 가장 근본적인 보안·운영상 이유는?

A) 계정이 많을수록 AWS 할인율이 높아져서

B) AWS 계정이 IAM·결제·서비스 한도·보안의 가장 강력한 격리 경계이므로, 계정 분리가 격벽(bulkhead)·폭발 반경 축소를 기본값으로 만들어 한 워크로드의 침해·한도 고갈이 다른 워크로드로 번지지 않게 하기 때문

C) 계정마다 다른 region을 강제로 쓰게 하려고

D) 단일 계정은 CloudFormation을 쓸 수 없어서

**정답: B**

해설: 한 계정 안의 분리는 사람이 IAM 정책을 정확히 쓴다는 전제에 의존하지만, 계정을 쪼개면 분리가 기본값이 된다 — 다른 계정 리소스는 명시적 cross-account 신뢰 없이는 보이지도 않는다. 이는 분산 시스템의 격벽 패턴과 shared-nothing 사상의 조직 단위 적용으로, 폭발 반경(blast radius)을 한 계정 안으로 한정한다. 할인율(A)·region 강제(C)·CloudFormation(D)은 근거가 없다.

---

**문제 2.** SCP(Service Control Policy)에 대한 설명으로 가장 정확한 것은?

A) SCP는 계정에 직접 권한을 부여한다

B) SCP는 권한을 부여하지 않고 권한의 상한(ceiling)만 정하는 Deny 가드레일이며, 유효 권한은 SCP ∩ Permission Boundary ∩ Identity 정책의 교집합이고, Management 계정에는 적용되지 않는다

C) SCP는 IAM 정책을 대체한다

D) SCP는 Management 계정에 가장 먼저 적용된다

**정답: B**

해설: SCP는 권한을 주지 못하고 상한만 정한다 — `Allow *`를 써도 IAM 정책이 별도로 허용하지 않으면 아무 권한도 생기지 않는다. 진짜 역할은 Root 사용 금지·CloudTrail 비활성화 금지 같은 Deny 가드레일이다. 같은 계정 내 유효 권한은 SCP·Permission Boundary·Identity 정책 셋 모두가 Allow해야 하는 교집합이며, Management 계정에는 SCP가 적용되지 않으므로 그 계정은 결제·조직 구조만 다뤄야 한다. 권한 직접 부여(A)·IAM 대체(C)·Management 우선 적용(D)은 모두 틀리다.

---

**문제 3.** 100명 개발자가 수백 개 계정을 필요로 하는 환경에서, 신규 계정을 표준 베이스라인(VPC/Config/CloudTrail/GuardDuty)과 함께 자동 프로비저닝하려면?

A) 플랫폼 팀이 콘솔에서 계정마다 수동 생성

B) Landing Zone/Control Tower + Account Factory(AFT)로 요청을 받아 파이프라인이 계정을 선언적으로 프로비저닝하고 표준 베이스라인을 자동 부착

C) 각 개발자가 자기 신용카드로 계정 가입

D) Lambda로 매일 계정을 무작위 생성

**정답: B**

해설: Account Factory(특히 AFT)는 계정 생성 요청을 받아 파이프라인으로 계정을 프로비저닝하고 그 위에 표준 베이스라인을 자동으로 심는다. 이는 불변 인프라·선언적 패러다임을 계정 수준으로 끌어올린 것으로, "계정의 표준 상태"가 Git에 코드로 남아 감사·재현·롤백이 가능하다. 수동 생성(A)은 누락·확장 불가, 개발자 개별 가입(C)·무작위 생성(D)은 거버넌스 붕괴다.

---

**문제 4.** Tooling 계정 Hub-Spoke 구조에서 cross-account 파이프라인 배포가 "Access Denied (KMS)" 오류로 실패한다. 가장 흔한 원인과 해결은?

A) S3 버킷 정책만 수정하면 된다

B) 아티팩트가 KMS로 암호화돼 있는데 배포 대상(Spoke) 계정/Role의 복호화 권한이 KMS 키 정책에 없어서다 — S3 버킷 정책과 KMS 키 정책 둘 다 Spoke를 허용해야 한다

C) 파이프라인을 재시작하면 해결된다

D) ECR을 비활성화하면 된다

**정답: B**

해설: Tooling 계정의 암호화된 S3 아티팩트를 Spoke의 CloudFormation이 읽으려면 S3 버킷 정책과 KMS 키 정책 둘 다 Spoke의 접근/복호화를 허용해야 한다. 초심자는 S3만 고치고 KMS를 잊어 배포가 깨진다. 멀티 리전 DR까지 고려하면 Multi-Region Key로 같은 키 ID를 양쪽 region에서 참조하게 해 정책을 단순화한다. S3만 수정(A)·재시작(C)·ECR 비활성화(D)는 근본 원인을 못 짚는다.

---

**문제 5.** 개발자에게 IAM Role 생성을 셀프서비스로 위임하되, 만든 Role이 회사 정책 상한(예: 특정 region만)을 넘지 못하게 안전하게 강제하려면?

A) 개발자에게 AdministratorAccess를 준다

B) Permission Boundary 정책을 정의하고, Role 생성 권한에 `iam:PermissionsBoundary` 조건으로 새 Role에 반드시 그 Boundary를 부착해야만 생성 가능하도록 강제한다

C) 모든 Role 생성을 금지한다

D) SCP만으로 개별 Role을 제어한다

**정답: B**

해설: Permission Boundary는 주체(principal) 수준의 권한 상한이다. Role 생성 권한을 줄 때 `iam:PermissionsBoundary` 조건으로 새 Role에 Boundary 부착을 강제하면, 개발자가 만드는 모든 Role이 Boundary를 넘을 수 없어 권한 상승이 차단된다 — 셀프서비스 위임을 안전하게 만든다. Admin 부여(A)는 권한 상승 구멍, 전면 금지(C)는 셀프서비스 포기, SCP(D)는 계정·OU 상한이지 개별 Role 생성 시점의 강제 메커니즘이 아니다.

---

**문제 6.** Organizations 환경에서 GuardDuty·Config 베이스라인을 모든 계정에 배포하고, 앞으로 OU에 새로 들어올 계정에도 자동 적용되게 하려면?

A) Self-Managed StackSets로 각 계정에 Role을 수동 생성

B) Service-Managed StackSets + Auto-Deployment(Enabled)를 OU 타깃으로 배포하면 신규 계정에도 자동 적용되며, GuardDuty/Security Hub/Config는 위임 관리자(Audit 계정)로 집계

C) Lambda 스크립트로 매일 신규 계정을 스캔

D) 각 계정 관리자가 콘솔에서 수동으로 켠다

**정답: B**

해설: Service-Managed StackSets는 Organizations와 통합해 실행 Role을 AWS가 관리하고 OU 타깃팅과 Auto-Deployment를 지원한다 — OU에 새 계정이 들어오면 자동으로 베이스라인이 배포된다. "신규 계정에도 자동 적용"은 항상 Service-Managed + Auto-Deployment다. Self-Managed(A)는 Role 수동 셋업 필요, 스크립트(C)·수동(D)은 누락 위험의 안티패턴이다.

---

**문제 7.** Platform Engineering의 "Golden Path" 개념과 Service Catalog의 관계로 가장 정확한 것은?

A) Golden Path는 개발자에게 표준을 강제로 막는 차단 장치다

B) Golden Path는 "가장 쉽고 빠른 권장 경로"로, 따라가면 보안·관찰성·배포가 공짜로 따라오게 만들어 개발자가 자발적으로 표준을 택하게 하는 넛지(nudge)이며, Service Catalog가 그 경로를 클릭 한 번으로 제공하고 Permission Boundary·SCP가 이탈에 가드레일을 친다

C) Golden Path는 비용 최적화 전용 기능이다

D) Golden Path는 Service Catalog 없이는 존재할 수 없다

**정답: B**

해설: Golden Path의 핵심 통찰은 "강제보다 유인이 강하다"이다 — 표준 경로가 가장 쉽고 빠르면 개발자가 자발적으로 그 길을 택한다(행동경제학의 넛지). Service Catalog는 검증된 파이프라인 템플릿을 셀프서비스로 제공해 Golden Path를 구현하고, Permission Boundary·SCP는 경로를 벗어나려는 시도에 가드레일을 친다. "유인 + 가드레일"이 셀프서비스 거버넌스의 정수다. 강제 차단(A)·비용 전용(C)·Service Catalog 종속(D)은 개념을 좁게 오해한 것이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 계정 분리는 격벽·폭발 반경 축소라는 분산 시스템 회복성 원칙의 조직 적용이며, OU 트리로 SCP(권한 상한·Deny 가드레일)를 상속시킨다. 둘째, Landing Zone/Account Factory(AFT)가 계정을 코드로 찍어내 선언적·불변 인프라 사상을 계정 수준으로 끌어올리고 표준 베이스라인을 자동 부착한다. 셋째, Tooling 계정 Hub-Spoke가 파이프라인을 중앙화하고 cross-account AssumeRole로 권한만 빌려주며, KMS 키 정책 누락(SolarWinds류 공급망 위험과 함께)이 핵심 함정이다. 넷째, Service Catalog(Golden Path)·Permission Boundary(`iam:PermissionsBoundary` 강제)·SCP가 셀프서비스와 거버넌스를 동시에 만족시킨다. 다섯째, Service-Managed StackSets + Auto-Deployment + 위임 관리자가 "모든 계정 + 신규 계정"에 보안 베이스라인을 자동 적용하는 정답이다.
