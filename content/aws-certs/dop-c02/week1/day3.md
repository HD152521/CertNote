# Day 3 - AWS DevOps 도구 지도: Code* 시리즈와 그 너머의 진짜 그림

"AWS DevOps 도구가 뭐냐"고 물으면 대부분 "CodeCommit, CodeBuild, CodeDeploy, CodePipeline"이라고 답한다. 틀린 답은 아니지만 **절반도 못 본 답**이다. AWS의 DevOps 생태계는 30개가 넘는 서비스가 SDLC 전 단계에 걸쳐 분포해 있고, 이들이 어떻게 맞물리는지 한 장의 지도로 보지 못하면 시험 시나리오의 "이 서비스 조합 중 가장 적합한 것은?"이라는 질문에 답할 수 없다.

오늘은 그 지도를 그린다. 도메인 1-6 전부에 걸친 도구 카탈로그를, "어디서 어떤 기능을 담당하는가"의 흐름으로.

## Code* 시리즈의 탄생 — Jenkins 대안에서 통합 플랫폼까지

2014년 11월 re:Invent에서 AWS는 CodeCommit, CodeDeploy, CodePipeline을 동시 발표했다. 그 전까지 AWS는 IaaS 인프라(EC2, S3, RDS)에 집중했고, CI/CD는 고객이 알아서 Jenkins로 깔라는 입장이었다. 그런데 점점 "AWS에 배포할 건데 왜 Jenkins 서버를 따로 운영해야 하나"라는 요구가 커졌고, 답이 Code* 시리즈였다.

| 서비스 | 출시 | 대체 대상 |
|--------|------|-----------|
| CodeDeploy | 2014.11 | Capistrano, Fabric, Ansible |
| CodePipeline | 2015.07 | Jenkins, Bamboo, GoCD |
| CodeCommit | 2015.07 | GitHub Enterprise, GitLab, Bitbucket |
| CodeBuild | 2016.12 | Jenkins agents, Travis CI |
| CodeStar | 2017.04 (지금은 deprecating) | — |
| CodeArtifact | 2020.06 | JFrog Artifactory, Sonatype Nexus |
| CodeGuru | 2020.06 | SonarQube, Snyk |
| CodeCatalyst | 2022.12 | GitHub, GitLab (통합 플랫폼) |

이 진화에서 주목할 패턴은 두 가지. 첫째, **AWS는 각 단계의 도구를 분리해서 출시**했다(CodeBuild 따로, CodeDeploy 따로). 이게 GitLab/GitHub의 "한 플랫폼에 다 통합" 모델과 정반대다. 둘째, 2022년 CodeCatalyst가 등장하면서 AWS도 통합 플랫폼으로 가는 신호를 보냈다. 다만 시험 비중은 여전히 Code* 분리형 모델이 중심이다.

> 💡 **관련 이론**: Unix 철학의 "Do one thing and do it well"이 AWS Code* 시리즈에 직접적으로 반영되어 있다. 각 서비스가 한 단계만 담당하고, 다른 서비스와 IAM·이벤트 기반으로 느슨하게 결합. 이게 GitHub Actions의 "한 yaml에 다 적기"와 대비된다. trade-off: Code* 분리형은 학습 곡선이 가파르지만 fine-grained IAM 제어가 가능, 통합형은 빠르게 시작할 수 있지만 권한 분리가 어렵다.

## SDLC 6단계와 도구 매핑

```
[ SDLC 단계별 AWS 도구 지도 ]

PLAN     →  CODE      →  BUILD     →  TEST      →  RELEASE     →  DEPLOY      →  OPERATE
 |           |             |             |              |               |               |
Issues      CodeCommit    CodeBuild    CodeBuild      CodePipeline    CodeDeploy      CloudWatch
JIRA/       GitHub        GitHub       Inspector      CodeArtifact    ECS deploy      X-Ray
Linear      GitLab        Actions      CodeGuru       (versioning)    Lambda alias    Systems Manager
            S3 (artifact) Docker       SAST/DAST                      EB/AppRunner    DevOps Guru
                          ECR build                                                   Incident Manager
```

각 단계의 핵심:

### Plan (계획)
AWS는 자체 issue tracker가 없다. JIRA, Linear, Asana 같은 외부 도구를 쓰되, EventBridge로 통합. CodeCatalyst는 자체 issue tracker를 가지고 있어 통합 플랫폼 모델에 가깝다.

### Code (소스 관리)
- **CodeCommit**: Git 호환 관리형 저장소 (다만 2024부터 신규 가입 제한, GitHub 통합으로 무게중심 이동)
- **GitHub Actions ↔ AWS OIDC**: 가장 흔한 현대적 패턴. IAM Identity Provider로 GitHub OIDC token을 받아 AssumeRole, 정적 키 불필요.
- **GitLab + AWS**: 비슷한 OIDC 패턴 지원

### Build
- **CodeBuild**: buildspec.yml 기반 관리형 빌드. 컨테이너 이미지 빌드, 단위 테스트, 정적 분석을 phase별로 정의.
- **Amazon EC2 Image Builder**: AMI 빌드 파이프라인 자동화 (Packer 대체)
- **ECR**: 컨테이너 레지스트리 + 자동 취약점 스캔
- **CodeArtifact**: npm/pip/Maven/NuGet 사설 패키지 저장소

### Test
- CodeBuild 안에 통합 (별도 서비스 X)
- **CodeGuru Reviewer**: 자동 코드 리뷰 (Java/Python 정적 분석)
- **CodeGuru Profiler**: 런타임 성능 프로파일링
- **Inspector v2**: 컨테이너/EC2/Lambda 취약점 자동 스캔
- **AWS Device Farm**: 모바일 앱 자동 테스트

### Release
- **CodePipeline**: 모든 단계의 orchestrator. Stage → Action 구조.
- **CodeArtifact**: 빌드 산출물 버전 관리
- **S3**: artifact storage (CodePipeline 내부 산출물 저장소)

### Deploy
- **CodeDeploy**: EC2/On-Prem/Lambda/ECS 배포 자동화. AppSpec.yml 기반.
- **Elastic Beanstalk**: 풀-스택 PaaS (Heroku 스타일)
- **App Runner**: 컨테이너 PaaS (Cloud Run/Render 스타일)
- **AWS Proton**: 셀프 서비스 인프라 템플릿 (Platform Engineering 도구)

### Operate
- **CloudWatch** 일족: Metrics, Logs, Alarms, Dashboards, Synthetics, RUM, Evidently, Insights
- **X-Ray + ADOT**: 분산 추적
- **Systems Manager** 일족: Parameter Store, Run Command, Patch Manager, Session Manager, Automation, AppConfig
- **EventBridge + Chatbot**: 이벤트 기반 자동화
- **Incident Manager**: 사고 대응 워크플로

## CodePipeline 내부 구조 — action provider의 정체

CodePipeline은 단순한 trigger 도구가 아니다. 내부적으로 **action provider model**이라는 플러그인 아키텍처를 가진다.

```
[ CodePipeline 구조 ]

Pipeline
  └─ Stage (직렬 실행)
       ├─ Stage: Source
       │    └─ Action: CodeCommit / S3 / ECR / GitHub
       ├─ Stage: Build
       │    └─ Action: CodeBuild / Jenkins
       ├─ Stage: Test
       │    └─ Action (병렬): CodeBuild / DeviceFarm / 3rd party
       └─ Stage: Deploy
            └─ Action: CodeDeploy / ECS / CFN / Lambda invoke / Step Functions
```

각 Action은 **3가지 type** 중 하나:
- **AWS managed**: CodeCommit, CodeBuild, CodeDeploy 등 (AWS 서비스 직접 연결)
- **Custom action**: Lambda invoke로 임의 작업 정의
- **3rd party**: GitHub, Jenkins, BlazeMeter 등 (AWS Marketplace)

Action 간 데이터는 **artifact**로 전달된다. Source Action이 산출물을 S3에 zip으로 올리고, Build Action이 그 zip을 다운로드해 처리한 뒤 결과를 다시 S3에. 이 S3 bucket이 "pipeline artifact bucket"이고 KMS 키로 암호화된다.

