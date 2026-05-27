# Day 5 - Week 7 복습: 서버리스 CI/CD의 모든 조각을 한 그림에

이번 주를 한 문장으로 정리하면 "**서버리스 워크로드의 CI/CD는 IaC 도구 선택부터 배포 전략, 워크플로 오케스트레이션까지 한 묶음으로 봐야 한다**"이다. 어제까지 본 SAM(Day 1), Serverless Framework·CDK(Day 2), Lambda Version·Alias·CodeDeploy Canary(Day 3), Step Functions(Day 4)는 모두 같은 그림의 다른 면이다. 시험에 나오는 시나리오 문제는 거의 항상 두세 개 도구를 결합한 형태로 출제되므로, 각 도구가 어디서 빛나고 어디서 약한지를 정확히 매칭하는 능력이 합격을 가른다.

오늘은 이번 주 다섯 가지 핵심 축을 다시 정리하고, 실제 시험 패턴과 유사한 시나리오 12문항으로 종합 점검한다. 단순 사실 암기를 넘어 "이 시나리오의 어느 키워드가 어느 답을 호출하는지"의 매핑을 외워두는 게 목표다.

## 다섯 가지 축 정리

### 축 1: IaC 도구 선택 — 워크로드 성격과 팀 언어가 결정

| 시나리오 키워드 | 적합한 도구 | 이유 |
|------------------|--------------|------|
| "Lambda + API Gateway + Dynamo만, YAML" | **SAM** | CFN Macro로 서버리스 6종 최적화, 학습 곡선 낮음 |
| "Lambda 200개, 멀티 stage, 풍부한 플러그인" | **Serverless Framework** | Node 플러그인 생태계 (단 v4 라이선스 검토) |
| "Lambda + EKS + RDS + OpenSearch + TS 팀" | **CDK** | 모든 AWS 리소스 L2 추상화 + grant 메서드 + L3 사내 라이브러리 |
| "멀티 클라우드 (AWS+GCP+Azure)" | **Terraform** | Provider 모델로 클라우드 무관 |
| "CFN 거버넌스(StackSets, Drift) 그대로 + 서버리스 단순화" | **SAM** | CFN의 모든 기능 호환 |
| "사내 9000 Stack + 표준 패턴 라이브러리 필요" | **CDK** | L3 Construct로 재사용 가능 추상화 |

### 축 2: Lambda 배포 — Version/Alias 모델

핵심 명제: **Version은 불변 스냅샷, Alias는 가변 포인터**. Git commit/branch, Docker image digest/tag와 같은 발상.

```
publish-version  →  V7 (불변, 영구히 변하지 않음)
update-alias --function-version 7  →  live가 V7 가리킴
```

| 기능 | 동작 |
|------|------|
| `$LATEST` | 가변 working copy, weighted routing 불가, PC 불가 |
| Version 숫자 | 불변, 자원 정책과 PC만 변경 가능 |
| Alias weighted | primary + 1 additional만 (최대 2-way) |
| API Gateway 통합 | `${stageVariables.alias}` + `add-permission --qualifier <alias>` |
| CodeDeploy Canary | `AutoPublishAlias` + `DeploymentPreference` 한 줄 |

### 축 3: Cold Start 완화 — PC와 SnapStart의 정확한 구분

| 기법 | 적용 런타임 | 비용 | 효과 |
|------|--------------|------|------|
| Provisioned Concurrency | 모든 런타임 | 활성 시간 과금 | Cold start 0 (PC 용량 내) |
| SnapStart | Java 11/17/21, Python 3.12+, .NET 8+ (zip만) | Java 무료, Py/.NET 유료 | Init 시간 90% 단축 |
| Reserved Concurrency | 모든 | 무료 | 동시 한도 (cold start와 무관) |
| ARM 아키텍처 | 호환 런타임 | 20% 저렴 | Init 10~20% 빠름 |

### 축 4: Step Functions — Standard vs Express

| 항목 | Standard | Express |
|------|----------|---------|
| 시간 | 1년 | 5분 |
| 보장 | Exactly-once | At-least-once |
| 동기 호출 | 불가 | 가능 (StartSyncExecution) |
| TaskToken | ✅ | ❌ |
| 가격 | 상태 전이당 | 호출 + 실행 시간 |
| 사용 | 배포 워크플로, 사람 승인 | API 백엔드, IoT, ETL |

