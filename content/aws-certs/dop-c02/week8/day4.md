# Day 4 - CDK + Terraform 통합 패턴 + CDK Pipelines

📅 날짜: Week 8 (Day 4)
🎯 주제: 모던 IaC 도구의 통합 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CDK Construct Levels (L1/L2/L3) 차이
- CDK Pipelines로 self-mutating CI/CD
- Terraform과 CDK의 공존 패턴 (CDK for Terraform)
- IaC 도구 선택 매트릭스

---

## 🧩 사전 지식 (CS 기초)

- **Imperative vs Declarative**: 명령형(코드) vs 선언형(상태). CDK는 코드로 선언 정의.
- **Synthesize**: CDK 코드 → CFN 템플릿 변환.
- **Bootstrap**: CDK가 사용할 S3/ECR/IAM 리소스 사전 프로비저닝.
- **Backend state**: Terraform tfstate 파일. S3 + DynamoDB 잠금.

---

## 📖 이론 내용

### 1. CDK Construct Levels

| Level | 예 | 추상화 |
|-------|----|--------|
| **L1** | `CfnBucket` | 원시 CFN 그대로 |
| **L2** | `s3.Bucket` | 합리적 기본값 + 메서드 (grant*, addEventNotification) |
| **L3 (Pattern)** | `ApplicationLoadBalancedFargateService` | 여러 리소스 묶음 (Fargate + ALB + Service Discovery + ...) |

```typescript
// L1 — 원시
new CfnBucket(this, 'Raw', { bucketName: 'x' });

// L2 — 일반적 사용
const bucket = new s3.Bucket(this, 'B', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
});
bucket.grantRead(myLambda);

// L3 — 패턴
new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
  taskImageOptions: { image: ecs.ContainerImage.fromRegistry('nginx') },
  publicLoadBalancer: true,
});
// 자동: VPC + ECS Cluster + Service + Task Def + ALB + Target Group + Security Group
```

### 2. CDK Bootstrap

```bash
cdk bootstrap aws://111/ap-northeast-2
```

생성되는 리소스:
- S3 Asset Bucket (Lambda zip, Docker image manifest 등)
- ECR Repository (Container Image asset)
- IAM Roles (deploy, lookup, file-publishing, image-publishing, cloudformation-execution)
- CloudFormation Stack `CDKToolkit`

크로스 계정/리전 배포 시 각각 bootstrap 필요.

### 3. CDK Pipelines (self-mutating)

```typescript
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';

const pipeline = new CodePipeline(this, 'Pipeline', {
  pipelineName: 'MyApp',
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.connection('my-org/app', 'main', {
      connectionArn: 'arn:aws:codestar-connections:...',
    }),
    commands: ['npm ci', 'npm test', 'npx cdk synth'],
  }),
  selfMutation: true,
});

// 환경별 Stage
const dev = pipeline.addStage(new MyAppStage(this, 'Dev', {
  env: { account: 'DEV', region: 'ap-northeast-2' },
}));

const prod = pipeline.addStage(new MyAppStage(this, 'Prod', {
  env: { account: 'PRD', region: 'ap-northeast-2' },
}), {
  pre: [new ManualApprovalStep('Approve')],
  post: [new ShellStep('SmokeTest', {
    commands: ['curl https://api.example.com/health || exit 1'],
  })],
});
```

**self-mutating의 의미:**
1. Pipeline 첫 실행 시 자기 자신을 첫 Stage로 등록
2. 다음 실행부터: 코드 변경 → Pipeline 자체도 update → 그 다음 일반 Stage들 진행
3. Pipeline 정의 변경이 다음 실행에 자동 반영

### 4. CDK for Terraform (CDKTF)

CDK 구문으로 Terraform 코드 생성:
```typescript
import { Construct } from 'constructs';
import { App, TerraformStack, S3Backend } from 'cdktf';
import { AwsProvider, s3 } from '@cdktf/provider-aws';

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    new AwsProvider(this, 'aws', { region: 'ap-northeast-2' });
    new s3.S3Bucket(this, 'b', { bucket: 'cdktf-example' });
    new S3Backend(this, { bucket: 'tfstate', key: 'app/state.tfstate', region: 'ap-northeast-2' });
  }
}
const app = new App();
new MyStack(app, 'my');
app.synth();
```

