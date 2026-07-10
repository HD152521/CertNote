# Day 2 - CloudFormation: The Idea of "Declaring" Infrastructure

Clicking to create one server in the console is easy. But creating tens of resources — VPC, subnets, security groups, EC2, RDS, ALB, Lambda — clicking through all of them, replicating them identically to staging and production, then six months later trying to trace "why is this security group wide open?" — that's where hell begins. Hand-crafted infrastructure can't be reproduced, has no change history, and depends only on human memory. **Infrastructure as Code (IaC)** attacks this problem head-on — declaring infrastructure in text files enables version control (git), code review, and recreating identical environments with a single command. AWS CloudFormation is AWS's implementation of IaC.

In DVA-C02, CloudFormation is central to the Deployment domain and the foundation for SAM and CDK, so you must understand it. Simple memorization (`!Ref` vs `!GetAtt`, DeletionPolicy) appears, but scenario questions asking "why is stack update dangerous," "how does rollback work," and "cross-stack reference traps" are more common. This article digs deep into: what's different between declarative IaC and imperative scripts, how CloudFormation resolves dependencies to determine creation order, how stack update and rollback work internally, and why various protection mechanisms diverge.

## Declarative vs Imperative: The Difference Between "What" and "How"

When you first see a CloudFormation template, it seems like "just a config file," but underneath is the important philosophy of the **declarative model**. Declarative IaC specifies only "**what** you want (the desired final state)" and leaves "**how** to achieve it (creation order, API calls, error handling, rollback)" to the CloudFormation engine. In contrast, bash scripts doing `aws ec2 create-vpc` → `aws ec2 create-subnet` → ... in order are **imperative**.

This difference is decisive in practice. Imperative scripts that "halfway fail" leave you in a messy state — VPC created but subnet failed, and you own the cleanup. Declarative models let the engine compute the difference between "desired state" and "current state," so running twice yields the same result — **idempotency** — and on failure, the engine **automatically rolls back**. Not "do what I tell you" but "make this state happen."

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: My Application Stack

Parameters:
  EnvironmentName:
    Type: String
    Default: production
    AllowedValues: [production, staging, development]

Conditions:
  IsProduction: !Equals [!Ref EnvironmentName, production]

Mappings:
  RegionAMI:
    ap-northeast-2: { AMI: ami-0c9c942bd7bf113a2 }
    us-east-1:      { AMI: ami-0abcdef1234567890 }

Resources:
  MyVPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      Tags: [{ Key: Name, Value: !Sub "${EnvironmentName}-vpc" }]

  MyEC2:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !If [IsProduction, m5.large, t3.micro]
      ImageId: !FindInMap [RegionAMI, !Ref AWS::Region, AMI]

Outputs:
  VPCId:
    Value: !Ref MyVPC
    Export:
      Name: !Sub "${EnvironmentName}-vpc-id"
