# Day 1 - CloudFormation Advanced: Nested·Cross-Stack and the Deep Story of Modularization

When you first use CloudFormation, you stuff everything into one file. VPC, security groups, EC2, RDS, ALB all go into one template, and once it exceeds 500 lines, reading git diff becomes impossible. At some point someone says "let's separate the VPC out," and true modularization begins. But the moment you separate it, two paths appear. One is **Nested Stack** where the parent template directly calls child templates, and the other is **Cross-Stack** where completely independent stacks exchange values through Export/ImportValue. Both claim the same purpose of "reuse," but their operational models are exact opposites.

Today we examine why these two patterns exist simultaneously, how the software engineering concept of coupling (dating back to 1968) reappears in IaC, the accidents caused by Export being locked while in use, why Stack Policy is a different protective layer from IAM, the internal workings of dynamic references like `{{resolve:secretsmanager:...}}` and their limitations, and the subtle differences between the DeletionPolicy/UpdateReplacePolicy/UpdatePolicy trio. In DOP exams, this area produces 3-5 scenario questions per test asking "which pattern should you choose."

## Nested Stack and Cross-Stack — Two Answers to the Same Problem of Coupling

In software engineering, coupling (how dependent two modules are on each other) and cohesion (how much elements within a module serve a single purpose) were formalized by Larry Constantine in 1968. CloudFormation's two modularization patterns sit at opposite ends of the coupling axis.

**Nested Stack** is tight coupling (parent-child). You declare an `AWS::CloudFormation::Stack` resource in the parent template and point `TemplateURL` at the child template. When the parent Stack updates, child Stacks are re-evaluated too, and when the parent Stack is deleted, child Stacks are deleted together. The lifecycle is bound as one. In exchange, the parent can directly receive the child Stack's Output via `!GetAtt VpcStack.Outputs.VpcId`, making dependency relationships clear and change tracking easy.

**Cross-Stack** is loose coupling between independent Stacks. When a network Stack publishes a value via `Outputs.Export.Name` and an app Stack receives it with `!ImportValue Network-VpcId`, the two Stacks have completely independent lifecycles so they can be deployed, updated, and deleted separately. But the "contract" exchanging values gets bound in Export name as a global namespace, which becomes the starting point for the pitfall we'll see next.

> 💡 **Related Theory**: The coupling-cohesion principle was formalized in Edward Yourdon and Larry Constantine's 1979 book *Structured Design*, and later evolved into Robert Martin's SOLID principles (especially Single Responsibility and Interface Segregation). The choice between Nested vs Cross-Stack in CloudFormation is essentially the same tradeoff. Nested bundles things in one transaction gaining consistency but can't isolate change impact. Cross-Stack gains isolation but must manage the explicit contract of Export names. Kubernetes's Helm umbrella chart (Nested) and Helm dependencies + separate releases (Cross) sit on exactly the same axis.

> 🔍 **Deeper**: CloudFormation internally views Stack as a "transaction unit for resources." In Nested Stack, if one of 50 child Stacks fails, the **entire parent Stack rolls back** (`UPDATE_ROLLBACK_IN_PROGRESS`). That is, if the 49th child fails, all previous 48 are rolled back to their prior state. This is the cost of tight coupling. Meanwhile, if the app Stack fails in Cross-Stack, the network Stack remains unchanged. In large environments, it's standard to break Stacks by domain (network/common IAM/per-service) to reduce the "blast radius of failure."

> 🎯 **Scenario**: "A company runs 200 microservices where the entire infrastructure Stack gets stuck in UPDATE_IN_PROGRESS for 30 minutes because of one service's IAM Role addition. How to improve?" — The answer is breaking Stacks by domain (network/common IAM/per-service) and connecting with Cross-Stack Export/Import. One service change won't block other service deployments.

## When Export is in Use — The Real Meaning of Locking

The biggest pitfall of Cross-Stack appears here. The moment a network Stack exports `VpcId` and an app Stack imports it with `!ImportValue Network-VpcId`, **that Output becomes "locked"**. You can't change the name or value of the Output, and scarier, you can't delete the network Stack itself. It's a safety mechanism CloudFormation built to maintain Export global consistency, but in actual operations this frequently causes accidents.

