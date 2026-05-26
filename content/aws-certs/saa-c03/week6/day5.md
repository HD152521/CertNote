# Day 30 - Week 6 복습: 서버리스 + 컨테이너 종합

6주차의 주제는 "관리형 컴퓨팅"이었다. 서버를 직접 운영하는 부담을 AWS가 점점 더 흡수해가는 방향 — Lambda(완전 서버리스)에서 Fargate(서버리스 컨테이너), ECS/EKS(오케스트레이션)까지 스펙트럼을 따라 각 서비스의 위치와 트레이드오프를 정리한다. SAA-C03 시험에서 이 주제는 "어떤 서비스를 선택하느냐"와 "어떻게 연결하느냐" 두 축으로 출제된다.

> 💡 **운영 부담의 스펙트럼**: EC2(완전 관리) → ECS/EKS + EC2(노드 관리) → ECS/EKS + Fargate(오케스트레이션만) → Lambda(함수만). 오른쪽으로 갈수록 운영 부담은 줄고 AWS 추상화 레이어가 두꺼워진다. 비용 최적화 관점에서는 반드시 오른쪽이 유리하지 않다 — 트래픽이 일정하고 높을수록 EC2나 컨테이너가 Lambda보다 저렴할 수 있다. 선택 기준은 "트래픽 패턴"과 "팀의 운영 역량"이다.

## 6주차 핵심 서비스 한눈에 보기

| 서비스 | 핵심 역할 | 시험 포인트 |
|--------|---------|-----------|
| Lambda | 이벤트 기반 함수 실행 | 콜드 스타트 vs Provisioned Concurrency, Reserved vs Provisioned, awsvpc VPC 네트워킹 |
| API Gateway REST | 리치 API 기능 | API Key + Usage Plan, Mapping Templates, AWS 서비스 통합, mTLS |
| API Gateway HTTP | 저비용 HTTP API | JWT Authorizer, Lambda 통합, REST 대비 70% 저렴 |
| API Gateway WebSocket | 실시간 양방향 | connectionId, $connect/$disconnect/$default, 서버 푸시 |
| Step Functions Standard | 장기 오케스트레이션 | 최대 1년, exactly-once, waitForTaskToken, 상태 전환 과금 |
| Step Functions Express | 고처리량 워크플로 | 최대 5min, at-least/most-once, 실행 횟수 과금, 100K req/s |
| AppSync | 관리형 GraphQL | Subscription(실시간), Pipeline Resolver, N+1 DataLoader |
| ECR | 컨테이너 이미지 레지스트리 | 이미지 스캔, Lifecycle Policy, VPC Endpoint 3개 |
| ECS | AWS 네이티브 오케스트레이터 | Task Role vs Execution Role, awsvpc 모드, Blue/Green |
| EKS | 관리형 Kubernetes | IRSA, Managed/Self-Managed/Fargate Profiles |
| Fargate | 서버리스 컨테이너 실행 | Firecracker MicroVM 격리, Spot 70% 절감 |

## Lambda 핵심 복습

> 💡 **Lambda 사양 빠른 참조**:
>
> | 항목 | 값 |
> |------|-----|
> | 최대 실행 시간 | 15분 |
> | 최대 메모리 | 10,240 MB (10 GB) |
> | 최대 동시 실행 (리전) | 기본 1,000 (증가 가능) |
> | Burst Concurrency | 500-3,000/분 (리전별 상이) |
> | 배포 패키지 (ZIP) | 50 MB (압축), 250 MB (압축 해제) |
> | 배포 패키지 (Container) | 최대 10 GB |
> | 환경 변수 | 4 KB |
> | /tmp 저장소 | 512 MB ~ 10 GB |
> | Provisioned Concurrency | 구성 가능 (워밍된 실행 환경) |

