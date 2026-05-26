# Day 1 - CodePipeline 구조: Stage, Action, Artifact가 만들어진 이유

CodePipeline을 처음 보면 Jenkins를 웹 UI로 바꿔놓은 것처럼 보인다. 그 느낌으로 공부를 시작하면 시험 문제 앞에서 막힌다. DOP-C02가 파이프라인에 대해 묻는 것은 "어떻게 쓰나"가 아니라 "왜 이렇게 설계됐나, 이 시나리오에서 어떤 조합이 정확한가"다. 그 답에 도달하려면 CodePipeline의 계층 구조가 어떤 문제를 풀기 위해 만들어졌는지부터 이해해야 한다.

Jenkins가 2004년 허드슨(Hudson)이라는 이름으로 나왔을 때 파이프라인은 단순한 Job 연쇄였다. "A가 끝나면 B를 시작" 수준. 문제는 조직이 커질수록 이 단순함이 깨진다. Dev 계정에서 빌드하고 Prod 계정에서 배포하는 멀티 계정 환경, 어떤 브랜치는 배포하고 어떤 브랜치는 빌드만 하는 분기 로직, 사람이 승인해야만 다음 단계로 가는 게이트—이 모든 것을 Jenkins Job 체인으로 표현하면 스파게티가 된다. CodePipeline의 Stage/Action/Artifact 계층은 이 스파게티를 명시적인 그래프로 바꾸기 위해 설계된 것이다.

## CodePipeline이 만들어진 배경: DAG로 CI/CD 표현하기

파이프라인은 수학적으로 DAG(Directed Acyclic Graph, 방향 비순환 그래프)다. 노드가 작업이고, 엣지가 의존 관계이며, 사이클이 없다는 게 핵심이다. Makefile(1976), Ant(2000), Maven(2004)이 모두 이 아이디어의 변형이다. CI/CD의 현대적 형태인 Pipeline-as-Code도 DAG를 코드로 표현하는 방법의 진화다.

> 💡 **관련 이론**: DAG는 위상 정렬(Topological Sort) 알고리즘을 사용해 실행 순서를 결정한다. Kahn's Algorithm(1962)이나 DFS 기반 방법이 대표적이다. CodePipeline의 runOrder는 이 위상 정렬의 명시적 표현—같은 runOrder를 가진 Action은 병렬(같은 레이어), 다른 runOrder는 직렬(다른 레이어)로 실행된다. GitHub Actions의 `needs:` 키워드, GitLab CI의 `stages:` 키워드도 동일한 DAG 표현의 다른 문법이다.

CodePipeline이 Jenkins와 다른 결정적 차이는 **상태를 서비스가 소유한다**는 점이다. Jenkins는 상태를 Jenkins 서버의 파일 시스템에 둔다. 서버가 죽으면 상태가 사라지고, 재현이 어렵다. CodePipeline은 상태를 AWS 서비스(S3 Artifact, DynamoDB 내부 상태)에 둔다. 파이프라인이 실행 중에 누군가 Action의 IAM Role을 바꿔도, 현재 실행 중인 것은 영향을 받지 않는다. 이 내구성과 격리성이 엔터프라이즈 환경에서 CodePipeline을 선택하는 핵심 이유다.

> 🔍 **더 깊이**: Jenkins의 파일시스템 상태 의존성은 2010년대 초반 대형 조직에서 심각한 문제였다. "Jenkins Restart of Death"—Jenkins가 재시작되면 진행 중인 모든 빌드가 사라지는 현상—이 일반적이었다. AWS가 CodePipeline 설계 시 이 교훈을 적용해 모든 상태를 S3와 DynamoDB에 위임한 것이다. 이 설계 결정이 왜 CodePipeline이 "단순히 Jenkins의 클라우드 버전"이 아닌지를 설명한다. 분산 시스템 이론에서 이것을 **State Externalization** 패턴이라 부른다—stateless 실행 엔진이 상태를 외부 내구성 저장소에 위임한다.

## Pipeline 계층 구조: 왜 이렇게 나뉘었나

