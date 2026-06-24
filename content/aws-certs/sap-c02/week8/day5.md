# Day 5 - Week 8 종합 — 서버리스·이벤트 아키텍처 시나리오 12선

Week 8은 서버리스와 이벤트 기반 아키텍처가 어떻게 협력하는지를 깊이 봤다. Lambda(콜드 스타트·동시성·VPC ENI), Step Functions(상태 머신·Saga·Distributed Map), EventBridge(Bus·Pipes·Scheduler), AppSync(GraphQL + Subscription), SQS/SNS/Kinesis/MSK(메시징·스트리밍) — 여섯 도메인은 각자 독립적으로 보이지만, 실제 production에서는 거의 항상 두세 개가 함께 쓰인다. SAP-C02 시험이 노리는 것도 정확히 이 부분이다. "Lambda만 알아도 안 되고", "Step Functions만 알아도 안 되고", 시나리오의 키워드를 보고 어느 도구의 조합이 가장 적합한지 판단하는 능력이 필요하다.

오늘은 week 8 전체를 종합 시나리오 12문항으로 정리한다. 각 문항은 단일 도구가 아니라 복합 패턴을 묻고, 해설에서 왜 그 답이 맞고 왜 다른 보기가 틀린지를 SAP 시험의 결정 기준으로 풀어낸다. 시험 직전에 이 시나리오들을 다시 읽으면 도메인 전체의 결정 트리가 머릿속에 다시 그려진다.

## Week 8 핵심 정리

### Lambda (Day 1)
- **Firecracker micro VM** 위 실행, **Slot 풀**에서 워밍업, 콜드 스타트는 다운로드/런타임/Init/JIT 4단계
- **동시성 3종**: 계정 한도(1,000) / Reserved(격리+상한) / Provisioned(따뜻함, 비용)
- **SnapStart**(CRaC 기반): Java/Python/.NET, **무료**, init uniqueness 주의
- **Hyperplane ENI**(2019~): VPC 통합 시 ENI 공유, **RDS Proxy**로 connection 폭증 해결
- **비동기 재시도** 2회 + **Destinations**(SNS/SQS/EB/Lambda)
- **Function URL** (API GW 우회), **Container Image 10GB** + lazy loading, **Graviton2 ARM 20%↓**
- **Burst Concurrency** 한도(us-east-1=3,000) → 예측 스파이크는 PC + Auto Scaling

### Step Functions (Day 2)
- 분산 영속 상태 머신, **Saga** = Catch + 별도 보상 분기
- **Standard**(1년·전이당) vs **Express**(5분·호출+시간) — 빈도·시간으로 분기
- **State 7종** + **Distributed Map**(10K 병렬 + S3 ItemReader)
- 통합 3패턴: Request-Response / **.sync** (Job 대기) / **.waitForTaskToken** (외부 콜백)
- **Retry + Catch**: 지수 백오프 + JitterStrategy(2023)
- Workflow Studio로 시각 작성 + IAM 자동 생성

### EventBridge (Day 3)
- **Bus 3종**: Default(AWS) / Custom(도메인) / Partner(SaaS)
- **Rule = Pattern + 최대 5 Targets**, JSON 깊은 필드 매칭 + **API Destination** 외부 HTTPS
- **Pipes**: SQS/Kinesis/DDB Stream/MQ/MSK → Filter → Enrich → Target, 코드 없이
- **Scheduler**: 100만+ 스케줄, time zone, flexible window, 200+ API 직접 호출
- **Schema Registry** + **Archive/Replay** — 진화 관리 + 시간 여행
- **SNS vs EventBridge**: 단순 fan-out·고처리량 vs 풍부 필터·다양 target

