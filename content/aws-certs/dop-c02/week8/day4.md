# Day 4 - CDK·CDK Pipelines·Terraform: 모던 IaC 도구의 깊은 비교와 자기 진화하는 파이프라인

CloudFormation 템플릿이 3000줄을 넘은 어느 순간, 개발자는 같은 질문을 던지기 시작한다. "이게 정말 코드인가?" YAML에는 함수도 없고, 변수 스코프도 없고, 자동완성도 약하고, 50개 마이크로서비스에 같은 패턴을 반복 적용하려면 복붙 외엔 답이 없다. 2018년 AWS가 발표한 **CDK(Cloud Development Kit)**는 정확히 이 한계를 풀려는 시도다. TypeScript/Python/Java/Go/.NET 같은 범용 언어로 인프라를 정의하고 `cdk synth`로 평범한 CloudFormation 템플릿을 합성(synthesize)한다. SAM이 CloudFormation 위에 매크로를 얹었다면, CDK는 한 계단 더 올라가 **언어 자체를 추상화 도구로 쓴다**.

오늘은 CDK Construct의 L1/L2/L3 계층이 왜 존재하는지, `cdk bootstrap`이 만드는 IAM 신뢰 체인의 보안적 의미, CDK Pipelines의 self-mutation이 왜 게임 체인저인지, Terraform과 CDK가 동시에 운영되는 현실의 패턴, CDKTF의 위치, 그리고 CDK Aspects가 cross-cutting concern을 어떻게 다루는지를 본다. DOP 시험에서 CDK 직접 출제는 중간이지만 CDK Pipelines + Multi-Account 시나리오는 자주 나온다.

## CDK의 본질 — 코드로 인프라를 "합성"하는 것

CDK를 처음 접하면 "Pulumi와 똑같은데?"라고 생각하기 쉽다. 둘 다 범용 언어로 인프라를 정의한다. 그런데 결정적 차이가 있다 — **CDK는 코드를 실행해 CloudFormation 템플릿(JSON/YAML)을 생성하고, 그 템플릿을 CFN 엔진에 넘겨 배포한다**. Pulumi는 자체 엔진이 코드 그래프를 직접 해석해 AWS API를 호출한다.

이 차이가 운영 모델 전체를 결정한다. CDK는 **CFN의 모든 거버넌스 자산(StackSets, Drift Detection, ChangeSet, Service Catalog, Config compliance)을 그대로 물려받는다**. Pulumi는 자체 엔진의 별도 거버넌스 도구를 써야 한다. 그래서 AWS-only 환경에서 큰 조직은 CDK를, 멀티 클라우드 환경에서는 Pulumi 또는 Terraform을 선호하는 경향이 있다.

```
CDK 코드 (TypeScript)
     │ cdk synth
     ▼
CloudFormation 템플릿 (YAML/JSON)
     │ cdk deploy
     ▼
CloudFormation 엔진 (AWS 관리형)
     │ Drift / ChangeSet / StackSet / Service Catalog 가능
     ▼
실제 AWS 리소스
```

이 구조 덕분에 CDK는 단일 신뢰 source처럼 보이지만 실제로는 **두 단계의 추상화**다. 첫째, CDK 코드에서 Construct 트리로(In-memory object graph). 둘째, Construct 트리에서 CFN 템플릿으로(synth). 그래서 `cdk diff`로 변경 미리보기를 볼 때 두 단계의 결과를 한 번에 봐야 한다 — 어떤 변경은 코드 수준의 의도이고, 어떤 변경은 합성 후의 CFN 변경이다.

> 💡 **관련 이론**: CDK의 합성 모델은 LLVM 컴파일러의 IR(Intermediate Representation) 패턴과 같다. 고수준 언어(C++/Rust)를 IR(LLVM bitcode)로 컴파일하고, IR을 각 타겟(x86, ARM)으로 변환한다. CDK는 TypeScript를 IR(Construct 트리)로 컴파일하고, IR을 CFN 템플릿으로 변환한다. 이 두 단계 덕분에 cdktf(Construct 트리를 Terraform HCL로 변환), cdk8s(Construct 트리를 Kubernetes manifest로 변환) 같은 다른 합성 타겟이 가능했다. 한 번 구축한 추상화가 여러 백엔드로 확장.