```
Pipeline (전체 워크플로 — IAM, Artifact Store, KMS 소유)
├── Stage 1: Source
│   ├── Action: SourceCheckout (runOrder 1, Source category)
│   └── Action: FetchConfigs  (runOrder 1, 병렬)
│
├── [Transition — 비활성화 가능한 게이트]
│
├── Stage 2: Build
│   ├── Action: BuildApp    (runOrder 1, Build category)
│   └── Action: BuildDocs   (runOrder 1, 병렬)
│
├── Stage 3: Test
│   ├── Action: UnitTest    (runOrder 1)
│   └── Action: Integration (runOrder 2, 직렬)
│
├── Stage 4: Approve
│   └── Action: ManualApproval
│
└── Stage 5: Deploy
    └── Action: DeployToProd
```

**Stage**가 하나의 관심사(Source/Build/Test/Deploy)를 묶는다. Stage 내부에서는 Action이 runOrder에 따라 병렬 또는 직렬로 실행된다. **Stage 사이에는 Transition이 있고, 이 Transition을 비활성화해서 "주말 배포 동결" 같은 운영 게이트를 만들 수 있다.** Stage가 성공하면 다음 Stage로 자동 전이—이게 "파이프라인"의 본질이다.

**Artifact**는 Stage 사이를 이동하는 데이터 단위다. 소스 코드, 컴파일된 바이너리, 테스트 리포트—이 모든 것이 Artifact로 S3에 저장되고, KMS로 암호화된다. 중요한 것은 **Artifact가 Action의 계약(Contract)이라는 점**이다. Action은 "이름 X의 Artifact를 받아서 이름 Y의 Artifact를 내보낸다"고 선언하고, CodePipeline이 이 이름 기반 연결을 보장한다.

> 💡 **관련 이론**: Artifact 패턴은 함수형 프로그래밍의 순수 함수(Pure Function) 개념과 닮았다. 각 Action은 입력 Artifact → 처리 → 출력 Artifact로 정의되며, 부수 효과(side effect)는 Action 내부로 격리된다. 이 덕분에 파이프라인의 각 단계가 **재현 가능(Reproducible)**하고 **테스트 가능(Testable)**해진다. Jenkins의 "공유 워크스페이스" 방식에서는 한 Job이 다른 Job의 파일을 직접 수정할 수 있어서 재현성이 깨지는 문제가 있었다.

> 📚 **사례**: 2019년 Capital One이 AWS re:Invent에서 공개한 멀티 계정 파이프라인 사례. 300개 이상의 마이크로서비스를 각각 독립 CodePipeline으로 관리하면서, Artifact S3 버킷과 KMS 키를 중앙 Tooling 계정에 두고 각 Spoke 계정에는 CrossAccountDeployRole만 두는 구조를 사용했다. 이 패턴에서 가장 자주 발생한 문제가 "S3는 되는데 KMS가 안 된다"는 Artifact 복호화 실패였고, 해결책은 KMS Key Policy에 모든 Spoke 계정 Role을 명시적으로 추가하는 것이었다.

## Action 6 카테고리: 분류의 논리

CodePipeline의 6 Action 카테고리(Source/Build/Test/Deploy/Approval/Invoke)는 임의로 만든 분류가 아니다. 각 카테고리는 다른 책임 모델과 실행 환경을 가진다.

| 카테고리 | 실행 주체 | 결과 | 대표 Provider |
|----------|-----------|------|---------------|
| **Source** | 외부 소스 시스템 | SourceArtifact | CodeCommit, GitHub (CodeStar Connections), S3, ECR, Bitbucket |
| **Build** | 컴퓨트 (CodeBuild) | BuildArtifact | CodeBuild, Jenkins, GitHub Actions |
| **Test** | 컴퓨트 | TestReport | CodeBuild, Ghost Inspector, Runscope |
| **Deploy** | 배포 서비스 | 인프라 상태 변경 | CodeDeploy, CloudFormation, ECS, Elastic Beanstalk, S3, AppConfig |
| **Approval** | 사람 | 승인/거부 | Manual (SNS 알림) |
| **Invoke** | Lambda/Step Functions | 임의 결과 | Lambda, Step Functions |

Source 카테고리가 별도로 있는 이유는 소스 시스템이 CodePipeline 외부에 있고, Webhook/polling으로 변경을 감지해야 하는 특별한 통합 방식이 필요하기 때문이다. Deploy 카테고리에 다양한 Provider가 있는 이유는 "배포"의 의미가 대상에 따라 완전히 다르기 때문이다—EC2에 배포하는 것과 CloudFormation Stack을 업데이트하는 것과 ECS Service를 갱신하는 것은 완전히 다른 API를 호출한다.

