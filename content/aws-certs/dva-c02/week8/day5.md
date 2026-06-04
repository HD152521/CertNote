# Day 40 - Week 8 종합 복습: CI/CD 파이프라인을 머릿속에서 끝까지 돌려보기

이번 주를 시작할 때만 해도 "Code* 시리즈가 다섯 개나 있다"는 게 부담이었을 텐데, 한 주를 지나고 보면 다섯 서비스가 사실은 한 흐름의 다섯 단계라는 게 보인다. CodeCommit이 코드를 받고, CodeBuild가 빌드하고, CodeDeploy가 배포하고, CodePipeline이 그 전체를 이어 붙이고, Elastic Beanstalk가 모든 걸 한 번에 추상화한다. 이 흐름을 머릿속에서 막힘없이 그릴 수 있으면 DVA-C02의 CI/CD 영역은 사실상 끝난다.

이번 글은 단순 요약이 아니다. **각 서비스를 다시 한 번 깊이 비교**하고, **이번 주에 자주 헷갈렸던 함정들을 일렬로 정리**하고, **실전 시험 유형의 시나리오 문제 12개**로 점검한다. 마지막 점검은 "정답을 맞히는 것"이 아니라 "왜 다른 보기는 틀렸는지를 설명할 수 있는가"의 자체 채점이다.

## 5개 서비스의 본질을 한 줄로

다섯 서비스가 각각 어떤 문제를 풀려고 만들어졌는지를 한 줄로 정리하면 다음과 같다.

| 서비스 | 풀려는 문제 | 핵심 추상화 |
|--------|-------------|------------|
| **CodeCommit** | "기업 컴플라이언스를 만족하는 IAM 통합 Git 호스팅" | 저장소 = IAM 리소스 |
| **CodeBuild** | "빌드 인프라를 직접 관리하지 않고 buildspec 한 장으로 끝" | 빌드 = ephemeral container |
| **CodeDeploy** | "배포라는 위험한 순간을 작은 단계로 쪼개고 검증" | 배포 = 라이프사이클 hook |
| **CodePipeline** | "여러 도구를 순서대로 자동 연결하는 워크플로우 엔진" | 파이프라인 = stage + action |
| **Elastic Beanstalk** | "코드만 던지면 인프라 전체를 자동 구성하는 PaaS" | 환경 = CloudFormation 스택 |

> 💡 **관련 이론**: 이 다섯 서비스의 분리는 "Single Responsibility Principle"의 시스템 레벨 적용이다. 한 서비스가 모든 걸 하는 monolith를 만드는 대신, 각 서비스가 하나의 책임만 갖고 잘 정의된 인터페이스(IAM, S3 artifact, EventBridge)로 연결되도록 설계했다. 그래서 어느 한 서비스만 별도로 쓰는 것도 가능하다(예: CodeBuild만 쓰고 다른 CI는 Jenkins, 배포는 GitHub Actions). 시험에서 "Code* 시리즈는 반드시 함께 써야 한다"는 보기는 항상 오답이다.

## 헷갈리기 쉬운 비교 25쌍

이번 주 학습 중 가장 자주 혼동되는 개념 쌍을 모두 정리한다. 시험 직전 마지막 점검용.

