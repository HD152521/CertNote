# Day 2 - StackSets: The Deep Story of Deploying IaC to Thousands of Accounts

The moment an enterprise adopts AWS Organizations, the operational time awareness of engineers changes. Until yesterday, "deploying a CloudFormation Stack to one account takes 5 minutes," but today becomes "I need to deploy the same security baseline to 200 member accounts, which takes 1700 minutes (28 hours) via console." Within those 28 hours, someone mispells an IAM Role name in one account, someone else deploys to ap-northeast-1 instead of ap-northeast-2, and someone forgets the last 50 accounts. **Drift begins the moment people start repeating the same work.** StackSets was built precisely to reduce those 28 hours to a single command.

Today we examine why StackSets' two permission models both exist, how the Organizations Trusted Access's internal trust chain works, how you decide Operation Preferences' concurrency and failure tolerance numbers, and real-world pitfalls met operating 1000+ accounts. In exams, the boundary between StackSets and Control Tower / Account Factory / Config Conformance Pack frequently blurs, so we clarify those boundaries. DOP produces 3-5 StackSets scenario questions per test, and "deploy to OU automatically," "multi-account fan-out," "on-premise integration" are almost standard.

## The Problem StackSets Solves — The Difficulty of Fan-out

In distributed systems, fan-out means "propagating one source command to N targets simultaneously." Message queue pub/sub, Kubernetes DaemonSet, Ansible multi-host playbook all follow this pattern. StackSets is the same fan-out, but the difference is (1) targets are **AWS Accounts** (security boundaries), (2) you must pre-establish IAM trust relationships to each target, (3) policy is needed for how to handle partial failures. These three create all the complexity of StackSets.

```
StackSet (defined in Administration account)
   │ Template + Parameters + Operation Preferences
   ▼
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Stack       │ Stack       │ Stack       │ Stack       │
│ Instance    │ Instance    │ Instance    │ Instance    │
│ (account A, │ (account A, │ (account B, │ (account B, │
│  ap-ne-2)   │  us-east-1) │  ap-ne-2)   │  us-east-1) │
└─────────────┴─────────────┴─────────────┴─────────────┘
   Each Stack Instance is an ordinary CloudFormation Stack in the member account
   StackSet is the upper metadata syncing their definitions
```

It's important that Stack Instance is just an ordinary Stack. Within the member account it looks like a normal CloudFormation Stack and can be handled identically in console. **But if the member account's operator arbitrarily modifies the Stack, drift immediately occurs, and the next StackSet update overwrites that change**. StackSet is a sync tool enforcing single source of truth, not a collaboration tool.

> 💡 **Related Theory**: The combination of fan-out and single source of truth is the core principle of GitOps. Flux and ArgoCD use Git as the source of truth, reconciling manifests to N Kubernetes clusters in exactly the same model as StackSets. The difference is GitOps uses a pull model (agents pull) while StackSets uses a push model (central pushes). Push model is strong on immediacy but weak on central failure, pull model is strong on distributed resilience but has propagation delay.

## Two Permission Models — The Chicken-and-Egg Problem of Self-managed

StackSets has Self-managed and Service-managed two permission models, where the difference is **who creates IAM Roles**. Initially both look like just "permission model differences," but in real operations, Self-managed creates a chicken-and-egg problem.

| Model | IAM Role Creator | Target Specification | Auto-apply to New Accounts |
|-------|---|---|---|
| **Self-managed** | Operator creates in each account | Account ID list | Cannot (manual) |
| **Service-managed** | AWS auto (Organizations integrated) | OU ID or account filter | Possible (Auto-deployment) |

The chicken-and-egg of Self-managed: "Using StackSets to deploy IAM Roles to multiple accounts" is a first use case, but **you must pre-create IAM Roles in each account for that deployment**. Creating IAM Roles manually in 200 accounts defeats the purpose of using StackSets. So in reality, **Self-managed only makes sense in non-Organizations environments** (e.g., company policy forbids Organizations, multiple AWS accounts from acquisition).