> 🔍 **더 깊이**: Pipeline의 artifact passing은 모두 S3 PutObject/GetObject 호출이다. 그래서 한 stage 결과가 다음 stage로 가는 "전달 시간"은 사실 S3 업로드/다운로드 시간이다. 큰 모노레포(예: 500MB monorepo)는 stage 전이마다 수십 초씩 깎인다. 해결법 1) Artifact를 작게 쪼개기 2) Build Action에서 다음 단계가 쓸 것만 zip으로 묶기 3) CodeBuild local cache 활용 (artifact가 아닌 캐시 형태로).

> 💡 **관련 이론**: Action provider model은 Jenkins의 plugin model과 본질적으로 같지만, **isolation 모델이 다르다**. Jenkins plugin은 JVM 안에서 같이 돌아 plugin 하나가 죽으면 master 전체에 영향. CodePipeline action은 별도 IAM principal로 실행되며 각자 격리. 보안 측면에서는 CodePipeline이 우월, 유연성에서는 Jenkins가 우월하다는 trade-off.

## CodeBuild의 내부 — Docker 기반 격리 환경

CodeBuild는 매 빌드마다 **Docker container를 띄워서 buildspec.yml의 phase를 실행**하고 끝나면 destroy한다. 이게 곧 격리성과 멱등성의 핵심이다.

```
[ CodeBuild 빌드 한 번의 lifecycle ]

1. 트리거 (CodePipeline / EventBridge / API)
2. 컨테이너 provisioning (보통 5-30초)
3. INSTALL phase   → 의존성 설치
4. PRE_BUILD phase → 로그인, 환경 변수 셋업
5. BUILD phase     → 실제 빌드/테스트
6. POST_BUILD phase → 산출물 정리
7. Artifact upload → S3
8. 컨테이너 destroy
```

각 phase는 shell command 시퀀스. 한 command가 실패하면 그 phase가 실패하고, `on-failure` 옵션이 없으면 전체 빌드가 fail.

> 📚 **사례**: 한 회사가 CodeBuild로 Docker 이미지 빌드 시 매번 base image를 다시 pull 하는 문제로 빌드 시간이 20분 걸렸다. 분석 결과 컨테이너가 매번 destroy 되어 Docker layer cache가 사라지는 게 원인. 해결: ① S3 cache로 docker layer 저장 ② Docker Hub pull rate limit 회피 위해 ECR로 base image 이전 ③ Local NVMe SSD cache 옵션 활성화. 결과 빌드 시간 20분 → 4분.

> ⚠️ **함정**: CodeBuild는 기본적으로 **별도 VPC 없이 실행**된다(AWS-managed VPC 사용). 그래서 사내 패키지 저장소(VPC 내부 Artifactory)나 RDS에 접근하려면 별도로 VPC 설정 + ENI 생성이 필요하다. 이 ENI 생성이 빌드 시작 시간을 30-60초 늘린다. 시험에서 "VPC 내부 자원 접근하면서 빌드 시간 최소화" 시나리오의 답은 "VPC 설정 + ENI warm-up" 또는 "VPC 외부에서 접근 가능한 패키지 미러 사용".

## Systems Manager — DevOps 영역에서 가장 저평가된 무기

Systems Manager(SSM)는 시험에서 가장 깊고 가장 자주 출제되는 서비스 중 하나다. 단순히 "Parameter Store가 있는 곳"이 아니다.

| 기능 | 용도 | DevOps 시나리오 |
|------|------|----------------|
| **Parameter Store** | 구성 값 저장 (계층적 path) | env별 DB 연결 문자열, feature flag |
| **Secrets Manager** | 시크릿 + 자동 회전 (별도 서비스) | DB 비밀번호, API 키 회전 |
| **Run Command** | 다수 EC2에 명령 실행 | 일괄 패치, 로그 수집 |
| **Patch Manager** | OS 패치 자동화 | Patch baseline, maintenance window |
| **Session Manager** | 브라우저 기반 SSH (포트 22 안 열어도 됨) | bastion 제거 |
| **State Manager** | 원하는 상태 유지 (configuration drift 방지) | "모든 EC2에 CloudWatch agent 설치" |
| **Inventory** | EC2/온프레미스 소프트웨어 목록 자동 수집 | 자산 관리, compliance |
| **Compliance** | Patch + Config 통합 compliance | 규제 보고서 |
| **Automation** | Runbook 자동 실행 | "장애 시 ASG 재시작" |
| **AppConfig** | Feature flag + 점진적 롤아웃 | A/B 테스트, dark launch |
| **OpsCenter** | 운영 이벤트 통합 워크플로 | 중앙 사고 관리 |
| **Distributor** | 소프트웨어 패키지 배포 | 사내 agent 배포 |