```

> 💡 **Related theory**: The core value of the declarative model is **convergence** — the system reaches the declared goal state regardless of starting point. This is the shared philosophy of configuration management tool lineage (Puppet 2005, Chef 2009, Ansible 2012) and, more fundamentally, resembles functional programming's "describe what to compute, let the runtime handle how." CloudFormation, Terraform, and Kubernetes manifests are all declarative because in distributed infrastructure, "humans handling every order and error by hand" is practically impossible. Handing that complexity to the engine is the essence of declarative.

## How CloudFormation Determines Creation Order: Dependency Graphs

When you specify an EC2, the VPC it belongs to, and the security group in a template, how does CloudFormation know what to create first? Answer: **dependency graph**. CloudFormation parses the template and extracts resource references — if EC2 references VPC via `!Ref MyVPC`, an edge "EC2 depends on VPC" is created. The resulting directed graph is **topologically sorted**, so dependencies are built first (VPC → subnet → EC2), and independent resources are created **in parallel**.

So in most cases, you don't need to explicitly declare `DependsOn` — referencing another resource via `!Ref` or `!GetAtt` automatically infers dependency. `DependsOn` is only for "implicit dependencies" that auto-inference misses (e.g., an IAM role must propagate before a resource using it is created).

> 🔍 **Going deeper**: The difference between `!Ref` and `!GetAtt` extends beyond simple memorization to dependency graph operation. `!Ref MyVPC` usually returns the resource's "default identifier" (for VPC, the VPC ID), while `!GetAtt MyRDS.Endpoint.Address` grabs a specific attribute. Both create "this value requires that resource to exist first" dependency. But `!GetAtt` attributes sometimes only exist **after resource is fully provisioned** (RDS endpoint address only known when DB is up). So a resource referencing RDS endpoint via `!GetAtt` must wait for RDS creation to complete, causing longer stack creation — a common reason for slow stack creates.

> ⚠️ **Trap**: If two resources reference each other, **circular dependency** occurs and stack creation fails. For example, security group A references B for inbound and B references A — topological sort is impossible. Solution: instead of inline rules, **separate `SecurityGroupIngress` resources** to break the cycle. On exams, "circular dependency" error almost always points to this pattern.

## Stack Updates' Three Fates: Modify, Replace, No Interruption

The most dangerous moment in CloudFormation is not creation but **update**. When changing an existing production stack's template, CloudFormation handles each changed resource one of three ways:

- **No interruption**: Resource stays, only properties change. Example: EC2 tag change, Lambda environment variable change. Safest.
- **Some interruption**: Resource stays but pauses briefly. Example: EC2 instance type change (requires restart).
- **Replacement**: **Create resource anew, delete the old one**. Most dangerous — some properties are immutable, so changing them requires building from scratch. Example: EC2's AZ or certain RDS settings, or changing the name of name-identified resources.

Replacement is scary for good reason: if an RDS database is replaced, a **new empty DB is created and existing data vanishes**. So not knowing "which properties trigger replacement" and modifying the template can cause data loss. That's why **Change Set** exists.

```bash
aws cloudformation create-change-set \
    --stack-name my-stack --template-body file://template.yaml \
    --change-set-name my-changes
aws cloudformation describe-change-set \
    --stack-name my-stack --change-set-name my-changes   # Check Replacement: True
aws cloudformation execute-change-set \
    --stack-name my-stack --change-set-name my-changes
```

Change Set shows "what will be added/modified/deleted/replaced" before execution. As a safety gate for production deploy, you can spot "DB will be replaced" and stop it.

> 📚 **Case study**: Accidentally triggering replacement of RDS by changing `DBInstanceIdentifier` or certain engine properties and losing data is a classic IaC operations trap. AWS recommends two-layer defense. First, **`DeletionPolicy: Snapshot`** or **`Retain`** on RDS/EBS to preserve data on delete/replacement. Second, **always review Change Set for Replacement** before updating. That's why "never update directly, always go through Change Set" became doctrine in mature teams.

## Automatic Rollback: Rewind on Failure

The strongest safety net of the declarative model is **automatic rollback**. If a resource fails during stack create or update, CloudFormation doesn't leave what it built — it **rolls back to the previous stable state**. On creation failure, everything made is deleted (`ROLLBACK_COMPLETE`); on update failure, the previous template state is restored (`UPDATE_ROLLBACK_COMPLETE`). This is the decisive difference from imperative scripts — scripts leave you halfway done, CloudFormation promises "all success" or "all undo," like a transaction.

> 💡 **Related theory**: This "all or nothing" is the **atomicity** of database transactions. Think of CloudFormation as an "infrastructure transaction manager" — bundling multiple resource creates as one unit, rolling back (with compensating deletes) on midway failure. But it's not a perfect transaction. Some resources won't delete on rollback (e.g., non-empty S3 buckets), leaving stacks stuck in `UPDATE_ROLLBACK_FAILED`. Then you manually clean and `ContinueUpdateRollback` to resume. On exams, "stack stuck in ROLLBACK_FAILED" has this fix.

> ⚠️ **Trap**: If a newly-created resource has `DeletionPolicy: Retain` during rollback, it stays even after rollback. Also, for CloudFormation to know if EC2 bootstrapping finished, it needs **`CreationPolicy` and cfn-signal** — without it, CloudFormation only sees "EC2 API succeeded" and doesn't know if the app inside actually launched. Broken UserData scripts succeed the stack anyway — exam trap from here.

## Cross-Stack References vs Nested Stacks: How to Decompose Infrastructure

When one stack gets too large, managing it's hard. Two ways to decompose infrastructure exist, and their purposes differ.

| Way | Mechanism | Coupling | Suited for |
|------|----------|--------|------|
| **Cross-stack reference** | `Export` + `!ImportValue` | Loose | Network stack's VPC ID shared by multiple app stacks |
| **Nested stack** | Parent includes child template as `AWS::CloudFormation::Stack` | Tight | Reusable components (standard ALB config) in multiple places |

Cross-stack reference: one stack `Export`s values in `Outputs`, another `!ImportValue`s them. Loosely coupled but has constraints — **if something Import`s an Exported value, you can't change that Export or delete the exporting stack**. Dependency tightens. Also, **`!ImportValue` only works within same region/account** (no cross-region/account).