| A | B | 핵심 차이 |
|---|---|----------|
| CodeCommit | GitHub | IAM 통합 vs OAuth/PAT |
| CodeCommit Triggers | Notifications | SNS/Lambda vs AWS Chatbot(Slack/Chime) |
| buildspec.yml | appspec.yml | CodeBuild 빌드 정의 vs CodeDeploy 배포 정의 |
| install | pre_build | 런타임/의존성 설치 vs 빌드 직전 작업(테스트, 인증) |
| build | post_build | 메인 빌드 vs 빌드 후 정리/푸시 |
| `variables` | `parameter-store` | 평문 vs SSM SecureString(KMS) |
| `parameter-store` | `secrets-manager` | 수동 회전 vs 자동 회전 |
| BUILD_GENERAL1_* | BUILD_LAMBDA_* | EC2 컨테이너 vs Firecracker microVM |
| Cache LOCAL | Cache S3 | 호스트 재사용 한정 vs 영구 공유 |
| In-Place | Blue/Green | 같은 인스턴스 파일 교체 vs 새 환경 |
| AllAtOnce | OneAtATime | 빠름/위험 vs 느림/안전 |
| Canary | Linear | 10% 두고 100%로 점프 vs 균등 증가 |
| ApplicationStop | ApplicationStart | 이전 revision 스크립트 vs 현재 revision 스크립트 |
| ValidateService | AfterAllowTraffic | In-Place 검증 vs Blue/Green 트래픽 전환 후 검증 |
| EC2 CodeDeploy | ECS CodeDeploy | In-Place 또는 B/G vs Blue/Green only |
| ECS rolling | ECS CodeDeploy B/G | ECS service 자체 vs CodeDeploy 사용 |
| Pipeline V1 | V2 | 단순 stage/action vs 변수+필터+실행모드 |
| Pipeline SUPERSEDED | QUEUED | 새 실행이 옛것 취소 vs 순서대로 |
| Action runOrder 같음 | 다름 | 병렬 vs 순차 |
| Source 카테고리 | Invoke 카테고리 | 코드 가져오기 vs 임의 함수 실행 |
| Manual Approval | Lambda Invoke 검증 | 사람의 결정 vs 자동 검증 |
| Beanstalk Rolling | Immutable | 같은 ASG 순차 vs 새 ASG 통째 |
| Beanstalk Web | Worker | ALB+HTTP vs SQS Daemon+백그라운드 |
| .ebextensions | .platform | AL1 전통 vs AL2/AL2023 권장 |
| Beanstalk Blue/Green | Traffic Splitting | 수동 URL swap vs ALB weighted 자동 |

## 이번 주의 함정 20가지

시험에서 자주 나오는 미세 함정들을 정리한다. 하나하나가 단독 출제 가능.

1. **CodeCommit은 2024년 7월부터 신규 가입 불가** — 그러나 기존 고객은 계속 사용, 시험엔 여전히 출제.
2. **HTTPS Git Credentials는 IAM 콘솔 로그인 비밀번호와 별개** — 별도 발급 필요.
3. **Credential Helper는 매 git operation마다 SigV4로 새 password 생성** — EC2 인스턴스 프로파일 자동 인증.
4. **CodeBuild는 매 빌드마다 fresh container** — startup 10-30s, LOCAL 캐시는 호스트 재사용 시만 동작.
5. **CodeBuild 환경변수 `variables`는 평문** — 비밀은 parameter-store(SecureString) 또는 secrets-manager.
6. **CodeBuild에서 Docker 빌드 시 privileged: true 필수** — DinD 패턴.
7. **CodeBuild VPC 모드는 ENI 프로비저닝으로 startup +30s** — 인터넷 outbound 사라짐, 각종 endpoint 필요.
8. **buildspec.yml의 post_build는 build 실패 시에도 실행** — `CODEBUILD_BUILD_SUCCEEDING` 변수로 분기.
9. **buildspec.yml의 exported-variables가 후속 stage로 전달** — CodePipeline에서 `#{BuildVariables.X}`.
10. **CodeDeploy EC2 배포는 Agent 필수** — Lambda/ECS는 Agent 없음.
11. **ECS는 CodeDeploy로 Blue/Green만 가능** — In-Place는 ECS service의 자체 rolling.
12. **EC2 ApplicationStop은 이전 revision의 스크립트가 실행** — 새 스크립트는 다음 배포 때.
13. **AllAtOnce 배포는 1개 인스턴스만 성공해도 deployment success** — 서비스 가용성은 별개.
14. **Lambda Canary와 Linear의 결정적 차이는 "한 번에 100%로 vs 균등 증가"**.
15. **Lambda BeforeAllowTraffic/AfterAllowTraffic 훅은 PutLifecycleEventHookExecutionStatus 호출 필수** — 안 하면 1시간 timeout.
16. **CodePipeline V2의 트리거 필터는 CodeStar Source Connection만 지원** — CodeCommit은 EventBridge rule로.
17. **CodePipeline artifact bucket은 파이프라인과 같은 리전 필수** — Cross-Region 시 각 리전에 별도.
18. **Manual Approval은 7일 응답 없으면 자동 거부**.
19. **Beanstalk 환경 안에 RDS를 만들면 환경 삭제 시 함께 삭제** — production은 외부에.
20. **Beanstalk Worker는 ALB가 없고 SQS Daemon이 HTTP로 변환** — application은 일반 HTTP 서버.

