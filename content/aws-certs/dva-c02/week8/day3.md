# Day 38 - CodePipeline: CI/CD 흐름의 지휘자

빌드 도구, 테스트 도구, 배포 도구를 따로 만들었으면 그 다음 문제는 "이걸 어떻게 자동으로 이어 붙일까"다. 한 사람이 매번 손으로 "빌드 끝났으니 테스트 시작", "테스트 통과했으니 배포 시작"을 누르는 건 출시 직전 새벽 3시까지 누군가가 깨어 있어야 하는 비극을 만든다. CodePipeline은 그 비극을 끝내는 도구다. "소스 변경 감지 → 빌드 → 테스트 → 승인 → 배포"라는 흐름을 한 번 정의해두면, 그 다음부터는 코드를 push할 때마다 자동으로 production까지 흘러간다.

DVA-C02 시험에서 CodePipeline 자체의 문법은 많이 묻지 않는다. 대신 **다른 Code* 서비스들과 어떻게 조합되는지**, **수동 승인이 언제 필요한지**, **artifact가 어떻게 단계 간에 흐르는지**, 그리고 2023년 등장한 **V2 파이프라인의 변수와 트리거 필터링**이 출제 포인트다. 이번 글에서는 CodePipeline의 내부 동작 모델, 아티팩트 시스템의 본질, 그리고 크로스 계정/리전 패턴까지 짚는다.

## CodePipeline의 본질: workflow engine, not build tool

CodePipeline은 build tool이 아니다. 빌드 자체는 CodeBuild가 하고, 배포는 CodeDeploy/CloudFormation/ECS가 한다. CodePipeline의 역할은 그것들을 **순서대로**, **조건부로**, **병렬로** 실행하는 워크플로우 엔진이다. AWS Step Functions가 일반 비즈니스 워크플로우용이라면, CodePipeline은 CI/CD 워크플로우에 특화된 형태다.

> 💡 **관련 이론**: 워크플로우 엔진의 역사는 1990년대 BPEL(Business Process Execution Language)로 거슬러 올라간다. "여러 시스템을 순차적/병렬적으로 호출하고 그 결과로 다음 단계를 결정한다"는 모델은 거의 모든 워크플로우 도구의 공통 뿌리다. CodePipeline은 그 모델을 CI/CD에 맞게 단순화한 것 — Stage(단계) → Action(액션) → Transition(전이)의 3층 구조이고, 각 Action은 외부 서비스 호출이다. GitHub Actions의 jobs → steps, GitLab CI의 stages → jobs, Jenkins의 stages → steps 모두 같은 추상화다.

CodePipeline의 데이터 모델:

```
Pipeline (전체 워크플로우)
  └── Stage (논리적 단계: Source, Build, Deploy 등)
        └── Action (구체적 작업: CodeBuild 실행, CodeDeploy 실행, 수동 승인)
              ├── Input Artifacts (이전 단계 산출물)
              ├── Output Artifacts (이 단계 산출물, 다음에 전달)
              ├── Configuration (액션별 파라미터)
              └── Role ARN (이 액션이 사용할 IAM 역할)
```

> 🔍 **더 깊이**: 한 Stage 안에 여러 Action을 두면 **기본적으로 병렬 실행**된다. 순차 실행을 강제하려면 `runOrder` 속성을 다르게 지정한다(runOrder 1 → 2 → 3). 이게 의외로 시험에 나오는데, "한 stage에서 빌드와 보안 스캔을 동시에 돌리고 둘 다 통과해야 다음 stage" 같은 시나리오에서 정답이다.

```json
{
  "name": "BuildAndScan",
  "actions": [
    {
      "name": "Build",
      "runOrder": 1,
      "actionTypeId": { "category": "Build", "provider": "CodeBuild" }
    },
    {
      "name": "SecurityScan",
      "runOrder": 1,    // 같은 runOrder = 병렬
      "actionTypeId": { "category": "Test", "provider": "CodeBuild" }
    },
    {
      "name": "UploadResult",
      "runOrder": 2,    // 위 두 개 완료 후
      "actionTypeId": { "category": "Invoke", "provider": "Lambda" }
    }
  ]
}
```