### 축 5: 통합 흐름 — 한 그림으로

```
   ┌─ Source (Git) ──→ CodePipeline ──→ CodeBuild (sam build) ──→ CFN Deploy ──┐
   │                                                                                                         ↓
   │                                                                                Lambda 새 Version V7 게시
   │                                                                                                         ↓
   │                                                              CodeDeploy: Alias 'live' weighted (V6:90, V7:10)
   │                                                                                                         ↓
   │                                                              5분 대기 + CloudWatch Alarm 모니터
   │                                                                                                         ↓
   │                                                                            ┌─ Alarm OK → V7:100
   │                                                                            └─ Alarm → V6:100 (롤백)
   │
   └─ 복잡한 흐름 → Step Functions로 위임
      ├─ AWS SDK Service Integration (Lambda 없이 직접 호출)
      ├─ TaskToken (사람 승인, 외부 시스템)
      └─ Distributed Map (대용량 병렬)
```

## 헷갈리기 쉬운 비교표

| A | B | 가르는 키워드 |
|---|---|----------------|
| SAM | CDK | YAML 서버리스 특화 vs 코드 범용·모든 AWS |
| SAM | Serverless Framework | AWS 네이티브·OSS vs 멀티 클라우드·v4 상업 |
| Standard SFn | Express SFn | 1년·exactly-once vs 5분·at-least-once |
| Provisioned Concurrency | Reserved Concurrency | 워밍업·유료 vs 한도·무료 |
| Lambda zip | Container Image | 250MB·Layer 가능 vs 10GB·Layer 불가·SnapStart 불가 |
| `$LATEST` | Version 숫자 | 가변·PC 불가 vs 불변·PC 가능 |
| Alias weighted | Version 100% | Canary 두 단계 vs All-at-once |
| Inline Map | Distributed Map | 40 동시·부모 history 영향 vs 1만 동시·child execution |
| `.sync` integration | `.waitForTaskToken` | 자동 완료 대기 vs 외부 콜백 대기 |
| sam deploy | sam sync | CFN 표준 경로 vs 개발 가속·drift 위험 |

> 💡 **관련 이론**: 이 표의 모든 비교는 트레이드오프 모델의 전형이다. CAP 정리(2000년 Eric Brewer), PACELC(2010년 Daniel Abadi), Conway의 법칙(1968) 같은 시스템 디자인 원칙이 IaC와 워크플로 도구에도 동일하게 적용된다. 예를 들어 Standard SFn의 exactly-once는 가용성/성능을 일부 희생한 일관성 보장이고, Express의 at-least-once는 반대의 트레이드. 시험 시나리오는 거의 항상 "어느 trade가 더 중요한가"를 묻는다.

> 🎯 **시나리오**: 이번 주 도구 5개의 결합으로 다음 그림을 그리는 문제가 시험에 나올 수 있다 — "CDK로 Lambda+DynamoDB+API Gateway 합성 → CodePipeline Source/Build → SAM Canary로 배포 → 30분 모니터링 → Step Functions로 멀티 리전 순차 배포 + 사람 승인". 이 흐름의 각 단계에서 어느 서비스가 책임지는지 묻는 문제는 거의 매번 출제.

> 📚 **사례**: 2023년 AWS Summit Seoul에서 한 핀테크 회사가 발표한 사례 — Lambda 1500개를 CDK + SAM 혼합으로 운영. 단순 서버리스(API+Lambda+Dynamo)는 SAM, 복잡 인프라(Lambda+EKS+OpenSearch+Step Functions)는 CDK, 배포 워크플로는 CodePipeline + Step Functions로 분리. 각 도구의 강점을 정확히 매칭한 결과 배포 시간 70% 단축. 시험에서 "여러 도구를 어떻게 조합?"의 답은 "각 도구의 강점에 맞춰 분리" — 한 도구로 모든 걸 하려는 건 안티패턴.

## 핵심 함정 정리

> ⚠️ **함정 1**: `add-permission --qualifier`를 빠뜨려 API Gateway가 Alias 호출 시 403. Function ARN 권한은 `$LATEST`만 허용.

> ⚠️ **함정 2**: SnapStart로 모든 호출에서 같은 UUID/random 생성. `org.crac.Resource`의 `afterRestore` Hook에서 재초기화 필수.

> ⚠️ **함정 3**: SAM Policy Template은 광범위(GSI/LSI 포함). PCI/HIPAA에선 `Statement` 직접 작성으로 정확한 ARN 제한.