## DVA-C02 특화 주제: 시험 자주 출제되는 5가지 깊이 포인트

### 1. Lambda Firecracker와 CodeBuild Lambda compute

CodeBuild BUILD_LAMBDA compute type(2023년 말 출시)은 내부적으로 Firecracker microVM 위에서 빌드 컨테이너를 띄운다. Firecracker는 AWS가 2018년 오픈소스화한 KVM 기반 microVM 모니터로, 100ms 이내 부팅과 5MB 메모리 풋프린트를 자랑한다. Lambda와 Fargate가 내부적으로 사용하는 격리 기술이고, "초경량 VM과 컨테이너의 중간"을 노린 설계.

> 🔍 **더 깊이**: Firecracker가 일반 Docker 컨테이너와 다른 점은 **하드웨어 가상화(KVM) 레벨 격리**다. Docker는 리눅스 namespace + cgroup으로 격리하므로 커널을 공유하지만, Firecracker는 각 VM이 자기 커널을 갖는다. 그래서 multi-tenant 환경(여러 고객의 코드를 같은 호스트에서 실행)에서 보안 boundary가 훨씬 강하다. Lambda가 처음부터 다른 고객 함수 코드를 같은 호스트에서 돌리면서도 안전했던 비결이 여기 있다.

### 2. DynamoDB 파티션과 hot partition (간접적으로 시험)

CodeBuild가 결과를 DynamoDB에 저장하는 패턴, 또는 Lambda + DynamoDB의 흔한 조합에서 hot partition 문제가 시험에 나온다. DynamoDB는 partition key의 hash 값으로 데이터를 분산하는데, 모든 쓰기가 한 partition key로 몰리면 그 파티션만 throttle된다. 해결책은 ① write sharding (suffix 추가) ② Adaptive Capacity 활성화(default) ③ partition key 설계 재검토.

### 3. API Gateway와 SigV4

API Gateway에 IAM 인증을 설정하면 클라이언트가 모든 요청을 SigV4로 서명해야 한다. CodeBuild에서 API Gateway 호출 시 자동으로 SigV4 서명 가능(boto3/aws-sdk가 처리). 시험에서 "Lambda → API Gateway 호출 시 IAM 인증" 시나리오가 흔하다.

### 4. SQS at-least-once와 Beanstalk Worker

Beanstalk Worker 환경의 SQS Daemon은 SQS의 **at-least-once delivery**를 그대로 application에 노출한다. 즉 같은 메시지가 두 번 처리될 수 있고, application은 idempotency를 보장해야 한다. message ID나 deduplication ID를 DynamoDB에 기록해 중복 처리 방지하는 패턴이 표준.

### 5. X-Ray sampling과 CI/CD 파이프라인

빌드 중인 application에 X-Ray instrumentation을 추가하면 production에서 trace가 수집되는데, 모든 요청을 sampling하면 비용 폭증. X-Ray의 기본 sampling rule은 "처음 1초당 1개 요청 + 추가 5% sampling"이다. 시험에서 "X-Ray 비용 절감"이 나오면 sampling rule 조정이 답.

## CI/CD 전체 흐름 한 번에 그리기

이번 주의 모든 서비스가 함께 동작하는 production-grade CI/CD를 한 번 그려보자.