## 액션 카테고리 6종: 각각 무엇을 하나

CodePipeline은 액션을 6가지 카테고리로 분류한다. 시험에서 가끔 "다음 중 Source 카테고리에 속하지 않는 것은?" 같이 카테고리 분류를 직접 묻는다.

| 카테고리 | 역할 | 대표 Provider |
|----------|------|--------------|
| **Source** | 코드/아티팩트 가져오기 | CodeCommit, GitHub, GitHub Enterprise, BitBucket, S3, ECR, Service Catalog |
| **Build** | 빌드 산출물 생성 | CodeBuild, Jenkins, TeamCity |
| **Test** | 테스트 실행 | CodeBuild, Device Farm, BlazeMeter, Ghost Inspector |
| **Approval** | 수동 승인 게이트 | Manual, ServiceNow Change |
| **Deploy** | 배포 실행 | CodeDeploy, CloudFormation, Elastic Beanstalk, ECS, S3, AppConfig, Service Catalog, AWS OpsWorks |
| **Invoke** | 임의 함수 호출 | Lambda, Step Functions |

> ⚠️ **함정**: "Invoke" 카테고리는 비교적 새로 추가됐는데(2018년 Lambda, 2022년 Step Functions), 시험 문제 중 "임의 검증 로직을 파이프라인 중간에 넣고 싶다"가 나오면 Lambda Invoke가 정답이다. 단순한 검증은 Manual Approval로 사람이 누르지만, "외부 API에서 컴플라이언스 체크 가져오기" 같은 자동화된 검증은 Lambda Invoke를 쓴다.

> 📚 **사례**: Capital One은 internal compliance review를 Lambda Invoke 액션으로 자동화했다고 re:Invent 2019에서 발표했다. 배포 전 ServiceNow의 change ticket 상태를 Lambda가 조회해 "approved" 상태일 때만 다음 단계로 진행. 사람이 매번 ServiceNow 콘솔과 CodePipeline 콘솔을 오가는 비효율을 제거.

## 아티팩트: 단계 간 데이터를 어떻게 흘리는가

CodePipeline의 가장 중요한 개념 중 하나가 아티팩트다. Stage A의 출력이 Stage B의 입력이 되는 메커니즘이고, 이게 S3 기반이라는 점이 시험의 단골 포인트다.

```
[Source Stage]
   Output Artifact: "SourceOutput"
       │ (zip으로 압축돼 S3 artifact bucket에 저장)
       ▼
[Build Stage]
   Input Artifact: "SourceOutput"
       │ (S3에서 다운로드해 CodeBuild 작업 디렉토리에 풀림)
   Output Artifact: "BuildOutput"
       │ (artifacts: 섹션의 파일을 다시 zip해 S3에 저장)
       ▼
[Deploy Stage]
   Input Artifact: "BuildOutput"
```

> 🔍 **더 깊이**: 아티팩트는 **계정·리전당 하나의 S3 bucket**에 저장된다(이름: `codepipeline-<region>-<random>`). 파이프라인을 처음 만들 때 AWS가 자동 생성하지만, 명시적으로 다른 bucket을 지정할 수도 있다. 이 bucket의 access를 제대로 통제하지 않으면 빌드 산출물(소스 코드 zip, Docker 이미지 메타데이터)이 노출될 수 있다. AWS Trusted Advisor의 보안 체크 중 "Amazon S3 Bucket Permissions"가 이 bucket을 자주 잡아낸다.

> ⚠️ **함정**: 아티팩트 bucket은 **반드시 파이프라인과 같은 리전**에 있어야 한다. Cross-Region 배포를 하려면 각 리전마다 별도의 artifact bucket이 필요하고, CodePipeline이 자동으로 복제한다. 이걸 모르고 "us-east-1 artifact를 ap-northeast-2 deploy에 직접 참조"하려고 하면 실패한다.