Nested stacks: parent stack wraps child stacks as resources. Good for standardized building blocks, and deleting parent also cleans up children.

> 🔍 **Going deeper**: The tight dependency created by `Export`/`ImportValue` often causes operational headaches. If network stack Exports VPC ID and five app stacks Import it, changing that Export name requires detaching all five first. So large organizations increasingly **store values in SSM Parameter Store and read from it** — Parameter Store doesn't create this tight coupling, letting stacks change independently. That's one reason CDK was created — to handle cross-stack reference more flexibly in code.

## Four Protection Mechanisms: What Protects What

CloudFormation has similar-looking but different-target mechanisms, a single-exam trap. "What are we protecting from what" clarifies.

| Mechanism | What does it prevent | Scope |
|----------|-------------|------|
| **DeletionPolicy** | **Resource** disappearing on stack/resource delete (Retain/Snapshot/Delete) | Per resource, at delete time |
| **UpdateReplacePolicy** | **Resource** disappearing when update causes replacement | Per resource, at replacement time |
| **Stack Policy** | **Modifying/replacing resource** during update | Stack update operation |
| **Termination Protection** | **Stack itself** being deleted | Stack-level |
| **IAM Policy** | **Who** can manipulate the stack | User/role permissions |

Separate the oft-confused pairs. **DeletionPolicy vs Termination Protection**: former is "keep just this DB when deleting stack" (per resource), latter is "prevent this stack from being deleted entirely" (stack-level). **Stack Policy vs IAM**: former is "don't touch ProductionDB during update" (operation protection), latter is "John can't update stacks" (people protection).

```json
{
  "Statement": [
    { "Effect": "Allow", "Action": "Update:*", "Principal": "*", "Resource": "*" },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": "LogicalResourceId/ProductionDB"
    }
  ]
}
```

> ⚠️ **Trap**: "Prevent accidental DB deletion?" has different answers by scenario. "Keep DB when stack deletes" → `DeletionPolicy: Retain`. "Prevent DB replacement during update" → Stack Policy's Deny `Update:Replace`. "Prevent stack itself from deletion" → Termination Protection. Know only one and you fall into the trap — protection time (delete/update) and scope (resource/stack) matter together.

## Drift: When Code and Reality Diverge

IaC's premise is "template is the truth of infrastructure." But if someone clicks a security group open in the console, template (code) and actual infrastructure (reality) diverge. That's **drift**. CloudFormation's **Drift Detection** compares expected state from template to actual resource state and shows differences.

Important: **drift detection is not automatic** — you must trigger it explicitly. CloudFormation doesn't prevent console changes in real-time (that's IAM/SCP's job). Drift detection is a post-hoc "find the divergence that's already happened" tool. For automatic/continuous detection, combine with **AWS Config** rules.

> 📚 **Case study**: Many teams repeat "it's urgent, fix in console now, update code later," then next stack update throws console changes away, losing emergency patches. CloudFormation update assumes "template is truth" and applies based on that, so ignoring drift and updating overwrites console changes. Mature teams **prevent console modification via IAM (read-only)** and make all changes go through template → pipeline, enforcing **immutable infrastructure** discipline.

## Summary