**콜드 스타트 해결 전략**: 언어 선택(Python/Node.js 빠름, Java/C# 느림), 메모리 증가(CPU 비례 할당), Provisioned Concurrency(워밍된 환경 유지), Lambda SnapStart(Java 11+ 스냅샷 복원, 최대 10× 개선).

**Reserved vs Provisioned Concurrency**:
- Reserved: "이 함수에 최대 N개의 동시 실행을 예약" — 다른 함수가 이 용량을 쓸 수 없음. 격리 목적. 콜드 스타트 해결 안 됨.
- Provisioned: "워밍된 실행 환경 N개를 항상 유지" — 콜드 스타트 0ms. 비용 추가 발생.

> ⚠️ **함정 — Lambda VPC와 인터넷 접근**: Lambda를 VPC에 연결하면(awsvpc 모드) 기본적으로 인터넷 접근이 불가능하다. VPC 내부 자원(RDS, ElastiCache)에는 접근 가능하지만, 외부 API나 AWS Public Endpoints(DynamoDB, S3 기본 엔드포인트)는 접근이 차단된다. 해결책: 프라이빗 서브넷 + NAT Gateway(인터넷 접근), 또는 VPC Gateway/Interface Endpoint(AWS 서비스 접근). Lambda의 Hyperplane ENI는 2019년 이후 ENI 생성 지연 문제를 해결했지만 NAT Gateway 비용은 여전히 존재한다.

## API Gateway 유형 선택 기준

> 💡 **API Gateway 3종 비교**:
>
> | 기능 | REST API | HTTP API | WebSocket API |
> |------|---------|---------|---------------|
> | 기본 비용 | 높음 | REST 대비 ~70% 저렴 | 연결 시간 + 메시지 기준 |
> | API Key + Usage Plan | O | X | X |
> | Lambda Authorizer | O | O | O |
> | JWT Authorizer (외부 OIDC) | X | O | X |
> | Mapping Templates (VTL) | O | X | X |
> | AWS 서비스 직접 통합 | O (DDB, SNS, SQS 등) | X | X |
> | Response Caching | O | X | X |
> | mTLS 클라이언트 인증 | O | X | X |
> | WebSocket 실시간 | X | X | O |
> | 최적 용도 | 엔터프라이즈 API, 파트너 통합 | 내부 마이크로서비스, 모바일 백엔드 | 채팅, 게임, 실시간 대시보드 |

**Lambda Authorizer 주의**: 캐싱 TTL이 300초가 기본이다. TTL 0으로 설정하면 모든 요청에서 Authorizer Lambda를 호출하므로 비용과 지연이 증가한다. TTL을 적절히 설정하되, 권한이 즉시 취소되어야 하는 경우(토큰 블랙리스트)는 TTL 0이 필요하다 — 이 트레이드오프를 이해해야 한다.

**WebSocket API의 서버 → 클라이언트 푸시**: `$connect`에서 connectionId를 저장하고, 서버가 Callback URL(`execute-api.region.amazonaws.com/{stage}/@connections/{connectionId}`)로 POST하면 클라이언트에 메시지가 push된다. connectionId 없이는 서버 푸시가 불가능하다.

> 🔍 **더 깊이 — REST API vs HTTP API 선택 트리**:
>
> ```
> 외부 파트너에게 API Key + 사용량 제한 필요?
>   → REST API (Usage Plan)
>
> AWS 서비스(DynamoDB, SQS)를 Lambda 없이 직접 통합?
>   → REST API (AWS Service Integration + Mapping Templates)
>
> 외부 OIDC 제공자(Auth0, Okta) JWT 인증?
>   → HTTP API (JWT Authorizer)
>
> 단순 Lambda/HTTP 백엔드, 비용 최적화?
>   → HTTP API
>
> 실시간 양방향 통신?
>   → WebSocket API
> ```

## Step Functions 선택 기준

**Standard vs Express 결정 기준**:
- 실행 시간이 5분을 넘는가? → Standard 필수
- 정확히 한 번(exactly-once) 처리가 필요한가? (결제, 재고 차감) → Standard
- 초당 수천~수십만 건의 고처리량? → Express (100K/s, 1M 동시 실행)
- 로그를 CloudWatch에 저장하고 비용 최소화? → Express (실행 횟수 과금, 상태 전환 무과금)

> 💡 **waitForTaskToken 패턴 — 사람이 포함된 워크플로**:
>
> 1. Step Functions가 Task State에서 taskToken을 SQS/SNS/EventBridge로 전달
> 2. 담당자가 승인/거부 처리
> 3. 처리 시스템이 `SendTaskSuccess(taskToken)` 또는 `SendTaskFailure(taskToken)` 호출
> 4. Step Functions가 결과를 받아 다음 상태로 진행
>
> `HeartbeatSeconds`를 설정하지 않으면 태스크가 무기한 대기한다. 설정하면 HeartbeatSeconds 내에 `SendTaskHeartbeat`가 없을 때 `States.HeartbeatTimeout`으로 실패 — `Catch` 블록으로 처리해야 한다.

**Distributed Map의 위력**: 10,000개의 병렬 자식 워크플로를 실행해 S3의 대용량 데이터를 병렬 처리한다. `ToleratedFailurePercentage`로 일부 실패를 허용하고, `ResultWriter`로 결과를 S3에 저장해 256KB 상태 데이터 제한을 우회한다.

> 🔍 **더 깊이 — Saga 패턴과 보상 트랜잭션**: 마이크로서비스 환경에서 여러 서비스에 걸친 분산 트랜잭션은 2PC(2-Phase Commit)를 사용할 수 없다 — 서비스 간 강한 결합이 생기고 가용성이 저하된다. 1987년 Garcia-Molina가 제안한 Saga 패턴은 각 단계가 로컬 트랜잭션으로 처리되고, 실패 시 이미 완료된 단계를 역순으로 보상 트랜잭션으로 취소한다. Step Functions에서는 `Retry`(지수 백오프 재시도)와 `Catch` + `States.ALL`(모든 오류 유형 포착)로 Saga를 구현한다. 보상 트랜잭션 자체도 실패할 수 있으므로 멱등성(idempotency)이 중요하다.

## 컨테이너 서비스 선택 기준

> 💡 **ECS vs EKS vs Fargate 결정 트리**:
>
> ```
> Kubernetes 표준 필요 (멀티 클라우드, 오픈소스 생태계)?
>   → EKS
>
> GPU / 특수 인스턴스 필요?
>   → ECS/EKS + EC2 Launch Type
>
> 노드 관리 부담 최소화, 단순한 서비스 배포?
>   → ECS + Fargate
>
> 강한 커널 수준 보안 격리 필요 (규제 산업)?
>   → Fargate (Firecracker MicroVM)
>
> 복잡한 배포 패턴 (CRD, Operator, Helm)?
>   → EKS
>
> EKS에서 일부 워크로드만 서버리스 실행?
>   → EKS + Fargate Profiles (단, DaemonSet 불가)
> ```

**IAM 권한의 두 가지 패턴**:
- ECS: Task Role(애플리케이션 코드 권한) + Task Execution Role(에이전트 권한)
- EKS: IRSA(IAM Roles for Service Accounts) — OIDC 토큰 기반 Pod별 IAM Role

두 패턴 모두 "인스턴스/노드 수준이 아닌 워크로드 단위로 IAM 권한을 부여"한다는 원칙이 동일하다.

> ⚠️ **함정 모음 — 자주 틀리는 개념들**:
>
> 1. **Task Role vs Task Execution Role**: Execution Role은 ECS 에이전트가 ECR pull + CW 로그 전송. Task Role은 컨테이너 코드가 S3/DDB 호출. 둘을 바꾸면 권한 오류.
>
> 2. **Fargate의 네트워킹 모드**: Fargate는 `awsvpc` 모드만 지원. `bridge`나 `host`는 불가.
>
> 3. **ECR VPC Endpoint 3개**: `ecr.api` + `ecr.dkr` + `S3 Gateway Endpoint`. 하나라도 빠지면 프라이빗 서브넷에서 이미지 pull 실패.
>
> 4. **IRSA vs Instance Profile**: EKS에서 노드 Instance Profile만 설정하면 같은 노드의 모든 Pod가 같은 권한 — IRSA로 Pod 단위 제어 필요.
>
> 5. **Standard vs Express**: 결제 처리(exactly-once, 5분 이상) = Standard. 주문 상태 조회(고처리량, 5분 이하) = Express.

## 통합 아키텍처 — 서버리스 + 컨테이너 혼합

```
[ 사용자 요청 흐름 ]

Mobile/Web Client
      │
      ├─ REST/JSON ──→ API Gateway (REST) ──→ Lambda ──→ DynamoDB / S3
      │                                             └──→ SQS → Lambda (비동기 처리)
      │
      ├─ GraphQL ───→ AppSync ──→ DynamoDB / Lambda / OpenSearch
      │              (Subscription으로 실시간 Push ↓ Client)
      │
      └─ WebSocket → API Gateway (WS) ──→ Lambda ($connect, $default)
                                              └──→ DynamoDB (connectionId 저장)
                                              └──→ 다른 클라이언트로 Push

[ 백엔드 컨테이너 서비스 ]

ALB → ECS Fargate (awsvpc 모드)
        │ Task Role (S3, DynamoDB 권한)
        └──→ RDS Proxy → Aurora Multi-AZ

[ 오케스트레이션 ]

EventBridge (스케줄 / 이벤트)
      └──→ Step Functions (Standard)
              ├─ Lambda (각 단계)
              ├─ ECS Fargate Task (배치 처리)
              ├─ waitForTaskToken (사람 승인)
              └─ Distributed Map (S3 대용량 병렬 처리)
```

> 📚 **사례 — 전자상거래 주문 처리 시스템**: 전형적인 시나리오로 시험에 자주 등장한다. 주문 생성(API GW → Lambda → DDB) → 결제 처리(Step Functions Standard, Saga 패턴, exactly-once) → 재고 차감(Lambda → DDB) → 배송 요청(SQS → ECS Fargate) → 배송 추적 실시간 업데이트(AppSync Subscription → Mobile App). 각 단계마다 다른 서비스가 최적인 이유가 있다 — 결제는 exactly-once가 필수라 Standard Step Functions, 배송 처리는 배치 특성이 있어 Fargate, 실시간 상태 알림은 AppSync Subscription.

> 📚 **사례 — 미디어 처리 파이프라인**: S3에 영상 업로드 → EventBridge → Step Functions Distributed Map (10,000개 청크 병렬 처리, 각 청크를 Lambda로 트랜스코딩) → 처리 완료 결과를 S3에 ResultWriter로 저장 → CloudFront로 CDN 배포. 이 아키텍처에서 Standard Step Functions의 Distributed Map은 AWS Batch나 EMR 없이 대용량 병렬 처리가 가능하고, 처리 실패 시 ToleratedFailurePercentage로 일부 실패를 허용한 뒤 재처리할 수 있다.

## DR 관점 — 6주차 서비스들의 가용성 설계

| 서비스 | 내장 HA | 추가 DR 고려사항 |
|--------|---------|----------------|
| Lambda | 자동 (다중 AZ 실행) | 동시성 한도 모니터링, DLQ 설정 |
| API Gateway | 자동 (리전 내 HA) | 멀티 리전: Route 53 + 각 리전 API GW |
| Step Functions | 자동 (서비스 수준 HA) | Standard: 실행 기록 1yr 보존, Express: CloudWatch 로그 보관 |
| AppSync | 자동 (리전 내 HA) | 멀티 리전: Global DynamoDB Table 연동 |
| ECS Fargate | 다중 AZ 서브넷 설정 | ALB + 최소 2 AZ에 태스크 분산, Fargate Spot + On-Demand 혼합 |
| EKS | 컨트롤 플레인 AWS 관리 HA | 멀티 AZ 노드 그룹, etcd 자동 백업 |
| ECR | 자동 (S3 기반 내구성) | Cross-Region 복제로 DR 리전에도 이미지 보관 |

> 🔍 **더 깊이 — Lambda Destinations vs DLQ**: 둘 다 Lambda 실패 처리 메커니즘이지만 목적이 다르다. DLQ(Dead Letter Queue)는 비동기 호출 실패 시 실패 이벤트를 SQS나 SNS로 보낸다. Lambda Destinations는 더 강력하다 — 성공과 실패 모두를 처리할 수 있고(DLQ는 실패만), 4가지 대상(SQS, SNS, Lambda, EventBridge)을 지원하며, 원본 이벤트 외에 함수 응답과 컨텍스트 정보도 포함된다. 일반적으로 Lambda Destinations를 DLQ보다 권장한다. Event Source Mapping(SQS, Kinesis, DDB Streams)의 실패 처리는 별도로 설정해야 하며, `ReportBatchItemFailures`로 부분 배치 성공을 지원한다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수가 평소에는 소량의 요청만 처리하지만, 매일 오전 9시에 수백 명이 동시에 접속해 콜드 스타트로 인한 응답 지연 SLA를 위반한다. 가장 적합한 해결책은?

A) Reserved Concurrency를 높게 설정해서 다른 함수의 간섭을 차단한다
B) Provisioned Concurrency를 설정하고 Application Auto Scaling으로 오전 8시 55분에 스케일 업한다
C) Lambda 함수의 메모리를 최대(10GB)로 올려 초기화 시간을 단축한다
D) Lambda 함수를 EC2 기반으로 마이그레이션한다