## Construct Levels L1/L2/L3 — 추상화의 세 계단

CDK의 가장 강력한 디자인 결정이 Construct Level의 분리다. 같은 S3 버킷을 세 가지 추상화로 표현할 수 있다.

```typescript
// L1 — CloudFormation 1:1 매핑 (Cfn 접두사)
new s3.CfnBucket(this, 'Raw', {
  bucketName: 'my-bucket',
  bucketEncryption: {
    serverSideEncryptionConfiguration: [{
      serverSideEncryptionByDefault: { sseAlgorithm: 'AES256' }
    }]
  }
});

// L2 — 합리적 기본값 + 메서드 (가장 자주 사용)
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
bucket.grantRead(myLambda);          // IAM 정책 자동 생성
bucket.addEventNotification(...);    // S3 이벤트 + Lambda 권한 자동 처리

// L3 — 패턴 (여러 리소스 묶음)
new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Web', {
  taskImageOptions: { image: ecs.ContainerImage.fromRegistry('nginx') },
  publicLoadBalancer: true,
  desiredCount: 3,
});
// 자동 생성: VPC + Subnets + IGW + NAT + ECS Cluster + Fargate Service +
//          Task Definition + ALB + Target Group + Security Groups + IAM Roles
```

| Level | 추상화 | 코드량 | 학습 곡선 | 제어력 |
|-------|--------|--------|----------|--------|
| **L1** (Cfn*) | CFN 1:1 매핑 | 많음 | 낮음(CFN과 동일) | 최대 |
| **L2** | 합리적 기본 + helper | 보통 | 중간 | 높음 |
| **L3** (patterns) | 다수 리소스 묶음 | 적음 | 낮음(API 단순) | 낮음(블랙박스) |

실무에서는 **L2를 기본으로 쓰고, 보안 영향이 큰 부분(IAM Policy, KMS Key Policy)에는 L1으로 정확한 제어**, **반복적 표준 패턴은 자체 L3 Construct로 추출**하는 방식이 일반적이다. 외부 L3(`ApplicationLoadBalancedFargateService` 같은)는 빠른 PoC에는 좋지만 prod에서는 내부 세부사항(보안 그룹 ingress 범위, ALB access log, WAF 연결)을 제어하기 어려워 점차 자체 Construct로 대체된다.

> 🎯 **시나리오**: "팀이 50개 마이크로서비스에 같은 패턴(Lambda + DynamoDB + API Gateway + CloudWatch Alarm + X-Ray)을 배포한다. 한 곳에서 보안 정책을 바꾸면 모든 서비스에 자동 반영되게 하려면?" — 답은 자체 L3 Construct(`StandardLambdaApiPattern`)를 정의하고 모든 서비스가 그걸 사용. 보안 정책 변경은 Construct 한 곳만 수정 → 다음 배포에 50개 서비스 모두 갱신. CFN으로는 모듈 패턴 또는 Nested Stack을 써야 하는데 코드 재사용성에서 CDK가 압도적.

## CDK Bootstrap — 보이지 않는 신뢰 체인

`cdk bootstrap`은 신규 계정·리전에서 CDK를 쓰기 전에 한 번 실행하는 명령이다. 표면적으로는 "S3 버킷, ECR repo 만들기" 정도로 보이지만, 실제로는 **CDK 운영의 모든 신뢰 관계를 설정하는 보안 인프라**다.

```bash
cdk bootstrap aws://111111111111/ap-northeast-2
```

이 한 줄이 만드는 자원들:
- **S3 Asset Bucket** (`cdk-hnb659fds-assets-111-ap-northeast-2`): Lambda zip, CloudFormation 템플릿, Docker 이미지 metadata 저장
- **ECR Repository** (`cdk-hnb659fds-container-assets-111-ap-northeast-2`): Docker 이미지 자산
- **5종의 IAM Role**:
  - `cdk-hnb659fds-deploy-role-*`: 배포 명령을 호출
  - `cdk-hnb659fds-cfn-exec-role-*`: CloudFormation이 사용하는 실행 역할
  - `cdk-hnb659fds-file-publishing-role-*`: S3에 파일 업로드
  - `cdk-hnb659fds-image-publishing-role-*`: ECR에 이미지 푸시
  - `cdk-hnb659fds-lookup-role-*`: AWS 환경 조회(VPC ID 등)