CloudFormation's core thesis is "declare desired infrastructure state, the engine resolves order via dependency graph, and deploys or entirely rolls back as a transaction." Declarative model yields idempotency and automatic rollback, dependency graphs and topological sort handle order/parallelization automatically. Update risk lies in replacement (dangerous for stateful resources), and Change Set previews it. DeletionPolicy, Stack Policy, and Termination Protection each protect different things at different times — resource vs stack, delete vs update. Cross-stack Export coupling is loosened with SSM Parameter Store, drift signals "code as truth" broke. Most exam traps ask "delete or replace, resource or stack, automatic or manual" on this pipeline.

Next we move to SAM, CloudFormation compressed for serverless.

---

## 📝 연습 문제

**문제 1.** 프로덕션 스택의 템플릿을 수정해 적용하려 한다. RDS가 의도치 않게 교체되어 데이터가 사라지는 것을 사전에 발견하려면?

A) 바로 스택을 업데이트하고 결과를 본다

B) Change Set을 생성해 Replacement 여부를 검토한 뒤 실행한다

C) 드리프트 감지를 실행한다

D) Termination Protection을 켠다

**정답: B**

해설: **Change Set**은 업데이트를 실제로 적용하기 전에 각 리소스가 추가/수정/삭제/**교체(Replacement: True)** 중 무엇이 되는지 보여준다. RDS가 교체되면 새 빈 DB가 생기고 데이터가 사라질 수 있으므로, Change Set으로 "Replacement: True"를 미리 확인하고 멈출 수 있다. A) 바로 업데이트하면 발견했을 땐 이미 늦다. C) 드리프트 감지는 이미 벌어진 콘솔 변경과의 차이를 보는 것이지 업데이트 결과 예측이 아니다. D) Termination Protection은 스택 삭제를 막을 뿐 업데이트 중 교체를 막지 않는다.

---

**문제 2.** CloudFormation 스택 생성 시 두 보안 그룹이 서로를 참조해 "circular dependency" 오류가 났다. 올바른 해결은?

A) DependsOn을 양쪽에 추가한다

B) 인라인 ingress 규칙을 별도의 AWS::EC2::SecurityGroupIngress 리소스로 분리한다

C) 두 보안 그룹을 하나로 합친다

D) 리전을 변경한다

**정답: B**

해설: 두 리소스가 서로를 참조하면 의존 그래프에 순환이 생겨 위상 정렬이 불가능해 생성이 실패한다. 보안 그룹 규칙을 인라인으로 두지 말고 **별도의 `AWS::EC2::SecurityGroupIngress` 리소스**로 떼어내면, 보안 그룹 자체는 서로 참조하지 않고 규칙만 나중에 양쪽을 연결하므로 순환이 끊긴다. A) DependsOn은 명시적 의존을 추가할 뿐 순환을 풀지 못한다(오히려 악화). C) 합치면 격리가 깨지고 항상 가능하지도 않다. D) 리전과 무관하다.

---

**문제 3.** 스택을 삭제하더라도 그 안의 프로덕션 RDS 데이터베이스는 보존하고 싶다. 적절한 설정은?

A) Termination Protection 활성화

B) 리소스에 DeletionPolicy: Retain 설정

C) Stack Policy로 Update:Delete 거부

D) IAM으로 삭제 권한 제거

**정답: B**

해설: **`DeletionPolicy: Retain`** 을 RDS 리소스에 걸면, 스택을 삭제해도 그 리소스는 삭제되지 않고 그대로 남는다(데이터 보존). 스냅샷을 원하면 `Snapshot`을 쓴다. A) Termination Protection은 스택 자체의 삭제를 막을 뿐, 스택을 정상적으로 삭제하는 경우의 리소스 보존과는 다른 개념이다. C) Stack Policy는 업데이트 작업 중 보호이지 스택 삭제 시점의 리소스 보존이 아니다. D) IAM은 "누가" 삭제하는지를 막을 뿐 리소스 보존 메커니즘이 아니다.

---

**문제 4.** 네트워크 스택이 Export한 VPC ID를 애플리케이션 스택에서 참조하려 한다. 올바른 함수와 제약은?

A) !Ref vpc-id, 모든 리전에서 가능

B) !ImportValue로 가져오며, 같은 리전·같은 계정 안에서만 가능

C) !GetAtt vpc.Id, 교차 리전 가능

D) !FindInMap, 교차 계정 가능

**정답: B**

해설: 다른 스택이 `Outputs`에서 `Export`한 값은 **`!ImportValue`** 로 가져온다. 단 이 메커니즘은 **같은 리전·같은 계정 내 스택끼리만** 작동하며 교차 리전/계정은 지원하지 않는다. 또 Import가 걸려 있는 동안 원본 Export는 변경·삭제할 수 없는 강결합이 생긴다. A) !Ref는 같은 템플릿 내 리소스/파라미터 참조다. C) !GetAtt는 같은 템플릿 내 속성 참조이고 교차 리전을 주지 않는다. D) !FindInMap은 매핑 조회로 무관하다.

---

**문제 5.** CloudFormation으로 EC2를 만들고 UserData로 애플리케이션을 부트스트랩하는데, 스크립트가 실패해도 스택이 "성공"으로 끝난다. 부트스트랩 완료를 CloudFormation이 기다리게 하려면?

A) DependsOn 추가

B) CreationPolicy + cfn-signal로 부트스트랩 완료 신호를 보낸다

C) DeletionPolicy: Retain

D) Stack Policy 설정

**정답: B**

해설: 기본적으로 CloudFormation은 EC2 생성 API가 성공하면 "성공"으로 보며, 인스턴스 **안의** 애플리케이션이 실제로 떴는지는 모른다. **`CreationPolicy`** 를 걸고 부트스트랩 끝에서 **`cfn-signal`** 로 성공 신호를 보내게 하면, CloudFormation은 그 신호(또는 타임아웃)까지 기다렸다가 완료 처리한다. 신호가 안 오면 실패로 보고 롤백한다. A) DependsOn은 리소스 간 순서일 뿐 내부 부트스트랩 완료를 기다리지 않는다. C·D는 부트스트랩 신호와 무관하다.

---

**문제 6.** 운영자가 콘솔에서 보안 그룹을 손으로 수정했다. CloudFormation 템플릿과 실제 리소스의 차이를 확인하려면?

A) Change Set 생성

B) 드리프트 감지(Drift Detection) 실행

C) 스택 업데이트

D) Termination Protection

**정답: B**

해설: **드리프트 감지**는 템플릿이 기대하는 상태와 실제 리소스 상태를 비교해 콘솔 등에서 발생한 수동 변경(드리프트)을 찾아낸다. 단 자동이 아니라 명시적으로 실행해야 하며, 지속·자동 감지가 필요하면 AWS Config와 결합한다. A) Change Set은 "앞으로의 업데이트"가 무엇을 바꿀지 보여주는 것이지 현재 어긋남을 보여주지 않는다. C) 스택 업데이트는 오히려 콘솔 변경을 덮어쓸 위험이 있다. D) Termination Protection은 삭제 방지일 뿐이다.

---

**문제 7.** CloudFormation의 자동 롤백 동작에 대한 설명으로 가장 정확한 것은?

A) 생성 중 한 리소스가 실패하면 그때까지 만든 것을 그대로 두고 멈춘다

B) 생성/업데이트 중 실패하면 직전 안정 상태로 되돌리며, 이는 트랜잭션의 원자성과 유사하다

C) 롤백은 항상 100% 성공한다

D) 롤백은 사용자가 수동으로만 시작할 수 있다

**정답: B**

해설: CloudFormation은 생성·업데이트 중 실패 시 **직전의 안정 상태로 자동 롤백**해, 명령적 스크립트처럼 어중간한 상태로 방치하지 않는다. 이는 DB 트랜잭션의 **원자성**(전부 성공 아니면 전부 취소)과 유사한 보장이다. A) 그대로 두는 게 아니라 되돌린다. C) 항상 성공하지는 않는다 — 비어 있지 않은 S3 버킷 등으로 `ROLLBACK_FAILED`에 빠지면 수동 정리 후 `ContinueUpdateRollback`이 필요하다. D) 롤백은 실패 시 자동으로 시작된다.