**정답: B**
Provisioned Concurrency는 워밍된 실행 환경을 미리 준비해 콜드 스타트를 0ms로 만든다. Application Auto Scaling을 사용하면 오전 8시 55분에 자동으로 Provisioned Concurrency를 늘리고, 피크 이후 줄일 수 있다. Reserved Concurrency(A)는 격리 목적이고 콜드 스타트를 해결하지 않는다. 메모리 증가(C)는 콜드 스타트를 줄이지만 근본 해결책이 아니다.

---

**문제 2.** 외부 SaaS 파트너에게 API를 제공하면서 파트너별로 월 10,000 요청으로 사용량을 제한하고, 초과 시 요청을 차단하며, 파트너별 사용량 대시보드를 제공해야 한다. 가장 적합한 API Gateway 유형과 기능은?

A) HTTP API + Lambda Authorizer
B) REST API + Usage Plan + API Key
C) WebSocket API + $connect 핸들러
D) HTTP API + JWT Authorizer

**정답: B**
API Key와 Usage Plan은 REST API의 고유 기능이다. Usage Plan에서 Throttle(초당 요청 제한)과 Quota(기간별 총 요청 수 제한)를 설정하고, 파트너별 API Key와 연결한다. Usage Plan은 파트너별 사용량 추적 데이터도 제공한다. HTTP API(A, D)는 API Key와 Usage Plan을 지원하지 않는다. WebSocket(C)은 실시간 양방향 통신용이다.