특히 **SSM Automation**은 시험의 핵심이다. 사고 자동 복구 시나리오의 거의 모든 답이 "EventBridge → SSM Automation Runbook"으로 끝난다.

> 🎯 **시나리오**: "RDS Read Replica의 replication lag이 60초를 넘으면 자동 복구"가 시험에 나오면 답은 다음 조합이다. ① CloudWatch Alarm (ReplicaLag > 60) ② EventBridge rule (alarm state change) ③ SSM Automation runbook(`AWS-RestartRdsInstance` 또는 custom) ④ SNS로 운영팀 통보. 모든 단계가 코드(JSON/YAML)로 정의 가능.

## CloudWatch 일족 — 단일 서비스가 아니라 생태계

CloudWatch는 한 서비스가 아니라 **10+ 서브 서비스의 묶음**이다.

| 서브 서비스 | 용도 |
|------------|------|
| Metrics | 메트릭 수집/저장 (custom + AWS-managed) |
| Logs | 로그 수집 (CloudWatch Logs Agent, CloudWatch Agent) |
| Alarms | 메트릭 기반 알림 |
| Dashboards | 시각화 |
| Logs Insights | 로그 쿼리 (KQL-like) |
| Synthetics | URL canary (외부 monitoring) |
| RUM | Real User Monitoring (JS SDK) |
| Evidently | A/B 테스트 + feature flag (AppConfig와 별개) |
| Container Insights | ECS/EKS/Fargate 전용 메트릭 |
| Lambda Insights | Lambda 전용 메트릭 |
| Application Insights | 자동 anomaly detection |
| Contributor Insights | top talker 분석 |
| ServiceLens | X-Ray + CloudWatch 통합 view |

이 생태계의 핵심은 **EMF (Embedded Metric Format)**이다. Lambda나 ECS 컨테이너에서 stdout으로 특정 JSON 형식의 로그를 출력하면, CloudWatch가 그것을 자동으로 metric으로 추출한다. 별도 CloudWatch API 호출 없이도 custom metric을 만들 수 있다는 뜻이다.

```json
// EMF 형식 예시 (stdout 출력)
{
  "_aws": {
    "Timestamp": 1640000000000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp",
      "Dimensions": [["Endpoint"]],
      "Metrics": [{"Name": "Latency", "Unit": "Milliseconds"}]
    }]
  },
  "Endpoint": "/api/users",
  "Latency": 42
}
```

> 🔍 **더 깊이**: EMF의 핵심 장점은 "metric과 log가 같은 데이터로 함께 저장"된다는 것이다. CloudWatch Logs Insights로 로그를 쿼리하다 "이 시점에 latency가 spike 했네" 싶으면 즉시 같은 데이터의 metric chart로 갈 수 있다. 별도 metric API 호출이 없어 비용도 절감(metric 호출당 $0.01이 아니라 logs 비용으로 통합).

## X-Ray vs ADOT — 분산 추적의 두 갈래

AWS 분산 추적은 두 선택지가 있다.

**X-Ray**: AWS-native 추적 서비스. SDK 통합이 쉽고 IAM·CloudWatch와 자동 연결. 단점은 OpenTelemetry 표준이 아니라 vendor lock-in.

**ADOT (AWS Distro for OpenTelemetry)**: OpenTelemetry 표준 구현. CNCF 표준이라 Jaeger, Tempo, Grafana 등으로 데이터 보낼 수도 있고 X-Ray로 보낼 수도 있다.