- **CloudFormation Stack `CDKToolkit`**: 위 자원들의 정의

이 구조의 핵심은 **권한 분리**다. CFN 실행 역할(`cfn-exec-role`)이 가장 강력한 권한(AdministratorAccess 기본)을 갖지만, 그 역할은 CloudFormation 서비스만 가정할 수 있다. 사람이나 파이프라인이 가정하는 deploy role은 더 좁은 권한만 가져서 직접 자원을 만들 수 없고 CloudFormation을 통해서만 작업한다.

```bash
# 크로스 계정: Tooling이 Dev/Prod를 신뢰하도록 bootstrap
cdk bootstrap aws://DEV-ACCT/ap-northeast-2 \
  --trust TOOLING-ACCT \
  --trust-for-lookup TOOLING-ACCT \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

`--trust TOOLING-ACCT`는 Dev 계정의 deploy role이 Tooling 계정의 ID도 가정할 수 있게 trust policy를 설정한다. 이게 CDK Pipelines가 한 Tooling 계정에서 여러 환경 계정에 배포할 수 있는 기반이다.

> 🔍 **더 깊이**: bootstrap은 버전이 있다 — `CdkBootstrap`이라는 SSM Parameter에 현재 버전 번호가 저장되고, `cdk deploy` 시 CDK CLI가 이 버전을 확인해 호환성을 검사한다. 오래된 bootstrap을 사용하면 새 CDK 기능(예: Asset Bucket의 KMS 암호화 강화) 사용 불가. AWS는 정기적으로 bootstrap 버전을 업데이트하므로 운영 표준에 "분기마다 cdk bootstrap 재실행"을 포함하는 게 권장된다.

> ⚠️ **함정**: bootstrap의 cfn-exec-role이 기본 AdministratorAccess라는 게 보안 관점에서 자주 지적된다. prod 환경에는 `--cloudformation-execution-policies`로 더 제한된 정책(예: 회사 표준 PowerUser + 명시적 deny)을 지정해야 한다. 그렇지 않으면 CDK 코드의 어떤 변경도 prod에 전권으로 배포될 수 있어 변경 통제가 무력화된다.

## CDK Pipelines — self-mutating의 진짜 의미

CDK Pipelines가 2020년 출시됐을 때 가장 큰 차별점은 **self-mutation**이었다. 일반 CodePipeline은 정의(파이프라인 구조)와 실행이 분리되어, 파이프라인 자체를 바꾸려면 별도 도구(CloudFormation, Terraform)로 파이프라인을 수정해야 한다. CDK Pipelines는 파이프라인이 **자기 자신을 첫 Stage에 포함**해 코드 변경이 다음 실행에 자동 반영된다.

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
  selfMutation: true,  // 기본값
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

이 코드가 만드는 파이프라인의 실제 Stage 순서:

```
1. Source (GitHub/CodeCommit pull)
2. Build (cdk synth → CFN 템플릿 + Asset)
3. UpdatePipeline  ← self-mutating step
   (파이프라인 정의 자체에 변경이 있으면 파이프라인을 자기 자신 update)