---

**문제 3.** 주문 처리 시스템에서 결제 청구, 재고 차감, 배송 요청 세 단계가 순서대로 실행되어야 한다. 결제 청구는 정확히 한 번만 실행되어야 하고, 어떤 단계든 실패하면 이전 단계를 취소(환불, 재고 복원)해야 한다. 가장 적합한 아키텍처는?

A) SQS FIFO → Lambda 체인 → 각 Lambda가 다음 Lambda를 동기 호출
B) Step Functions Standard + Saga 패턴 (Retry + Catch로 보상 트랜잭션)
C) Step Functions Express (고처리량, 비용 효율적)
D) EventBridge 이벤트 체인 (각 서비스가 이벤트를 발행하고 구독)

**정답: B**
결제 청구의 exactly-once 보장 → Step Functions Standard(at-least-once가 아닌 exactly-once). 실패 시 보상 트랜잭션(환불, 재고 복원) → Saga 패턴(Catch + 보상 트랜잭션 상태). Express(C)는 at-least-once로 결제가 중복 실행될 수 있다. SQS Lambda 체인(A)은 정확한 실행 순서와 보상 트랜잭션 관리가 복잡하다. EventBridge 체인(D)은 실행 상태 추적과 보상이 어렵다.

---

**문제 4.** 실시간 협업 문서 편집 서비스를 구축한다. 여러 사용자가 같은 문서를 편집할 때, 한 사용자의 변경사항이 다른 사용자들에게 즉시 전달되어야 한다. 가장 적합한 AWS 아키텍처는?