Service-managed resolves this contradiction through AWS Organizations' trust chain. When Organizations Management Account grants "StackSets Trusted Access," AWS automatically provisions `AWSCloudFormationStackSetExecutionRole` in all member accounts. Operators don't directly touch IAM trust relationships.

```bash
# Once: Enable StackSets Trusted Access in Organizations
aws organizations enable-aws-service-access \
  --service-principal stacksets.cloudformation.amazonaws.com

# After that, all Service-managed StackSets auto-create IAM in member accounts
```

> 🔍 **Deeper**: Service-managed auto IAM Roles are made via **Service-Linked Role (SLR)** mechanism, not `AWSReservedSSO_*` pattern. SLRs can't be deleted by users (service checks dependencies), permission changes are restricted too. It's a security advantage and a constraint simultaneously — attempts to arbitrarily modify auto-created roles are blocked, and to use custom roles you must switch to Self-managed. The trust origin starts at Organizations trust relationship (`organizations.amazonaws.com`), so assuming this role outside Org is impossible.

> ⚠️ **Pitfall**: In Self-managed, the Administration Role's trust policy has "Administration account ID" hardcoded, and Execution Role's trust policy has "only trust Administration account" hardcoded. The moment a company moves the Administration account itself via M&A, you must bulk-update all member accounts' Execution Role trusts — the biggest operational burden of Self-managed. Service-managed abstracts the trust chain via Organizations, so this problem doesn't exist.

## Delegated Administrator — Why We Lock the Management Account

AWS Organizations' Management Account has absolute power over all member accounts. If this account is compromised, the entire Org is at risk, so **minimizing Management Account usage is the top priority of AWS Well-Architected Framework Security Pillar**. In practice, people don't log into this account, all daily operations are delegated to separate accounts (Tooling Account, Security Account).

```bash
# Run once in Management Account
aws organizations register-delegated-administrator \
  --account-id 222222222222 \
  --service-principal stacksets.cloudformation.amazonaws.com

# Now account 222222222222 can do Service-managed StackSets work
# Management Account no longer participates in daily StackSets operations
```

This pattern applies identically to nearly all Org-aware services like GuardDuty (Security Account), Config (Audit Account), Security Hub, IAM Access Analyzer. Ultimately operational responsibility scatters to domain-specific accounts and Management Account remains only as an "emergency key."

> 📚 **Case Study**: In 2019 a global company lost Management Account root credential keys. Fortunately there was no compromise, but root recovery stopped all StackSets operations for 2 weeks. After that, company standard became "Management Account only for SCP changes and new OU creation, everything else via Delegated Admin." AWS Control Tower enforces this pattern by default — Audit/Log Archive accounts become Delegated Admins.

## Operation Preferences — The Math of Concurrency and Failure Tolerance

`MaxConcurrentCount` and `FailureToleranceCount` are the heart of StackSets operations. They look simple but contain deep operational failure-handling policy.

```bash
aws cloudformation create-stack-instances \
  --stack-set-name BaselineGuardrails \
  --deployment-targets '{"OrganizationalUnitIds":["ou-workloads-abc"]}' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType":"PARALLEL",
    "MaxConcurrentCount":20,
    "MaxConcurrentPercentage":10,
    "FailureToleranceCount":5,
    "FailureTolerancePercentage":2
  }'
```

- **MaxConcurrentCount**: How many Stack Instances to process simultaneously. Among 200 accounts × 3 regions = 600 Instances, handle 20 at a time.
- **MaxConcurrentPercentage**: Specify as ratio (%). Takes precedence over Count if used.
- **FailureToleranceCount**: Cumulative failure tolerance. When this number is reached, stop entire operation.
- **FailureTolerancePercentage**: Tolerance as ratio. 2% of 600 Instances = 12 failures allowed.
- **RegionConcurrencyType**: PARALLEL (all regions simultaneously) vs SEQUENTIAL (region by region).
- **RegionOrder**: When SEQUENTIAL, specify region order explicitly.