CDK 추상화 + Terraform state/Provider 풍부함. 시험에는 잘 안 나옴, 실무에서 종종.

### 5. Terraform + AWS 표준 운영

```hcl
terraform {
  backend "s3" {
    bucket         = "my-tfstate"
    key            = "envs/prod/app.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "tf-locks"      # 동시 변경 잠금
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-northeast-2"
  assume_role {
    role_arn = "arn:aws:iam::111:role/TerraformDeploy"
  }
}

resource "aws_s3_bucket" "data" {
  bucket = "my-data-${terraform.workspace}"
}
```

**핵심 운영 요소:**
- `terraform init`, `plan`, `apply`, `destroy`
- Remote state (S3+DynamoDB 잠금)
- Workspaces (환경별)
- Modules (재사용)
- `terraform import`로 기존 리소스 가져오기

### 6. CDK vs Terraform vs CFN 결정

| 기준 | CDK | Terraform | CloudFormation |
|------|-----|-----------|----------------|
| AWS 깊이 | ✅ | ✅ | ✅ |
| 멀티 클라우드 | ❌ | ✅ | ❌ |
| 언어 | TS/Py/Java/Go/.NET | HCL | YAML/JSON |
| State | CFN 관리 | tfstate (사용자 책임) | CFN 관리 |
| 학습 곡선 | 중 | 중 | 낮음 |
| 변경 감지 | CFN | terraform plan | Change Set |
| 시험 출제 | 중 | 낮음 (직접 거의 X) | 매우 높음 |

### 7. CDK Diff & Approve

```bash
cdk diff   # 변경 사항 미리보기
cdk deploy --require-approval=any-change  # 모든 변경에 승인 요구
cdk deploy --require-approval=broadening  # 보안 영향 변경에만 승인
```

---

## 🧠 알아두면 좋은 심화 이론

### CDK Aspects

전체 트리에 횡단적 처리:
```typescript
import { Aspects, IAspect, IConstruct, CfnResource } from 'aws-cdk-lib';

class EnforceTags implements IAspect {
  visit(node: IConstruct) {
    if (node instanceof CfnResource) {
      node.tags.setTag('Environment', 'prod');
    }
  }
}
Aspects.of(app).add(new EnforceTags());
```

태깅, 보안 검증, 표준 강제에 사용.

### CDK Custom Resource Provider

(Week 8 Day 3 참조) — onEvent + isComplete의 두 Lambda로 비동기 대기 표현.

### Stack Synth Outputs

```bash
cdk synth > template.yaml
```

CFN 템플릿 생성. 외부 도구(CI 검증, OPA Gatekeeper)와 결합 가능.

### CloudFormation 직접 vs CDK

| 항목 | 직접 CFN | CDK |
|------|---------|-----|
| 작은 Stack | 단순 | 과대 |
| 큰 Stack (수백 리소스) | YAML 헬 | 코드로 모듈화 |
| 동적 생성 (for 루프) | 불가 | TypeScript for문 |
| IDE 자동완성 | 약함 | 강함 |

---

## 🏗️ 아키텍처 다이어그램

```
CDK Pipelines Self-Mutation
==================================================

  Git Repo (CDK code + app code)
        │
        │ push
        ▼
  CodePipeline (created by initial cdk deploy)
   ┌──────────────────────────┐
   │ 1. Source                │
   ├──────────────────────────┤
   │ 2. Synth (cdk synth)     │
   ├──────────────────────────┤
   │ 3. UpdatePipeline        │  ← self-mutating step
   │    (updates this pipeline│
   │     itself if changed)   │
   ├──────────────────────────┤
   │ 4. Assets (S3/ECR push)  │
   ├──────────────────────────┤
   │ 5. Dev Stage             │
   │    - CFN deploy          │
   ├──────────────────────────┤
   │ 6. Manual Approval       │
   ├──────────────────────────┤
   │ 7. Prod Stage            │
   │    - CFN deploy          │
   │    - SmokeTest post-step │
   └──────────────────────────┘

  Next push: Pipeline itself can update before downstream stages run.
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ CDK Construct Level L1/L2/L3 — 추상화 단계
2. ⭐ `cdk bootstrap`은 계정×리전 조합마다 1회 필요
3. ⭐ CDK Pipelines `selfMutation: true`로 Pipeline 자체 갱신
4. ⭐ Terraform tfstate는 S3 + DynamoDB 잠금 표준
5. ⭐ CDK Aspects로 횡단적 태그/보안 강제

---

## 💻 실제 예시 - CDK Pipelines + Multi-env

```typescript
// bin/app.ts
import { App } from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline';