### AppSync + 메시징 (Day 4)
- **AppSync GraphQL**: schema-first + direct resolver(Lambda 없이 DDB) + **Subscription**(WebSocket) + 5 인증
- **SQS Standard**(무한 TPS) vs **FIFO**(300 TPS, 순서+dedup 5분) + High Throughput FIFO
- **Visibility Timeout**, **Long Polling**, **DLQ + maxReceiveCount**
- **SNS Fan-out + Message Filtering** + **FIFO Topic**(2020)
- **Kinesis Data Streams**: 재처리·다중 consumer, **Shard + Partition Key**, **EFO**
- **Firehose**(60~900초 buffer + Lambda 변환), **MSK**(Kafka 이식성)
- **Lambda ESM**: BatchSize, **ReportBatchItemFailures** partial batch

## 결정 트리 — 시나리오 키워드 → 도구 매핑

```
"콜드 스타트 + 비용 없이"            → SnapStart (Java/Python/.NET)
"콜드 스타트 + 예측 가능 트래픽"      → Provisioned Concurrency + Auto Scaling
"Lambda + DB connection too many"   → RDS Proxy
"한 함수가 다른 함수 영향"           → Reserved Concurrency
"Java/Python Lambda 비용 20%↓"      → Graviton2 ARM 전환
"ML 모델 1GB+ Lambda"               → Container Image (10GB 한도)

"장기 워크플로우 + 보상"             → Step Functions Standard + Catch
"고빈도·짧음 워크플로우"             → Step Functions Express
"인간 승인 / 외부 콜백"              → .waitForTaskToken
"ECS/EMR/Glue Job 완료 대기"        → .sync
"S3 100만 객체 병렬"                → Distributed Map + Express child

"100만 사용자 스케줄"                → EventBridge Scheduler
"SaaS partner 이벤트 수신"          → EventBridge Partner Bus
"큐 → 워크플로우, 코드 없이"         → EventBridge Pipes
"이벤트 재처리·재생"                 → EventBridge Archive + Replay
"풍부 필터 + 다양 target"            → EventBridge Custom Bus + Rule

"GraphQL + 실시간 + 모바일 + 인증"  → AppSync + Cognito
"순서 + 중복 제거 결제 큐"           → SQS FIFO
"단순 fan-out + 매우 높은 처리량"    → SNS Topic + SQS subscription
"재처리 + 다중 소비자"               → Kinesis Data Streams + EFO
"S3/Redshift/OpenSearch 자동 저장"   → Kinesis Firehose
"Kafka 표준 + 이식성"                → MSK
"실패 메시지 5회 시도 후 격리"       → DLQ + maxReceiveCount
"배치 처리 부분 실패만 재시도"        → Lambda ESM ReportBatchItemFailures
```

## SAP 시험 단골 함정 정리

1. **Task Role vs Task Execution Role** (ECS/Fargate) — 앱 권한은 Task Role, 인프라(ECR Pull, Logs) 권한은 Execution Role
2. **EventBridge DLQ vs Lambda Destinations** — EB DLQ는 invoke 실패용, Lambda 비즈니스 로직 실패는 Lambda Destinations
3. **SQS FIFO "exactly-once"** — 정확히는 5분 dedup window 안의 idempotency, application 레벨 idempotency 추가 권장
4. **Standard vs Express 비용** — 항상 Express가 싼 것은 아님. 드물게 실행되는 긴 워크플로우는 Standard가 더 저렴
5. **Reserved Concurrency** — 격리만이 아니라 **상한**이기도 함
6. **SNS는 메시지 보존 안 함** — 보존 필요하면 → SQS subscription 또는 EventBridge Archive
7. **Pipes vs Step Functions** — 1:1 라우팅은 Pipes, 복잡 워크플로우는 Step Functions, 자주 Pipes→SF 조합
8. **SnapStart의 uniqueness 함정** — init에서 만든 난수·UUID·DB connection state가 모든 복원본에 복사됨

---

## 📝 시나리오 12문항

---

**문제 1.** 한 글로벌 OTT 서비스가 사용자 시청 이벤트(초당 50,000건)를 받아 (1) 실시간 추천 모델에 즉시 전달 (2) 7일치 raw event를 S3에 보존해 ML 학습용으로 재처리 (3) 분석팀이 시간당 집계로 BI 대시보드 갱신. 세 다운스트림이 서로 latency 영향 없이 동시 처리되어야 한다. 가장 적합한 구성은?

