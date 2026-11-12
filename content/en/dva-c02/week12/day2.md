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

## 📝 Practice Questions

**Question 1.** You want to modify and apply the template of a production stack. How can you discover in advance that RDS would be unintentionally replaced, causing data loss?

A) Update the stack right away and see the result

B) Create a Change Set, review whether there is a Replacement, and then execute it

C) Run drift detection

D) Turn on Termination Protection

**Answer: B**

Explanation: A **Change Set** shows, before the update is actually applied, whether each resource will be added, modified, deleted, or **replaced (Replacement: True)**. If RDS is replaced, a new empty DB is created and data can be lost, so with a Change Set you can check "Replacement: True" in advance and stop. A) If you update right away, it is already too late by the time you find out. C) Drift detection looks at differences from console changes that have already happened; it does not predict update results. D) Termination Protection only prevents stack deletion and does not prevent replacement during an update.

---

**Question 2.** When creating a CloudFormation stack, two security groups reference each other and a "circular dependency" error occurred. What is the correct fix?

A) Add DependsOn to both sides

B) Split the inline ingress rules into separate AWS::EC2::SecurityGroupIngress resources

C) Merge the two security groups into one

D) Change the Region

**Answer: B**

Explanation: When two resources reference each other, a cycle forms in the dependency graph, so topological sorting is impossible and creation fails. If you do not keep the security group rules inline and instead separate them into **separate `AWS::EC2::SecurityGroupIngress` resources**, the security groups themselves no longer reference each other and only the rules link the two later, which breaks the cycle. A) DependsOn only adds explicit dependencies and cannot resolve a cycle (it actually makes it worse). C) Merging breaks isolation and is not always possible. D) It has nothing to do with the Region.

---

**Question 3.** You want to preserve the production RDS database inside a stack even if the stack is deleted. What is the appropriate setting?

A) Enable Termination Protection

B) Set DeletionPolicy: Retain on the resource

C) Deny Update:Delete with a Stack Policy

D) Remove the delete permission with IAM

**Answer: B**

Explanation: If you apply **`DeletionPolicy: Retain`** to the RDS resource, the resource is not deleted and remains as is even when the stack is deleted (data preserved). Use `Snapshot` if you want a snapshot. A) Termination Protection only prevents deletion of the stack itself; it is a different concept from preserving resources when the stack is deleted normally. C) A Stack Policy protects during update operations, not resource preservation at stack deletion time. D) IAM only blocks "who" deletes; it is not a resource preservation mechanism.

---

**Question 4.** You want to reference, in an application stack, the VPC ID exported by a network stack. What are the correct function and its constraint?

A) !Ref vpc-id, possible in all Regions

B) Retrieved with !ImportValue, and only possible within the same Region and the same account

C) !GetAtt vpc.Id, cross-Region possible

D) !FindInMap, cross-account possible

**Answer: B**

Explanation: A value that another stack has `Export`ed in `Outputs` is retrieved with **`!ImportValue`**. However, this mechanism works **only between stacks in the same Region and the same account**; cross-Region or cross-account is not supported. Also, while an Import exists, the original Export cannot be changed or deleted, which creates tight coupling. A) !Ref references resources/parameters within the same template. C) !GetAtt references attributes within the same template and does not provide cross-Region. D) !FindInMap looks up a mapping and is irrelevant.

---

**Question 5.** You create an EC2 instance with CloudFormation and bootstrap the application with UserData, but the stack finishes as "successful" even if the script fails. How can you make CloudFormation wait for bootstrap completion?

A) Add DependsOn

B) Use CreationPolicy + cfn-signal to send a bootstrap completion signal

C) DeletionPolicy: Retain

D) Set a Stack Policy

**Answer: B**

Explanation: By default, CloudFormation considers it a "success" when the EC2 creation API succeeds, and does not know whether the application **inside** the instance actually came up. If you apply a **`CreationPolicy`** and have the bootstrap send a success signal with **`cfn-signal`** at the end, CloudFormation waits for that signal (or the timeout) before marking completion. If the signal does not arrive, it is treated as a failure and rolls back. A) DependsOn is only ordering between resources and does not wait for internal bootstrap completion. C and D have nothing to do with the bootstrap signal.

---

**Question 6.** An operator modified a security group by hand in the console. How can you check the difference between the CloudFormation template and the actual resource?

A) Create a Change Set

B) Run Drift Detection

C) Update the stack

D) Termination Protection

**Answer: B**

Explanation: **Drift detection** compares the state the template expects with the actual resource state and finds manual changes (drift) made through the console and so on. However, it is not automatic and must be run explicitly; if you need continuous, automatic detection, combine it with AWS Config. A) A Change Set shows what a "future update" would change, not the current mismatch. C) A stack update actually risks overwriting the console changes. D) Termination Protection only prevents deletion.

---

**Question 7.** Which statement about CloudFormation's automatic rollback behavior is the most accurate?

A) If a resource fails during creation, it leaves everything created so far as is and stops

B) If creation/update fails, it reverts to the last stable state, which is similar to the atomicity of a transaction

C) Rollback always succeeds 100%

D) Rollback can only be started manually by the user

**Answer: B**

Explanation: When creation or an update fails, CloudFormation **automatically rolls back to the last stable state**, so unlike an imperative script it does not leave things in a half-finished state. This is a guarantee similar to the **atomicity** of a DB transaction (all succeed or all are canceled). A) It does not leave things as is; it reverts them. C) It does not always succeed: if it falls into `ROLLBACK_FAILED` because of, for example, a non-empty S3 bucket, manual cleanup followed by `ContinueUpdateRollback` is required. D) Rollback starts automatically on failure.
