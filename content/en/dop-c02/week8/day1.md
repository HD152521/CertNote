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

## 📝 Practice Questions

**Question 1.** A company runs 200 microservices of infrastructure in a single CloudFormation stack. An IAM change for one service locks the entire stack in UPDATE_IN_PROGRESS for 30 minutes. What is the most appropriate way to solve this?

A) Create 50 child stacks as nested stacks
B) Split the stack by domain and connect them with cross-stack Export/Import
C) Migrate to Terraform
D) Block changes with a stack policy

**Answer: B**

Explanation: A nested stack is evaluated within a single parent stack transaction even as children grow, so the problem (lack of change impact isolation) is not solved. Cross-stack has independent lifecycles, so one service change does not block another service deployment. This applies the coupling-cohesion principle. A Terraform migration (C) is costly, does not solve the root problem, and loses CFN governance assets (StackSets, Service Catalog). A stack policy (D) is change protection, not an isolation tool.

---

**Question 2.** The export `prod-network-VpcId` is being used as an ImportValue by another stack. What happens when a network stack update tries to recreate the VPC (logical ID reused, physical ID changed)?

A) The dependent stacks are updated automatically
B) The attempt to change the export value fails and the entire stack update rolls back
C) The export is automatically unlocked
D) The change impact automatically propagates to the dependent stacks

**Answer: B**

Explanation: The value of an export that is in use cannot be changed. Recreating the VPC changes the export value (VpcId), so the stack update itself fails. You must proceed in this order: first remove the ImportValue from the dependent stacks (step 1 of a 3-step deployment) → update the network stack → add the ImportValue back to the dependent stacks. This is the same pattern as the 2022 case of a game company whose prod deployments were paralyzed for 12 hours. AWS best practices recommend switching to SSM Parameter Store in such cases.

---

**Question 3.** Which of the following is a correct statement about the dynamic reference `'{{resolve:secretsmanager:prod/db:SecretString:password}}'`?

A) When Secrets Manager rotates, the RDS password is synchronized automatically
B) Drift detection automatically detects changes to the secret value
C) At stack deployment time, the CloudFormation service role fetches it with a GetSecretValue call and injects it, and no plaintext remains in the template/change set
D) The decrypted plaintext is stored inside the template saved in S3

**Answer: C**

Explanation: A dynamic reference is a fetch mechanism. At stack creation/update time, it is fetched from the external service and injected temporarily. Rotation synchronization (A) requires a separate `SecretTargetAttachment` + a rotation Lambda. Drift detection (B) only compares the `'{{resolve:...}}'` string in the template, so it cannot catch a change in the secret value — catching rotation events with EventBridge is the standard. The key security benefit of dynamic references is that plaintext is never stored in the template/change set/S3.

---

**Question 4.** What is the most accurate difference between a stack policy and an IAM policy?

A) A stack policy is an alias of an IAM policy
B) A stack policy is a change protection layer that controls the type of update (Replace/Delete/Modify) on specific resources in a stack, while IAM controls the API call permissions of users/roles
C) A stack policy is a cost optimization tool
D) Both are evaluated at the same time

**Answer: B**

Explanation: Permissions (IAM) and change protection (stack policy) are different layers. Even if an operator with PowerUser IAM permissions mistakenly modifies the prod template incorrectly, a stack policy that denies Replace on ProdDatabase blocks it. It is an implementation of the NIST SP 800-53 CM-3/CM-5 principle of "separating change control from access control." To proceed with the change, the stack policy must be temporarily lifted, so a human confirmation step is enforced.

---

**Question 5.** What is the most complete combination to protect a prod RDS instance?

A) DeletionPolicy: Retain only
B) Termination protection only
C) DeletionPolicy: Snapshot + UpdateReplacePolicy: Snapshot + a stack policy that denies Replace/Delete + termination protection
D) Deny RDS DeleteDBInstance with an IAM policy

**Answer: C**

Explanation: All four work at different points in time. DeletionPolicy applies when the stack is deleted, UpdateReplacePolicy applies when a property change causes replacement (for example, an engine change), the stack policy applies at the entry point of the Update API, and termination protection blocks the DeleteStack API call itself. With a single policy, a bypass path always exists. This is the defense in depth principle. A is weak against replacement caused by an engine change, B has no update protection, and D is weak against changes made through the stack (CFN bypasses IAM).

---

**Question 6.** What is the effect of `WaitOnResourceSignals: true` in the ASG UpdatePolicy `AutoScalingRollingUpdate`?

A) Replaces all ASG instances at the same time
B) Holds off on proceeding to the next batch until each batch instance sends a success signal with cfn-signal — preventing instances that failed to boot from accumulating
C) Disables automatic rollback
D) Changes IAM permissions

**Answer: B**

Explanation: cfn-signal is called in EC2 user data as `/opt/aws/bin/cfn-signal --exit-code $?` and signals "boot completed successfully." Without it, the ASG looks only at the RUNNING state and starts the next batch, so boot failures accumulate and the whole service can go down. Paired with CreationPolicy.ResourceSignal.Timeout, it guarantees a safe gradual replacement. Another exam point is the difference that RollingUpdate is an in-place replacement (individual instances), while ReplacingUpdate is a blue/green at the ASG level.

---

**Question 7.** What is the most accurate reason CFN drift detection does not provide automatic remediation?

A) A technical limitation
B) Drift may be an emergency patch or a mistake, so automatic restoration risks causing a bigger incident — responsibilities are separated: CFN handles detection/notification, and automatic remediation is handled by the AWS Config rule remediation action
C) Prohibited by AWS policy
D) A cost issue

**Answer: B**

Explanation: If automatic remediation runs during incident response, it reverts an emergency patch that the operator applied by hand and worsens the outage. That is why the design is conservative — CFN only detects, and automatic restoration happens only when an explicit automation policy is registered with Config rules + an SSM Automation document. It is a classic case of separation of concerns and safety-first design. The standard is a three-tier setup: CloudTrail for change tracking, Config for evaluation, and SSM Automation for restoration.

---

## 📌 Today's Summary

The five key takeaways from today are as follows. First, nested stacks (tight coupling, one transaction) and cross-stack (loose coupling, independent lifecycles) are an IaC application of the 1968 coupling principle. Second, an export is locked while in use, so switching to Parameter Store is recommended. Third, a dynamic reference is a fetch, not a synchronization, and drift detection cannot catch it. Fourth, stack policy / termination protection / DeletionPolicy / UpdateReplacePolicy are protection layers at different points in time and should be used together as defense in depth. Fifth, drift detection intentionally only detects, and automatic remediation is separated out to Config rules + SSM Automation.