4. PublishAssets (Lambda zip → S3, Docker 이미지 → ECR)
5. Dev (CFN deploy to DEV-ACCT)
6. ManualApproval
7. Prod (CFN deploy to PRD-ACCT)
8. SmokeTest
```

3번째 단계가 핵심이다. 만약 개발자가 코드에 새 Stage(예: Staging)를 추가하면, 다음 푸시 시 UpdatePipeline 단계가 파이프라인 자체에 Staging Stage를 추가하고, 그 다음 실행부터 새 Stage가 동작한다. **파이프라인 정의 변경에 별도 도구가 필요 없다**.

> 💡 **관련 이론**: self-mutation은 unix의 `make` bootstrap이나 Lisp의 메타 순환 평가기(Meta-circular Evaluator)와 같은 self-modifying code 패턴이다. 시스템이 자기 자신을 정의하고 진화하는 능력. Tekton Pipelines의 Trigger Templates, ArgoCD의 App-of-Apps 패턴, Spinnaker의 Managed Pipeline Templates도 같은 self-modifying 패턴의 변형들. CDK Pipelines가 GitOps의 핵심 원칙(파이프라인도 코드)을 가장 깔끔하게 구현한 AWS 네이티브 도구.

> 🎯 **시나리오**: "한 회사가 매주 새 환경(고객별 sandbox 5개)을 추가하는데 그때마다 운영자가 파이프라인을 손으로 수정해야 한다. 자동화하려면?" — 답은 CDK Pipelines + CDK 코드에서 환경 목록을 동적 생성(for 루프 또는 외부 설정 파일 읽기). Git에 환경 추가 commit만 하면 self-mutation이 다음 실행에 자동 반영. 일반 CodePipeline + CFN으론 별도 도구나 수동 단계 필요.

## crossAccountKeys — 멀티 계정의 자동 KMS 키 관리

CDK Pipelines로 멀티 계정 배포할 때 `crossAccountKeys: true`가 필수다. 이게 무엇을 자동화하는지 모르면 권한 설정에서 사고가 난다.

CodePipeline은 아티팩트(빌드 결과, 소스 코드)를 S3에 저장하는데, 멀티 계정에서는 그 S3 객체를 다른 계정의 CFN 실행 역할이 읽어야 한다. KMS로 암호화된 객체를 다른 계정이 복호화하려면 KMS Key Policy에 해당 계정의 권한이 명시되어야 한다. `crossAccountKeys: true`가 켜지면 CDK가 자동으로:

1. Tooling 계정에 새 KMS CMK 생성
2. KMS Key Policy에 모든 대상 계정(Dev/Prod)의 cfn-exec-role 권한 자동 추가
3. S3 아티팩트 버킷의 SSE-KMS 설정
4. 각 환경 계정의 신뢰 체인을 통해 복호화 가능

`crossAccountKeys: false`(기본값)이면 AWS 관리형 KMS 키를 쓰는데, 이 키는 다른 계정에 공유할 수 없어 멀티 계정 배포가 실패한다. 이 함정이 "어제까지 잘 되던 CDK Pipeline이 Prod 계정 추가하니까 KMS 에러가 난다" 같은 시나리오로 자주 출제된다.

> ⚠️ **함정**: `crossAccountKeys: true`는 운영자 정의 CMK이므로 **추가 비용**($1/월/key)이 발생한다. 그리고 한 번 켜고 끄면 기존 아티팩트가 복호화 불가하므로 신중하게 결정. 처음부터 멀티 계정 가능성이 있으면 켜고 시작하는 게 표준.

## CDK Aspects — 횡단 관심사를 트리에 주입

CDK Aspects는 OOP의 Aspect-Oriented Programming(AOP)의 IaC 버전이다. 트리 전체를 순회하면서 모든 노드에 횡단적 처리를 적용한다.

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

`Annotations.addError`로 합성(synth) 단계에서 빌드를 실패시킬 수 있다. CFN Hooks가 배포 시점의 차단이라면 **Aspects는 합성 시점의 차단**이다. CI 파이프라인의 더 이른 시점에 실패하므로 피드백이 빠르다.

| 검증 도구 | 시점 | 무엇을 |
|----------|------|--------|
| CDK Aspects | `cdk synth` 시점 | CDK 코드 단계의 정책 위반 |
| cdk-nag | `cdk synth` 시점 | AWS Solutions/HIPAA/NIST 등 규칙 묶음 |
| cfn-lint | 합성 후 CFN 단계 | 템플릿 syntax/best practice |
| CFN Hook | 배포 시점 | 변경 사전 차단 (proactive) |
| Config Rules | 배포 후 | 평가/알람/자동 수정 (reactive) |

> 📚 **사례**: 2022년 한 SaaS가 Aspects 대신 cdk-nag 룰셋(NIST 800-53 Rev5)을 통째로 적용했더니 빌드가 1200개 위반으로 실패했다. 한 번에 모든 룰을 켜는 대신 (1) 가장 자주 위반되는 5개 룰만 enforce, (2) 나머지는 warning으로 6개월간 점진 수정, (3) 단계적으로 enforce 전환하는 graceful rollout으로 운영 마비 없이 안착. Hooks와 마찬가지로 거버넌스 도구 도입은 단계적 접근이 필수.

## Terraform과 CDK의 공존 — CDKTF의 위치

현실의 큰 조직은 한 도구만 쓰지 않는다. **AWS 워크로드는 CDK, 멀티 클라우드 또는 SaaS Provider(GitHub, Datadog, Snowflake)는 Terraform**으로 운영하는 경우가 흔하다. 이 두 도구를 한 시스템에서 다루는 방법이 몇 가지 있다.

1. **물리적 분리**: 디렉토리/팀별로 도구 분리. 가장 단순. 상호 참조는 SSM Parameter Store나 Secret Manager로.
2. **CDKTF**: CDK 구문으로 Terraform HCL 합성. CDK 추상화 + Terraform Provider 생태계.
3. **Terraform CDK + Provider**: 일부 팀이 Terraform을 메인으로 쓰면서 CDK 구문만 도입.

```typescript
// CDKTF — CDK 구문으로 Terraform 코드 생성
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