> ⚠️ **함정 4**: `sam sync --watch`는 CFN 우회 → drift 발생. 프로덕션에서 다음 정규 deploy가 변경 덮어씀.

> ⚠️ **함정 5**: PC는 `$LATEST`에 설정 불가, Alias/Version에만. Canary 중 두 Version 모두 PC라 비용 2배 일시 상승.

> ⚠️ **함정 6**: Container Image Lambda는 Layer 불가, SnapStart 불가. 모든 의존성을 Dockerfile에 포함.

> ⚠️ **함정 7**: Alias weighted routing은 primary + 1 additional만. 3-way는 ALB target group이나 Route 53 weighted 필요.

> ⚠️ **함정 8**: Step Functions Express는 TaskToken 미지원. 사람 승인 워크플로는 반드시 Standard.

---

## 🧠 종합 시나리오 문제 12개

### 시나리오 1

**문제 1.** 한 SaaS 팀이 Lambda 200개를 Serverless Framework v3로 운영 중인데, v4 상업 라이선스 적용으로 연간 비용이 부담된다. 가장 합리적인 마이그레이션 경로는?

A) Terraform으로 이전 — CFN 거버넌스 자산 모두 폐기
B) SAM 또는 CDK로 이전 — 둘 다 Apache 2.0 OSS, CFN 거버넌스(StackSets, Drift) 유지
C) v3에 영구히 머무름 — 보안 패치 위험
D) 자체 IaC 도구 개발

**정답: B**
해설: SLS v4(2023.2)는 연 매출 200만 달러 이상 기업에 상업 라이선스 적용. 같은 사례로 Terraform도 2023.8에 BSL로 전환했지만 OpenTofu fork로 대응. AWS-only 워크로드면 SAM(YAML 친숙) 또는 CDK(코드 추상화) 둘 다 무료. SLS yml과 SAM template은 구조가 비슷해 마이그레이션이 비교적 단순. C는 보안 위험, D는 비현실적, A는 CFN 자산 폐기로 부담 큼.

---

### 시나리오 2

**문제 2.** Java Spring Boot Lambda(메모리 1GB, 패키지 80MB, init 8초)의 P99 latency를 1초 미만으로 만들고 싶다. 비용도 최소화. 가장 효과적인 조합은?

A) Provisioned Concurrency 100개
B) SnapStart 활성화 + Runtime Hook(`afterRestore`)에서 SecureRandom 재초기화 → 300~500ms로 단축, 비용 무료
C) Java를 Node.js로 재작성
D) Reserved Concurrency 100

**정답: B**
해설: SnapStart는 JVM init 단계의 메모리 스냅샷을 만들어 init 시간을 90% 단축. Java zip 패키지는 무료. 단 uniqueness assumption violation(같은 random seed)을 Runtime Hook으로 재초기화 필수. PC(A)는 동일 효과지만 활성 시간 과금. C는 거대한 리팩토링, D는 한도 설정이지 cold start와 무관. SnapStart 도입 후 비용 변동 없이 latency 95% 감소.

---

### 시나리오 3

**문제 3.** S3 데이터 레이크에서 매일 5000만 JSON 객체(평균 50KB)를 변환·집계해야 한다. 1% 실패 허용, 운영 부담 최소화. 가장 적합한 패턴은?

A) Spark on EMR 클러스터 운영
B) Step Functions Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) Lambda 5000만 직접 호출
D) Glue Crawler

**정답: B**
해설: Distributed Map(2022)이 정확한 답. Spark 클러스터(A)는 운영 부담 큼. Lambda 직접 호출(C)은 throttle·동시성 한도·에러 처리 미흡. Glue Crawler(D)는 스키마 발견용, 변환 작업 부적합. Distributed Map의 강점 — (1) MaxConcurrency 10000, (2) child workflow Express라 비용 저렴, (3) ItemBatcher로 효율, (4) ToleratedFailurePercentage로 부분 실패 허용, (5) ResultWriter로 S3 자동 저장. 광고 회사 사례처럼 Spark 대비 비용 60% 절감.

---

### 시나리오 4

**문제 4.** API Gateway REST API가 Lambda Alias `live`를 가리키는데, 코드 변경마다 API 재배포가 발생해 운영이 번거롭다. 가장 깔끔한 구성은?