```
[개발자] git push origin feature/new-api
              │
              ▼
[CodeCommit (또는 GitHub via Code Connection)]
              │
              │ EventBridge 즉시 트리거
              ▼
[CodePipeline V2 "myapp-pipeline"]
   │
   ├── Stage 1: Source
   │     Action: CodeCommit Source (output: SourceOutput)
   │
   ├── Stage 2: Validate (병렬 실행, runOrder=1)
   │     Action A: CodeBuild "lint" (input: SourceOutput)
   │     Action B: CodeBuild "security-scan" (Snyk, Bandit)
   │     Action C: CodeBuild "unit-test" (output: TestReport)
   │
   ├── Stage 3: Build
   │     Action: CodeBuild "build"
   │             - install: nodejs 20, docker
   │             - pre_build: ECR login, IMAGE_TAG export
   │             - build: docker build & push to ECR
   │             - post_build: imagedefinitions.json
   │             (output: BuildOutput with imagedefinitions.json)
   │
   ├── Stage 4: Deploy-Staging
   │     Action: ECS CodeDeploy Blue/Green
   │             - 새 task definition으로 Green tasks 배포
   │             - ALB Test Listener로 smoke test
   │             - Production Listener swap
   │             - 5분 후 Blue tasks 종료
   │
   ├── Stage 5: Integration Test
   │     Action: CodeBuild "integration-test"
   │             - staging endpoint에 대해 Postman/Pytest
   │
   ├── Stage 6: Manual Approval
   │     Action: Manual Approval
   │             - SNS notification → Slack via Chatbot
   │             - 7일 timeout
   │
   └── Stage 7: Deploy-Production
         Action: ECS CodeDeploy Blue/Green
                 - Lambda hook BeforeAllowTraffic: contract test
                 - 10% canary 10분 → 100% (LambdaCanary10Percent10Minutes 패턴)
                 - CloudWatch Alarm 위반 시 자동 롤백
```

> 📚 **사례**: Airbnb는 2019년 InfoQ 발표에서 자체 CI/CD 파이프라인의 변천사를 공유했다. 처음에는 Jenkins monolith → 마이크로서비스화하면서 각 팀이 자체 파이프라인 → 결국 표준화된 "deploy board"라는 추상화로 회귀. 핵심 교훈은 "파이프라인 자체가 너무 다양해지면 운영 부담이 폭증한다, 표준 템플릿이 필수"였다. AWS의 CodePipeline + CloudFormation 조합으로 같은 패턴을 만들 수 있다 — CFN으로 파이프라인 템플릿을 정의해두면 모든 신규 서비스가 같은 모양의 파이프라인을 자동 갖춤.

## 다른 클라우드의 동등 서비스 매핑

| AWS | GCP | Azure |
|-----|-----|-------|
| CodeCommit | Cloud Source Repositories | Azure Repos |
| CodeBuild | Cloud Build | Azure Pipelines (Build) |
| CodeDeploy | (없음, Cloud Deploy 출시 중) | Azure Pipelines (Release) |
| CodePipeline | Cloud Build triggers + Cloud Deploy | Azure Pipelines |
| Elastic Beanstalk | App Engine / Cloud Run | Azure App Service |
| CodeArtifact | Artifact Registry | Azure Artifacts |

> 💡 **관련 이론**: GCP는 처음부터 통합 도구(Cloud Build)로 시작해 추후 deploy 도구를 분리했고, Azure는 GitHub 인수 후 GitHub Actions와 Azure Pipelines가 공존하는 어색한 구조다. AWS는 4개 도구를 분리하고 CodePipeline으로 연결하는 모델인데, 이는 "각 도구가 단독으로도 가치 있어야 한다"는 분리 철학과 "조합 시 시너지"라는 통합 철학의 균형이다.

## 정리하며

CI/CD라는 단어를 너무 신비하게 보지 말자. 핵심은 "사람이 매번 수동으로 하던 release 절차를, 한 번 정의해두면 그 다음부터는 자동으로 흘러간다"는 한 가지 약속이다. 그 약속의 구체적 구현이 이번 주의 5개 서비스이고, 각 서비스는 자기 자리에서 한 가지 역할만 잘 한다.