A) SNS Topic + 3개 SQS subscription, 각 큐에 14일 보존·DLQ 설정 후 consumer가 폴링
B) Kinesis Data Streams + Enhanced Fan-Out (3 consumer) + Firehose
C) EventBridge Bus + 3개 Rule, 각 Rule에 input transformer와 7일 Archive/Replay 연결
D) MSK + Kafka Consumer Group 3개, EBS gp3 스토리지에 7일 retention.ms 설정

**정답: B**
해설: 핵심 키워드는 "재처리 + 다중 소비자 + 7일 보존". SQS(A)는 1회 소비라 재처리 불가, SNS는 보존 없음. EventBridge(C)는 풍부 필터링용이지 50,000 TPS 스트리밍 + 7일 보존이 아님. MSK(D)도 가능하지만 운영 부담이 더 크고 AWS 위주 워크로드에 Kinesis가 매니지드 우위. Kinesis Data Streams + EFO는 consumer마다 shard당 2MB/s 전용 + 보존 24h~365d 지원 + Firehose로 S3 자동 저장. 추가 학습: 광고·미디어·IoT의 표준 패턴.

---

**문제 2.** Java Spring Boot 기반 Lambda 함수의 콜드 스타트가 평균 4초. 일평균 호출 100만 회, 콜드 비율 5%. 운영팀은 추가 비용 없이 콜드 스타트를 1초 이하로 줄여야 한다. init에서 DB connection pool과 UUID 기반 인스턴스 ID 생성 코드가 있다. 가장 적합한 조합은?

A) Provisioned Concurrency = 500을 Application Auto Scaling 스케줄로 상시 워밍업 유지
B) SnapStart만 활성화하고 init의 UUID·DB connection 코드는 그대로 둠
C) SnapStart + init 코드의 UUID 생성·DB connection을 `Crac.Resource`의 `afterRestore`로 이전
D) 메모리를 10GB로 증가시켜 CPU 비례 할당으로 JIT 컴파일·클래스 로딩을 가속

**정답: C**
해설: SnapStart는 무료이고 Java init 시간을 거의 0으로 줄임. 그러나 SnapStart는 init 시점의 메모리·디스크 상태를 그대로 복원하므로 UUID 같은 uniqueness state와 DB connection의 TCP 상태가 모든 복원본에 복사되어 충돌이 생긴다. `Crac.Resource.afterRestore`에서 재초기화해야 안전. B(SnapStart만)는 인스턴스 충돌·DB 오류 위험. A(PC)는 비용 발생(시간당 과금). D(메모리)는 콜드 스타트와 거의 무관하고 비용 증가. 함정: "SnapStart 활성화하면 다 해결"이라는 보기가 함정. uniqueness 재초기화가 필수. 추가: 2024년 SnapStart가 Python·.NET까지 확장.

---

**문제 3.** 결제 → 재고 차감 → 배송 예약 워크플로우가 평균 30초~며칠 사이 걸린다(외부 배송업체 응답 대기 포함). 배송 예약이 실패하면 결제 환불 + 재고 복원이 필요하다. 외부 배송업체는 비동기 webhook으로 결과를 보낸다. 가장 적합한 구성은?

A) Step Functions Express + Catch(보상) + 배송업체 webhook을 API GW로 받아 폴링
B) Step Functions Standard + Catch(보상) + .waitForTaskToken(webhook)
C) Lambda chain + try/catch + DynamoDB에 단계별 상태 기록 후 환불·복원 보상 호출
D) EventBridge Pipes + Lambda enrichment으로 결제→재고→배송을 순차 라우팅

**정답: B**
해설: 며칠 걸릴 수 있는 워크플로우는 Express의 5분 한도 초과 → Standard. Saga 보상은 각 Task의 Catch가 별도 보상 state로 분기. 외부 webhook 대기는 `.waitForTaskToken`이 정확한 패턴(token 발급 → SNS로 알림 → webhook receiver Lambda가 `SendTaskSuccess` 호출). A는 5분 한도 초과. C는 Lambda 15분 timeout + 보상 로직이 코드에 흩어짐 + 가시성 부족. D는 1:1 라우팅이지 복잡 워크플로우가 아님. 함정: "장기 + 보상 + 외부 콜백"이면 Standard + Catch + waitForTaskToken 3-패턴.