```yaml
# Network Stack
Outputs:
  VpcId:
    Value: !Ref Vpc
    Export:
      Name: !Sub '${AWS::StackName}-VpcId'   # "prod-network-VpcId"

# App Stack (different Stack)
Resources:
  Sg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !ImportValue prod-network-VpcId   # ← From this moment Network Stack's VpcId Export locks
```

In this locked state, if you need to update the network Stack to change the Export value (the ID returned by `!Ref Vpc`), for example through VPC recreation, the update fails entirely. If even one Export is in use, you can't change its value. So the operations team enters a migration window executing a 3-stage deployment: "Stage 1: Remove ImportValue from app Stack", "Stage 2: Update network Stack", "Stage 3: Add ImportValue back to app Stack". If this repeats every time, teams eventually switch to SSM Parameter Store or Service Catalog.

> ⚠️ **Pitfall**: You can check who's using an Export beforehand with `aws cloudformation list-exports` and `aws cloudformation list-imports --export-name <name>`. If the README of the Stack publishing the Export doesn't document "Export change procedure," six months later no one knows who uses that Export, and trying to change it stops all prod deployments. In 2022, a gaming company was blocked from deploying anything new for 12 hours while expanding VPC because of exactly this.

> 📚 **Case Study**: AWS's own documentation (Best Practices) even recommends switching to **SSM Parameter Store** when Stack count grows, instead of Export/ImportValue. Parameter Store has no locking so it's freely changeable, and when using dynamic references `'{{resolve:ssm:/network/vpc-id:1}}'`, you can specify the version to control unintended change impact. The downside is dependent Stacks don't auto-update when changed (only at deploy time).

## Internal Workings of Dynamic References

Syntax like `'{{resolve:secretsmanager:prod/db:SecretString:password}}'` appears throughout CloudFormation templates. Understanding how it works cuts operational accidents in half.

Dynamic references are a mechanism where **CloudFormation fetches the secret from external services immediately before creating/updating resources and temporarily injects it**. The template itself never contains plaintext passwords, uploaded template files have no plaintext, and ChangeSet shows it only in masked form. Supported sources are three.

| Source | Syntax | Caching |
|--------|--------|---------|
| **SSM Parameter** | `'{{resolve:ssm:/path/to/param:version}}'` | Version specifiable, latest uses creation/update time |
| **SSM Secure String** | `'{{resolve:ssm-secure:/path:version}}'` | KMS decryption then inject, version required |
| **Secrets Manager** | `'{{resolve:secretsmanager:secret-id:SecretString:json-key:version-stage:version-id}}'` | JSON key extraction, rotation version specifiable |

