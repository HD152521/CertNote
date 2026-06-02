# Day 5 - Week 7 복습 + 시나리오 문제 10개

📅 날짜: Week 7 (Day 5)
🎯 주제: 서버리스 CI/CD 통합 시나리오

---

## 📖 Week 7 핵심 요약

### 1줄 요약

1. SAM = CFN Macro 기반 서버리스 친화 IaC
2. CDK는 모든 AWS, SLS는 멀티 클라우드+플러그인, Terraform은 멀티 클라우드 IaC
3. Lambda Version은 불변, Alias는 가변 포인터 — Canary는 weighted routing
4. PC(워밍업, 유료) vs Reserved(한도, 무료), SnapStart는 Java cold start 표준
5. Step Functions로 복잡 워크플로 (Standard 1년 vs Express 5분)

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| SAM | CDK | YAML 서버리스 특화 vs 코드 범용 |
| Standard SFn | Express SFn | 1년 vs 5분 |
| PC | Reserved Concurrency | 워밍업 vs 한도 |
| Lambda zip | Container Image | 250MB vs 10GB |
| $LATEST | Version 숫자 | 가변 vs 불변 |
| Alias weighted | Version 100% | Canary vs All-at-once |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1
"Lambda 함수 새 버전 배포 시 5xx 모니터링 + Canary 5분 + 자동 롤백" 가장 적절한 구성은?

A) SAM AutoPublishAlias + DeploymentPreference Canary10Percent5Minutes + CloudWatch Alarm
B) 수동 Alias 시프트
C) Lambda Destination
D) Step Functions

**정답: A**
해설: SAM 표준 패턴.

---

### 시나리오 2
"Java Lambda cold start 1.5초. 비용 최소화 + 단축" 가장 적절한 해결은?

A) Provisioned Concurrency (비용 ↑)
B) SnapStart 활성화 (Java 무료)
C) Reserved Concurrency
D) Layer 사용

**정답: B**
해설: Java SnapStart 무료. PC는 비용 ↑.

---

### 시나리오 3
"S3에 100만 객체를 모두 처리해야 한다. 1시간 안에."

A) Lambda 1만 동시 호출 (한도 초과)
B) Step Functions Distributed Map (Express 자식 + 1만+ 동시)
C) Glue
D) EC2 스크립트

**정답: B**
해설: Distributed Map이 대용량 병렬의 표준.

---

### 시나리오 4
"API Gateway가 Lambda Alias `live`를 가리키고, 배포 시 자동 시프트되어야 한다." 가장 적절한 구성은?

A) API Gateway Integration URI에 `${stageVariables.alias}` + Stage Variable `alias=live` + Alias permission
B) 매번 새 API Gateway 생성
C) Custom domain
D) Lambda Layer

**정답: A**
해설: stageVariables 패턴.

---

### 시나리오 5
"Lambda zip 패키지가 ML 모델 때문에 1.5GB. 어떻게?"

A) Lambda Container Image (10GB 한도)
B) Layer로 분리 (250MB 한도 동일)
C) ECS로 이전
D) S3에서 매번 다운로드

**정답: A**
해설: Container Image가 큰 패키지의 답.

---

### 시나리오 6
"CodePipeline에서 1시간 걸리는 멀티 리전 배포가 필요. Lambda Invoke로는 부족."

A) Step Functions Action + ASL로 워크플로
B) 더 큰 Lambda
C) ECS Task
D) Pipeline 분리

**정답: A**
해설: 15분 초과는 Step Functions.

---

### 시나리오 7
"Serverless Framework로 기존 운영. v4 라이선스 비용 문제로 대안은?"

A) SAM 또는 CDK로 마이그레이션 (둘 다 OSS)
B) Terraform
C) 라이선스 구매
D) 자체 도구 개발

**정답: A**
해설: SAM/CDK가 모두 무료 OSS.

---

### 시나리오 8
"CDK Stack에 Lambda + Dynamo + API Gateway. Lambda에 적절한 Dynamo 권한을 코드로 부여하는 가장 깔끔한 방법은?"

A) IAM Policy 수동 작성
B) `table.grantReadWriteData(lambdaFunction)` 의도 기반 grant
C) 모든 권한 부여
D) Lambda Layer

**정답: B**
해설: CDK grant 메서드가 핵심 강점.

---

### 시나리오 9
"Step Functions로 사람 승인이 필요한 배포 워크플로." 가장 적절한 구성은?

A) Wait 상태 + 폴링
B) `.waitForTaskToken` + SNS → Slack → SendTaskSuccess/Failure
C) Lambda 매번 호출
D) Manual Approval Action

**정답: B**
해설: TaskToken이 외부 사람 통합의 표준.

---

### 시나리오 10
"`sam sync --watch`를 프로덕션에 사용해도 되는가?"

A) 가능 — 빠르므로
B) 부적합 — 개발 가속용. CFN 우회로 인프라 변경 추적 불가
C) Region 제한
D) 라이선스 필요

**정답: B**
해설: sync는 개발 가속, 프로덕션은 sam deploy.

---

## 📌 Week 7 요약

1. SAM/SLS/CDK/Terraform의 선택 기준 — 워크로드 성격
2. Lambda Blue/Green = Alias weighted routing
3. PC/Reserved/SnapStart의 정확한 구분
4. Step Functions Standard vs Express, SDK 직접 통합
5. TaskToken으로 외부 시스템·사람 통합

---

## 🔜 다음 주 예고 (Week 8)

**IaC 심화 - CloudFormation/CDK/Terraform**

- Day 1: CloudFormation 고급 - Nested Stack, Cross-Stack
- Day 2: StackSets - 멀티 계정/리전
- Day 3: Drift Detection, Change Set, Custom Resource
- Day 4: CDK + Terraform 통합 + CDK Pipelines
- Day 5: 시나리오 문제 10개

---

> 💪 Week 7 완료! 서버리스 CI/CD의 모든 도구가 갖춰졌습니다.