CDKTF의 장점은 **CDK 코드의 재사용성**과 **Terraform Provider의 풍부함**을 결합하는 것. 단점은 (1) CDK 진영에서는 CFN-native가 빠르고, (2) Terraform 진영에서는 HCL이 표준이라 CDKTF가 양쪽에서 어중간하다는 인식. 시험에는 거의 안 나오지만 실무에서는 종종 마주친다.

| 도구 | AWS 깊이 | 멀티 클라우드 | State 관리 | 시험 비중 |
|------|---------|-------------|----------|----------|
| **CloudFormation** | 최고 | ❌ | AWS 관리 | 매우 높음 |
| **CDK** | 최고 (CFN 합성) | ❌ | AWS 관리 | 중간 |
| **SAM** | 서버리스 특화 | ❌ | AWS 관리 (CFN) | 높음 |
| **Terraform** | 높음 | ✅ | tfstate (사용자 책임) | 낮음 |
| **CDKTF** | 높음 | ✅ | tfstate | 매우 낮음 |
| **Pulumi** | 높음 | ✅ | Pulumi Cloud 또는 자체 | 거의 없음 |

> 🔍 **더 깊이**: Terraform tfstate가 사용자 책임이라는 게 운영에서 가장 큰 차이다. tfstate는 모든 리소스의 실제 상태를 기록하고, 잘못 손상되면 Terraform이 "이 자원을 처음 보는 것"으로 인식해 중복 생성 또는 삭제를 시도한다. 그래서 운영 표준은 (1) S3 버킷 + DynamoDB 잠금으로 원격 저장, (2) S3 versioning + 객체 lock으로 변경 이력 보존, (3) 환경별 workspace 또는 별도 backend로 분리. CDK/CFN은 이 부담이 AWS에 위임되므로 운영 단순성이 높다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **CDK는 합성 모델**로 코드를 CFN 템플릿으로 변환해 CFN의 모든 거버넌스 자산을 물려받는다 — LLVM IR과 같은 두 단계 추상화 패턴. 둘째, **Construct Level L1/L2/L3는 추상화의 세 계단**이고 실무는 L2 기본 + 자체 L3 추출이 표준. 셋째, **bootstrap은 신뢰 체인 인프라**이고 cfn-exec-role의 권한 범위가 prod 보안의 핵심. 넷째, **CDK Pipelines self-mutation**은 파이프라인 정의 변경을 한 도구로 처리하는 GitOps 원칙의 AWS 구현이고, 멀티 계정에는 `crossAccountKeys: true`가 필수. 다섯째, **Aspects + cdk-nag로 합성 시점 검증**, **Hooks로 배포 시점 차단**, **Config Rules로 배포 후 평가**의 3단 검증 계층.

다음 글에서는 Week 8 전체를 통합하는 시나리오 종합문제를 푼다. CFN/SAM/StackSets/Custom Resource/CDK/CDK Pipelines가 한 문제 안에서 어떻게 결합되는지를 본다.

---

## 📝 연습 문제

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