Internally CloudFormation service calls `ssm:GetParameter` or `secretsmanager:GetSecretValue` with its Service Role (or user's IAM permissions). So if the role deploying the Stack lacks secret access, you get a `Dynamic reference resolution failed` error and the entire Stack stalls.

```yaml
Resources:
  Db:
    Type: AWS::RDS::DBInstance
    Properties:
      MasterUsername: '{{resolve:secretsmanager:prod/db:SecretString:username}}'
      MasterUserPassword: '{{resolve:secretsmanager:prod/db:SecretString:password}}'
      # Fetches different keys from same secret — 2 Secrets Manager calls
```

> 🔍 **Deeper**: Dynamic references never **permanently store the fetched value** inside CloudFormation. That is, the next Stack update will fetch again, so rotating the secret in Secrets Manager doesn't automatically change the RDS password. To link RDS and Secrets Manager auto-rotation, you need separate `AWS::SecretsManager::SecretTargetAttachment` and rotation Lambda. Dynamic references are an "injection" mechanism, not a "synchronization" mechanism.

> ⚠️ **Pitfall**: With dynamic references, Stack drift detection misses secret changes. CloudFormation compares only the `'{{resolve:...}}'` string in the template, not the actually fetched value. So even if someone directly changes the password in Secrets Manager, drift doesn't occur. To detect secret changes you need EventBridge rules catching Secrets Manager rotation events.

## Stack Policy — A Different Protection Layer from IAM

When you first see Stack Policy, it looks almost identical to IAM policy. JSON, Effect/Action/Principal/Resource structure. But why does it exist separately? **IAM controls "who can do what," Stack Policy controls "within this Stack, are specific resources protected."** It's not a permissions model but a change protection model.

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": [
        "LogicalResourceId/ProdDatabase",
        "LogicalResourceId/ProdS3Bucket"
      ]
    }
  ]
}
```

In a Stack with this policy applied, nobody can replace or delete ProdDatabase with any IAM Role. If a PowerUser accidentally modifies the prod template wrong trying to change the RDS Engine (Engine change causes Replace), it's blocked. **To proceed with changes, you must temporarily unlock the Stack Policy**, and this unlock action appears in change history forcing human confirmation.

| Protection Mechanism | Who Blocks | How |
|---|---|---|
| **IAM Policy** | User/role unit | Denies API call |
| **Stack Policy** | Specific resource in Stack | Denies Update type (Replace/Delete/Modify) |
| **Termination Protection** | Stack's own deletion | Denies DeleteStack API |
| **DeletionPolicy: Retain** | When resource is deleted | Stack deleted but resource remains |
| **UpdateReplacePolicy: Retain** | When resource is replaced by property change | Existing resource preserved |

These five work at different points, which people often confuse. **DeletionPolicy acts at Stack deletion, UpdateReplacePolicy acts at replacement by property change**. The same RDS has different policies when replaced by Engine change versus Stack deletion. So for prod stateful resources, the standard is **setting both policies to Snapshot or Retain**.

> 💡 **Related Theory**: Change protection layering applies NIST SP 800-53 CM-3 (Configuration Change Control) and CM-5 (Access Restrictions for Change) recommendations to IaC. "Change control must exist separately from permissions" — even if people have permission, there must be separate system-level guardrails, a deep security principle (defense in depth).

## UpdatePolicy — Different Meanings for ASG and Lambda

`UpdatePolicy` is easily confused due to similar naming. Completely different from UpdateReplacePolicy (acts during replacement), it **controls how to proceed when a resource is updated in-place**. It's most known with AutoScalingGroup.

```yaml
WebAsg:
  Type: AWS::AutoScaling::AutoScalingGroup
  UpdatePolicy:
    AutoScalingRollingUpdate:
      MinInstancesInService: 4         # Always serve traffic with minimum 4
      MaxBatchSize: 2                   # Replace 2 at a time
      PauseTime: PT5M                   # 5 min wait between each batch
      WaitOnResourceSignals: true       # Wait for cfn-signal
      SuspendProcesses:                 # Suspend ASG processes during update
        - HealthCheck
        - ReplaceUnhealthy
        - AZRebalance
        - AlarmNotification
        - ScheduledActions
  Properties:
    MinSize: 4
    MaxSize: 12
    DesiredCapacity: 6
    LaunchTemplate: ...