```yaml
# Cross-Region 배포의 artifact bucket 설정 (CloudFormation 발췌)
Pipeline:
  Type: AWS::CodePipeline::Pipeline
  Properties:
    ArtifactStores:
      - Region: us-east-1
        ArtifactStore:
          Type: S3
          Location: !Ref PrimaryArtifactBucket
      - Region: ap-northeast-2
        ArtifactStore:
          Type: S3
          Location: !Ref SeoulArtifactBucket   # 서울 리전 별도 bucket
```

## 트리거: 파이프라인이 시작되는 4가지 방법

CodePipeline이 어떻게 trigger되는지가 자주 헷갈리는 영역이다. 4가지 방식이 있는데, 권장도와 latency가 다르다.

| 방식 | Latency | 권장 사용처 | 시험 키워드 |
|------|---------|-------------|-------------|
| **EventBridge** (default for AWS sources) | 수 초 | CodeCommit, ECR, S3 변경 | "즉각 자동 시작" |
| **GitHub Webhook** | 수 초 | GitHub push 시 | "GitHub 통합" |
| **Polling** | 최대 1분 | 레거시, 비권장 | "Polling은 비권장" |
| **수동/CLI** | 즉시 | 디버깅, 핫픽스 | "수동 재시작" |

> 💡 **관련 이론**: 2019년 이전에는 CodePipeline이 기본적으로 polling 모델(매 분마다 S3/GitHub 변경 확인)을 썼다. AWS가 EventBridge 기반 push 모델로 전환한 이유는 ① latency 단축 ② API 호출 비용 절감 ③ GitHub rate limit 회피. Polling은 여전히 가능하지만 비권장으로 명시돼 있고, 시험에서 "가장 효율적인 트리거"가 보이면 EventBridge가 답.

## CodePipeline V2: 변수, 트리거 필터, 실행 모드

2023년 10월 출시된 V2는 V1의 한계를 정면 해결했다. V1에서 가장 큰 불편이 ① 단계 간 동적 변수 전달 불가 ② 모든 push마다 파이프라인 실행 ③ 동시 실행 제어 부족이었는데, V2가 모두 풀었다.

### 1. 변수 (Pipeline Variables)

```yaml
# 파이프라인 시작 시 변수 정의
variables:
  - name: Environment
    defaultValue: dev
    description: "Target environment"
  - name: ImageTag
    defaultValue: latest

# 사용
configuration:
  ProjectName: my-build
  EnvironmentVariables: |
    [{"name":"ENV","value":"#{variables.Environment}","type":"PLAINTEXT"}]
```

또 stage의 **action variable**을 다른 stage에서 참조 가능하다:

```
Source action output: #{SourceVariables.CommitId}
Build action output:  #{BuildVariables.IMAGE_TAG}     (CodeBuild의 exported-variables)
```

> 🔍 **더 깊이**: `#{SourceVariables.CommitId}`는 V1에서도 가능했지만 일부 source에서만 노출됐다. V2는 모든 액션이 일관된 변수 모델을 갖는다. 빌드의 exported-variables가 deploy 단계로 자동 흐르는 게 가장 흔한 패턴 — 빌드 시 결정된 image tag를 deploy의 ECS task definition에 동적으로 주입.

### 2. 트리거 필터링

V1에서는 push만 일어나면 무조건 파이프라인이 실행됐다. V2는 브랜치·파일 패턴으로 필터 가능.

```yaml
triggers:
  - providerType: CodeStarSourceConnection
    gitConfiguration:
      sourceActionName: Source
      push:
        - branches:
            includes: ["main", "release/**"]
            excludes: ["release/experimental"]
          filePaths:
            includes: ["src/**", "package.json"]
            excludes: ["docs/**", "**/*.md"]
        - tags:
            includes: ["v*.*.*"]
```

> ⚠️ **함정**: 트리거 필터는 V2 + CodeStar Source Connection(GitHub, BitBucket, GitLab)에서만 동작. CodeCommit source에는 안 먹는다. 시험에서 "CodeCommit + 특정 브랜치만 트리거"가 나오면 EventBridge rule로 필터링하는 게 정답이지 파이프라인 트리거 필터가 아님.

### 3. 실행 모드