DVA-C02 시험 직전 점검 포인트: ① 5개 서비스의 역할 1줄 매핑 ② CodeDeploy 배포 전략별 trade-off ③ Lambda 배포 9가지 사전 정의 구성 ④ Beanstalk 6가지 배포 전략 ⑤ CodePipeline V2 신기능. 이 5가지를 자기 언어로 30초 안에 설명할 수 있으면 출제 범위의 80%를 잡는다.

다음 주에는 데이터 보안, IAM, KMS, Secrets Manager — DVA-C02의 또 다른 핵심 축인 보안 영역을 본다.

---

## 📝 종합 시나리오 연습 문제 (12문항)

**문제 1.** 한 핀테크 회사가 모든 코드 변경에 대해 ① 보안 스캔(Snyk) ② 단위 테스트 ③ lint를 **병렬로** 실행하고, 세 가지 모두 통과해야 다음 단계로 진행하려 한다. CodePipeline 구성으로 옳은 것은?

A) 세 작업을 각각 별도 stage에 배치하고 각 stage 사이에 자동 전환을 설정
B) 한 stage에 세 액션을 두고 runOrder를 1, 2, 3으로 지정해 의존 순서를 명시
C) 한 stage에 세 액션을 모두 runOrder=1로 지정
D) 세 작업을 각각 별도 파이프라인으로 분리하고 EventBridge로 완료를 집계해 게이트 구성

**정답: C**

해설: 같은 stage 안에서 동일한 runOrder를 가진 액션들은 병렬 실행되고, 모두 성공해야 stage 자체가 성공으로 처리된다. A) 별도 stage는 항상 순차 실행이라 병렬 불가. B) 다른 runOrder는 1 → 2 → 3 순차. D) 별도 파이프라인은 통합 통과 게이트 만들기 어려움. 시험에서 "한 단계에서 여러 검증 병렬 실행"의 표준 답.

---

**문제 2.** 한 e-commerce 회사가 Lambda 기반 결제 처리 함수를 배포하려 한다. 새 버전이 잘못되면 결제 실패로 직결되므로, **처음 10분 동안 10%만 트래픽을 받은 후 자동 검증을 통해 점진적으로 100%로 가야** 한다. 또한 CloudWatch Alarm `ErrorRate > 1%`가 발생하면 자동 롤백돼야 한다. 가장 적합한 구성은?

A) `LambdaCanary10Percent10Minutes` + Auto Rollback (DEPLOYMENT_STOP_ON_ALARM)
B) `LambdaLinear10PercentEvery1Minute` + Auto Rollback (DEPLOYMENT_FAILURE)
C) `LambdaAllAtOnce` + 사후 모니터링
D) `LambdaCanary10Percent5Minutes` + Manual Approval

**정답: A**

해설: 문제는 "10%를 10분 두고 한 번에 100%로" + "Alarm으로 자동 롤백"이다. A) Canary10Percent10Minutes가 정확히 시나리오에 일치, AutoRollback의 DEPLOYMENT_STOP_ON_ALARM이 CloudWatch Alarm 위반 시 자동 롤백을 만든다. B) Linear는 균등 증가로 "한 번에 100%로"라는 조건과 어긋남, DEPLOYMENT_FAILURE만으로는 Alarm 기반 롤백 안 됨. C) AllAtOnce는 점진적 전환 없음. D) 5분은 시간 조건 불일치, Manual Approval은 자동이 아님. Canary와 Linear의 구분이 핵심.

---

**문제 3.** ECS Fargate 기반 마이크로서비스를 CodeDeploy로 Blue/Green 배포하려 한다. 다음 중 **필수 사전 조건이 아닌 것**은?

A) ECS service의 deploymentController.type을 CODE_DEPLOY로 설정
B) ALB Target Group 2개 (Production + Test)와 두 개의 listener(Production listener + Test listener) 구성
C) appspec.json(또는 appspec.yaml)에 TaskDefinition과 LoadBalancerInfo, ContainerName/ContainerPort 명시
D) Fargate task definition의 컨테이너에 CodeDeploy Agent sidecar를 추가하고 lifecycle hook 스크립트 마운트