A) REST API Gateway + 클라이언트 폴링(1초마다 변경사항 확인)
B) API Gateway WebSocket + Lambda ($connect에서 connectionId 저장, 변경 시 모든 연결에 push)
C) AppSync GraphQL + Subscription
D) SNS + 클라이언트가 HTTP Long Polling

**정답: C 또는 B**
AppSync GraphQL Subscription(C)은 관리형 실시간 WebSocket 연결을 제공하고, DynamoDB 변경을 자동으로 클라이언트에 push할 수 있다. 인프라 관리가 적고 GraphQL 쿼리와 실시간을 통합한다. API Gateway WebSocket(B)도 유효하지만 connectionId 관리와 push 로직을 직접 구현해야 한다. 폴링(A, D)은 실시간이 아니고 불필요한 요청이 많다.

---

**문제 5.** ECS Fargate 서비스를 프라이빗 서브넷에 배포하고, 컨테이너가 인터넷 없이 ECR에서 이미지를 pull해야 한다. 필요한 구성 요소는?

A) NAT Gateway만 설정하면 인터넷을 통해 ECR 접근 가능
B) `com.amazonaws.region.ecr.dkr` VPC Endpoint 하나만 설정
C) `ecr.api` Interface Endpoint + `ecr.dkr` Interface Endpoint + S3 Gateway Endpoint
D) ECR Public Registry를 사용해 VPC Endpoint 없이 접근