---

**문제 4.** 100만 사용자 SaaS가 각 사용자의 선호 시간(타임존 + 시각)에 일일 요약 이메일을 발송. 사용자 설정 변경 시 즉시 반영. 가장 적합한 구성은?

A) EventBridge Rule 100만 개를 사용자별 cron 표현식으로 생성하고 SES target 연결
B) EventBridge Scheduler 100만 스케줄 + SES target
C) Lambda + DynamoDB 스케줄 테이블 + 1분 주기 cron poller로 발송 대상 스캔
D) Step Functions Wait State 100만 워크플로우를 사용자별 타임존 오프셋만큼 대기

**정답: B**
해설: Scheduler는 계정당 100만+ 스케줄을 지원하고 타임존, cron, flexible time window 제공. SES를 target으로 직접 호출(200+ AWS API 지원). A는 Rule 계정 한도(수천)에 막힘. C는 자체 스케줄 인프라 운영 부담(스토리지, 일관성, 스케일링). D는 100만 워크플로우가 항상 wait 상태로 계산 자원 소모 + 비용 폭증. 함정: "사용자별 다른 시간" = Scheduler. 추가: Flexible time window(±15분)로 동시 부하 분산.

---

**문제 5.** DynamoDB의 변경 이벤트(DDB Streams)를 필터링해 특정 패턴만 Step Functions 워크플로우로 보낸다. Lambda 코드 작성과 운영을 피하고 싶다. 가장 적합한 구성은?

A) DDB Streams → Lambda(이벤트 패턴 필터 코드) → Step Functions StartExecution 호출
B) DDB Streams → EventBridge Pipes(Filter) → Step Functions
C) DDB Streams → Kinesis Data Streams → Lambda consumer → Step Functions
D) DDB Streams → EventBridge Pipes → SQS → Lambda poller → Step Functions

**정답: B**
해설: Pipes는 정확히 이 패턴(Source=DDB Stream + Filter + Target=Step Functions)을 코드 없이 매니지드로 구성. A는 Lambda 운영 부담(코드 배포, 에러 처리, 로깅, 비용). C/D는 추가 인프라가 끼어 복잡도 증가. 함정: "코드 없이"가 키워드면 Pipes. 추가 학습: Pipes의 enrichment 단계로 Step Functions 외에도 Lambda·API Destination·API GW 등을 거쳐 변환 가능. 입출력 모두 EventBridge 패턴 매칭 사용.

---

**문제 6.** 한 e-commerce가 OrderPlaced 이벤트를 분석·배송·CRM·알림·audit 5개 다운스트림에 동일 메시지로 fan-out한다. 처리량은 초당 5,000건. 각 다운스트림은 자체 속도로 처리하고 실패 시 영구 격리 분석. 가장 적합한 구성은?

A) EventBridge Custom Bus + 5개 Rule(동일 패턴 매칭) + 각 target에 DLQ 연결
B) SNS Topic + 5개 SQS subscription + 각 SQS의 DLQ
C) Kinesis Data Streams + 5개 Consumer(EFO) + 각 consumer 실패 시 재처리
D) Lambda fan-out 함수가 5개 다운스트림을 동기 호출하고 실패 시 SQS로 격리

**정답: B**
해설: 단순 fan-out + 매우 높은 처리량은 SNS의 정확한 sweet spot. SQS subscription으로 다운스트림이 자체 폴 속도 + DLQ로 영구 실패 격리. A(EventBridge)도 가능하지만 5개 룰이 같은 패턴 매칭에 단가가 더 비싸고 throughput 한도가 낮음. C는 재처리·시계열 분석용이지 fan-out 최적이 아님. D는 결합도 높음. 함정: "단순 fan-out + 높은 처리량"이면 SNS, "풍부 필터링·다양 target"이면 EventBridge. 추가: 각 SQS의 visibility timeout = 처리 시간 × 1.5~2, maxReceiveCount = 5~10.