How to set these numbers? **Too high bursts CloudFormation API rate limits and Lambda concurrency,** **too low turns 1000-account deployment into days**. Practical guidelines:

| Environment Scale | MaxConcurrentCount | FailureTolerance | Region Strategy |
|---|---|---|---|
| Small (10-50 accounts) | 5-10 | 1-2 | PARALLEL |
| Medium (50-200 accounts) | 20-30 | 5 (1%) | PARALLEL |
| Large (200-1000 accounts) | 50-100 | 1-2% | prod region SEQUENTIAL first, rest PARALLEL |
| Very large (1000+ accounts) | 100+ | 1% | First canary region SEQUENTIAL, rest PARALLEL after validation |

> 🎯 **Scenario**: "Deploy security baseline to 500 accounts: fail immediately on first 5, then tolerate 1% failure." — Answer is two-stage deployment: Stage 1 canary 5 accounts with FailureToleranceCount=0 (immediate stop at even one failure), Stage 2 remaining 495 with FailureTolerancePercentage=1. CFN StackSets has no built-in canary stage, so you call create-stack-instances twice to construct it yourself.

> 🔍 **Deeper**: When failure reaches FailureToleranceCount, **Stack Instances already in progress continue to completion**. That is, even if the 5th failure occurs in "20 concurrent + 5 tolerance," the running 15 don't stop. Only new Instances stop starting. So actual final failures can exceed FailureToleranceCount. Operators must track operation status via SNS alerts and if needed call stop-stack-set-operation to force-stop.

## AccountFilterType — Four Set Operations

Service-managed mode specifies OU and Accounts together, performing set arithmetic.

```bash
--deployment-targets '{
  "OrganizationalUnitIds": ["ou-prod-1234"],
  "AccountFilterType": "DIFFERENCE",
  "Accounts": ["111111111111", "222222222222"]
}'
```

| Filter | Meaning | Use Case |
|--------|---------|----------|
| **NONE** (default) | All accounts in OU | Typical OU-wide deployment |
| **INTERSECTION** | OU ∩ Accounts | Specific accounts within OU |
| **DIFFERENCE** | OU - Accounts | Exclude some accounts from OU |
| **UNION** | OU ∪ Accounts | OU + additional accounts |

DIFFERENCE is particularly useful for "deploy to entire OU except 2 accounts in mid-migration." UNION is useful for "gradually migrate by including one legacy account outside OU temporarily." INTERSECTION is useful for "canary 5 specific accounts within prod OU."

> ⚠️ **Pitfall**: The Accounts list in AccountFilterType is evaluated exactly as specified regardless of OU membership. That is, specifying OU-external accounts in UNION actually deploys to those accounts. This OU-external deployment falls outside audit flow in operational standards, so better to restructure the OU itself. UNION should be "temporary"; if it becomes permanent, governance leaks.

## Auto-deployment and RetainStacksOnAccountRemoval

Service-managed's most powerful feature is Auto-deployment. The instant a new member account joins an OU, all Stack Instances defined in the StackSet are auto-created. When combined with Account Factory (Service Catalog or Control Tower), **new account provisioning → automatic baseline application → automatic security guardrail activation** proceeds entirely without human hands.

```bash
aws cloudformation create-stack-set \
  --stack-set-name BaselineGuardrails \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-url ...
```

The meaning of `RetainStacksOnAccountRemoval` is important. When a member account leaves an OU or is removed from Org, what happens to that account's Stack Instances?

- `false`: Account leaves OU → Stack auto-deleted — most common, removes stale permissions
- `true`: Account leaves OU → Stack retained — M&A account separation, leftover workload handling

The default is `false`, which is safer from security, but **Stack-included RDS/S3 data disappears with Stack deletion risk**. So stateful resource StackSets should use (1) per-resource `DeletionPolicy: Retain` setting, or (2) RetainStacksOnAccountRemoval=true.