A) Stage Variable `lambdaAlias=live` + Integration URI에 `${stageVariables.lambdaAlias}` + `add-permission --qualifier live`
B) 매 배포마다 새 API Gateway 생성
C) Lambda Function URL로 변경
D) CloudFront 추가

**정답: A**
해설: Stage Variable 패턴(가장 흔한 시험 출제)이 정확한 답. Integration URI에 `${stageVariables.alias}`를 사용하면 API 재배포 없이 Stage Variable만 바꿔도 라우팅 변경. 또 한 API에서 dev Stage는 `lambdaAlias=staging`, prod Stage는 `lambdaAlias=live`로 환경 분리 가능. `--qualifier` 누락은 가장 흔한 403 원인. B는 비효율, C는 다른 패턴, D는 무관.

---

### 시나리오 5

**문제 5.** 한 팀이 sam local invoke로 모든 통합 테스트를 통과한 후 production에 배포했다. Lambda가 즉시 throttle되고 API Gateway가 30초 timeout으로 5xx를 반환. 가장 가능성 높은 원인은?

A) Lambda 코드 버그
B) VPC 내부 RDS Proxy 연결 시 ENI 생성에 8~10초 소요. 로컬은 호스트 네트워크라 이 latency가 에뮬레이션되지 않음
C) IAM Role 부재
D) API Gateway 설정 오류

**정답: B**
해설: 2020년 핀테크 사례 그대로. sam local은 RIE 기반 Docker 컨테이너로 Lambda Runtime API를 정확히 재현하지만 (1) Cold start 시간, (2) VPC ENI 생성, (3) IAM Role의 deny 정책, (4) Lambda CPU 비율은 에뮬레이션 안 됨. 교훈: 로컬은 로직 검증, integration test는 반드시 dev/staging 클라우드 환경. 해결책은 RDS Proxy + Provisioned Concurrency + VPC endpoint 최적화. A/C/D는 시나리오와 무관.

---

### 시나리오 6

**문제 6.** Lambda zip 패키지에 ML 모델(2.5GB)을 포함해야 한다. zip 한도 초과. 가장 적합한 패키징 방식은?

A) Lambda Layer 4개로 분리 (Layer당 250MB 한도라 불가)
B) Lambda Container Image (10GB 한도) + 자체 ECR 저장소 + DockerImageFunction
C) S3에서 매번 런타임에 다운로드 (Cold start 10초+)
D) EFS 마운트 (운영 복잡)

**정답: B**
해설: 2020년 12월 출시된 Lambda Container Image의 핵심 사용 사례. 10GB 한도 + 자체 OS 도구 포함 가능. ARM 빌드는 `docker buildx --platform linux/arm64`. CDK는 `lambda.DockerImageFunction.fromImageAsset()`. 단 Container는 Layer 사용 불가, SnapStart 미지원, cold start가 zip 대비 2~3배. A는 250MB×4=1GB라 부족, C는 cold start 폭증·다운로드 비용, D는 EFS 추가 비용·복잡도.

---

### 시나리오 7

**문제 7.** CodePipeline에서 us-east-1 → eu-west-1 → ap-northeast-2 순차 배포 중 EUW1 단계에서 알람 발동 시 USE1과 EUW1을 역순 롤백해야 한다. 가장 적합한 구성은?

A) 각 리전 CFN Deploy Action 3개 + Manual Approval로 사람이 롤백
B) Step Functions Action + ASL로 각 리전 ResultPath에 deploymentId 누적 + Choice로 알람 체크 + Catch로 역순 RollbackEUW1 → RollbackUSE1 자동
C) Lambda 하나에 모든 로직 인라인
D) 별도 Pipeline 3개로 분리

**정답: B**
해설: 복잡 분기·역순 롤백은 Step Functions의 전형적 강점. CodePipeline은 단순 직선 흐름에 최적, 자동 역순 롤백 같은 분기 로직은 SF에 위임이 표준. CDK + SF의 typed workflow로 표현 가능. AWS SDK Service Integration(`arn:aws:states:::aws-sdk:codedeploy:createDeployment`)으로 Lambda 없이 직접 호출. A는 사람 수동 롤백이라 RTO 위반, C는 복잡도 폭증·디버깅 불가, D는 리전 간 의존성 표현 불가.

---

### 시나리오 8