---

**문제 7.** Lambda 함수가 VPC 안의 RDS PostgreSQL에 접속. 동시 실행이 1,500개로 증가하면서 "FATAL: too many connections" 오류. RDS max_connections=200. 가장 적합한 해결책은?

A) RDS 인스턴스 클래스를 키워 max_connections=2,000으로 올리고 Multi-AZ 읽기 부하 분산
B) Lambda Reserved Concurrency = 200으로 제한해 DB 연결 수를 max_connections 이하로 묶음
C) RDS Proxy 도입, Lambda는 Proxy에 연결
D) Lambda VPC 통합 제거 후 PostgreSQL을 퍼블릭 엔드포인트로 노출해 접속

**정답: C**
해설: RDS Proxy는 connection multiplexing(pooling)을 제공해 1,500 Lambda가 50개 내외 RDS 연결로 묶임. 추가로 IAM 인증과 failover 시 connection holding 제공. A는 비용·DB 부하 증가에 비해 근본 해결 아님(Lambda는 더 늘 수 있음). B는 가용성 희생. D는 RDS 접속 불가. 함정: "connection 부족" + Lambda + RDS면 거의 RDS Proxy. SAP 시험 단골. 추가: Aurora·RDS MySQL/PostgreSQL/MariaDB/SQL Server 지원 + Secrets Manager 통합 자동.

---

**문제 8.** 모바일 채팅 앱이 GraphQL로 백엔드를 구성하고 메시지 실시간 push를 받는다. Cognito 사용자 인증, DynamoDB 저장, 오프라인 동기화 필요. 가장 적합한 백엔드는?

A) API Gateway REST + Lambda + WebSocket API + DynamoDB로 메시지·연결 ID 관리
B) AppSync GraphQL + Cognito User Pool + DynamoDB direct resolver + Amplify DataStore
C) ALB + ECS Fargate Service + Socket.io + Cognito JWT 검증 미들웨어
D) IoT Core MQTT + 디바이스 섀도우로 오프라인 메시지 동기화

**정답: B**
해설: AppSync는 매니지드 GraphQL + WebSocket subscription + Cognito 통합 + DynamoDB direct resolver(Lambda 없이) + Amplify DataStore 오프라인 동기화를 한 서비스로 제공. A는 REST/WebSocket 두 API를 따로 운영 + 클라이언트가 합쳐야 함. C는 인프라 운영 부담 + Cognito 통합 코드 필요. D(IoT Core)는 device pub/sub용이지 사용자 chat이 아님. 함정: "GraphQL + 실시간 + 모바일 + Cognito" 키워드 조합은 거의 AppSync. 추가: direct resolver로 DynamoDB 직접 호출하면 Lambda 콜드 스타트 제거 + 비용 절감.

---

**문제 9.** S3에 저장된 100만 개의 CSV 파일을 각각 Lambda로 처리한다. 각 파일당 처리 시간 5~30초. 결과를 다른 S3 버킷에 집계 저장. 가장 적합한 패턴은?

A) Map state (인라인, 동시 40개)로 S3 객체 목록을 순회하며 Lambda 호출
B) Step Functions Distributed Map + Express child + ItemReader/ResultWriter
C) AWS Batch에 100만 task 제출 + Fargate Spot + array job으로 병렬 처리
D) 오케스트레이터 Lambda가 100만 파일을 청크로 나눠 자식 Lambda를 재귀 호출

**정답: B**
해설: Distributed Map은 10,000 child execution 병렬 + S3 list/CSV/JSONL을 ItemReader로 직접 source + ResultWriter로 S3 자동 집계. Express child execution으로 비용·속도 최적화. A는 동시 40개 제한이라 100만 처리 너무 느림. C(AWS Batch)는 task당 컨테이너 부팅 비용이 5~30초 짧은 작업엔 Lambda보다 훨씬 크고 큐잉·스케줄 운영 부담. D는 Lambda 15분 timeout + 페이로드 한도 + 재귀 호출 가시성 부족. 함정: "대규모 병렬 + S3 source + 집계 결과"는 거의 Distributed Map. ECS Fargate Task를 child가 호출하는 패턴(.sync)도 자주.