> 📚 **Case Study**: In 2021 a fintech removed 5 subsidiary AWS accounts from Org due to subsidiary sale, and StackSets-deployed baseline Stacks auto-deleted, erasing the CloudTrail Trails inside them. Result was loss of 90 days of audit logs before the sale. After that, company standard became "Stacks containing audit/logging resources use RetainStacksOnAccountRemoval=true + resource DeletionPolicy=Retain."

## StackSets and Control Tower / Conformance Pack Boundary

This area frequently confuses on tests. All three "apply governance to multiple accounts."

| Tool | What Deploys | Auto-apply to New Accounts | Auto-fix |
|------|---|---|---|
| **CloudFormation StackSets** | Any CFN template | Auto-deployment | ❌ (Drift detection only) |
| **AWS Control Tower** | Predefined Landing Zone + Guardrails | Account Factory auto | Partial (Proactive guardrails) |
| **Config Conformance Pack** | Config Rules bundle | Org Conformance Pack | ✅ (Remediation Action) |
| **Service Catalog** | Product catalog exposed to users | Users launch | ❌ |

Selection criteria:
- Deploy arbitrary resources (IAM, VPC, alarms) → **StackSets**
- Standard multi-account environment + guardrails together → **Control Tower** (uses StackSets internally)
- Evaluation/monitoring/auto-fix rules → **Config Conformance Pack**
- Standard products for user self-service → **Service Catalog**

Control Tower internally uses StackSets, resulting in `AWSControlTower*` prefixed Stacks in member accounts. Directly modifying Stacks managed by Control Tower is immediately caught as drift and overwritten on next Landing Zone update.

> 💡 **Related Theory**: StackSets(generic) → Control Tower(landing zone specialized) → AWS Organizations(governance) hierarchy is the canonical 3-layer cloud governance structure. NIST SP 800-204C and CIS AWS Foundations Benchmark recommend multi-account strategy, and this is its concrete form. Typical company flow: quickly establish landing zone with Control Tower, then reinforce with domain-specialized resources via StackSets, separate evaluation/audit with Config Conformance Pack.

## Drift Detection at Scale — Handling 1000+ Instances

`detect-stack-set-drift` triggers drift detection against all Stack Instances simultaneously. With 1000 Instances, the task itself takes 30 minutes to hours, and results must be queried per Instance separately.

```bash
# Trigger
aws cloudformation detect-stack-set-drift \
  --stack-set-name BaselineGuardrails \
  --operation-preferences MaxConcurrentCount=10

# Track operation status
aws cloudformation describe-stack-set-operation \
  --stack-set-name BaselineGuardrails \
  --operation-id ...

# Results (per Instance)
aws cloudformation list-stack-instances \
  --stack-set-name BaselineGuardrails \
  --filters Name=DRIFT_STATUS,Values=DRIFTED
```

At scale, run this automatically on EventBridge schedule daily and send results to Security Hub or Slack. **Drift detects but doesn't auto-fix, so operators must judge whether unintended changes are intentional patches or mistakes**. Auto-fix needs Config Rules + SSM Automation Document combination.

> 🎯 **Scenario**: "Baseline Stack in 500 accounts — GuardDuty is off in one account. Detect automatically and alert." — Answer is (1) run StackSets Drift Detection daily via EventBridge → send DRIFTED list to SNS (detection side), (2) deploy Config Rule `guardduty-enabled-centralized` to Conformance Pack for all accounts → aggregate to Security Hub (real-time side), (3) for auto-fix register SSM Automation Document as Config Remediation to re-enable GuardDuty (fix side). Three-tool role separation.

## Summary

Today's picture has five parts. First, **StackSets = fan-out + single source of truth** and is a GitOps push model variant. Second, **Self-managed's chicken-and-egg problem** means Service-managed + Organizations is standard in reality. Third, **Delegated Administrator blocks Management Account from daily use** — AWS Well-Architected's top security recommendation. Fourth, **Operation Preferences concurrency/failure tolerance tunes by scale**, and canary stage requires operators calling twice. Fifth, **StackSets and Control Tower / Config Conformance Pack boundary** — tests frequently blur this, so arbitrary resources/landing zone/evaluation rules distinction is key.

