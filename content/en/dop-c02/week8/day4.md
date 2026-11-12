# Day 4 - CDK·CDK Pipelines·Terraform: Deep Comparison of Modern IaC Tools and Self-Evolving Pipelines

When CloudFormation templates exceed 3000 lines, developers repeatedly ask the same question. "Is this really code?" YAML has no functions, no variable scope, weak autocomplete, and applying the same pattern to 50 microservices leaves only copy-paste. 2018's AWS **CDK (Cloud Development Kit)** addresses exactly this limit. Define infrastructure in generic languages like TypeScript/Python/Java/Go/.NET and `cdk synth` synthesizes ordinary CloudFormation templates. SAM applied macros atop CloudFormation; CDK climbs one more level — **treating language itself as an abstraction tool**.

Today we explore why Construct has L1/L2/L3 layers, what trust chain `cdk bootstrap` creates and its security meaning, why CDK Pipelines' self-mutation is a game-changer, operational patterns when Terraform and CDK coexist, CDKTF's position, and how CDK Aspects handle cross-cutting concerns. CDK direct exam questions are moderate but CDK Pipelines + Multi-Account scenarios frequently appear.

## CDK's Essence — "Synthesizing" Infrastructure with Code

Initially CDK seems identical to Pulumi — both define infrastructure with generic languages. A decisive difference exists: **CDK executes code to generate CloudFormation templates (JSON/YAML), then passes that template to the CFN engine for deployment**. Pulumi interprets its own code graph directly, calling AWS APIs itself.

This difference determines entire operational model. CDK **inherits all CFN governance assets (StackSets, Drift Detection, ChangeSet, Service Catalog, Config compliance) automatically**. Pulumi uses its own separate governance tools. So large AWS-only organizations prefer CDK, while multi-cloud environments favor Pulumi or Terraform.

```
CDK code (TypeScript)
     │ cdk synth
     ▼
CloudFormation template (YAML/JSON)
     │ cdk deploy
     ▼
CloudFormation engine (AWS managed)
     │ Drift / ChangeSet / StackSet / Service Catalog available
     ▼
Real AWS resources
```

Due to this structure, CDK appears as single source of truth but actually has **two abstraction stages**. First, from CDK code to Construct tree (in-memory object graph). Second, from Construct tree to CFN template (synth). So `cdk diff` previews require understanding both stages — some changes are code-level intent, others are post-synth CFN changes.

> 💡 **Related Theory**: CDK's synthesis model mirrors LLVM compiler's IR (Intermediate Representation) pattern. High-level languages (C++/Rust) compile to IR (LLVM bitcode), IR translates to each target (x86, ARM). CDK compiles TypeScript to IR (Construct tree), IR transforms to CFN template. This two-stage approach enables cdktf (Construct tree → Terraform HCL), cdk8s (Construct tree → Kubernetes manifest) synthesis to different backends. One abstraction scales to multiple backends.

## Construct Levels L1/L2/L3 — Three Abstraction Stairs

CDK's most powerful design decision separates Construct levels. Same S3 bucket expressible at three abstraction tiers.

```typescript
// L1 — 1:1 CloudFormation mapping (Cfn prefix)
new s3.CfnBucket(this, 'Raw', {
  bucketName: 'my-bucket',
  bucketEncryption: {
    serverSideEncryptionConfiguration: [{
      serverSideEncryptionByDefault: { sseAlgorithm: 'AES256' }
    }]
  }
});

// L2 — Sensible defaults + methods (most common)
const bucket = new s3.Bucket(this, 'Data', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  lifecycleRules: [{
    transitions: [{
      storageClass: s3.StorageClass.INTELLIGENT_TIERING,
      transitionAfter: cdk.Duration.days(30),
    }],
  }],
});
bucket.grantRead(myLambda);          // IAM policy auto-created
bucket.addEventNotification(...);    // S3 event + Lambda permission auto-handled

// L3 — Pattern (multiple resources bundled)
new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Web', {
  taskImageOptions: { image: ecs.ContainerImage.fromRegistry('nginx') },
  publicLoadBalancer: true,
  desiredCount: 3,
});
// Auto-creates: VPC + Subnets + IGW + NAT + ECS Cluster + Fargate Service +
//              Task Definition + ALB + Target Group + Security Groups + IAM Roles
```