> 🔍 **더 깊이**: Invoke 카테고리의 Lambda와 Step Functions는 단순히 "커스텀 로직"을 실행하는 것 이상의 의미가 있다. Lambda는 최대 15분의 제약이 있는 반면 Step Functions은 이론상 1년(365일)까지 실행할 수 있는 워크플로다. AWS의 분산 시스템 논문(Amazon Builders' Library의 "Using sagas for data consistency")에서 소개하는 **Saga 패턴**—복잡한 분산 트랜잭션을 보상 트랜잭션(compensating transaction)으로 처리하는 패턴—이 Step Functions Invoke Action으로 구현된다. 멀티 리전 배포에서 한 리전이 실패하면 이미 완료된 다른 리전을 롤백하는 로직이 대표적 사례다.

## Artifact 저장소: S3 + KMS의 구체적 동작

Artifact는 Pipeline 생성 시 지정한 S3 버킷에 `<pipeline-name>/<stage-name>/<action-name>/<execution-id>/` 구조로 저장된다. 압축(zip)된 형태이며, Pipeline이 사용하는 KMS CMK(또는 AWS 관리 키)로 서버 사이드 암호화된다.

```
s3://tooling-artifacts-bucket/
└── checkout-pipeline/
    ├── Source/
    │   └── SourceArtifact/
    │       └── abc123def.zip   ← git checkout 결과
    ├── Build/
    │   └── BuildArtifact/
    │       └── abc123def.zip   ← 컴파일 결과
    └── Test/
        └── TestReport/
            └── abc123def.zip   ← 테스트 리포트
```

각 Action이 InputArtifact를 받으면 CodePipeline이 S3에서 해당 zip을 다운로드하고 복호화해서 Action의 실행 환경에 제공한다. Action이 OutputArtifact를 만들면 실행 환경에서 zip으로 압축해 S3에 업로드하고 KMS로 암호화한다. **이 S3 + KMS 조합이 Cross-Account 배포의 핵심 마찰 지점이다.**

> ⚠️ **함정**: Cross-Account 배포에서 가장 흔한 실수는 S3 버킷 정책만 주고 KMS Decrypt를 빠뜨리는 것이다. Spoke 계정의 Role이 S3 GetObject 권한을 가지고 있어도, KMS Decrypt 권한이 없으면 객체를 다운로드할 수는 있지만 복호화가 실패한다. 에러 메시지는 "Access Denied"처럼 보이지만 실제 원인은 KMS Policy다. 트러블슈팅 시 CloudTrail에서 `kms:Decrypt`의 AccessDenied 이벤트를 먼저 확인해야 한다. AWS 관리 키(aws/s3)는 Cross-Account 복호화를 허용하지 않으므로, Cross-Account 파이프라인에는 반드시 CMK(Customer Managed Key)를 사용해야 한다.

> 💡 **관련 이론**: KMS CMK를 Cross-Account에서 사용할 때 두 가지 정책이 모두 일치해야 한다. **KMS Key Policy**(리소스 기반 정책)와 **IAM Identity Policy**(주체 기반 정책). KMS의 독특한 점은 Key Policy에 명시적으로 허용해야만 외부 계정에서 사용 가능하다는 것이다—S3 버킷 정책과 달리 IAM Policy만으로는 다른 계정의 KMS 키를 사용할 수 없다. 이 이중 정책 요구사항이 "권한 줬는데 안 된다"는 혼란의 원인이다.

## V1 vs V2 Pipeline: 마이그레이션이 필요한 이유

2023년 말에 도입된 V2 Pipeline은 단순한 기능 추가가 아니라 설계 철학의 진화다.

| 기능 영역 | V1 | V2 |
|-----------|----|----|
| **변수 시스템** | 제한적 (환경 변수만) | 풍부 (입력 변수, Action 출력 변수, 메타 변수) |
| **트리거** | push 전체 브랜치 | 브랜치/태그/경로 필터 (모노레포 지원) |
| **Execution Mode** | SUPERSEDED만 | SUPERSEDED + QUEUED + PARALLEL |
| **Stage 조건** | 없음 | beforeEntry/success/failure conditions |
| **Action 재시도** | 없음 | 자동 재시도 구성 가능 |
| **비용** | 활성 파이프라인 월 $1 | 실행당 과금 (파이프라인 수×실행 횟수) |

V2의 Execution Mode는 특히 중요하다. **SUPERSEDED**(기본)는 새 실행이 시작되면 진행 중인 이전 실행을 무효화한다—빠른 main 브랜치 개발에서 "마지막 commit이 중요하고 이전 것은 버려도 된다"는 가정이 맞을 때. **QUEUED**는 모든 실행을 FIFO 순서로 큐에 넣어 순차 실행한다—감사나 규정 준수상 모든 commit의 배포 이력이 필요할 때. **PARALLEL**은 동시에 여러 실행을 허용한다—PR 브랜치별로 독립된 테스트 환경이 필요할 때.

> 📚 **사례**: Netflix는 2012년 Jenkins 기반 파이프라인에서 여러 브랜치의 빌드가 서로의 Artifact를 덮어쓰는 문제("빌드 오염" 문제)를 겪었다. 해결책으로 각 빌드 실행을 완전히 격리된 Artifact 네임스페이스에 두는 구조로 전환했다. CodePipeline V2의 Execution ID 기반 Artifact 격리가 정확히 이 패턴을 공식 서비스로 제공하는 것이다. PARALLEL 모드에서 두 실행이 동일 Stage를 실행하더라도 Artifact는 Execution ID로 격리된다.

## EventBridge 기반 트리거: 폴링 vs 이벤트

V1 CodePipeline은 기본적으로 폴링(polling) 기반이었다. CodeCommit 저장소를 주기적으로 확인해서 새 커밋이 있으면 파이프라인을 시작하는 방식. 이게 S3 Source나 ECR Source에서는 여전히 적용된다. V2 + CodeStar Connections 기반 GitHub Source는 Webhook 방식으로 전환됐다—GitHub이 AWS에 push 이벤트를 보내고, 이를 EventBridge가 받아 파이프라인을 시작한다.

```json
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Repository State Change"],
  "detail": {
    "event": ["referenceUpdated"],
    "referenceType": ["branch"],
    "referenceName": ["main"]
  }
}
```

> 💡 **관련 이론**: Polling vs Push(Webhook) 패턴의 근본적 차이는 누가 주도권을 가지냐의 문제다. Polling은 수신자(CodePipeline)가 주도권을 가지고 주기적으로 확인한다—새 이벤트가 없어도 불필요한 API 호출이 발생한다(Busy Waiting). Push는 발신자(GitHub)가 이벤트 발생 시 즉시 통보한다—불필요한 API 호출이 없고 지연도 짧다. AWS 내부적으로는 EventBridge가 이벤트 버스 역할을 해서, CodeCommit의 상태 변화가 EventBridge 이벤트로 발행되고 CodePipeline Rule이 이를 수신한다. 이게 CloudTrail → EventBridge → 자동화의 표준 패턴이기도 하다.

## IAM Role 구조: Pipeline Service Role과 Action Role

CodePipeline은 두 가지 다른 IAM Role 개념이 사용된다. 혼동이 잦은 부분이다.

**Pipeline Service Role**: CodePipeline 서비스 자체가 사용하는 Role. CodeBuild 프로젝트를 시작하고, S3에 Artifact를 저장하고, CodeDeploy 배포를 시작하는 권한이 여기 있다. Pipeline을 생성할 때 지정하는 Role이다.

**Action Role (roleArn)**: 특정 Action이 실행될 때 가정(AssumeRole)하는 Role. Cross-Account Action에서 필수다. Pipeline Service Role이 먼저 이 Action Role을 AssumeRole하고, 그 후 Action Role의 권한으로 Spoke 계정의 리소스에 접근한다.

```
Pipeline Service Role
    ↓ sts:AssumeRole
Action Role (Spoke 계정의 CrossAccountDeployRole)
    ↓ 권한 행사
CloudFormation, ECS, Lambda (Spoke 계정 리소스)
```

> 🔍 **더 깊이**: IAM Role의 AssumeRole 체인에는 깊이 제한이 있다. 직접적인 제한은 없지만, STS 토큰의 세션 Duration이 최대 12시간이고, 체인이 깊어질수록 원래 Role의 Permission Boundary가 누적 적용된다. AWS의 보안 모범사례(AWS Well-Architected Framework Security Pillar)는 "최소 권한 원칙(Least Privilege)"을 위해 Action별로 별도 Role을 두고 Permission Boundary로 최대 권한 상한을 설정하도록 권장한다. Pipeline 엔지니어링에서 "왜 Action Role이 따로 있냐"는 질문의 답이 바로 이 최소 권한 원칙이다.

> 🎯 **시나리오**: 한 팀이 CodePipeline V1을 쓰다가 "모노레포에서 checkout 서비스와 inventory 서비스를 별도 파이프라인으로 트리거하고 싶다"는 요구가 생겼다. V1으로는 불가능하다—V1은 브랜치 전체를 트리거할 뿐 경로 필터가 없다. V2로 업그레이드하고 각 파이프라인에 `filePaths.includes`를 서비스 디렉토리로 설정하면 된다. 한 commit이 두 서비스 모두 건드리면 두 파이프라인이 동시에 시작된다. 이게 PARALLEL Execution Mode가 아니라—PARALLEL은 같은 파이프라인의 여러 실행이다. 서로 다른 파이프라인은 항상 독립적으로 실행된다.

## 다른 CI/CD 도구와의 비교

CodePipeline을 선택할지 GitHub Actions나 GitLab CI를 선택할지는 종종 시험 문제에도 등장하는 주제다.

| 특성 | CodePipeline | GitHub Actions | GitLab CI |
|------|-------------|----------------|-----------|
| **파이프라인 정의** | JSON/CloudFormation | YAML (.github/workflows/) | YAML (.gitlab-ci.yml) |
| **실행 환경** | CodeBuild (관리형) | Runner (GitHub Hosted/Self-hosted) | Runner (GitLab Hosted/Self-hosted) |
| **AWS 통합** | Native (IAM, KMS, S3) | OIDC 연동 필요 | OIDC 연동 필요 |
| **Cross-Account** | 내장 지원 | 별도 구성 | 별도 구성 |
| **승인 게이트** | Manual Approval Action | Environment Protection Rules | Protected Environments |
| **비용 모델** | 파이프라인당 + 실행당 | 분당 (커밋당 무료 포함) | 분당 (커밋당 무료 포함) |
| **모노레포** | V2 filePath 필터 | on.push.paths | rules:changes |
| **매트릭스 빌드** | 어색 (Action 반복) | 네이티브 지원 | 네이티브 지원 |

DOP-C02에서 "GitHub Actions + CodePipeline 하이브리드"가 자주 정답으로 나오는 이유가 여기 있다. PR 빌드와 테스트는 GitHub Actions가 더 자연스럽고, prod 배포는 AWS 권한 체계와 통합된 CodePipeline이 더 안전하다. 둘을 섞어 쓰는 것이 현실적인 모범사례다.

> ⚠️ **함정**: "AWS 환경이니까 무조건 CodePipeline"이라는 함정이 있다. 매트릭스 빌드(OS × 런타임 버전 조합 테스트), PR 상태 표시(PR에 빌드 결과 자동 표시), 다양한 언어별 Action 마켓플레이스—이 기능들이 필요하면 GitHub Actions가 현실적으로 더 적합하다. 시험에서 "PR마다 독립 빌드 + 상태 표시 + 멀티 OS 테스트"라는 요구사항이 나오면 GitHub Actions 쪽 보기를 살펴봐야 한다.

## CloudFormation으로 Pipeline 정의하기

```yaml
Resources:
  MyPipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      Name: checkout-pipeline
      PipelineType: V2
      ExecutionMode: QUEUED
      RoleArn: !GetAtt PipelineRole.Arn
      ArtifactStore:
        Type: S3
        Location: !Ref ArtifactBucket
        EncryptionKey:
          Id: !GetAtt ArtifactKMSKey.Arn
          Type: KMS
      Triggers:
        - ProviderType: CodeStarSourceConnection
          GitConfiguration:
            SourceActionName: SourceCheckout
            Push:
              - Branches:
                  Includes: [main, release/*]
                FilePaths:
                  Includes: ["src/**", "lib/**"]
                  Excludes: ["docs/**", "*.md"]
      Stages:
        - Name: Source
          Actions:
            - Name: SourceCheckout
              ActionTypeId:
                Category: Source
                Owner: AWS
                Provider: CodeStarSourceConnection
                Version: 1
              OutputArtifacts:
                - Name: SourceArtifact
              Configuration:
                ConnectionArn: !Ref GitHubConnection
                FullRepositoryId: my-org/checkout-service
                BranchName: main
                OutputArtifactFormat: CODEBUILD_CLONE_REF
        - Name: Build
          Actions:
            - Name: BuildApp
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: 1
              InputArtifacts:
                - Name: SourceArtifact
              OutputArtifacts:
                - Name: BuildArtifact
              Configuration:
                ProjectName: checkout-build
                EnvironmentVariables: |
                  [{"name":"ENV","value":"#{variables.Environment}","type":"PLAINTEXT"}]
              RunOrder: 1
            - Name: BuildDocs
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: 1
              InputArtifacts:
                - Name: SourceArtifact
              Configuration:
                ProjectName: docs-build
              RunOrder: 1   # BuildApp과 병렬
        - Name: Deploy
          BeforeEntry:
            Conditions:
              - Result: FAIL
                Rules:
                  - Name: AlarmCheck
                    RuleTypeId:
                      Category: Rule
                      Owner: AWS
                      Provider: LambdaInvoke
                      Version: 1
                    Configuration:
                      FunctionName: PreDeployAlarmGate
          Actions:
            - Name: DeployProd
              ActionTypeId:
                Category: Deploy
                Owner: AWS
                Provider: CloudFormation
                Version: 1
              InputArtifacts:
                - Name: BuildArtifact
              Configuration:
                ActionMode: CREATE_UPDATE
                StackName: checkout-prod
                TemplatePath: BuildArtifact::template.yaml
                RoleArn: !Sub "arn:aws:iam::${ProdAccountId}:role/CloudFormationExecutionRole"
```

## 실제 동작 흐름: Artifact가 움직이는 방식

```bash
# 1) Pipeline Service Role이 S3 Artifact Store를 초기화
# 2) Source Action이 GitHub에서 코드를 받아 SourceArtifact.zip으로 S3에 업로드 + KMS 암호화
# 3) Build Action이 SourceArtifact.zip을 S3에서 다운로드 + KMS 복호화 → CodeBuild 환경에 압축 해제
# 4) CodeBuild가 빌드 실행 → 결과물을 BuildArtifact.zip으로 S3에 업로드 + KMS 암호화
# 5) Deploy Action이 BuildArtifact.zip을 S3에서 다운로드 → CloudFormation/ECS에 전달

# Artifact 크기 확인 (5GB 한도)
aws s3 ls s3://tooling-artifacts-bucket/checkout-pipeline/Build/BuildArtifact/ --human-readable

# Transition 비활성화 (주말 배포 동결)
aws codepipeline disable-stage-transition \
  --pipeline-name checkout-pipeline \
  --stage-name Deploy \
  --transition-type Inbound \
  --reason "Weekend deployment freeze - re-enable Monday 09:00 KST"

# 복원
aws codepipeline enable-stage-transition \
  --pipeline-name checkout-pipeline \
  --stage-name Deploy \
  --transition-type Inbound
```

> 💡 **관련 이론**: Artifact의 5GB 한도는 단순한 크기 제한이 아니라 설계 철학을 반영한다. 파이프라인 Artifact는 "빌드 결과물의 전달 매체"이지 "대용량 데이터 저장소"가 아니다. 만약 빌드 결과가 수 GB라면, 일반적으로 Artifact에 이미지 URI나 S3 경로 같은 "포인터"만 담고 실제 데이터는 ECR이나 S3에 따로 저장하는 것이 패턴이다. 이 포인터 패턴이 "Configuration as Data" 접근으로, 파이프라인 Artifact는 작고 빠르게 유지하면서 실제 대용량 산출물은 별도 저장소에 두는 분리 원칙이다.

> 🎯 **시나리오**: 한 금융 서비스 회사가 "모든 prod 배포는 오전 9시~오후 6시(KST)에만 가능하고, 그 외 시간에는 빌드와 테스트는 계속 실행되어야 한다"는 배포 동결 정책을 구현하려 한다. 구현 방법: (1) Lambda 함수를 EventBridge 스케줄로 실행—오후 6시에 Deploy Stage의 Inbound Transition을 `disable-stage-transition`으로 비활성화하고, 오전 9시에 `enable-stage-transition`으로 다시 활성화. (2) 비활성화 상태에서도 Source/Build/Test Stage는 계속 실행되어 이미 빌드된 Artifact가 Transition 재활성화를 기다린다. 이 패턴에서 Transition이 재활성화되면 대기 중인 가장 최근 Artifact가 자동으로 Deploy Stage로 진행된다.

## 정리하며

오늘의 핵심은 세 가지다. 첫째, CodePipeline의 Stage/Action/Artifact 계층은 임의적인 설계가 아니라 DAG 기반의 명시적 의존성 표현이고, Artifact는 Action 간의 불변 계약이다. 둘째, S3 + KMS 조합은 Artifact의 내구성과 보안을 보장하며, Cross-Account에서는 KMS Key Policy가 반드시 함께 구성돼야 한다. 셋째, V2 Pipeline은 Execution Mode(SUPERSEDED/QUEUED/PARALLEL), Trigger Filter(브랜치/경로), Stage 조건(beforeEntry)으로 모노레포와 엔터프라이즈 요구를 지원하는 모던 표준이다.

다음 글에서는 이 구조 위에서 Tooling 계정과 Spoke 계정이 어떻게 IAM/S3/KMS 조합으로 연결되는지, Cross-Account 파이프라인의 구체적인 구성을 본다.

---

## 📝 연습 문제

**문제 1.** CodePipeline의 한 Stage 내에서 두 Action을 병렬로 실행하려면 어떻게 해야 하는가?

A) 두 Action을 서로 다른 Stage에 배치한다
B) 두 Action의 runOrder를 동일한 값으로 설정한다
C) Transition을 비활성화한다
D) Pipeline Execution Mode를 PARALLEL로 설정한다