```yaml
executionMode: SUPERSEDED    # 기본. 새 실행이 들어오면 대기 중인 이전 실행 자동 취소
# 또는
executionMode: QUEUED        # 들어온 순서대로 하나씩 실행
# 또는
executionMode: PARALLEL      # 여러 실행 동시 진행
```

> 📚 **사례**: PARALLEL 모드는 2024년 발표된 새 기능이다. 여러 PR을 동시에 검증해야 하는 monorepo 환경에서 유용. 단 deploy 단계가 같은 리소스(예: 동일 ECS service)를 만지면 race condition이 발생하므로 보통 Source/Build/Test까지만 PARALLEL이고 Deploy는 SUPERSEDED나 QUEUED로 별도 파이프라인을 분리하는 게 안전 패턴.

## Manual Approval: 사람이 마지막 게이트가 되는 경우

자동화는 위대하지만, production 배포 직전에는 사람의 눈이 필요할 때가 있다. 컴플라이언스 요구사항이거나, 정책상 변경 관리 위원회 승인이 필요하거나, 단순히 비즈니스 시간에만 배포하고 싶거나.

```yaml
- name: ProductionApproval
  actions:
    - name: Approve
      actionTypeId:
        category: Approval
        owner: AWS
        provider: Manual
      configuration:
        NotificationArn: arn:aws:sns:ap-northeast-2:111122223333:approvals
        CustomData: "Please review staging environment at https://staging.example.com"
        ExternalEntityLink: "https://staging.example.com"
```

승인 메커니즘 디테일:

- 승인하려면 IAM `codepipeline:PutApprovalResult` 권한 필요
- SNS 알림에 승인 URL이 포함됨 (콘솔의 specific deep link)
- **7일 안에 응답 없으면 자동 거부**(timeout)
- 거부되면 그 stage는 Failed로 표시, 다음 stage 실행 안 됨

> 🔍 **더 깊이**: Manual Approval의 7일 timeout은 변경 불가능한 하드 리밋이다. 더 짧거나 길게 하고 싶으면 EventBridge로 "STARTED" 상태 모니터링 → Lambda로 N시간 후 자동 reject 호출하는 패턴을 쓴다. 또는 Approval action 대신 Lambda Invoke에서 외부 시스템(JIRA, ServiceNow)의 승인 상태를 polling하는 패턴.

> ⚠️ **함정**: Manual Approval에 권한이 있는 IAM 사용자가 본인이 만든 변경을 본인이 승인할 수 있는가? **기본적으로는 가능**하지만, IAM Condition `aws:userId`로 "변경한 사람과 승인자가 달라야 한다"는 분리(separation of duties)를 강제하려면 추가 IAM 정책이 필요하다. 컴플라이언스가 중요한 환경에서는 별도 그룹(release manager)에만 승인 권한을 부여하는 게 일반적.

## Cross-Account/Region 패턴: 멀티 계정 조직의 표준

기업이 성장하면 보통 dev/staging/prod 계정을 분리하고, 각 계정의 권한을 분리한다. CodePipeline이 cross-account로 자원을 만지려면 권한 chain을 명시적으로 설정해야 한다.

```
[Source Account: 111111111111]
  - CodePipeline 실행
  - 아티팩트 bucket
  - KMS CMK (cross-account 사용 허용)

[Target Account: 222222222222 (prod)]
  - CrossAccountDeployRole (Source 계정을 신뢰하는 IAM role)
  - CodeDeploy / CloudFormation으로 실제 배포

[Source 계정 Pipeline] →
   Sts:AssumeRole (CrossAccountDeployRole) →
   [Target 계정에서 배포 실행]
```

필요한 구성:

1. **Source 계정**: Pipeline 서비스 역할에 `sts:AssumeRole` for Target 계정 role 권한
2. **Target 계정**: CrossAccountDeployRole의 trust policy에 Source 계정 명시
3. **KMS CMK**: 양쪽 계정에서 사용 가능하도록 Key Policy 설정 (artifact는 KMS로 암호화돼야 cross-account 전달 가능)
4. **S3 Artifact Bucket**: Bucket policy에 Target 계정 read 권한

