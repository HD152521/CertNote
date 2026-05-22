# Day 64 - 최종 복습 4: 메시징, 컨테이너, 아키텍처 패턴

📅 날짜: 2026년 8월 12일 (수요일)  
🎯 주제: 메시징/컨테이너 최종 복습 + 아키텍처 패턴  
⏱️ 학습 시간: 약 120분

---

## 🎯 학습 목표

- 메시징, 컨테이너, 아키텍처 패턴의 핵심을 최종 정리한다
- 시나리오 기반 아키텍처 선택 문제를 풀어본다

---

## 📖 최종 핵심 정리

### 메시징 서비스 선택 가이드
```
SQS 표준: 높은 처리량, 순서/중복 미보장
SQS FIFO: 순서 보장, 중복 제거, 초당 300개
SNS: Push, 여러 구독자 동시, 팬아웃 패턴
Kinesis Streams: 실시간 스트리밍, 여러 Consumer, 24시간 보존
Kinesis Firehose: ETL, S3/Redshift/OpenSearch, 1분 지연
Step Functions: 워크플로우 오케스트레이션, 재시도/병렬
AppSync: GraphQL, 실시간 구독, 오프라인 지원
```

### 핵심 숫자
```
SQS: 256KB, 14일, FIFO 300/s, VisibilityTimeout 30초
Kinesis: 샤드 1MB/s 쓰기, 2MB/s 읽기, 24시간 기본 보존
SNS: 여러 구독 대상, Push 방식
```

### 컨테이너/IaC 핵심 암기
```
ECS Fargate: 서버리스, awsvpc 모드
executionRole: ECR pull, CloudWatch Logs
taskRole: 컨테이너에서 AWS 서비스 접근
ECR: 취약점 스캔, 수명 주기 정책
CloudFormation: Change Set(검토), !ImportValue(교차 스택)
SAM: Transform 필수, sam local(Docker 필요)
CDK: 프로그래밍 언어 → CloudFormation 변환
```

---

## 아키텍처 패턴 총정리

```
패턴 1: 서버리스 REST API
================================
[클라이언트] → [API Gateway] → [Lambda] → [DynamoDB]
                                        ↘ [ElastiCache]
인증: Cognito Authorizer

패턴 2: 이벤트 기반 비동기 처리
================================
[서비스A] → [SQS] → [Lambda B]
                  ↘ (실패 시) [DLQ]

패턴 3: 팬아웃
================================
[S3 업로드] → [SNS] → [SQS1] → [Lambda: 리사이즈]
                    → [SQS2] → [Lambda: 분석]
                    → [Lambda: 알림]

패턴 4: 스트리밍 파이프라인
================================
[데이터 소스] → [Kinesis Streams] → [Lambda: 실시간]
                                  → [Firehose] → [S3]

패턴 5: 완전 CI/CD
================================
[Git Push] → [CodePipeline]
  → [CodeBuild: 테스트/빌드]
  → [Manual Approval]
  → [CodeDeploy: 배포]
     (Canary for Lambda, Blue/Green for EC2)
```

---

## 🧠 시나리오 → 정답 매핑 (시험 핵심 패턴)

### 메시징 시나리오 → 서비스

| 시나리오 | 답 |
|----------|-----|
| "비동기 작업 큐, 디커플링" | **SQS Standard** |
| "정확히 1회, 순서" | **SQS FIFO** |
| "여러 시스템에 동시 알림" | **SNS** |
| "S3 → 여러 Lambda" | **SNS 팬아웃** 또는 **EventBridge** |
| "실시간 클릭스트림 수집" | **Kinesis Data Streams** |
| "스트림 → S3 자동" | **Kinesis Firehose** |
| "Kafka 호환" | **MSK** |
| "복잡한 다단계 워크플로" | **Step Functions Standard** |
| "5분 이내 빠른 워크플로" | **Step Functions Express** |
| "GraphQL + 실시간 구독" | **AppSync** |
| "1년 워크플로" | **Step Functions Standard** |
| "외부 시스템 응답 대기" | **.waitForTaskToken** |
| "Kinesis 데이터 365일 보관" | Retention 설정 또는 Firehose → S3 |
| "Lambda 멱등 처리" | DDB idempotency 또는 SQS FIFO dedup |

### 컨테이너·IaC 시나리오