Next we'll see Custom Resource and Module/Hook expanding CloudFormation's expressiveness. If SAM added abstraction via Transform Macro, Custom Resource is a more general mechanism to embed arbitrary Lambda into CFN's lifecycle.

---

## 📝 연습 문제

**문제 1.** 새 멤버 계정이 OU에 추가될 때 자동으로 보안 베이스라인이 적용되고, 운영자가 매번 손대지 않게 하려면 가장 적절한 구성은?

A) Self-managed StackSets + 수동 create-stack-instances
B) Service-managed StackSets + AutoDeployment Enabled + Organizations Trusted Access
C) Lambda를 EventBridge로 호출
D) 각 계정에 IAM Role을 사전 생성한 후 stage별 호출

**정답: B**

해설: Service-managed는 Org Trusted Access를 통해 AWS가 자동으로 멤버 계정에 Execution Role(Service-Linked Role)을 프로비저닝한다. AutoDeployment Enabled가 켜지면 OU에 신규 계정이 가입하는 순간 모든 Stack Instance가 자동 생성. Self-managed(A,D)는 사전 IAM 필요로 닭과 달걀 문제. Lambda 직접 호출(C)은 멱등성·실패처리·동시성 정책을 직접 구현해야 해서 비효율.

---

**문제 2.** 200 계정에 StackSet으로 보안 가드레일 업데이트를 배포하는데 "처음 5 계정에서 실패가 나면 즉시 전체 중단, 그 이후엔 1%까지 실패 허용"이 필요하다. 가장 적절한 운영 방식은?

A) FailureToleranceCount=0 한 번에 전체 배포
B) FailureTolerancePercentage=1 한 번에 전체 배포
C) 1단계 카나리 5 계정에 FailureToleranceCount=0 → 검증 후 2단계 나머지 195 계정에 FailureTolerancePercentage=1
D) 자동 스크립트 없이 콘솔로 한 계정씩

**정답: C**

해설: StackSets 자체에 내장 카나리 단계가 없으므로 운영자가 create-stack-instances를 두 번 호출해 직접 단계 구성한다. INTERSECTION 또는 Accounts 명시로 1단계 카나리 계정만 선택, 검증 후 DIFFERENCE로 나머지 계정에 적용. A는 첫 실패에서 전체 중단, B는 카나리 단계 없음, D는 비현실적. 시험에서는 "단계적 배포"라는 키워드와 함께 자주 출제.

---

**문제 3.** Service-managed StackSets에서 AWS가 멤버 계정에 자동 생성하는 IAM Role의 특징으로 가장 정확한 것은?

A) 사용자가 자유롭게 삭제 가능
B) Service-Linked Role 메커니즘으로 만들어져 의존성 검사로 임의 삭제 차단, 신뢰 출발점은 Organizations 신뢰 관계
C) 각 계정의 IAM 관리자가 trust policy를 직접 작성해야 함
D) Cross-account access key 기반

**정답: B**

해설: Service-Linked Role(SLR)은 AWS 관리형 역할로 서비스 의존성 검사 통과 시에만 삭제 가능하고 권한 수정도 제한된다. 신뢰 관계는 `organizations.amazonaws.com`을 출발점으로 하므로 Org 외부에서 가장 불가능 — 보안 격리의 핵심. Self-managed처럼 운영자가 trust를 직접 만지지 않아 회사 계정 구조 변경 시 운영 부담이 작다.

---

**문제 4.** Delegated Administrator 등록을 권장하는 핵심 이유는?

A) 비용 절감
B) Management Account의 일상 사용을 최소화해 침해 시 폭발 반경 축소 — AWS Well-Architected Security Pillar의 최우선 권고
C) 리전 확장 가능
D) IAM 자동 회전 활성화