**정답: D**

해설: ECS(Fargate 또는 EC2)는 **CodeDeploy Agent가 필요 없다**. ECS service가 task definition swap과 target group 전환을 처리하고, CodeDeploy는 그 오케스트레이션을 담당. Agent는 EC2/온프레미스 배포에서만 필요. A/B/C는 모두 필수. 시험에서 "ECS + Agent" 보기는 거의 항상 함정.

---

**문제 4.** CodeBuild가 사설 서브넷의 Aurora 클러스터에 접속해 DB 마이그레이션을 실행해야 한다. 현재 빌드는 default 환경(AWS managed VPC)에서 실행 중이고 Aurora 접속이 안 된다. 가장 적합한 해결은?

A) Aurora 클러스터를 public으로 변경
B) CodeBuild 프로젝트를 사용자 VPC 모드로 전환하고 적절한 subnet + security group 지정, ECR/S3/Secrets Manager용 VPC Endpoint 구성
C) CodeBuild가 호출하는 Lambda 함수를 통해 우회 접속
D) DB 마이그레이션을 EC2 bastion에서 수동 실행

**정답: B**

해설: 기본 CodeBuild는 AWS managed VPC에서 실행돼 사용자 사설 리소스에 접근 불가. VPC 모드로 전환하면 지정 subnet에 ENI가 만들어져 사설 리소스 접근 가능. 단 인터넷 outbound가 사라지므로 ECR pull, S3 artifact, CloudWatch Logs send, Secrets Manager fetch 등을 위한 VPC Endpoint를 모두 만들어야 함. A) public 노출은 보안 안티패턴. C) Lambda 우회는 불필요한 복잡성. D) 수동은 자동화 원칙 위배. 시험에서 "CodeBuild가 사설 리소스 접근"이 보이면 VPC 모드 + endpoints가 정답.

---

**문제 5.** Beanstalk 환경에 새 버전을 배포하면서 **다운타임 없이 가장 빠르게 롤백이 가능**하고, **production 인스턴스 용량이 절대 감소해서는 안 되며**, **추가 비용 일시 2배를 허용**한다. 가장 적합한 배포 전략은?

A) Rolling
B) Rolling with Additional Batch
C) Immutable
D) All at once

**정답: C**

해설: 조건 ① 다운타임 없음 ② 빠른 롤백 ③ 용량 감소 없음 ④ 2배 비용 허용을 모두 만족하는 건 Immutable. 새 ASG를 통째로 띄워 v2를 배포하고 검증 후 swap. 실패 시 새 ASG만 삭제하면 끝(빠른 롤백). 기존 ASG는 배포 내내 그대로라 용량 유지. A) Rolling은 용량 감소 발생. B) Rolling with Additional Batch는 용량 유지하지만 롤백이 재배포라 느림. D) AllAtOnce는 다운타임 있음. 시험에서 4가지 조건 묶음이 보이면 Immutable이 답.

---

**문제 6.** 한 SaaS 회사가 Source 계정에서 CodePipeline을 운영하고, **Prod 계정**의 ECS service에 배포하려 한다. 다음 중 필요한 구성을 **모두** 고르면?

A) Source 계정 pipeline 서비스 역할에 Prod 계정 cross-account role에 대한 sts:AssumeRole 권한
B) Prod 계정에 Source 계정을 신뢰하는 CrossAccountDeployRole 생성
C) Artifact S3 bucket의 KMS CMK Key Policy에 양쪽 계정 permission
D) Artifact S3 bucket policy에 Prod 계정 read 권한
E) Prod 계정 ECS service에 Agent 설치

**정답: A, B, C, D (E 제외)**

해설: Cross-Account 배포의 정석 chain. A) Source의 pipeline role이 Prod role을 assume할 수 있어야 함. B) Prod에 Source를 신뢰하는 role. C) artifact 암호화 KMS CMK가 cross-account 사용 가능해야 — 한쪽 계정만 권한 있으면 다른 계정에서 복호화 불가. D) artifact bucket의 bucket policy에 Prod 계정 read 권한. E)는 ECS와 무관 — Agent는 EC2/온프레미스만. 이 4가지 chain이 시험의 단골 답.