| 시나리오 | 답 |
|----------|-----|
| "EC2 없이 컨테이너" | **Fargate** |
| "비용 절감 컨테이너" | **Fargate Spot** |
| "쿠버네티스 표준" | **EKS** |
| "온프레미스 ECS" | **ECS Anywhere** |
| "ECS → S3 권한" | **taskRole** |
| "ECR pull 권한" | **executionRole** |
| "CFN 안전 업데이트" | **Change Set** |
| "CFN 리소스 보호" | **DeletionPolicy: Retain** |
| "다중 계정 IaC 배포" | **Stack Set** |
| "재사용 가능한 CFN" | **Nested Stack** |
| "서버리스 SAM 로컬" | `sam local invoke` + Docker |
| "프로그래밍 언어 IaC" | **CDK** |
| "Lambda Canary 배포" | **CodeDeploy + SAM/CodePipeline** |

### 데이터·DB 시나리오

| 시나리오 | 답 |
|----------|-----|
| "관계형 + 자동 회전 비밀번호" | RDS + Secrets Manager |
| "NoSQL + 마이크로초 캐시" | DynamoDB + **DAX** |
| "여러 EC2 파일 공유" | **EFS** |
| "고성능 임시 디스크" | 인스턴스 스토어 |
| "글로벌 활성-활성 DB" | **Aurora Global** 또는 **DDB Global Tables** |
| "S3 PII 자동 탐지" | **Macie** |
| "EBS 1억 객체 일괄" | S3 Batch Operations |
| "오래된 S3 객체 정리" | Lifecycle Policy |
| "CRR + KMS" | **Multi-Region Key** |
| "원본은 한 번, 다양한 뷰" | **S3 Object Lambda** |
| "여러 팀에 다른 권한" | **S3 Access Points** |

### 보안 시나리오

| 시나리오 | 답 |
|----------|-----|
| "DB 비밀번호 자동 회전" | **Secrets Manager** |
| "100KB 데이터 KMS 암호화" | **Envelope Encryption** |
| "JWT 자동 검증 (REST API)" | **Cognito Authorizer** |
| "JWT 자동 검증 (HTTP API)" | **JWT Authorizer** |
| "외부 JWT (Auth0/Okta)" | **Lambda Authorizer** 또는 JWT Authorizer (HTTP API) |
| "SQL 인젝션 방어" | **WAF** |
| "DDoS 비용 보호" | **Shield Advanced** |
| "S3 HTTPS 강제" | `aws:SecureTransport=false` Deny |
| "EC2 직접 SSL 인증서" | ACM 불가 — 외부 인증서 |
| "다중 계정 가드레일" | **SCP (Organizations)** |
| "사용자에게 위임 가능 최대 권한" | **Permissions Boundary** |
| "Confused Deputy 방지" | **ExternalId** |

### 모니터링·디버깅 시나리오

| 시나리오 | 답 |
|----------|-----|
| "어떤 서비스가 느린지" | **X-Ray** |
| "쿼리 느림 분석" | **Performance Insights** (RDS) |
| "EC2 메모리 모니터링" | **CloudWatch Agent** |
| "root 로그인 즉시 감지" | CloudTrail → EventBridge → SNS |
| "API 가용성 24/7 모니터" | **Synthetics** |
| "로그 패턴 → 알람" | **Metric Filter** |
| "ML 기반 비정상 감지" | **Anomaly Detection** |
| "여러 계정 통합 대시보드" | **Cross-Account Dashboard** |
| "API GW Latency vs IntegrationLatency 차이 크면?" | API GW 자체 지연 |

### 비용 최적화 시나리오

| 시나리오 | 답 |
|----------|-----|
| "예측 가능한 EC2" | **Reserved** 또는 **Savings Plan** |
| "내결함성 + 90% 절감" | **Spot** |
| "ARM 호환 + 40% 절감" | **Graviton** |
| "SSE-KMS 비용 ↑" | **S3 Bucket Key** |
| "DDB throttle + 비용 절감" | **DAX** + 적절한 RCU |
| "Lambda 콜드 스타트 무료" | **SnapStart** (Java/Python/.NET) |
| "API GW 비용 절감" | **HTTP API** |
| "S3 아주 가끔 접근" | **Glacier Deep Archive** |
| "EBS 사용량 적은데 데이터 보존" | **gp3** (gp2보다 20% ↓) |