**정답: C**
ECR 프라이빗 VPC 접근에는 세 가지 Endpoint가 모두 필요하다. `ecr.api`는 ECR API 호출(인증, 이미지 메타데이터), `ecr.dkr`는 Docker 이미지 레이어 전송, S3 Gateway Endpoint는 ECR이 이미지 레이어를 S3에 저장하기 때문에 필수다. 하나라도 없으면 이미지 pull이 실패한다. A는 인터넷 경유이므로 요구사항 불충족.

---

**문제 6.** EKS 클러스터에서 결제 서비스 Pod는 Secrets Manager에, 로그 수집 Pod는 CloudWatch에만 접근해야 한다. 두 Pod가 같은 노드에서 실행될 때 Pod 단위로 IAM 권한을 부여하는 방법은?

A) EC2 노드 Instance Profile에 두 권한 모두 부여
B) 각 Pod의 환경변수에 IAM 액세스 키를 설정
C) IRSA로 각 Pod의 Service Account에 별도 IAM Role을 연결
D) Kubernetes Secret에 IAM 자격증명을 저장

**정답: C**
IRSA는 OIDC 토큰을 통해 Pod별로 독립된 IAM Role을 사용하게 한다. 같은 노드에 있어도 각 Pod는 자신의 Service Account에 연결된 Role의 권한만 갖는다. A는 같은 노드의 모든 Pod가 두 권한을 모두 갖게 되어 최소 권한 위반. B와 D는 자격증명 노출 위험이 있고 자동 갱신이 안 된다.

---

**문제 7.** S3 버킷에 매일 밤 100만 개의 새 파일이 업로드된다. 각 파일을 독립적으로 처리해 결과를 DynamoDB에 저장해야 하며, 처리 실패율이 5%를 넘으면 전체 작업을 중단하고 알림을 보내야 한다. 가장 적합한 아키텍처는?

A) EventBridge 스케줄 → Lambda (순차 처리)
B) S3 이벤트 → SQS → Lambda (병렬 처리, 100만 개)
C) Step Functions Standard + Distributed Map (ToleratedFailurePercentage=5)
D) AWS Batch + ECS Fargate

**정답: C**
Step Functions Distributed Map은 최대 10,000개의 병렬 자식 워크플로를 실행하며, S3 파일 목록을 직접 입력으로 받을 수 있다. `ToleratedFailurePercentage=5`로 실패율 5% 초과 시 전체 실행을 실패로 처리하고, CloudWatch Events로 알림을 트리거할 수 있다. A는 순차 처리로 100만 개 처리가 너무 오래 걸린다. B는 SQS + Lambda도 가능하지만 실패율 임계치 제어가 복잡하다. D는 배치 컴퓨팅에 적합하지만 실패율 제어 로직을 직접 구현해야 한다.

---

**문제 8.** 보험 청구 처리 시스템에서 고객이 청구서를 제출하면, 검토자가 5 영업일 내에 승인 또는 거부를 해야 한다. 검토자가 응답하지 않으면 에스컬레이션 이메일을 보내야 한다. 이 워크플로를 구현하는 가장 적합한 방법은?

A) SQS + Lambda (5일마다 DLQ 확인)
B) Step Functions Standard + waitForTaskToken + HeartbeatSeconds(5일) + Catch(States.HeartbeatTimeout → 에스컬레이션)
C) EventBridge 스케줄러로 5일 후 알림 Lambda 실행
D) Step Functions Express + waitForTaskToken

**정답: B**
waitForTaskToken은 외부 시스템이나 사람의 응답을 기다리는 패턴이다. Step Functions Standard로 최대 1년까지 대기 가능(Express는 5분 한계 — D는 오답). `HeartbeatSeconds`를 5영업일로 설정하면 응답 없을 때 `States.HeartbeatTimeout` 오류가 발생하고, `Catch`로 에스컬레이션 Lambda를 호출한다. A는 5일 간격 폴링이 복잡하고 상태 관리가 어렵다. C는 단순하지만 워크플로 상태 추적이 불가능하다.

---

**문제 9.** 스타트업이 초기 서비스를 출시하면서 Kubernetes 경험이 없는 3명의 백엔드 팀이 컨테이너 기반 API 서버를 배포하려 한다. 빠른 출시와 최소한의 운영 부담이 우선이다. 가장 적합한 서비스 조합은?