**정답: B**

해설: Management Account는 모든 멤버 계정에 대한 절대 권한을 갖는 단일 위험점. 사람 로그인을 최소화하고 일상 운영을 Tooling/Security 계정에 위임하는 게 표준. 같은 패턴이 GuardDuty/Config/Security Hub/Access Analyzer에도 적용. Control Tower는 Audit/Log Archive 계정을 자동 Delegated Admin으로 설정해 이 패턴 강제. 2019년 root credential 분실 사고 같은 사례 방지.

---

**문제 5.** StackSet의 한 Stack Instance가 stateful 리소스(RDS, S3 with data)를 포함한다. 자회사 매각으로 그 계정이 OU를 떠날 때 데이터를 보호하려면?

A) AutoDeployment Enabled만 설정
B) RetainStacksOnAccountRemoval=true + 리소스마다 DeletionPolicy=Retain (두 정책 모두)
C) StackSet 삭제 후 재생성
D) AccountFilterType=DIFFERENCE로 계정 제외

**정답: B**

해설: RetainStacksOnAccountRemoval=false(기본)면 OU 이탈 시 Stack 자동 삭제되고 그 안의 RDS/S3가 같이 사라진다. true로 설정해 Stack 자체를 남기고, 추가로 리소스 DeletionPolicy=Retain으로 어떤 경로의 Stack 삭제에도 데이터 보존. 2021년 핀테크 CloudTrail 유실 사례의 교훈. A는 무관, C는 데이터 손실 위험, D는 향후 배포 제외이지 데이터 보호 아님.

---

**문제 6.** AccountFilterType=DIFFERENCE의 사용 예로 가장 적절한 것은?

A) OU 외부 계정 추가 포함
B) OU 안에서 진행 중인 마이그레이션 계정 2개를 임시로 배포 대상에서 제외
C) OU의 모든 계정
D) 특정 리전만

**정답: B**

해설: DIFFERENCE = OU - Accounts. OU 전체를 대상으로 하되 일부를 임시 제외할 때 유용. 마이그레이션/장애/예외 상황에 사용. UNION(A)은 OU + 추가 계정 외부 포함, NONE(C)은 OU 전체, 리전 필터(D)는 별도 --regions 옵션. 시험에서는 네 가지 집합 연산의 의미 자체를 묻는다.

---

**문제 7.** 500 계정 환경에서 GuardDuty 활성화 여부를 실시간으로 평가하고 자동 복원까지 하려면 가장 적절한 조합은?

A) StackSets Drift Detection만
B) StackSets로 GuardDuty 배포 + Config Rule `guardduty-enabled-centralized`를 Conformance Pack으로 평가 + SSM Automation Document를 Config Remediation으로 자동 복원
C) Lambda 한 개로 직접 체크
D) 콘솔에서 매일 수동 점검

**정답: B**

해설: 세 도구의 역할 분리 — StackSets는 자원 배포(예방), Config Rules는 평가(감지), SSM Automation은 자동 복원(수정). StackSets Drift Detection은 비주기/수동 트리거이고 자동 수정도 안 됨 → 실시간 단독 솔루션 안 됨. Conformance Pack은 Org 전체에 Config Rules를 일관 배포하는 묶음이라 멀티 계정 평가의 표준. Security Hub로 집계해 가시성 확보까지 표준 3단 구성.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, StackSets는 fan-out + single source of truth의 결합이고 GitOps push 모델의 AWS 버전. 둘째, Self-managed의 닭과 달걀 문제로 인해 Service-managed + Organizations가 표준. 셋째, Delegated Administrator로 Management Account 일상 사용 차단이 Well-Architected의 최우선 보안 권고. 넷째, Operation Preferences는 규모별로 튜닝하고 카나리는 두 단계 호출로 직접 구성. 다섯째, StackSets/Control Tower/Config Conformance Pack의 경계 — 임의 리소스/landing zone/평가규칙으로 구분.