---

**문제 7.** Beanstalk Worker 환경에서 SQS 메시지가 **간헐적으로 두 번 처리**되는 현상을 발견했다. 원인과 해결은?

A) SQS는 at-least-once delivery이므로 정상 동작이며, application에서 idempotency를 구현해야 한다
B) Beanstalk의 SQS Daemon 버그이므로 AWS Support에 문의
C) Auto Scaling Group이 너무 많이 띄워졌으므로 인스턴스 수 줄이기
D) SQS visibility timeout을 0으로 설정

**정답: A**

해설: SQS Standard Queue는 at-least-once delivery 모델이라 같은 메시지가 두 번 이상 전달될 수 있다. Beanstalk Worker 환경의 SQS Daemon이 이를 그대로 application HTTP로 전달하므로, application은 message ID나 deduplication ID를 DynamoDB에 기록해 중복 처리 방지(idempotency)를 구현해야 한다. 이게 분산 시스템의 표준 패턴. B) AWS 버그 아님. C) 인스턴스 수와 무관. D) visibility timeout 0은 즉시 메시지가 다시 보이게 해 더 많은 중복 발생. FIFO 큐로 바꾸는 것도 한 방법이지만 처리량 제한(초당 300건) 때문에 대부분 Standard + idempotency 패턴.

---

**문제 8.** CodePipeline 파이프라인이 production 배포에 실패할 때마다 **JIRA에 자동으로 incident ticket을 생성**하고 싶다. 가장 적합한 구성은?

A) CodeStar Notifications → AWS Chatbot → Slack에서 사람이 JIRA 등록
B) EventBridge rule (FAILED 상태 감지) → Lambda → JIRA REST API 호출
C) CloudWatch Logs Insight에서 5분마다 실패 로그 조회 후 JIRA 등록
D) CodePipeline 콘솔에서 JIRA 통합 옵션 활성화

**정답: B**

해설: 자동 JIRA 티켓 생성처럼 "복잡한 조건부 자동화"는 EventBridge rule로 상태 변경을 감지하고 Lambda로 외부 API를 호출하는 표준 패턴. A)는 사람의 수동 작업 필요. C)는 매우 비효율적인 polling. D)는 콘솔에 JIRA 통합 옵션 없음. CodeStar Notifications는 Slack/Chime 같은 사전 정의된 채널에 적합하고, JIRA처럼 임의 시스템 통합은 EventBridge + Lambda가 정답.

---

**문제 9.** CodeBuild에서 빌드 도중 동적으로 결정된 `IMAGE_TAG` 값을 **다음 stage의 CodeDeploy 액션에 전달**하려 한다. 적합한 메커니즘은?

A) buildspec.yml의 `env.exported-variables`에 `IMAGE_TAG` 명시 → CodePipeline에서 `#{BuildVariables.IMAGE_TAG}` 참조
B) buildspec.yml의 `env.variables`에 정적 정의
C) DynamoDB에 저장하고 다음 stage에서 조회
D) S3에 텍스트 파일로 저장하고 다음 stage에서 다운로드

**정답: A**

해설: CodeBuild의 `exported-variables`는 빌드 중 export된 환경변수를 후속 CodePipeline stage로 전달하는 표준 메커니즘. 빌드 phase에서 `export IMAGE_TAG=$(git rev-parse --short HEAD)` 후 buildspec에 export 명시하면 다음 stage가 `#{BuildVariables.IMAGE_TAG}`로 참조 가능. B)는 정적 값이라 동적 결정 불가. C/D)는 가능하지만 추가 권한과 코드 필요해 비효율. 시험에서 "빌드 → 배포로 변수 전달"의 표준 답.

---

**문제 10.** CodeDeploy로 EC2에 In-Place 배포 중인 fleet(100대)에 CloudWatch Alarm `ErrorRate > 5%`가 발생했다. 자동 롤백이 동작하려면 어떤 설정 조합이 필요한가?