---

**문제 10.** 블랙프라이데이 세일 시작 시 Lambda 동시 실행이 0에서 5,000으로 5분 안에 폭증. us-east-1 burst 한도는 3,000. throttle 없이 처리해야 하고, 정확한 시작 시각을 알 수 있다. 가장 적합한 구성은?

A) Reserved Concurrency = 5,000으로 설정해 다른 함수로부터 동시성을 격리 확보
B) Application Auto Scaling + Provisioned Concurrency 세일 30분 전부터 5,000으로 미리 설정
C) 함수 메모리를 10GB로 증가시켜 인스턴스당 처리량을 높여 필요 동시성 자체를 축소
D) Function URL로 변경해 API Gateway 경유 오버헤드를 제거하고 직접 호출로 지연 단축

**정답: B**
해설: Burst Concurrency 한도(3,000)는 함수 동시성 한도와 별개의 초기 폭증 제한. 0→5,000을 5분 안에 달성하려면 PC로 미리 워밍업. Application Auto Scaling 스케줄 기반(예: 매주 금요일 19:30)으로 PC 조정 → 운영 부담 감소. A(Reserved)는 상한이지 미리 띄우는 게 아니므로 burst 한도에 막힘. C는 콜드 스타트만 약간 감소. D는 무관. 함정: "예측 가능 트래픽 스파이크"는 거의 PC + Auto Scaling. 비용은 PC 시간당이지만 throttle 회피 + 일관 latency가 더 가치. 추가: 세일 종료 후 PC=10으로 내려 비용 절감.

---

**문제 11.** 글로벌 SaaS가 Stripe webhook과 Shopify webhook을 동시에 받고, amount > $1,000 이벤트만 Step Functions 워크플로우로, 나머지는 Lambda로 보낸다. Webhook receiver 운영 부담을 피하고 싶다. 가장 적합한 구성은?

A) API Gateway + Lambda webhook receiver가 서명 검증·재시도 후 amount로 분기 라우팅
B) EventBridge Partner Bus(Stripe + Shopify) + Rule(amount > 1000) + Step Functions/Lambda target
C) SNS HTTPS subscription으로 webhook을 받고 message filter policy로 amount 분기
D) ECS Fargate에 webhook proxy를 띄워 서명 검증 후 SQS로 분기 라우팅

**정답: B**
해설: Partner Bus는 AWS가 SaaS partner와 직접 통합해 webhook 인프라 없이 이벤트를 받는 매니지드 채널. EventBridge Rule의 풍부한 JSON 필드 매칭으로 amount > 1000 같은 조건 분기. A는 webhook receiver 운영 부담(보안, 인증, 재시도, 스케일링). C는 SNS가 메시지를 발행(outbound)하는 서비스라 SaaS의 인바운드 HTTPS webhook을 직접 수신할 수 없음 + 메시지 필터는 속성 기반이라 SaaS 임의 JSON 본문 매칭에 부적합. D는 자체 인프라 운영. 함정: "SaaS partner 이벤트"는 거의 Partner Bus. 추가: Stripe, Shopify, Datadog, Auth0, MongoDB Atlas 등 메이저 SaaS가 등록되어 있고 콘솔에서 한 번에 활성화.

---

**문제 12.** 한 핀테크가 결제 거래를 SQS에 받아 Lambda로 처리. 배치 size=10, 한 메시지가 실패하면 기본 동작은 전체 배치 재시도이지만, idempotent 안 된 다운스트림이라 중복 처리가 문제. 실패한 메시지만 재시도하려면?

A) BatchSize=1로 설정
B) Visibility Timeout 짧게
C) Lambda ESM에서 ReportBatchItemFailures 활성화 + 함수가 실패 message ID 반환
D) DLQ에 즉시 보내기