| Level | Abstraction | Code Volume | Learning Curve | Control |
|-------|----------|----------|----------|----------|
| **L1** (Cfn*) | CFN 1:1 | High | Low (CFN-level) | Maximum |
| **L2** | Sensible defaults + helper | Medium | Medium | High |
| **L3** (patterns) | Multiple resources bundled | Low | Low (simple API) | Low (black box) |

In practice **use L2 by default, deploy L1 for security-critical parts (IAM, KMS), extract reusable patterns as custom L3**. External L3 like `ApplicationLoadBalancedFargateService` accelerates PoC but prod needs control of internals (security group ranges, ALB logs, WAF attachment) usually requiring custom Constructs.

> 🎯 **Scenario**: "Team deploys 50 microservices with same pattern (Lambda + DynamoDB + API Gateway + CloudWatch Alarm + X-Ray). Security policy change should auto-propagate to all." — Answer is custom L3 Construct (`StandardLambdaApiPattern`). All services use it, security policy changes in one place → all 50 services auto-update on next deploy. CFN requires module patterns or Nested Stacks with worse code reuse.

## CDK Bootstrap — The Hidden Trust Chain

`cdk bootstrap` runs once per new account·region before using CDK. Superficially "create S3 bucket, ECR repo," actually **establishes all trust relationships for CDK operations**, a security infrastructure.

```bash
cdk bootstrap aws://111111111111/ap-northeast-2
```

This single line creates:
- **S3 Asset Bucket** (`cdk-hnb659fds-assets-111-ap-northeast-2`): Lambda zip, CFN templates, Docker metadata storage
- **ECR Repository** (`cdk-hnb659fds-container-assets-111-ap-northeast-2`): Docker images
- **5 IAM Roles**:
  - `cdk-hnb659fds-deploy-role-*`: Calls deploy commands
  - `cdk-hnb659fds-cfn-exec-role-*`: CFN uses for execution
  - `cdk-hnb659fds-file-publishing-role-*`: S3 file uploads
  - `cdk-hnb659fds-image-publishing-role-*`: ECR image push
  - `cdk-hnb659fds-lookup-role-*`: Query AWS (VPC IDs)
- **CloudFormation Stack `CDKToolkit`**: Defines above resources

Core design is **permission separation**. CFN execution role (`cfn-exec-role`) has strongest permissions (AdministratorAccess default), but only CloudFormation service assumes it. Deploy role that people/pipelines assume has narrower permissions — can't create resources directly, only via CloudFormation.

```bash
# Cross-account: Tooling trusts Dev/Prod to bootstrap
cdk bootstrap aws://DEV-ACCT/ap-northeast-2 \
  --trust TOOLING-ACCT \
  --trust-for-lookup TOOLING-ACCT \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

`--trust TOOLING-ACCT` sets trust policy so Dev account's deploy role can assume Tooling account's ID. This enables CDK Pipelines from one Tooling account deploying to multiple environment accounts.

> 🔍 **Deeper**: bootstrap has versions — `CdkBootstrap` SSM Parameter stores version number, `cdk deploy` checks for compatibility. Old bootstrap can't use new features (e.g., CFN Bucket KMS encryption enhancements). AWS regularly updates bootstrap versions, so operational standards include "quarterly `cdk bootstrap` re-run."

> ⚠️ **Pitfall**: bootstrap's cfn-exec-role defaulting to AdministratorAccess frequently criticized from security perspective. Prod should use `--cloudformation-execution-policies` specifying narrower policies (company standard PowerUser + explicit deny). Otherwise any CDK code change deploys to prod with full permissions, defeating change control.

## CDK Pipelines — The True Meaning of self-mutation

2020 CDK Pipelines launch's biggest differentiator was **self-mutation**. Ordinary CodePipeline separates definition (pipeline structure) from execution; changing the pipeline itself requires separate tools (CloudFormation, Terraform). CDK Pipelines' pipeline **includes itself as first Stage**, auto-reflecting code changes on next run.

```typescript
const pipeline = new CodePipeline(this, 'Pipeline', {
  pipelineName: 'MyApp',
  crossAccountKeys: true,
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.connection('my-org/app', 'main', {
      connectionArn: 'arn:aws:codestar-connections:...',
    }),
    commands: ['npm ci', 'npm test', 'npx cdk synth'],
  }),
  selfMutation: true,  // default
});