> 💡 **관련 이론**: 이 패턴은 AWS의 "Well-Architected Multi-Account Strategy"의 한 부분이다. 2019년 AWS Control Tower 출시 이후 조직 수준에서 표준화됐고, AWS Organizations의 SCP(Service Control Policy)와 결합해 사용된다. "권한은 계정 경계로 분리하고, 자동화는 IAM cross-account role로 명시적 위임"이 핵심 사상.

> 📚 **사례**: AWS re:Invent 2022 session DOP312에서 Liberty Mutual은 350개 이상의 AWS 계정을 운영하면서 CodePipeline cross-account로 단일 source 계정에서 모든 application 계정으로 배포를 통일했다. 핵심은 "계정 boundary로 blast radius를 제한하고, IAM role chain으로 자동화는 그대로 유지"하는 사상.

## EventBridge 통합: 파이프라인 상태를 외부로 흘리는 표준

CodePipeline의 모든 상태 변경(시작, 단계 진행, 성공, 실패)은 EventBridge로 자동 발행된다. 알림·메트릭·자동화의 표준 hook.

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": [
    "CodePipeline Pipeline Execution State Change",
    "CodePipeline Stage Execution State Change",
    "CodePipeline Action Execution State Change"
  ],
  "detail": {
    "state": ["FAILED"]
  }
}
```

이걸로 만들 수 있는 패턴:

- 실패 시 Slack 알림 (→ AWS Chatbot)
- 실패 시 자동 JIRA 티켓 생성 (→ Lambda → JIRA API)
- 모든 prod 배포를 보안팀 audit S3 bucket에 기록 (→ Kinesis Firehose)
- 일별 파이프라인 성공률 메트릭 (→ CloudWatch Custom Metric)

> 🔍 **더 깊이**: CodeStar Notifications는 EventBridge 위에 더 친화적 UI를 얹은 것이다. "이메일/Slack/Chime으로 알림"이 목적이라면 CodeStar Notifications가 빠르고, "복잡한 자동화 분기"가 필요하면 EventBridge rule을 직접 쓰는 게 유연하다. 시험에서 "Slack 알림 + 최소 구성"이면 CodeStar Notifications, "조건부 자동 응답"이면 EventBridge.

## Pipeline-as-Code: CloudFormation/CDK로 관리하기

파이프라인 자체도 코드로 관리하는 게 best practice다. 콘솔로 클릭해 만든 파이프라인은 다른 환경에 복제하기 어렵고, 변경 이력이 안 남는다.

```python
# AWS CDK 예시 (Python)
from aws_cdk import (
    Stack, aws_codepipeline as codepipeline,
    aws_codepipeline_actions as actions,
    aws_codebuild as codebuild,
)

class PipelineStack(Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)

        source_output = codepipeline.Artifact()
        build_output = codepipeline.Artifact()

        pipeline = codepipeline.Pipeline(self, "MyPipeline",
            pipeline_name="my-app",
            stages=[
                codepipeline.StageProps(
                    stage_name="Source",
                    actions=[actions.CodeCommitSourceAction(
                        action_name="Source",
                        repository=repo,
                        output=source_output,
                        branch="main",
                    )]
                ),
                codepipeline.StageProps(
                    stage_name="Build",
                    actions=[actions.CodeBuildAction(
                        action_name="Build",
                        project=build_project,
                        input=source_output,
                        outputs=[build_output],
                    )]
                ),
                codepipeline.StageProps(
                    stage_name="Deploy",
                    actions=[actions.CloudFormationCreateUpdateStackAction(
                        action_name="DeployInfra",
                        stack_name="my-app-infra",
                        template_path=build_output.at_path("template.yaml"),
                        admin_permissions=False,
                    )]
                ),
            ]
        )