A) EKS + Managed Node Groups + Helm
B) ECS + Fargate + ALB
C) ECS + EC2 Launch Type + ASG
D) EKS + Fargate Profiles

**정답: B**
ECS는 Kubernetes보다 단순한 개념 모델이고, Fargate는 노드 관리가 불필요하다. ALB와 ECS Service의 통합으로 트래픽 분산과 자동 스케일링을 쉽게 구성할 수 있다. A와 D는 Kubernetes 학습 곡선이 있다. C는 EC2 노드(ASG)를 직접 관리해야 해서 운영 부담이 크다.

---

**문제 10.** 핀테크 회사가 멀티 테넌트 API를 제공한다. 각 테넌트는 자체 DynamoDB 테이블과 S3 버킷을 가지며, Lambda 함수가 테넌트별로 올바른 리소스에만 접근해야 한다. 또한 API 응답 지연을 최소화하기 위해 Lambda 콜드 스타트를 방지해야 한다. 가장 적합한 설계는?

A) 테넌트별 별도 Lambda 함수 배포 + 각 함수에 Provisioned Concurrency 설정
B) 단일 Lambda 함수 + 환경변수로 테넌트 ID 전달 + EC2 Instance Profile로 DynamoDB 접근 + Provisioned Concurrency
C) 단일 Lambda 함수 + 런타임에 STS AssumeRole로 테넌트별 IAM Role 전환 + Provisioned Concurrency
D) 테넌트별 ECS Fargate 서비스 배포 + Task Role로 격리

**정답: C**
단일 Lambda 함수에서 API Key나 JWT 클레임으로 테넌트를 식별한 뒤, STS `AssumeRole`로 테넌트별 IAM Role을 가져와 해당 테넌트의 DynamoDB와 S3에만 접근한다. Provisioned Concurrency로 콜드 스타트를 방지한다. A는 테넌트가 수백~수천 개면 Lambda 함수도 수천 개가 되어 관리 불가. B의 Instance Profile은 모든 테넌트 리소스에 접근 가능해 격리 실패. D는 테넌트별 Fargate 서비스는 비용이 매우 크다.

---

**문제 11.** Lambda 함수가 비동기로 호출되어 이미지를 처리한다. 처리에 실패한 이미지 이벤트를 캡처해서 재처리하고, 성공적으로 처리된 이미지는 별도 EventBridge 버스로 후속 파이프라인을 시작해야 한다. 가장 적합한 구성은?

A) DLQ(Dead Letter Queue)를 SQS로 설정해서 실패 이벤트만 처리
B) Lambda Destinations 설정: 성공 → EventBridge, 실패 → SQS
C) Lambda 내부에서 try/catch로 성공 시 EventBridge put-events, 실패 시 SQS send-message
D) CloudWatch Logs Insights로 실패 패턴을 분석하고 수동 재처리

**정답: B**
Lambda Destinations는 성공과 실패 모두를 처리할 수 있다. 성공 시 EventBridge로 후속 파이프라인을 시작하고, 실패 시 SQS로 재처리 큐에 넣는다. DLQ(A)는 실패만 처리 가능하고 성공 대상을 설정할 수 없다. C는 가능하지만 애플리케이션 코드에 인프라 라우팅 로직이 포함되어 관리가 복잡하다. D는 자동화가 아니다.

---

**문제 12.** 회사가 AWS 서버리스 서비스를 최적화하면서 다음 워크로드를 검토 중이다: (1) 초당 50,000건의 주문 상태 조회(각 조회 3초 이내 완료), (2) 월 100건의 대규모 보고서 생성(각 보고서 20분 소요). Step Functions를 사용한다면 각각 어떤 유형을 써야 하는가?

A) (1) Standard, (2) Standard
B) (1) Express, (2) Standard
C) (1) Express, (2) Express
D) (1) Standard, (2) Express

**정답: B**
(1) 주문 상태 조회: 초당 50,000건 고처리량 + 3초 이내 완료 → Express(100K req/s 지원, 5분 한계 충분, 실행 횟수 과금으로 고처리량에서 Standard보다 저렴). (2) 보고서 생성: 20분 소요 → Express의 최대 5분 한계를 초과 → Standard 필수. Standard는 1년까지 실행 가능하며 보고서 완료를 추적하기에 적합하다. D(Standard + Express)는 20분 보고서를 Express로 처리하려 해서 한계 초과 오류.

---