시험에서 둘을 구분하는 키워드:
- "OpenTelemetry 표준 유지" → ADOT
- "Multi-cloud 환경" → ADOT
- "AWS 전용, 가장 쉽게 시작" → X-Ray
- "Jaeger/Tempo로 데이터 export" → ADOT

> 💡 **관련 이론**: OpenTelemetry는 OpenTracing(2016)과 OpenCensus(Google, 2018)가 2019년에 CNCF에서 합쳐진 표준이다. W3C의 Trace Context 표준(traceparent header)도 통합. 이게 클라우드 vendor lock-in을 줄이는 핵심 표준이고, AWS는 X-Ray를 deprecating 하지 않으면서도 ADOT을 동시에 밀고 있다. 시험은 둘 다 알아야 한다.

## EventBridge — 자동화의 결합 조직

EventBridge(구 CloudWatch Events)는 AWS 자동화의 글루(glue). 90+ AWS 서비스가 EventBridge로 이벤트를 송신하고, EventBridge가 그 이벤트를 rule로 매칭해 target(Lambda, SSM Automation, Step Functions 등)으로 전달한다.

```
[ EventBridge 흐름 ]

Source                Bus               Rule              Target
------                ---               ----              ------
EC2 state change  →  default        →  pattern match  →  Lambda
S3 PutObject      →  custom bus     →  schedule cron  →  SSM Automation
Code* events      →  partner bus    →  archive replay →  Step Functions
SaaS (PagerDuty)  →                                      SNS / SQS
```

핵심 패턴 3가지:
1. **Event pattern matching**: JSON 패턴으로 이벤트 필터 (e.g., `{"source":["aws.ec2"],"detail":{"state":["stopped"]}}`)
2. **Schedule rule**: cron 표현식으로 주기 실행 (CloudWatch Events Cron)
3. **EventBridge Pipes** (2022): Source → (Filter → Enrich → Target) — Kafka처럼 stream 처리 가능

> 📚 **사례**: 한 회사가 매일 새벽 3시에 RDS 스냅샷 → cross-region 복사 → 7일 후 자동 삭제 워크플로를 구축했다. 도구 조합: ① EventBridge schedule (`cron(0 3 * * ? *)`) → ② Lambda (snapshot 생성) → ③ Lambda (copy to DR region) → ④ EventBridge rule (snapshot complete) → ⑤ SSM Automation runbook (7일 후 삭제 tag). 전부 코드(CDK)로 정의되어 git에 들어간다.

## DevOps Guru — ML 기반 anomaly detection

AWS DevOps Guru(2020 출시)는 CloudWatch 메트릭에 머신러닝을 돌려 anomaly를 자동 검출한다. 사용자가 알람 임계값을 설정하지 않아도 "이 메트릭이 평소와 다르다"를 자동 발견.

시험에서는 "어느 도구가 자동으로 운영 이상을 검출하나"라는 키워드가 나오면 DevOps Guru. 단 비용이 높아 실무 채택률은 그리 높지 않다(인스턴스당 monthly fee).

## AWS Proton — Platform Engineering 도구

Proton은 "내부 개발자 플랫폼(IDP)"을 위한 AWS 도구다. Platform 팀이 환경 템플릿(CloudFormation/Terraform)을 정의해 등록하고, 개발자는 셀프 서비스로 "프로젝트 생성"을 누르면 표준 환경이 자동 프로비저닝된다. 시험 비중은 낮지만, Platform Engineering 트렌드를 반영해 등장 가능.

## 종합 — 도메인별 핵심 도구

| 도메인 | 비중 | 핵심 도구 |
|--------|------|-----------|
| 1. SDLC 자동화 | 22% | CodePipeline, CodeBuild, CodeDeploy, CodeCommit, CodeArtifact |
| 2. 구성 관리 & IaC | 17% | CloudFormation, CDK, SAM, SSM Parameter Store, AppConfig |
| 3. 복원력 | 15% | Route 53, Multi-Region, Aurora Global, DynamoDB Global, Resilience Hub, FIS |
| 4. 모니터링 & 로깅 | 15% | CloudWatch (전 일족), X-Ray, ADOT, OpenSearch |
| 5. 인시던트 & 이벤트 대응 | 14% | EventBridge, SSM Automation, Chatbot, Incident Manager, Lambda |
| 6. 보안 & 컴플라이언스 | 17% | GuardDuty, Security Hub, Config, Inspector, Macie, Audit Manager, IAM |