---

## 📝 최종 모의고사 - Part 4

**문제 1.** 수백만 사용자의 클릭 이벤트를 실시간으로 수집하고 여러 시스템에서 분석해야 할 때?

A) SQS  
B) SNS  
C) Kinesis Data Streams  
D) EventBridge  

**정답: C** - Kinesis Data Streams는 대용량 실시간 스트리밍을 지원하고 여러 Consumer가 동시에 동일 스트림을 읽을 수 있습니다.

---

**문제 2.** 마이크로서비스 A가 B의 응답을 기다리지 않고 비동기로 작업을 처리하려면?

A) Lambda A에서 Lambda B를 동기 호출  
B) Lambda A → SQS → Lambda B  
C) API Gateway 직접 연결  
D) DynamoDB를 통한 데이터 공유  

**정답: B** - SQS를 통한 비동기 통신은 두 서비스를 느슨하게 결합하고 Lambda A가 응답을 기다리지 않아도 됩니다.

---

**문제 3.** ECS 태스크가 실행 중 Secrets Manager에서 비밀번호를 가져오려면?

A) executionRoleArn에 권한 추가  
B) taskRoleArn에 권한 추가  
C) 환경 변수에 하드코딩  
D) CloudFormation 파라미터로 주입  

**정답: B** - taskRole은 컨테이너 내 애플리케이션 코드가 AWS 서비스에 접근하는 데 사용합니다.

---

**문제 4.** 결제 처리 → 이메일 발송 → 재고 업데이트 순서로 실행하되 각 단계 실패 시 재시도해야 할 때?

A) SQS 체인  
B) Lambda 체인 (Lambda에서 Lambda 직접 호출)  
C) Step Functions  
D) Kinesis  

**정답: C** - Step Functions는 순차 실행, 오류 처리, 자동 재시도를 시각적으로 관리할 수 있습니다.

---

**문제 5.** CloudFormation에서 VPC를 별도 스택으로 관리하고 다른 스택에서 참조하려면?

A) VPC ID를 수동으로 파라미터로 전달  
B) Outputs에서 Export 후 !ImportValue로 참조  
C) 동일 스택에 모두 포함  
D) 크로스 스택 참조 불가  

**정답: B** - Outputs 섹션에서 Export 이름을 지정하고 다른 스택에서 !ImportValue로 참조합니다.

---

**문제 6.** S3 업로드 이벤트로 이미지 리사이즈, 메타데이터 분석, 관리자 알림을 동시에 처리하려면?

A) S3 이벤트를 각 Lambda에 직접 설정  
B) S3 → SNS → 여러 SQS → 각 Lambda  
C) S3 → Kinesis → Lambda  
D) S3 → EventBridge → Lambda 3개  

**정답: B 또는 D** - 팬아웃 패턴입니다. SNS를 중간에 두고 각 SQS로 분기하거나(B), EventBridge로 여러 Lambda를 동시에 트리거합니다(D).

---

**문제 7.** Beanstalk에서 중단 없이 새 버전을 배포하는 가장 안전한 전략은?

A) All at once  
B) Rolling  
C) Immutable  
D) Blue/Green  

**정답: C** - Immutable 배포는 새 ASG에 새 버전을 배포하고 검증 후 교체하므로 가장 안전합니다.

---

**문제 8.** CDK 앱을 배포할 때 실제로 생성되는 것은?

A) Terraform 플랜  
B) CloudFormation 스택  
C) ECS 태스크  
D) Lambda 레이어  

**정답: B** - CDK는 cdk deploy 시 코드를 CloudFormation 템플릿으로 변환하고 CloudFormation 스택을 생성합니다.

---

## 📌 오늘의 요약

1. SQS(큐/비동기) vs SNS(팬아웃/Push) vs Kinesis(스트리밍/다중Consumer)
2. Step Functions: 복잡한 워크플로우, 재시도, 병렬, 오류 처리
3. ECS: taskRole(앱 권한), executionRole(인프라 권한)
4. CDK: 프로그래밍 언어 → CloudFormation, cdk synth/deploy
5. 핵심 패턴: 팬아웃(SNS→SQS), 비동기(SQS), 워크플로우(Step Functions)