```

> 💡 **관련 이론**: "Pipeline-as-Code"는 GitOps 사상의 일부다. Weaveworks가 2017년 제안한 GitOps는 "운영 환경의 desired state를 git에 두고, 그것과 실제 상태의 차이를 자동 reconcile한다"는 모델. CodePipeline은 그 reconcile loop의 actuator 역할을 한다. ArgoCD/Flux가 K8s 환경에서 같은 역할을 하는 것과 같다.

## 정리하며

CodePipeline은 빌드도 배포도 직접 하지 않는다. 그저 다른 도구들을 정해진 순서와 조건으로 호출하는 지휘자다. 그 단순한 역할이 중요한 이유는 "수동으로 하던 모든 release 절차를 한 번 정의해두면 그 다음부터는 사람 없이 동작한다"는 약속을 가능하게 하기 때문이다. CodePipeline V2의 변수와 트리거 필터링은 그 약속을 더 정교한 워크플로우까지 확장한다.

다음 글에서는 이 자동 파이프라인의 마지막 안전망 — **CloudFormation의 변경 세트(Change Set)와 drift detection** — 을 본다. 인프라가 코드와 일치하는지, 그리고 코드 변경이 production에 어떤 영향을 줄지를 어떻게 사전에 검증하는지를 짚는다.

---

## 📝 연습 문제

**문제 1.** CodePipeline의 한 stage 안에 빌드 액션과 보안 스캔 액션을 두 개 만들었다. **두 액션이 병렬로 실행되게** 하려면?

A) 두 액션을 서로 다른 stage에 배치
B) 두 액션의 runOrder를 동일한 값(예: 1)으로 설정
C) 두 액션의 runOrder를 다른 값(1, 2)으로 설정
D) 두 액션을 다른 파이프라인으로 분리

**정답: B**

해설: 한 stage 안에서 같은 `runOrder`를 가진 액션들은 병렬 실행된다. 다른 runOrder를 지정하면 순차(작은 번호 먼저). A) 다른 stage는 항상 순차이므로 병렬 불가. C) runOrder 1과 2이면 1이 먼저 끝나야 2 시작 = 순차. D) 다른 파이프라인은 별개 실행으로 본 문제 해결 안 됨. 시험에서 "stage 내 병렬 실행"이 나오면 runOrder가 답.

---

**문제 2.** CodePipeline의 stage 간 데이터(빌드 산출물) 전달은 어떻게 이뤄지는가?

A) 직접 메모리로 전달
B) 계정·리전당 1개 S3 artifact bucket을 통해 zip으로 저장 후 다음 stage가 다운로드
C) DynamoDB stream
D) AWS Step Functions의 state object로 전달

**정답: B**

해설: CodePipeline은 각 액션의 output artifact를 zip으로 묶어 S3 artifact bucket에 저장하고, 다음 액션이 input artifact로 다운로드한다. Bucket은 파이프라인 생성 시 자동 만들어지지만 명시 가능. 이 메커니즘 때문에 ① 아티팩트 보안(bucket policy, KMS 암호화)이 중요하고 ② Cross-Region 배포 시 각 리전에 별도 bucket 필요. A/C/D는 모두 메커니즘 자체가 틀림. 시험의 단골 문제.

---

**문제 3.** CodePipeline V2에서 추가된 **트리거 필터링** 기능에 대한 설명으로 옳은 것은?

A) CodeCommit source에서 브랜치 패턴 필터링이 가능하다
B) GitHub source(CodeStar Source Connection)에서 브랜치·파일 경로·태그 패턴 필터링이 가능하다
C) S3 source에서 객체 경로 필터링이 가능하다
D) ECR source에서 이미지 태그 필터링이 가능하다

**정답: B**

해설: V2의 트리거 필터링은 **CodeStar Source Connection 기반 source**(GitHub, GitLab, BitBucket)에서만 동작. 브랜치(includes/excludes), 파일 경로(includes/excludes), 태그 패턴까지 지원. A) CodeCommit은 EventBridge rule로 필터링해야 함(파이프라인 트리거 필터 직접 지원 X). C) S3는 객체 변경 감지만 가능하고 경로 패턴은 EventBridge에서. D) ECR도 EventBridge 필터링. 시험에서 "V2 트리거 필터링 + monorepo" 시나리오면 GitHub source + 파일 경로 패턴이 정답.

---

**문제 4.** Production CodeDeploy 단계 직전에 **사람의 승인을 반드시 받게** 하려면?

A) Lambda Invoke 액션으로 Slack 메시지 전송 후 자동 진행
B) Manual Approval 카테고리 액션을 추가하고 SNS topic으로 알림 발송
C) CloudWatch Alarm 기반 자동 정지
D) EventBridge rule로 외부 시스템에서 승인 받기

**정답: B**

해설: Manual Approval은 정확히 "프로덕션 배포 전 사람의 검토"를 위한 카테고리다. SNS topic을 지정하면 알림이 발송되고 승인자가 콘솔/CLI에서 PutApprovalResult로 응답. 7일 안에 응답 없으면 자동 거부. A) Slack 메시지만 보내고 진행은 사람의 승인을 강제하지 않음. C) Alarm은 자동 정지이지 사람 승인이 아님. D) 외부 시스템 통합도 가능하지만 "최소 구성"이면 Manual Approval이 표준. 시험에서 "사람의 승인 게이트"는 항상 Manual Approval.

---

**문제 5.** Source 계정의 CodePipeline이 **다른 AWS 계정의 ECS 서비스에 배포**하려고 한다. 필요한 구성이 아닌 것은?

A) Target 계정에 Source 계정을 신뢰하는 IAM Role 생성
B) Source 계정의 Pipeline 서비스 역할에 Target 계정 role에 대한 sts:AssumeRole 권한
C) Artifact S3 bucket을 KMS CMK로 암호화하고 양쪽 계정에서 사용 가능하도록 Key Policy 설정
D) Target 계정에 CodeDeploy Agent 설치

**정답: D**

해설: ECS 배포에는 CodeDeploy Agent가 필요 없다(ECS service가 처리). Cross-Account 배포의 필수 구성은 A) Target 계정의 cross-account role B) Source 계정의 AssumeRole 권한 C) KMS CMK의 cross-account Key Policy. 이 셋이 핵심 chain. 추가로 artifact bucket의 bucket policy에 Target 계정 read 권한도 필요. D는 EC2 배포에서나 의미 있고 ECS와는 무관. 시험에서 "Cross-Account ECS + Agent" 보기가 보이면 거의 항상 함정.

---

**문제 6.** CodePipeline 파이프라인 실패 시 슬랙 채널에 알림을 보내려 한다. 가장 권장되는 구성은?

A) EventBridge rule로 FAILED 상태 감지 → SNS → 이메일 → 사람이 slack에 복붙
B) CodeStar Notifications + AWS Chatbot Slack 연동
C) CodePipeline 콘솔에서 직접 Slack URL 등록
D) CloudTrail 로그를 CloudWatch Logs Insight로 5분마다 조회

**정답: B**

해설: CodeStar Notifications는 CodePipeline/CodeBuild/CodeCommit 이벤트를 사전 정의된 형태로 AWS Chatbot에 연결, Chatbot이 Slack/Chime을 네이티브 통합한다. 별도 Lambda나 webhook 없이 채널에 풍부한 카드 메시지로 발송. A)는 가능하지만 사람의 수동 작업 필요. C)는 그런 옵션 자체가 없음(콘솔에서 직접 Slack 등록 불가). D)는 매우 비효율적. 시험에서 "최소 구성 + Slack"이 보이면 CodeStar Notifications + Chatbot.

---

**문제 7.** CodePipeline V2의 **execution mode** 중 새 실행이 들어오면 대기 중이던 이전 실행을 자동 취소하는 모드는?

A) QUEUED
B) PARALLEL
C) SUPERSEDED
D) BLOCKING

**정답: C**

해설: SUPERSEDED는 V1부터 기본 동작이었고 V2에서 명시적 모드 이름이 됐다. 빠른 연속 push 시 마지막 변경만 빌드/배포하면 충분하므로 중간 실행을 취소해 자원 낭비를 줄임. QUEUED는 모든 실행을 순서대로(취소 없음), PARALLEL은 모든 실행을 동시. BLOCKING은 존재하지 않는 모드. 시험에서 "execution mode" 키워드가 보이면 SUPERSEDED/QUEUED/PARALLEL 셋 중 하나가 답.