**정답: B**
해설: runOrder는 Stage 내 Action의 실행 순서를 결정하는 정수값이다. 같은 runOrder를 가진 Action들은 병렬로 실행되고, 다른 runOrder를 가진 Action은 낮은 runOrder가 완료된 후 높은 runOrder가 실행된다. A는 Stage 간 관계이고(Stage 사이는 항상 직렬), C의 Transition 비활성화는 Stage 간 전이를 멈추는 것이며, D의 PARALLEL Execution Mode는 동일 Pipeline의 여러 실행을 동시에 허용하는 것이지 한 실행 내 Action 병렬화가 아니다.

---

**문제 2.** Tooling 계정의 CodePipeline이 Prod 계정 ECS에 배포한다. "S3 GetObject는 성공하지만 Artifact 압축 해제 시 AccessDenied가 발생한다"는 문제의 원인으로 가장 가능성 높은 것은?

A) S3 버킷 정책에 Prod 계정 Role이 누락
B) Prod 계정 CrossAccountDeployRole에 kms:Decrypt 권한 또는 KMS Key Policy에 해당 Role 누락
C) CodePipeline Service Role의 sts:AssumeRole 권한 부족
D) ECS Task Definition 형식 오류

**정답: B**
해설: S3 GetObject가 성공한다는 것은 S3 버킷 정책과 Prod 계정의 S3 접근 권한은 정상이라는 뜻이다. Artifact는 KMS로 암호화되어 있어서 다운로드 후 복호화가 필요하다. 복호화에는 kms:Decrypt 권한이 Prod 계정 Role의 IAM Policy에 있어야 하고, Tooling 계정의 KMS Key Policy에도 해당 Prod 계정 Role이 명시되어야 한다. 양쪽 중 하나라도 빠지면 "GetObject 성공, Decrypt 실패"가 된다. CloudTrail에서 `kms:Decrypt` AccessDenied 이벤트를 확인하면 즉시 진단된다.