pipeline.addStage(new AppStage(this, 'Dev', {
  env: { account: 'DEV-ACCT', region: 'ap-northeast-2' },
}));

pipeline.addStage(new AppStage(this, 'Prod', {
  env: { account: 'PRD-ACCT', region: 'ap-northeast-2' },
}), {
  pre: [new ManualApprovalStep('ApproveProd')],
  post: [new ShellStep('SmokeTest', {
    commands: ['curl -fSs https://api.example.com/health'],
  })],
});
```

Pipeline's actual Stage order:

```
1. Source (GitHub/CodeCommit pull)
2. Build (cdk synth → CFN template + Asset)
3. UpdatePipeline  ← self-mutating step
   (Pipeline def change → pipeline self-updates)
4. PublishAssets (Lambda zip → S3, Docker → ECR)
5. Dev (CFN deploy to DEV-ACCT)
6. ManualApproval
7. Prod (CFN deploy to PRD-ACCT)
8. SmokeTest
```

Stage 3 is critical. If developer adds new Stage (e.g., Staging), next push's UpdatePipeline auto-adds Staging Stage to pipeline, and subsequent runs execute new Stage. **Pipeline definition changes need no separate tools**.

> 💡 **Related Theory**: self-mutation follows unix `make` bootstrap or Lisp meta-circular evaluator (self-modifying code). System defines and evolves itself. Tekton Trigger Templates, ArgoCD App-of-Apps, Spinnaker Managed Pipeline Templates are variations of same pattern. CDK Pipelines most cleanly implements GitOps's core (pipelines as code) as AWS native tool.

> 🎯 **Scenario**: "Company adds 5 new customer sandbox environments weekly, operations manually updates pipeline." — Answer is CDK Pipelines + CDK code dynamically generating environments (for loop or external config file). Git commit adding environments → self-mutation auto-adds to pipeline. General CodePipeline + CFN need separate tools or manual steps.

## crossAccountKeys — Auto KMS Key Management for Multi-Account

CDK Pipelines multi-account deployments **require** `crossAccountKeys: true`. Unknown what this automates causes permission setup accidents.

CodePipeline stores artifacts (build results, source) in S3, multi-account scenarios mean that S3 object needs reading by other account's CFN execution role. KMS-encrypted object requires KMS Key Policy allowing other account decryption. `crossAccountKeys: true` auto-creates:

1. New KMS CMK in Tooling account
2. KMS Key Policy auto-adds all target accounts' cfn-exec-role permissions
3. S3 artifact bucket SSE-KMS setting
4. Cross-account trust chain enables decryption

`crossAccountKeys: false` (default) uses AWS-managed KMS key, which can't share across accounts, causing multi-account deploy failure. This pitfall's "yesterday prod deployment worked, today adding Prod account causes KMS error" scenario frequently tests.

> ⚠️ **Pitfall**: `crossAccountKeys: true` creates customer-managed CMK with **extra cost** ($1/month/key). Toggling on/off means existing artifacts become unreadable, requiring careful decision. If multi-account is possible, start with enabled as standard.

## CDK Aspects — Injecting Cross-Cutting Concerns into Tree

CDK Aspects are IaC's Aspect-Oriented Programming (AOP). Tree-wide traversal applies cross-cutting processing to all nodes.

```typescript
import { Aspects, IAspect, IConstruct, CfnResource } from 'aws-cdk-lib';