**정답: C**
해설: ReportBatchItemFailures는 Lambda ESM의 partial batch response 기능. 함수가 `batchItemFailures: [{itemIdentifier: "msg-id-X"}, ...]` 형태로 응답하면 Lambda가 실패한 메시지만 재시도하고 나머지는 ack(큐에서 삭제). A(BatchSize=1)는 효율 매우 낮음 + 비용 증가. B는 무관. D는 maxReceiveCount 초과 후의 격리. 함정: "배치 처리 + 부분 실패 + 중복 처리 방지"는 ReportBatchItemFailures. 추가: Kinesis/DDB Streams ESM도 동일 기능. SQS의 경우 응답 형식이 약간 다르므로 docs 확인.

---

## 📌 Week 8 한눈에

```
[클라이언트]
   │ GraphQL
   ▼
[AppSync] ──Subscription(WebSocket)── 실시간 모바일/웹
   │ Mutation, direct resolver
   ▼
[DynamoDB] ──Streams──► [EventBridge Pipes]
                          │ Filter
                          ▼
                  [EventBridge Custom Bus]
                          │ Rule
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  [Step Functions]    [SNS Topic]     [Kinesis Data Streams]
   ├─ Standard (1년)   │ Fan-out       │ 보존 24h~365d
   ├─ Express (5분)    │ Filtering     │ EFO 다중 consumer
   ├─ Saga(Catch)      └─ 5 SQS         │
   ├─ Distributed Map                   ▼
   ├─ .sync (Job 대기)                [Firehose] ──► S3/Redshift
   └─ .waitForTaskToken (외부 콜백)

[Lambda]
 ├─ Concurrency 3종 (계정/Reserved/Provisioned)
 ├─ SnapStart (Java/Python/.NET, 무료)
 ├─ Hyperplane ENI (VPC), RDS Proxy로 connection
 ├─ Destinations (OnSuccess/OnFailure → SNS/SQS/EB/Lambda)
 ├─ Container Image 10GB (block-level lazy loading)
 └─ Graviton2 ARM 20%↓

[EventBridge Scheduler] ──► 100만+ 사용자 스케줄
[EventBridge Partner Bus] ──► Stripe/Shopify/Datadog 직접
[EventBridge Archive + Replay] ──► 이벤트 재처리
[Schema Registry] ──► 진화 관리 + 코드 바인딩
```

## 시험 직전 체크리스트

- [ ] Lambda 콜드 스타트 4단계(다운로드/런타임/Init/JIT)를 설명할 수 있다
- [ ] SnapStart 동작 원리(CRaC 스냅샷 + 복원)와 uniqueness 함정을 안다
- [ ] Reserved vs Provisioned vs 계정 한도의 차이를 한 줄로 설명할 수 있다
- [ ] RDS Proxy가 connection 폭증을 어떻게 푸는지 안다
- [ ] Step Functions Standard vs Express의 가격 모델과 분기 기준
- [ ] .sync vs .waitForTaskToken의 사용 시점
- [ ] Distributed Map의 ItemReader/ResultWriter + child Express
- [ ] EventBridge Bus 3종 + Rule + 5 Target 한도
- [ ] Pipes의 Source/Filter/Enrich/Target 4단계
- [ ] Scheduler vs CloudWatch Rule cron의 한도 차이
- [ ] SNS vs EventBridge 선택 기준(단순 fan-out vs 풍부 필터)
- [ ] SQS Standard vs FIFO + High Throughput FIFO
- [ ] Visibility Timeout, Long Polling, DLQ + maxReceiveCount
- [ ] Kinesis Shard + Partition Key + EFO
- [ ] Lambda ESM ReportBatchItemFailures partial batch

다음 주(Week 9): **데이터 아키텍처** — Data Lake (S3 + Lake Formation + Glue), Redshift (RA3 + AQUA + Spectrum), EMR (Spark/Hive on EC2/EKS), Athena (Iceberg + federated query), MSK Connect, Lakeformation 권한 모델, Migration to Data Lakehouse.