---

**문제 3.** V2 Pipeline의 QUEUED Execution Mode가 필요한 시나리오로 가장 적절한 것은?

A) 빠른 main 브랜치 개발에서 최신 commit만 빌드하면 된다
B) 감사 요구사항으로 모든 commit의 배포 이력이 필요하고, 새 commit이 진행 중 빌드를 취소해서는 안 된다
C) 여러 PR 브랜치를 동시에 독립적으로 빌드해야 한다
D) Pipeline 실행 비용을 최소화해야 한다

**정답: B**
해설: QUEUED는 새 실행이 시작될 때 이전 실행을 취소하지 않고 큐에 추가해 FIFO 순서로 실행한다. 금융 규제나 SOC2 감사에서 "어떤 commit이 언제 prod에 배포됐는지"의 완전한 이력이 필요할 때 모든 commit 실행이 보장되어야 한다. A는 SUPERSEDED(기본)의 시나리오, C는 PARALLEL의 시나리오, D는 SUPERSEDED가 오히려 적게 실행되어 비용이 낮을 수 있다.

---

**문제 4.** CodePipeline에서 Artifact Store의 KMS 키를 Customer Managed Key(CMK)로 설정해야 하는 이유로 가장 적절한 것은?

A) CMK가 AWS 관리 키보다 저렴하다
B) Cross-Account 배포 시 KMS Key Policy에서 다른 계정 Role에게 권한을 부여할 수 있다
C) CMK가 더 강한 암호화 알고리즘을 사용한다
D) AWS 관리 키는 S3와 함께 사용할 수 없다