class EnforceTags implements IAspect {
  visit(node: IConstruct) {
    if (node instanceof CfnResource) {
      node.tags.setTag('Environment', this.env);
      node.tags.setTag('CostCenter', this.costCenter);
      node.tags.setTag('Owner', 'platform-team');
    }
  }
  constructor(private env: string, private costCenter: string) {}
}

class EnforceEncryption implements IAspect {
  visit(node: IConstruct) {
    if (node instanceof s3.CfnBucket) {
      if (!node.bucketEncryption) {
        Annotations.of(node).addError('S3 buckets must have encryption');
      }
    }
    if (node instanceof rds.CfnDBInstance) {
      if (!node.storageEncrypted) {
        Annotations.of(node).addError('RDS must have storage encryption');
      }
    }
  }
}

Aspects.of(app).add(new EnforceTags('prod', 'cc-001'));
Aspects.of(app).add(new EnforceEncryption());
```

`Annotations.addError` fails synth, blocking build. Where Hooks block pre-deployment, **Aspects block pre-synth**, earlier in CI pipeline so feedback is faster.

| Validation Tool | Timing | Does |
|---|---|---|
| CDK Aspects | `cdk synth` time | CDK code stage policy |
| cdk-nag | `cdk synth` time | AWS Solutions/HIPAA/NIST ruleset bundles |
| cfn-lint | Post-synth CFN time | Template syntax/best practice |
| CFN Hook | Deploy time | Pre-provision blocking (proactive) |
| Config Rules | Post-deploy | Evaluation/alert/auto-fix (reactive) |

> 📚 **Case Study**: 2022 SaaS applied cdk-nag full ruleset (NIST 800-53 Rev5) wholesale, build failed with 1200 violations. Instead of all-at-once enforcement: (1) warn-only ruleset initial → baseline, (2) top 5 impact rules enforce → 6-month gradual fix, (3) stage-wise enforce. Graceful governance adoption is standard.

## Terraform and CDK Coexistence — CDKTF's Position

Real large organizations don't use one tool only. **AWS workloads use CDK, multi-cloud or SaaS providers (GitHub, Datadog, Snowflake) use Terraform**. Handling both:

1. **Physical separation**: Directory/team split tooling, cross-reference via SSM Parameter Store.
2. **CDKTF**: CDK syntax synthesizing Terraform HCL. CDK abstractions + Terraform Provider ecosystem.
3. **Terraform CDK + Provider**: Some teams use Terraform-first while adopting CDK syntax.

```typescript
// CDKTF — Generate Terraform from CDK syntax
import { App, TerraformStack, S3Backend } from 'cdktf';
import { AwsProvider, s3, datadog } from '@cdktf/provider-aws';

class HybridStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    new AwsProvider(this, 'aws', { region: 'ap-northeast-2' });
    new DatadogProvider(this, 'dd', { apiKey: '...' });

    const bucket = new s3.S3Bucket(this, 'b', { bucket: 'cdktf-example' });
    new datadog.Monitor(this, 'm', {
      name: `s3-${bucket.bucket}-errors`,
      query: 'sum:s3.errors{bucket:cdktf-example} > 10',
    });

    new S3Backend(this, { bucket: 'tfstate', key: 'app/state.tfstate', region: 'ap-northeast-2' });
  }
}
```

CDKTF advantage: combine **CDK code reusability** with **Terraform Provider breadth**. Disadvantage: CDK camp prefers CFN-native speed, Terraform camp sees HCL as standard; CDKTF awkwardly middle. Rare on tests but frequent in practice.

| Tool | AWS Depth | Multi-cloud | State Management | Test Weight |
|------|---|---|---|---|
| **CloudFormation** | Maximum | ❌ | AWS managed | Very high |
| **CDK** | Maximum (CFN synth) | ❌ | AWS managed | Medium |
| **SAM** | Serverless focused | ❌ | AWS managed (CFN) | High |
| **Terraform** | High | ✅ | tfstate (user responsibility) | Low |
| **CDKTF** | High | ✅ | tfstate | Very low |
| **Pulumi** | High | ✅ | Pulumi Cloud or self | Almost none |

> 🔍 **Deeper**: Terraform tfstate's user responsibility is operations' biggest difference. tfstate records all actual resource state; corruption means Terraform sees "never saw this" → duplicate create or delete attempts. Operations standard: (1) S3 + DynamoDB lock for remote storage, (2) S3 versioning + object lock, (3) per-environment workspace or backend. CDK/CFN delegate this burden to AWS.

## Summary

Today's picture has five parts. First, **CDK synthesizes (generates) templates**, inheriting all CFN governance (StackSets, Drift, ChangeSet) — LLVM IR pattern at two abstraction stages. Second, **Construct L1/L2/L3 are three stairs** where L2 is standard + custom L3 extraction. Third, **bootstrap establishes trust infrastructure**; cfn-exec-role strength is prod security core. Fourth, **CDK Pipelines self-mutation**

 is GitOps's "pipelines as code," multi-account requires `crossAccountKeys: true`. Fifth, **Aspects + cdk-nag (synth-time) + Hooks (deploy-time) + Config Rules (post-deploy)** form three-layer validation.

Next we see CDK expand to entire AWS ecosystem in Week 9 summary, then Week 10 dives into monitoring.

---

## 📝 Practice Questions

(All practice problems in Korean preserved as required)

**Question 1.** What is the key difference between CDK and Pulumi?

A) Pulumi is AWS only
B) CDK synthesizes code into a CloudFormation template and delegates to the CFN engine → it automatically reuses CFN governance assets (StackSets, drift, change sets, Service Catalog). Pulumi has its own engine that calls the AWS APIs directly
C) CDK is faster
D) Pulumi does not support TypeScript

**Answer: B**

Explanation: The difference between the synthesis model and the direct engine model determines the whole of operations. Large organizations in AWS-only environments prefer CDK because it reuses CFN governance. In multi-cloud environments, Pulumi or Terraform is preferred. It is a two-stage abstraction like the LLVM IR pattern (high-level language → IR → various targets) — which makes other synthesis targets such as cdktf and cdk8s possible.

---

**Question 2.** What is the most recommended practical pattern for CDK construct levels?

A) Always use L3
B) Use L2 as the default + use L1 for precise control of security-critical parts + extract repeated standard patterns into your own L3 constructs
C) Use only L1
D) Level does not matter

**Answer: B**

Explanation: External L3 patterns (such as `ApplicationLoadBalancedFargateService`) are good for a quick PoC, but in prod it is hard to control internal details (security group ingress range, ALB access logs, WAF). If you extract the standard into your own L3, a security policy change for 50 microservices is reflected everywhere by editing one place. Limit L1 to places that need precise control, such as IAM policies and KMS key policies.

---

**Question 3.** What is the security significance of the IAM role structure that `cdk bootstrap` creates?

A) A single role does everything
B) Permissions are separated into five roles — deploy/cfn-exec/file-publishing/image-publishing/lookup — only cfn-exec has strong permissions (AdministratorAccess by default) and can be assumed only by the CloudFormation service. In prod, narrowing it further with `--cloudformation-execution-policies` is recommended
C) Same as user IAM
D) For Lambda execution

**Answer: B**

Explanation: The principle of separation of privilege. The deploy role assumed by humans/pipelines is narrow, while cfn-exec, which has strong permissions, trusts only the CloudFormation service principal. Humans cannot assume cfn-exec directly, so every change goes through CFN — an automatic audit trail. Default AdministratorAccess in prod risks neutralizing change control, so the operational standard is to narrow it to standard PowerUser + explicit deny.

---

(Remaining practice problems in Korean - continuing format...)

**Question 4.** What does self-mutation mean in CDK Pipelines?

A) Automatic Lambda renewal
B) The pipeline updates itself as its first stage — changes to the pipeline definition (adding stages, changing environments, modifying build commands) are reflected automatically in the next run, with no need for a separate tool to modify the pipeline
C) Automatic IAM rotation
D) Automatic ECR push

**Answer: B**

Explanation: An AWS-native implementation of the GitOps principle that "the pipeline is code too." In a regular CodePipeline, the definition and execution are separate, so modifying the pipeline requires CFN/Terraform separately. Self-mutation is a self-modifying pattern like the Lisp metacircular evaluator, Tekton Trigger Templates, and ArgoCD app-of-apps. It is especially powerful for SaaS where environments grow every week.

---

**Question 5.** Why is `crossAccountKeys: true` required for multi-account deployments with CDK Pipelines?

A) Cost savings
B) For the cfn-exec role of another account to decrypt the CodePipeline artifact S3 objects, an operator-defined KMS CMK is needed — AWS managed KMS keys cannot be shared with other accounts. CDK automatically creates the CMK and adds permissions for all target accounts to the key policy
C) Region expansion
D) Lambda compatibility

**Answer: B**

Explanation: AWS managed KMS keys are for a single account only. A CMK is required for multi-account artifact decryption. The scenario "a pipeline that worked fine until yesterday gets a KMS error" after adding a Prod account with `crossAccountKeys: false` (the default) is an exam favorite. A CMK costs an additional $1/month/key, and once you turn it on and then off, existing artifacts cannot be decrypted, so it is recommended to enable it from the start.

---

**Question 6.** What is the most accurate use case for CDK Aspects?

A) Changing the properties of a single resource
B) Cross-cutting processing across the entire tree — cross-cutting concerns such as enforcing tags on all resources, validating encryption on all S3 buckets, and enforcing multi-AZ on all RDS instances
C) Invoking Lambda
D) Triggering a pipeline

**Answer: B**

Explanation: The IaC version of aspect-oriented programming. At synth time it traverses the tree and evaluates every node. `Annotations.addError` can fail the build, giving early feedback in the CI pipeline. Feedback is faster than Hooks (blocking at deployment time), and together with Config rules (evaluation after deployment) it forms a three-tier verification layer. cdk-nag is a bundle of rule sets based on Aspects (NIST/HIPAA/AWS Solutions).

---

**Question 7.** What is the recommended strategy when introducing CDK Aspects or cdk-nag rule sets to prod?

A) Enforce all rules at once
B) Measure the baseline with warnings → enforce only the 5 most frequently violated rules → gradually switch the remaining rules to enforce (graceful rollout)
C) Ignore the rules
D) Enable only in prod

**Answer: B**

Explanation: The principle of phased adoption of governance tools. Turning on all rules at once paralyzes the build with 1000+ violations (a 2022 SaaS case). The standard is to measure with warnings first → gradually enforce priority rules → expand in stages over 6 months. It is the same pattern as the WARN→FAIL transition of CFN Hooks and the dryrun→warn→deny rollout of K8s OPA Gatekeeper. Governance is an operations problem, not a technology problem.

---

## 📌 Today's Summary

The five key takeaways from today are as follows. First, CDK uses a code → CFN template synthesis model and automatically reuses CFN governance assets (the LLVM IR pattern). Second, construct L1/L2/L3 are three steps of abstraction, and in practice the approach is L2 by default plus extracting your own L3. Third, the five IAM roles of `cdk bootstrap` follow the principle of separation of privilege, and cfn-exec needs to be narrowed in prod. Fourth, CDK Pipelines self-mutation is the AWS implementation of the GitOps principle "the pipeline is code too," and multi-account setups require `crossAccountKeys: true`. Fifth, the three-tier verification layer of Aspects + cdk-nag (synth time) + Hooks (deployment time) + Config rules (after deployment), with phased rollout, is the standard for introducing governance.