**문제 8.** 프로덕션 배포 시 보안팀 → DevOps 팀 → 자동 배포 3단계 승인, 각 단계 7일 안에 응답 없으면 자동 취소, 통보는 Slack interactive message. 가장 적합한 워크플로 엔진과 패턴은?

A) CodePipeline ManualApprovalAction 3개
B) Standard Step Functions + `.waitForTaskToken` 3회 + SNS→Slack→Lambda(SendTaskSuccess) + TimeoutSeconds: 604800
C) Express Step Functions
D) EventBridge Scheduler

**정답: B**
해설: Standard만 TaskToken 지원, Express는 미지원(C 오답). 7일 timeout은 Standard의 강점(Express 5분 한도). Slack interactive message → Lambda → `SendTaskSuccess(token, output)` 패턴. Capability-based security(Henry Levy 1984)의 클라우드 구현. CodePipeline ManualApprovalAction(A)도 가능하지만 (1) Slack 통보·인증 흐름 복잡, (2) 분기·롤백 표현이 SF보다 약함. EventBridge Scheduler(D)는 정기 실행용으로 부적합.

---

### 시나리오 9

**문제 9.** 한 팀이 `sam sync --watch`를 production 환경에 사용 중. 며칠 후 다음 정규 `sam deploy`가 hotswap 변경을 모두 덮어썼다. 가장 정확한 원인 설명은?

A) sam sync는 코드를 `update-function-code` API로 직접 패치 → CFN 스택 상태와 실제가 어긋남(drift) → 다음 sam deploy가 CFN 상태 기준으로 변경을 덮어쓰며 hotswap이 사라짐
B) Lambda 버그
C) Region 불일치
D) Layer 충돌

**정답: A**
해설: sam sync(2021)의 의도된 한계. 개발 가속용으로 명시되어 있고 production 금지. 동일 패턴이 `cdk deploy --hotswap`. CloudFormation의 ChangeSet/Rollback 트래킹을 우회하므로 변경 이력·승인 워크플로 무력화. 해결책은 (1) production은 sam deploy + CodeDeploy Canary, (2) `sam deploy --no-disable-rollback` 같은 명시적 보호, (3) production IAM에서 sam sync 권한 제거. B/C/D는 사실이 아님.

---

### 시나리오 10

**문제 10.** 한 회사가 1500개 Lambda 함수를 CDK로 관리 중. 각 팀이 비슷한 함수 패턴(Lambda + DynamoDB + API Gateway + IAM grant + X-Ray + Powertools)을 반복 작성하고 있다. 운영 표준화와 재사용성을 어떻게 확보?

A) 모든 팀이 SAM Policy Template만 사용
B) 사내 L3 Construct 라이브러리 작성 — 표준 패턴(보안·태깅·로깅·tracing)을 추상화한 `StandardApiFunction` 같은 Construct 배포
C) CloudFormation YAML 템플릿 공유 폴더
D) 모든 코드를 monorepo에 통합

**정답: B**
해설: Liberty Mutual의 9000 Stack 사례(2022). CDK L3 Construct는 여러 L2를 묶은 검증된 패턴. 사내 `@mycorp/standard-constructs` 패키지로 배포해 모든 팀이 5분 만에 표준 패턴 배포. SAM(A)은 추상화 도구 부재라 같은 효과 불가. CFN YAML(C)은 코드 추상화 부족. Monorepo(D)는 조직 결합 증가. CDK의 본질적 가치는 단순히 "코드로 인프라"가 아니라 **재사용 가능한 인프라 추상화 라이브러리**를 만들 수 있다는 점.

---

### 시나리오 11

**문제 11.** CDK Pipelines에 `selfMutation: true`를 켜고 production 운영 중. 어느 날 잘못된 파이프라인 정의를 push해 self-mutation이 깨진 파이프라인을 deploy. 다음 실행이 깨진 파이프라인으로 시작되어 정상 복구 불가. 가장 적절한 예방·복구 전략은?

A) selfMutation을 끔
B) Break-glass IAM 권한 유지 + 콘솔에서 수동으로 파이프라인 정의 롤백 + feature branch에서 `cdk diff` 미리 검증 + Stage별 분리 테스트
C) AWS Support 요청만으로 복구
D) Pipeline을 매번 재생성