이 표가 시험 직전에 머리에 떠올라야 한다.

## 정리하며

오늘 본 그림은 단순하다. **AWS DevOps는 30+ 서비스의 생태계**이고, 시험은 그 중 어느 조합이 시나리오에 가장 적합한지를 묻는다. Code* 시리즈는 시작점이지 끝이 아니다. SSM Automation, EventBridge, CloudWatch 일족, X-Ray/ADOT, Inspector, Config — 이 모두가 시나리오 풀이의 필수 어휘다.

다음 글에서는 멀티 계정 전략(Organizations, Control Tower, IAM Identity Center)으로 들어간다. Professional 시험의 거의 모든 시나리오는 멀티 계정 환경이 기본 가정이라, 이 토대 없이는 다음 주제를 이해할 수 없다.

---

## 📝 연습 문제

**문제 1.** CodePipeline의 한 Stage 결과를 다음 Stage로 전달하는 메커니즘은?

A) HTTP POST request
B) S3 artifact bucket을 통한 zip 파일 전달
C) DynamoDB stream
D) Kafka topic

**정답: B**
해설: CodePipeline의 모든 artifact는 **S3 bucket에 zip으로 저장**되어 다음 Stage가 GetObject로 가져간다. 이 S3가 "pipeline artifact bucket"이고 KMS 키로 암호화. 큰 monorepo는 이 S3 업로드/다운로드 시간이 빌드 시간보다 길어질 수 있어 artifact 크기 최적화가 중요. 시험에서 "artifact 전달 메커니즘", "cross-region pipeline" 등의 질문이 나오면 S3 + KMS가 핵심.

---

**문제 2.** CodeBuild가 VPC 내부의 RDS에 접근해야 한다. 가장 정확한 설정은?

A) CodeBuild는 항상 VPC 안에서 실행되므로 별도 설정 불필요
B) CodeBuild 프로젝트에 VPC 구성을 명시 + Security Group + Subnet 지정, 다만 빌드 시작 시 ENI 생성으로 30-60초 추가
C) RDS를 public으로 노출
D) Lambda를 통한 우회 접근

**정답: B**
해설: CodeBuild는 **기본적으로 AWS-managed VPC에서 실행**된다. 사내 VPC 자원(RDS, Artifactory) 접근하려면 프로젝트에 VPC 구성을 명시해야 하고, 그러면 빌드 시작 시 ENI를 생성하는 데 30-60초 소요. 시험에서 "VPC 내부 접근 + 빌드 시간 최소화" 시나리오는 ENI warm-up 패턴이나 VPC 밖에서 접근 가능한 미러 사용이 답. C는 보안상 금지, D는 우회 안티패턴.

---

**문제 3.** CloudWatch EMF(Embedded Metric Format)의 가장 큰 장점은?

A) Lambda 콜드 스타트 감소
B) stdout 출력만으로 custom metric 생성 가능, 별도 API 호출 불필요로 비용 절감
C) X-Ray와 자동 통합
D) DynamoDB로 메트릭 저장

**정답: B**
해설: EMF는 stdout에 특정 JSON 형식을 출력하면 CloudWatch가 자동으로 metric을 추출하는 메커니즘. 별도 PutMetricData API 호출이 없어서 ① 비용 절감(metric API 호출당 비용 없음) ② 로그와 metric이 같은 timestamp로 정렬돼 디버깅 쉬움 ③ Lambda/Fargate 같은 짧은 lifecycle 환경에서 metric 누락 방지. 시험에서 "Lambda에서 custom metric 비용 효율적으로" 키워드가 나오면 EMF가 답.

---

**문제 4.** SSM Automation을 EventBridge와 결합한 자동 복구 시나리오의 일반적 흐름은?

A) CloudWatch Alarm → EventBridge → SSM Automation Runbook → SNS
B) Lambda → SSM Parameter Store → CloudWatch
C) IAM Role → CodePipeline → CodeDeploy
D) Route 53 → CloudFront → S3