```

`WaitOnResourceSignals: true` means the EC2 UserData calls `cfn-signal` to report "I've booted normally," and the next batch doesn't start until that signal arrives. Without this, ASG starts the next batch as soon as instances are RUNNING, and new instances failing health checks during that time might silently cause full service death.

| Resource | UpdatePolicy Type | What Controls |
|--------|---|---|
| `AWS::AutoScaling::AutoScalingGroup` | `AutoScalingRollingUpdate` | Gradual instance replacement |
| `AWS::AutoScaling::AutoScalingGroup` | `AutoScalingReplacingUpdate` | Create new ASG and shift traffic |
| `AWS::AutoScaling::AutoScalingGroup` | `AutoScalingScheduledAction` | Behavior when scheduled action exists |
| `AWS::Lambda::Alias` | `CodeDeployLambdaAliasUpdate` | Canary/Linear traffic shift |
| `AWS::ElastiCache::ReplicationGroup` | `UseOnlineResharding` | Online resharding |

> 🔍 **Deeper**: AutoScalingReplacingUpdate creates the ASG itself. That is, spin up new instances in a new ASG, both ASGs briefly coexist, ELB Target Group switches to only new ASG instances, then old ASG is deleted. Think of it as the **EC2 version of blue/green**. RollingUpdate is in-place replacement; ReplacingUpdate is blue/green at ASG level.

## CFN Helper Scripts — A Disappearing Bootstrap Pattern

The pattern of EC2 instances self-configuring with cfn-init during boot was standard in the early-to-mid 2010s. Now it's less frequent as workloads move to AMI baking (Packer), containers, EKS, Lambda, but it still appears in exams.

```yaml
WebInstance:
  Type: AWS::EC2::Instance
  Metadata:
    AWS::CloudFormation::Init:
      configSets:
        default: [install, configure, start]
      install:
        packages:
          yum:
            nginx: []
            python3: []
        files:
          /etc/nginx/conf.d/app.conf:
            content: !Sub |
              server {
                listen 80;
                location / { proxy_pass http://localhost:8080; }
              }
            owner: root
            group: root
            mode: '000644'
      configure:
        commands:
          01_set_hostname:
            command: !Sub 'hostnamectl set-hostname web-${Environment}'
      start:
        services:
          sysvinit:
            nginx:
              enabled: true
              ensureRunning: true
              files: [/etc/nginx/conf.d/app.conf]
  CreationPolicy:
    ResourceSignal:
      Timeout: PT10M
  Properties:
    UserData: !Base64
      Fn::Sub: |
        #!/bin/bash -xe
        yum install -y aws-cfn-bootstrap
        /opt/aws/bin/cfn-init -v -s ${AWS::StackName} -r WebInstance --configsets default --region ${AWS::Region}
        /opt/aws/bin/cfn-signal -e $? --stack ${AWS::StackName} --resource WebInstance --region ${AWS::Region}
```

`CreationPolicy.ResourceSignal.Timeout: PT10M` means if cfn-signal doesn't arrive within 10 minutes, the instance creation fails. This pairs with ASG's UpdatePolicy.WaitOnResourceSignals. cfn-init is designed with idempotency — running the same configSet multiple times produces the same result. `cfn-hup` runs as a daemon and re-runs cfn-init when it detects metadata changes (Stack update) — configuration changes without instance reboot.

> 📚 **Case Study**: Until around 2018, many companies installed OS packages with cfn-init, but this added 3-5+ minutes to instance boot time and exposed direct yum/apt mirror failure. So now standard is pre-baking AMIs with Packer and using cfn-init only for minimal environment variable injection and cfn-signal. AMI baking reduces boot time to under 30 seconds with the GoldenAMI pattern.

## Drift Detection — Detecting Without Auto-Fixing

`aws cloudformation detect-stack-drift` inspects all Stack resources, comparing template definition to actual state. Results show `IN_SYNC`, `MODIFIED`, `DELETED`, or `NOT_CHECKED`, and provide detailed comparison for each property. Interestingly, **CloudFormation doesn't auto-fix drift**.

This is intentional design. Drift means "someone changed this via console/CLI directly," and that change might be an emergency patch or a mistake. If CloudFormation auto-reverts, it erases emergency patches causing bigger disasters. So drift takes the conservative approach — "detect and alert only," and fixes are executed by humans via ChangeSet or separate tools (AWS Config Rules, Custom Lambda).

| Tool | Drift Detection | Auto-Fix | When to Use |
|------|---|---|---|
| **CFN Drift Detection** | ✅ Stack unit | ❌ | Manual/scheduled run |
| **AWS Config Rules** | ✅ Resource unit | ✅ (Remediation) | Continuous monitoring |
| **Terraform plan** | ✅ State comparison | ❌ (refresh accepts) | CI pipeline |
| **Pulumi refresh** | ✅ | ❌ | CI pipeline |

> 🎯 **Scenario**: "Prod RDS backup retention changed from 7 to 3 days. Track who changed it when and auto-restore." — Answer is (1) CloudTrail tracks RDS modify calls, (2) Config Rule `rds-instance-deletion-protection-enabled` and similar managed rules detect changes, (3) SSM Automation Document registered as Config Remediation auto-restores. CFN Drift alone detects only, not sufficient.

## Summary

Today's picture has five parts. First, **Nested Stack and Cross-Stack are two answers to modularization** and the 1968 coupling principle applies directly to IaC. Second, **Cross-Stack Export locks when in use** — operations standards should consider Parameter Store migration. Third, **dynamic references are fetch mechanisms, not sync** — Drift Detection can't catch it, so EventBridge separately monitors. Fourth, **Stack Policy / Termination Protection / DeletionPolicy / UpdateReplacePolicy all work at different points** and form a multi-layer protection. Fifth, **Drift Detection deliberately only detects**, and auto-fixes separate to Config Rules + SSM Automation.

Next we'll see StackSets extending these patterns to thousands of accounts and multiple regions through Organizations integration, raising governance to another level.

---

## 📝 연습 문제

**문제 1.** 한 회사가 200개 마이크로서비스 인프라를 단일 CloudFormation Stack에 담아 운영 중이다. 한 서비스의 IAM 변경 때문에 전체 Stack이 UPDATE_IN_PROGRESS로 30분간 묶이는 문제를 가장 적절히 해결하려면?

A) Nested Stack으로 자식 50개를 만든다
B) 도메인별로 Stack을 쪼개고 Cross-Stack Export/Import로 연결한다
C) Terraform으로 마이그레이션
D) Stack Policy로 변경 차단

**정답: B**

해설: Nested Stack은 자식이 늘어도 부모 Stack 한 트랜잭션 안에서 평가되므로 문제(변경 영향 격리 부재)가 해결되지 않는다. Cross-Stack은 독립 라이프사이클을 가져 한 서비스 변경이 다른 서비스 배포를 막지 않는다. 결합도-응집도 원칙의 적용. Terraform 마이그레이션(C)은 비용이 크고 본질을 해결하지 않으며 CFN의 거버넌스 자산(StackSets, Service Catalog)을 잃는다. Stack Policy(D)는 변경 보호이지 격리 도구가 아니다.

---

**문제 2.** Cross-Stack에서 Export `prod-network-VpcId`가 다른 Stack의 ImportValue로 사용 중이다. 네트워크 Stack 업데이트로 VPC를 재생성(논리 ID 재사용, 물리 ID 변경)하려 할 때 일어나는 일은?

A) 자동으로 의존 Stack까지 업데이트됨
B) Export 값 변경 시도가 실패해 전체 Stack 업데이트 롤백
C) Export가 자동 잠금 해제됨
D) 변경 영향이 의존 Stack에 자동 전파

**정답: B**

해설: 사용 중인 Export의 값은 변경 불가. VPC 재생성은 Export 값(VpcId)을 바꾸므로 Stack 업데이트 자체가 실패한다. 의존 Stack에서 먼저 ImportValue를 제거(3단계 배포의 1단계) → 네트워크 Stack 업데이트 → 의존 Stack에 ImportValue 다시 추가 순으로 진행해야 한다. 2022년 게임사 12시간 prod 배포 마비 사례와 동일한 패턴. AWS Best Practices는 이런 경우 SSM Parameter Store 전환을 권장.

---

**문제 3.** 다음 중 `'{{resolve:secretsmanager:prod/db:SecretString:password}}'` 동적 참조에 대해 옳은 설명은?

A) Secrets Manager 회전 시 RDS 비밀번호가 자동으로 동기화된다
B) Drift Detection이 시크릿 값 변경을 자동 감지한다
C) Stack 배포 시점에 CloudFormation Service Role이 GetSecretValue 호출로 fetch해 주입하고, 템플릿/ChangeSet에는 평문이 남지 않는다
D) S3에 저장된 템플릿 안에 복호화된 평문이 저장된다

**정답: C**

해설: 동적 참조는 fetch 메커니즘. Stack 생성/업데이트 시점에 외부 서비스에서 가져와 임시 주입한다. 회전 동기화(A)는 별도 `SecretTargetAttachment` + 회전 Lambda가 필요. Drift Detection(B)은 템플릿의 `'{{resolve:...}}'` 문자열만 비교하므로 시크릿 값 변경 못 잡음 — EventBridge로 회전 이벤트 잡는 게 표준. 평문이 절대 템플릿/ChangeSet/S3에 저장되지 않는다는 게 동적 참조의 핵심 보안 이점.

---

**문제 4.** Stack Policy와 IAM Policy의 차이로 가장 정확한 것은?

A) Stack Policy는 IAM Policy의 별칭
B) Stack Policy는 Stack 안의 특정 리소스에 대한 Update 종류(Replace/Delete/Modify)를 통제하는 변경 보호 계층이고, IAM은 사용자/역할의 API 호출 권한을 통제
C) Stack Policy는 비용 최적화 도구
D) 둘 다 동일한 시점에 평가됨

**정답: B**

해설: 권한(IAM)과 변경 보호(Stack Policy)는 다른 계층. PowerUser IAM 권한을 가진 운영자가 실수로 prod 템플릿을 잘못 수정해도 Stack Policy가 ProdDatabase의 Replace를 Deny하면 막힌다. NIST SP 800-53 CM-3/CM-5의 "변경 통제와 접근 통제 분리" 원칙의 구현. 변경을 진행하려면 Stack Policy를 일시 해제해야 하므로 사람의 한 단계 확인이 강제된다.

---

**문제 5.** RDS prod 인스턴스를 보호하기 위해 다음 중 가장 완전한 조합은?

A) DeletionPolicy: Retain만
B) Termination Protection만
C) DeletionPolicy: Snapshot + UpdateReplacePolicy: Snapshot + Stack Policy로 Replace/Delete Deny + Termination Protection
D) IAM 정책으로 RDS DeleteDBInstance 거부

**정답: C**

해설: 네 가지가 모두 다른 시점에 작동. DeletionPolicy는 Stack 삭제 시, UpdateReplacePolicy는 속성 변경에 의한 교체 시(예: Engine 변경), Stack Policy는 Update API 진입 시점, Termination Protection은 DeleteStack API 호출 자체를 차단. 단일 정책으로는 우회 경로가 항상 존재. defense in depth 원칙. A는 Engine 변경 교체에 약함, B는 update 보호 없음, D는 Stack을 통한 변경에 약함(CFN이 IAM 우회).

---

**문제 6.** ASG의 UpdatePolicy `AutoScalingRollingUpdate`에서 `WaitOnResourceSignals: true`의 효과는?

A) ASG의 모든 인스턴스를 동시에 교체
B) 각 배치 인스턴스가 cfn-signal로 정상 신호를 보낼 때까지 다음 배치 진행 보류 — 부팅 실패 인스턴스가 누적되는 것 방지
C) 자동 롤백 비활성화
D) IAM 권한 변경

**정답: B**

해설: cfn-signal은 EC2 UserData에서 `/opt/aws/bin/cfn-signal --exit-code $?`로 호출되며 "정상 부팅 완료"를 알린다. 이게 없으면 ASG는 RUNNING 상태만 보고 다음 배치를 시작해 부팅 실패가 누적되며 서비스 전체가 죽을 수 있다. CreationPolicy.ResourceSignal.Timeout과 짝을 이뤄 안전한 점진 교체를 보장. RollingUpdate는 in-place 교체(개별 인스턴스), ReplacingUpdate는 ASG 단위 블루/그린이라는 차이도 시험 포인트.

---

**문제 7.** CFN Drift Detection이 자동 수정을 제공하지 않는 이유로 가장 정확한 것은?

A) 기술적 한계
B) Drift는 긴급 패치일 수도 실수일 수도 있어 자동 복원이 더 큰 사고로 이어질 위험 — 감지/알림은 CFN, 자동 수정은 Config Rules의 Remediation Action으로 책임 분리
C) AWS 정책상 금지
D) 비용 문제

**정답: B**

해설: 자동 수정이 인시던트 대응 중 진행되면 운영자가 손으로 적용한 긴급 패치를 되돌려 장애를 악화시킨다. 그래서 보수적 설계 — CFN은 감지만, Config Rules + SSM Automation Document로 명시적 자동화 정책을 등록한 경우만 자동 복원. 책임 분리(separation of concerns)와 안전성 우선 설계의 전형. CloudTrail로 변경 추적, Config로 평가, SSM Automation으로 복원의 3단 구성이 표준.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Nested(강결합, 한 트랜잭션)와 Cross-Stack(약결합, 독립 라이프사이클)은 1968년 결합도 원칙의 IaC 적용. 둘째, Export는 사용 중이면 잠기므로 Parameter Store 전환이 권장. 셋째, 동적 참조는 fetch이지 동기화가 아니며 Drift Detection이 못 잡는다. 넷째, Stack Policy / Termination Protection / DeletionPolicy / UpdateReplacePolicy는 모두 다른 시점의 보호 계층이고 defense in depth로 함께 써야 한다. 다섯째, Drift Detection은 의도적으로 감지만 하며 자동 수정은 Config Rules + SSM Automation으로 분리.