A) DeploymentGroup의 AlarmConfiguration에 알람 등록 + AutoRollbackConfiguration.Events에 DEPLOYMENT_STOP_ON_ALARM 포함
B) CloudWatch Alarm action에 직접 CodeDeploy stop API 등록
C) Lambda 함수를 만들어 알람 시 수동 stop 호출
D) ASG의 health check type을 ELB로 변경

**정답: A**

해설: CodeDeploy 자동 롤백은 두 설정이 모두 활성화돼야 동작. ① AlarmConfiguration에 모니터링할 알람을 등록해야 CodeDeploy가 알람 상태를 polling/구독 ② AutoRollbackConfiguration.Events에 `DEPLOYMENT_STOP_ON_ALARM`이 있어야 알람 발생 시 자동 롤백. B) CloudWatch Alarm은 SNS/EC2 action만 직접 지원, CodeDeploy API 직접 호출 불가. C) 가능하지만 비효율적이고 race condition 가능. D) 무관. 시험에서 "배포 중 알람 → 자동 롤백" 시나리오의 단골 답.

---

**문제 11.** 한 회사가 Beanstalk 환경에서 production DB로 외부 RDS를 사용 중이다. 환경 변수로 DB endpoint와 비밀번호를 주입하고 있는데, 비밀번호를 30일마다 자동 회전하면서 application도 자동으로 새 비밀번호를 받게 하려 한다. 가장 적합한 구성은?

A) .ebextensions의 `option_settings`에 비밀번호를 평문으로 저장하고 주기적으로 수동 업데이트
B) AWS Secrets Manager에 DB 자격증명 저장 + 자동 회전 활성화, .ebextensions에서 SSM Parameter Store reference로 endpoint만 주입하고 application 코드에서 Secrets Manager API로 비밀번호 fetch
C) S3 bucket에 비밀번호 파일을 저장하고 인스턴스가 주기적으로 다운로드
D) EC2 user data에 비밀번호 하드코딩

**정답: B**

해설: Secrets Manager는 RDS/Aurora 자격증명의 native 자동 회전(Lambda 기반)을 제공. application은 SDK로 비밀번호를 실시간 fetch하므로 회전 발생 즉시 새 값 사용 가능. .ebextensions로는 endpoint나 비밀명만 주입하고, 실제 비밀번호는 application 코드에서 동적 조회. A) 평문 저장은 보안 위반 + 회전 수동. C) S3 파일은 회전 자동화 어려움. D) 하드코딩은 회전 불가능. 시험에서 "자동 회전"이 키워드면 Secrets Manager가 거의 항상 답.

---

**문제 12.** CodeBuild로 빌드 중인 Java application의 단위 테스트 결과(JUnit XML)를 CodeBuild 콘솔에서 시각화해 보고 싶다. 필요한 buildspec.yml 설정은?

A) `artifacts.files`에 XML 파일을 추가하고 `artifacts.name`으로 S3 산출물 경로를 지정
B) `reports` 섹션에 file-format을 JUNITXML로 지정하고 파일 경로 명시
C) `cache.paths`에 XML 경로를 추가하고 cache.type을 LOCAL_CUSTOM_CACHE로 설정
D) `env.exported-variables`에 JUNIT_XML을 추가하고 후속 stage에서 `#{BuildVariables.JUNIT_XML}`로 참조

**정답: B**

해설: CodeBuild의 `reports` 섹션은 테스트 결과를 별도로 처리해 콘솔에서 시각화한다. JUnit XML, Cucumber JSON, TestNG, NUnit, Visual Studio TRX 등 5가지 포맷 지원, 보존 기간 기본 30일. A) artifacts는 빌드 산출물 일반 저장으로 테스트 시각화 안 됨. C) cache는 의존성 캐시. D) exported-variables는 변수 전달. 시험에서 "테스트 결과 시각화" + buildspec이 보이면 reports 섹션이 정답.

```yaml
reports:
  jest_reports:
    files:
      - 'junit.xml'
    file-format: JUNITXML
    base-directory: 'test-results'
```