**정답: B**
해설: AWS 관리 키(aws/s3 등)는 Key Policy를 사용자가 수정할 수 없다. 따라서 다른 계정의 Role에게 Decrypt 권한을 부여하는 것이 불가능하다. CMK는 Key Policy를 완전히 제어할 수 있어서 Spoke 계정의 CrossAccountDeployRole을 Principal로 추가해 Decrypt를 허용할 수 있다. Cross-Account Artifact 공유를 위해 CMK가 필수인 이유다. 암호화 알고리즘(AES-256)은 동일하다.

---

**문제 5.** "주말 동안 prod 배포를 일시 중단하되, 빌드와 테스트는 계속 실행해야 한다"는 요구사항을 CodePipeline에서 구현하는 가장 적절한 방법은?

A) Pipeline 자체를 비활성화한다
B) Deploy Stage의 Inbound Transition을 비활성화한다
C) Deploy Stage의 Action을 삭제한다
D) IAM Role의 권한을 일시적으로 제거한다

**정답: B**
해설: Transition 비활성화는 특정 Stage로의 진입만 막는다. Deploy Stage의 Inbound Transition을 비활성화하면 Source→Build→Test Stage는 계속 정상 실행되지만, Test Stage 완료 후 Deploy Stage로 자동 전이가 차단된다. Pipeline 비활성화(A)는 모든 Stage를 멈추고, Action 삭제(C)는 되돌리기가 어려우며, IAM Role 수정(D)은 부작용이 크다. Transition은 `disable-stage-transition`과 `enable-stage-transition` API로 간단히 제어할 수 있다.