const app = new App();
new PipelineStack(app, 'AppPipeline', {
  env: { account: 'TOOLING', region: 'ap-northeast-2' },
});

// lib/pipeline.ts
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { AppStage } from './app-stage';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'AppPipeline',
      crossAccountKeys: true,   // 멀티 계정 시 필수
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection('my-org/app', 'main', {
          connectionArn: 'arn:aws:codestar-connections:...',
        }),
        commands: ['npm ci', 'npm test', 'npx cdk synth'],
      }),
    });

    pipeline.addStage(new AppStage(this, 'Dev', {
      env: { account: 'DEV-ACCT', region: 'ap-northeast-2' },
    }));

    pipeline.addStage(new AppStage(this, 'Prod', {
      env: { account: 'PRD-ACCT', region: 'ap-northeast-2' },
    }), {
      pre: [new ManualApprovalStep('ApproveProd')],
      post: [new ShellStep('SmokeTest', {
        commands: ['curl https://api.example.com/health'],
      })],
    });
  }
}
```

```bash
# 첫 배포 (Tooling 계정에서)
cdk bootstrap aws://TOOLING/ap-northeast-2
cdk bootstrap aws://DEV/ap-northeast-2 \
  --trust TOOLING --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
cdk bootstrap aws://PRD/ap-northeast-2 \
  --trust TOOLING --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
cdk deploy AppPipeline
```

---

## 📝 연습 문제

**문제 1.** CDK L3 Construct (Pattern)의 예는?

A) `CfnBucket`
B) `s3.Bucket`
C) `ApplicationLoadBalancedFargateService` (ALB+ECS+VPC 등 묶음)
D) IAM Policy

**정답: C**
해설: L3 Pattern은 여러 리소스 묶음.

---

**문제 2.** `cdk bootstrap`이 필요한 이유는?

A) IAM User 생성
B) CDK가 사용할 S3 Asset Bucket, ECR, IAM Role 등 사전 프로비저닝
C) Pipeline 자동 생성
D) Region 활성

**정답: B**
해설: Bootstrap이 CDK 의존 리소스 셋업.

---

**문제 3.** CDK Pipelines의 self-mutation은?

A) Pipeline이 자기 자신을 첫 Stage로 — 코드 변경이 다음 실행에 반영
B) Lambda 자동 갱신
C) IAM 자동 회전
D) ECR 자동 푸시

**정답: A**
해설: self-mutating CI/CD의 핵심.

---

**문제 4.** Terraform tfstate 안전 운영의 표준은?

A) 로컬 파일
B) S3 + DynamoDB (잠금) + 암호화
C) Git에 commit
D) Secrets Manager

**정답: B**
해설: tfstate는 절대 git에 두지 않음.

---

**문제 5.** CDK Aspects의 용도는?

A) Lambda 호출
B) 전체 트리에 횡단적 처리 (태그 강제, 보안 검증)
C) IAM 자동 생성
D) Pipeline 트리거

**정답: B**
해설: Aspects = cross-cutting concerns.

---

**문제 6.** CDK Pipelines에서 멀티 계정 배포 시 필수 설정은?

A) `crossAccountKeys: true`
B) S3 단일 버킷
C) 단일 KMS 키
D) Lambda 추가

**정답: A**
해설: Cross-Account KMS 키 자동 생성.

---

**문제 7.** CDKTF (CDK for Terraform)의 이점은?

A) AWS만 지원
B) CDK 구문 + Terraform Provider/State의 멀티 클라우드 + 풍부 Provider
C) Terraform보다 빠름
D) CloudFormation 호환

**정답: B**
해설: 두 도구의 장점 결합.

---

## 📌 오늘의 요약

1. CDK L1/L2/L3 — 추상화 단계, L3 Pattern이 가장 고수준
2. `cdk bootstrap`은 계정×리전마다 1회
3. CDK Pipelines `selfMutation: true`로 self-mutating CI/CD
4. Terraform tfstate는 S3 + DynamoDB 잠금
5. CDK Aspects로 횡단적 태그/보안 강제
