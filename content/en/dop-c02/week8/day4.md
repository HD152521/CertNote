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

## 📝 연습 문제

(All practice problems in Korean preserved as required)

**문제 1.** CDK가 Pulumi와 다른 핵심 차이는?

A) Pulumi는 AWS 전용
B) CDK는 코드를 CloudFormation 템플릿으로 합성(synth)해 CFN 엔진에 위임 → CFN의 거버넌스(StackSets, Drift, ChangeSet, Service Catalog) 자산 자동 활용. Pulumi는 자체 엔진이 직접 AWS API 호출
C) CDK가 더 빠름
D) Pulumi는 TypeScript 미지원

**정답: B**

해설: 합성 모델 vs 직접 엔진 모델의 차이가 운영 전체를 결정. AWS-only 환경의 큰 조직은 CFN 거버넌스 재사용 때문에 CDK 선호. 멀티 클라우드 환경에서는 Pulumi 또는 Terraform 선호. LLVM IR 패턴(고수준 언어 → IR → 다양한 타겟)과 같은 두 단계 추상화 — 이 덕분에 cdktf, cdk8s 같은 다른 합성 타겟이 가능.

---

**문제 2.** CDK Construct Level의 실무 적용 패턴으로 가장 권장되는 것은?

A) 무조건 L3 사용
B) L2를 기본으로 + 보안 영향 큰 부분은 L1로 정확한 제어 + 반복 표준 패턴은 자체 L3 Construct로 추출
C) L1만 사용
D) Level 무관

**정답: B**

해설: 외부 L3 패턴(`ApplicationLoadBalancedFargateService` 등)은 빠른 PoC에는 좋지만 prod에서 내부 세부사항(보안 그룹 ingress 범위, ALB access log, WAF) 제어 어려움. 자체 L3로 표준 추출하면 50개 마이크로서비스의 보안 정책 변경이 한 곳 수정으로 전체 반영. L1은 IAM Policy/KMS Key Policy 같은 정밀 제어가 필요한 곳에 한정 사용.

---

**문제 3.** `cdk bootstrap`이 만드는 IAM Role 구조의 보안적 의미는?

A) 단일 역할이 모든 일 수행
B) deploy/cfn-exec/file-publishing/image-publishing/lookup의 5종 역할로 권한 분리 — cfn-exec만 강한 권한(기본 AdministratorAccess)을 갖고 CloudFormation 서비스만 가정 가능. prod에선 `--cloudformation-execution-policies`로 더 좁히는 게 권장
C) 사용자 IAM과 동일
D) Lambda 실행용

**정답: B**

해설: 권한 분리 원칙(separation of privilege). 사람/파이프라인이 가정하는 deploy role은 좁고, 강한 권한을 가진 cfn-exec는 CloudFormation 서비스 principal만 신뢰. 사람이 cfn-exec를 직접 가정할 수 없어 모든 변경이 CFN을 통과 — 자동 감사 추적. prod에 기본 AdministratorAccess는 변경 통제 무력화 우려가 있어 표준 PowerUser + 명시적 deny로 좁히는 게 운영 표준.

---

(Remaining practice problems in Korean - continuing format...)

**문제 4.** CDK Pipelines의 self-mutation의 의미는?

A) Lambda 자동 갱신
B) Pipeline이 첫 Stage로 자기 자신 update를 수행 — 파이프라인 정의(Stage 추가, 환경 변경, 빌드 명령 수정)가 다음 실행에 자동 반영, 별도 도구로 파이프라인을 수정할 필요 없음
C) IAM 자동 회전
D) ECR 자동 푸시

**정답: B**

해설: GitOps "파이프라인도 코드" 원칙의 AWS 네이티브 구현. 일반 CodePipeline은 정의와 실행이 분리되어 파이프라인 수정에 CFN/Terraform이 별도로 필요. self-mutation은 Lisp 메타 순환 평가기, Tekton Trigger Templates, ArgoCD App-of-Apps와 같은 self-modifying 패턴. 매주 환경이 늘어나는 SaaS에서 특히 강력.

---

**문제 5.** CDK Pipelines로 멀티 계정 배포 시 `crossAccountKeys: true`가 필수인 이유는?

A) 비용 절감
B) CodePipeline 아티팩트 S3 객체를 다른 계정 cfn-exec-role이 복호화하려면 운영자 정의 KMS CMK가 필요 — AWS 관리형 KMS는 다른 계정에 공유 불가. CDK가 자동으로 CMK 생성 + Key Policy에 모든 대상 계정 권한 추가
C) Region 확장
D) Lambda 호환

**정답: B**

해설: AWS 관리형 KMS 키는 단일 계정 전용. 멀티 계정 아티팩트 복호화에는 CMK 필수. `crossAccountKeys: false`(기본)에서 Prod 계정 추가 시 "어제까지 잘 되던 Pipeline이 KMS 에러"라는 시나리오가 시험 단골. CMK는 $1/월/key 추가 비용이고 한 번 켜고 끄면 기존 아티팩트 복호화 불가하므로 처음부터 켜고 시작 권장.

---

**문제 6.** CDK Aspects의 가장 정확한 사용 사례는?

A) 단일 리소스 속성 변경
B) 트리 전체 횡단 처리 — 모든 리소스에 태그 강제, 모든 S3에 암호화 검증, 모든 RDS에 multi-AZ 강제 등 cross-cutting concerns
C) Lambda 호출
D) Pipeline 트리거

**정답: B**

해설: Aspect-Oriented Programming의 IaC 버전. 합성(synth) 시점에 트리를 순회하며 모든 노드 평가. `Annotations.addError`로 빌드 실패시킬 수 있어 CI 파이프라인의 이른 시점 피드백. Hooks(배포 시점 차단)보다 더 빠른 피드백, Config Rules(배포 후 평가)와 함께 3단 검증 계층. cdk-nag가 Aspects 기반의 룰셋 묶음(NIST/HIPAA/AWS Solutions).

---

**문제 7.** CDK Aspects 또는 cdk-nag 룰셋을 prod에 도입할 때 권장 전략은?

A) 모든 룰을 한 번에 enforce
B) Warning으로 베이스라인 측정 → 가장 자주 위반되는 5개 룰만 enforce → 단계적으로 나머지 룰 enforce 전환 (graceful rollout)
C) 룰 무시
D) prod에서만 활성화

**정답: B**

해설: 거버넌스 도구의 단계적 도입 원칙. 한 번에 모든 룰 켜면 1000+ 위반으로 빌드 마비(2022 SaaS 사례). 처음엔 warning으로 측정 → 우선순위 룰 점진 enforce → 6개월에 걸쳐 단계적 확장이 표준. CFN Hooks의 WARN→FAIL 전환, K8s OPA Gatekeeper의 dryrun→warn→deny rollout과 같은 패턴. 거버넌스는 기술이 아니라 운영의 문제.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, CDK는 코드 → CFN 템플릿 합성 모델로 CFN 거버넌스 자산 자동 활용(LLVM IR 패턴). 둘째, Construct L1/L2/L3는 추상화 세 계단이고 실무는 L2 기본 + 자체 L3 추출. 셋째, `cdk bootstrap`의 5종 IAM Role은 권한 분리 원칙, cfn-exec는 prod에서 좁힐 필요. 넷째, CDK Pipelines self-mutation은 GitOps "파이프라인도 코드" 원칙의 AWS 구현이고 멀티 계정엔 `crossAccountKeys: true` 필수. 다섯째, Aspects + cdk-nag(합성 시점) + Hooks(배포 시점) + Config Rules(배포 후)의 3단 검증 계층, 단계적 rollout이 거버넌스 도입의 표준.