**정답: A**
해설: 자동 복구의 표준 패턴은 ① CloudWatch Alarm이 metric 기반 이상 감지 ② Alarm state change가 EventBridge로 이벤트 송신 ③ EventBridge rule이 매칭해 SSM Automation Runbook 호출 ④ Runbook이 복구 절차(EC2 재시작, ASG scale-out 등) 자동 실행 ⑤ 결과를 SNS로 운영팀에 통보. 모든 단계가 코드(JSON/YAML)로 정의되어 git에 들어간다. 시험에서 "자동 remediation" 시나리오는 거의 다 이 패턴.

---

**문제 5.** X-Ray와 ADOT 중 어떤 것을 선택해야 하는 시나리오로 가장 정확한 매칭은?

A) 멀티 클라우드 환경 + OpenTelemetry 표준 유지 → X-Ray
B) AWS 전용 + 가장 빠르게 시작 → ADOT
C) Jaeger와 X-Ray 양쪽으로 trace 데이터 export → ADOT
D) Lambda 한 함수만 trace → 둘 다 똑같음

**정답: C**
해설: ADOT는 OpenTelemetry 표준 구현이라 Jaeger, Tempo, Grafana 등으로 자유롭게 export 가능. 멀티 클라우드, 다중 backend 시나리오는 ADOT. X-Ray는 AWS-native라 가장 쉬운 시작점이지만 vendor lock-in. A와 B는 매칭이 뒤바뀌어 있다. D는 사실 아니다 — 같은 Lambda여도 ADOT은 export 다양성이 X-Ray보다 풍부.

---

**문제 6.** AWS DevOps Guru가 가장 적합한 시나리오는?

A) 매뉴얼 임계값 기반 알람
B) 머신러닝으로 anomaly를 자동 검출, 사용자가 임계값 설정 불필요
C) 비용 최적화
D) 단순 로그 검색

**정답: B**
해설: DevOps Guru는 CloudWatch 메트릭에 ML을 돌려 anomaly를 자동 검출. 사용자가 "CPU > 80%" 같은 임계값을 미리 설정하지 않아도 "평소와 다른 패턴"을 검출. 비용이 높아 실무 채택률은 제한적이지만, "ML 기반 운영 이상 검출" 키워드는 항상 DevOps Guru. A는 CloudWatch Alarm, C는 Cost Explorer, D는 CloudWatch Logs Insights.

---

**문제 7.** CodePipeline의 Custom Action에 Lambda를 사용할 때 그 본질적 이유는?

A) Lambda가 가장 빠르다
B) AWS-managed action으로 표현할 수 없는 임의 로직(예: 외부 API 호출, custom 승인 흐름)을 코드로 구현하기 위해
C) IAM 권한 분리가 더 쉽다
D) 비용이 가장 저렴하다

**정답: B**
해설: Custom action(Lambda invoke)의 본질은 "**AWS-managed action만으로 표현 안 되는 워크플로**" 구현. 예: 외부 ITSM 티켓 자동 생성, custom 승인 알고리즘(JIRA 상태 체크), 데이터 변환. Lambda가 PutJobSuccessResult / PutJobFailureResult API를 호출해 결과를 CodePipeline에 통보. A, C, D는 부차적 장점이지 본질 이유가 아님.

---

**문제 8.** "Pipeline-as-Code" 원칙에 가장 부합하는 CodePipeline 운영 방식은?

A) AWS Console에서 GUI로 생성
B) CDK / CloudFormation / Terraform으로 pipeline 정의를 git에 두기
C) AWS CLI로 매번 새로 생성
D) Lambda로 동적 생성

**정답: B**
해설: Pipeline-as-Code의 핵심은 "**파이프라인 정의 자체가 git에 코드로 들어간다**". CDK Pipelines(`@aws-cdk/pipelines`), CloudFormation, Terraform aws_codepipeline 리소스로 정의. 변경 시 PR + 리뷰 거치고, 롤백 시 git revert. A는 코드가 아니라 GUI 상태로 남음(버전 관리 불가), C는 일시적, D는 동적 생성이지만 정의가 git에 있는 형태가 아니라면 IaC 원칙 위배.