**정답: B**
해설: Self-mutating GitOps의 잘 알려진 anti-pattern. 2021년 Stripe도 비슷한 사고. 방어책은 (1) Break-glass IAM(콘솔에서 CDK 우회 수정 가능한 emergency role) 유지, (2) feature branch에서 `cdk diff` 항상 검토, (3) Staging에서 먼저 검증 후 prod 적용, (4) Pipeline의 `Test` 단계에 `cdk synth` 검증 포함. A는 selfMutation의 가치 포기, C는 시간 오래 걸림, D는 비용·복잡도 폭증.

---

### 시나리오 12

**문제 12.** 한 결제 회사가 결제 처리 워크플로를 다음과 같이 설계한다 — 검증(50ms) → 인증(100ms) → 차지(150ms) → 기록(50ms). API Gateway 동기 응답 필요, 초당 500회 호출. 가장 적합한 워크플로 엔진과 호출 패턴은?

A) Lambda 하나에 4단계를 인라인으로 모두 구현
B) Express Step Functions + StartSyncExecution + API Gateway AWS service integration (target `arn:aws:apigateway:...:states:action/StartSyncExecution`)
C) Standard Step Functions + StartExecution + 결과 폴링
D) Step Functions 부적합 — 항상 Lambda 인라인이 빠름

**정답: B**
해설: Express + StartSyncExecution(2019)이 동기 워크플로 패턴. 5분 안에 끝나는 다단계 로직을 워크플로로 표현하면 (1) 시각화·재시도·에러 처리 자동, (2) 각 단계 메트릭 자동, (3) AWS SDK Integration으로 DynamoDB Put 등 Lambda 없이 직접 호출 가능, (4) 비용은 초당 500회 기준 합리적. Lambda 인라인(A)도 가능하지만 디버깅·재시도·시각화 어려움. Standard(C)는 비동기 only로 API 백엔드 부적합. D는 잘못된 단정.

---

## 📌 Week 7 종합 요약

이번 주에 익힌 다섯 가지 축의 핵심을 마지막으로 다시 정리한다.

1. **IaC 도구 선택**은 워크로드 성격과 팀 언어가 결정한다. AWS-only 서버리스는 SAM, 다양한 AWS 자원은 CDK, 멀티 클라우드는 Terraform. Serverless Framework는 v4 라이선스 검토 필수.

2. **Lambda Version은 불변 스냅샷, Alias는 가변 포인터**. Git commit/branch와 같은 발상. Weighted routing은 primary + 1 additional만 가능 — CodeDeploy Canary가 "한 번에 한 단계"인 구조적 이유.

3. **Cold Start 완화**의 두 표준 — Provisioned Concurrency(워밍업·유료) vs SnapStart(Java/Python/.NET zip만·init 시간 90% 단축). Reserved Concurrency는 한도 설정이지 cold start와 무관.

4. **Step Functions**는 호출 빈도×실행 시간으로 Standard/Express 선택. AWS SDK Service Integration으로 200+ 서비스 Lambda 없이 호출. TaskToken으로 사람·외부 시스템 통합. Distributed Map으로 1만 동시 자식 워크플로.

5. **통합 흐름**은 CodePipeline + CodeBuild + CFN/SAM Deploy + CodeDeploy Canary + Step Functions의 결합. 각 서비스의 강점에 맞춰 분리하는 게 표준 패턴. 한 도구로 모든 걸 하려는 건 안티패턴.

---

## 🔜 다음 주 예고 (Week 8)

**IaC 심화 - CloudFormation/CDK/Terraform 깊이**

- Day 1: CloudFormation 고급 — Nested Stack, Cross-Stack, Macro 직접 작성
- Day 2: StackSets — 멀티 계정/리전 거버넌스
- Day 3: Drift Detection, Change Set, Custom Resource의 내부 동작
- Day 4: CDK Pipelines 심화 + CDK ↔ Terraform 통합 + cdktf
- Day 5: 종합 시나리오 12문항

이번 주가 "어떤 도구를 쓸 것인가"였다면, 다음 주는 "그 도구를 어떻게 깊이 운영할 것인가"가 주제다. StackSets로 100개 계정에 정책을 일괄 적용하고, Drift Detection으로 수동 변경을 잡고, Custom Resource로 CFN이 모르는 자원을 통합하는 — 엔터프라이즈 IaC의 본격적 영역이 펼쳐진다.

---

> 💪 Week 7 완료. 서버리스 CI/CD의 모든 조각이 한 그림으로 들어왔다면 절반은 합격한 셈이다.