---

**문제 6.** Pipeline Execution Mode가 PARALLEL인 경우 발생할 수 있는 가장 심각한 문제는?

A) 파이프라인 실행이 느려진다
B) 두 실행이 동일한 prod 리소스(예: ECS Service, CloudFormation Stack)를 동시에 수정하려 할 때 충돌 또는 예측 불가능한 상태가 발생한다
C) Artifact 저장 비용이 두 배가 된다
D) IAM 권한이 자동으로 제한된다

**정답: B**
해설: PARALLEL 모드는 동시에 여러 Pipeline 실행을 허용하므로, 각 실행이 독립된 Artifact를 가지지만 대상 리소스(ECS Service, CloudFormation Stack, RDS)는 공유된다. 실행 A와 실행 B가 동시에 같은 ECS Service를 업데이트하려 하면 나중 업데이트가 먼저 업데이트를 덮어쓰거나 API 충돌이 발생한다. PARALLEL은 각 실행이 독립된 환경(별도 네임스페이스, 다른 리소스)을 대상으로 할 때만 안전하다—예: 각 PR이 독립된 스테이징 환경에 배포될 때.

---

**문제 7.** CodePipeline V2에서 Build Action(CodeBuild)이 생성한 IMAGE_TAG 값을 같은 Pipeline의 Deploy Stage에서 사용하려면 어떤 방법이 올바른가?

A) Lambda Invoke Action을 중간에 추가해서 S3에 저장하고 다음 Stage가 읽는다
B) CodeBuild의 exported-variables에 IMAGE_TAG를 정의하고 Deploy Action에서 `#{BuildVariables.IMAGE_TAG}`로 참조한다
C) Pipeline 변수(variables)를 미리 선언하고 CodeBuild가 그 값을 변경한다
D) buildspec.yml의 artifacts 섹션에 IMAGE_TAG를 포함시킨다

**정답: B**
해설: CodeBuild의 buildspec.yml에서 `exported-variables` 섹션에 변수 이름을 정의하면, 해당 환경 변수 값이 V2 Pipeline의 Action 출력 변수로 자동 노출된다. 다음 Stage의 Action에서 `#{BuildVariables.IMAGE_TAG}` 형식으로 참조한다. A의 S3 경유는 불필요한 복잡성이고, C의 방식은 Pipeline 변수를 런타임에 수정하는 것인데 이는 지원되지 않는다. D의 artifacts는 Artifact 파일을 지정하는 것이지 변수 노출이 아니다.

---
