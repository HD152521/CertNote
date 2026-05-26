# Day 26 - Lambda: 서버 없이 코드를 실행한다는 것의 진짜 의미

Lambda가 2014년 re:Invent에서 발표됐을 때, 많은 개발자들이 "그래서 EC2를 대체하는 건가요?"라고 물었다. 아니다. Lambda는 EC2를 대체하지 않는다. Lambda는 완전히 다른 질문에 답한다. "이 코드를 언제 어디서 실행할지 내가 결정하고 싶지 않다. 그냥 이벤트가 발생했을 때 코드가 실행됐으면 좋겠다." 서버를 프로비저닝하고, OS를 관리하고, 용량을 계획하고, 패치하는 모든 과정을 없애는 것이 Lambda의 본질이다.

그 뒤에는 실제로 서버가 있다. Lambda가 서버리스라는 것은 사용자가 서버를 관리하지 않는다는 의미이지, 물리적 서버가 없다는 의미가 아니다. AWS가 내부적으로 Firecracker라는 마이크로VM 기술로 Lambda 함수를 격리된 실행 환경에서 돌린다. NIST SP 800-145는 클라우드 서비스를 IaaS/PaaS/SaaS로 분류하는데, Lambda는 이 분류를 넘어선 FaaS(Function as a Service)라는 새로운 추상화 계층이다.

## 실행 모델 — 콜드 스타트와 웜 스타트의 물리학

Lambda 함수가 처음 호출되거나 오랫동안 사용되지 않다가 다시 호출될 때, AWS는 새로운 실행 환경(Execution Environment)을 준비해야 한다. 이 과정이 콜드 스타트(Cold Start)다.

콜드 스타트 동안 발생하는 일:
1. AWS가 Lambda 서비스 플릿에서 하나의 Firecracker MicroVM 슬롯을 할당한다
2. 함수 코드 패키지를 S3에서 다운로드하고 실행 환경에 배치한다
3. 런타임(Node.js, Python, Java 등)을 초기화한다
4. 핸들러 외부의 초기화 코드(`import`, 글로벌 변수, DB 연결 등)를 실행한다
5. 그 다음에야 핸들러 함수가 호출된다

4번까지의 시간이 콜드 스타트 지연이다. 언어별로 다르다. Python/Node.js는 보통 100-500ms, Java는 1-3초(JVM 초기화), Go는 수십 ms, .NET은 수백 ms.

콜드 스타트 이후 실행 환경은 **재사용**된다. 같은 환경에서 다음 요청을 처리할 때는 3-4번 과정이 없어서 빠르다. 이것이 웜 스타트(Warm Start)다. 실행 환경이 재사용되는 동안 `/tmp`(512MB~10GB) 디렉토리도 남아 있어서, 파일을 캐싱하는 데 활용할 수 있다.

```
[첫 번째 호출 - 콜드 스타트]
시간 0: 요청 도착
   │ MicroVM 할당 + 코드 다운로드
   │ 런타임 초기화
   │ 초기화 코드 실행 (DB 연결, import 등)
   ▼
시간 ~500ms (Java: ~2000ms): 핸들러 실행
   ▼
시간 ~600ms: 응답 반환

[두 번째 호출 - 웜 스타트 (실행 환경 재사용)]
시간 0: 요청 도착
   │ (MicroVM/런타임/초기화 생략)
   ▼
시간 ~5ms: 핸들러 실행
   ▼
시간 ~10ms: 응답 반환
```

콜드 스타트 최소화 기법:
- **패키지 크기 최소화**: 의존성을 줄이면 코드 다운로드 시간이 줄어든다
- **초기화 코드 최적화**: 핸들러 외부 코드에서 불필요한 작업을 제거한다
- **런타임 선택**: Go, Python, Node.js가 Java, .NET보다 콜드 스타트가 짧다
- **Provisioned Concurrency**: 지정된 수의 인스턴스를 워밍업 상태로 유지
- **Lambda SnapStart** (Java): 초기화 완료 시점의 메모리 스냅샷을 저장해서 콜드 스타트를 수백 ms로 단축

> 💡 **Firecracker MicroVM과 격리 보장** — Lambda의 Firecracker MicroVM은 AWS가 2018년 오픈 소스로 공개한 기술이다. QEMU/KVM 기반의 전통적 VM보다 훨씬 가볍고 빠르게(125ms 내 시작) 격리된 실행 환경을 만든다. Firecracker는 KVM 하이퍼바이저를 직접 사용하면서 필요한 디바이스 에뮬레이션을 최소화했다. Lambda 함수가 다른 함수의 메모리를 읽거나 프로세스를 종료할 수 없는 것이 이 격리 덕분이다. 2019년 AWS re:Invent에서 공개된 데이터에 따르면 AWS는 초당 수백만 개의 Firecracker MicroVM을 시작할 수 있다. Firecracker는 Rust로 작성됐으며 메모리 안전성과 최소 공격 표면을 중시하는 설계 철학을 갖고 있다.

> 🔍 **Lambda SnapStart — 콜드 스타트의 근본적 해결** — Lambda SnapStart(Java용, 2022년 출시)는 콜드 스타트 문제를 근본적으로 다른 방식으로 해결한다. 함수가 배포될 때 초기화 단계(1-4번)를 실행하고, 그 시점의 메모리와 디스크 상태를 스냅샷으로 저장한다. 이후 콜드 스타트가 필요할 때 새로운 MicroVM에서 처음부터 초기화하는 대신, 저장된 스냅샷을 복원한다. Java의 3초 콜드 스타트를 수백 ms 수준으로 줄일 수 있다. 단, 스냅샷 복원 시 `UUID.randomUUID()`, 현재 시간, 난수 생성 등이 스냅샷 시점 값을 반환할 수 있어서 별도 복원 훅(restore hook `@SnapStartRestore`)으로 재초기화해야 한다.

## 트리거 유형 — 동기, 비동기, 폴링의 차이

Lambda를 호출하는 방법은 세 가지 패턴으로 구분된다. 이 차이가 오류 처리, 재시도, DLQ(Dead Letter Queue) 동작을 결정한다.

### 동기 호출(Synchronous)

호출자(Invoker)가 Lambda에 요청을 보내고 결과가 돌아올 때까지 기다린다. 호출자가 응답을 받아서 처리해야 하므로, Lambda 오류 시 재시도는 **호출자의 책임**이다. AWS Lambda 서비스 자체는 재시도하지 않는다.

대표 서비스: API Gateway, ALB, Cognito, CloudFront(Lambda@Edge), SDK 직접 호출.

```python
# 동기 호출 예
import boto3
lambda_client = boto3.client('lambda')
response = lambda_client.invoke(
    FunctionName='my-function',
    InvocationType='RequestResponse',  # 동기
    Payload=b'{"key": "value"}'
)
result = response['Payload'].read()
```

### 비동기 호출(Asynchronous)

호출자가 Lambda에 이벤트를 보내고 즉시 ACK를 받는다. Lambda는 내부 이벤트 큐에 이벤트를 넣고 호출자는 결과를 기다리지 않는다. Lambda 실패 시 **자동으로 최대 2회 재시도**한다(총 3번 시도). 재시도 후에도 실패하면 이벤트는 DLQ(Dead Letter Queue - SQS 또는 SNS)로 보내거나, Lambda Destinations의 On-Failure 대상으로 라우팅된다.

대표 서비스: S3 이벤트, SNS, EventBridge, SES, AWS IoT, CodeCommit.

### 이벤트 소스 매핑(Event Source Mapping, Polling)

Lambda 서비스가 소스를 직접 폴링해서 배치를 Lambda 함수에 전달한다. 호출자가 없고 Lambda 서비스가 중간에서 소스를 계속 감시한다.

대표 서비스: SQS, Kinesis Data Streams, DynamoDB Streams, MSK(Managed Kafka), Amazon MQ.

각 소스별 오류 처리가 다르다:
- **SQS**: 실패한 메시지는 가시성 타임아웃 후 다시 큐에 돌아온다. 최대 재시도 후 DLQ로. `ReportBatchItemFailures`로 실패 항목만 재시도 가능.
- **Kinesis/DynamoDB Streams**: 실패한 배치의 시작 시퀀스 번호부터 계속 재시도. 만료될 때까지 멈추지 않는다(기본). `bisectBatchOnFunctionError`로 실패 범위를 절반씩 좁혀서 문제 항목을 격리할 수 있다.

| 호출 방식 | 결과 대기 | 재시도 | DLQ 지원 | 대표 소스 |
|-----------|---------|-------|---------|---------|
| 동기 | O | 호출자 책임 | X (직접 구현) | API GW, ALB |
| 비동기 | X | 자동 2회 | O (SQS/SNS) | S3, SNS, EventBridge |
| 이벤트 소스 매핑 | X(폴링) | 소스별 다름 | O (소스별) | SQS, Kinesis, DDB Streams |

> ⚠️ **S3 이벤트 알림은 비동기 호출이다** — "S3가 Lambda를 동기적으로 호출한다" — 틀렸다. S3 이벤트 알림은 Lambda를 비동기적으로 호출한다. S3는 이벤트를 Lambda에 보내고 응답을 기다리지 않는다. 따라서 S3 → Lambda 파이프라인에서 Lambda가 실패하면, AWS Lambda가 자동으로 2회 재시도하고 이후 DLQ나 On-Failure Destination으로 라우팅한다. S3가 직접 오류를 받지 않는다. 반면 API Gateway → Lambda는 동기 호출이므로 Lambda 오류가 API Gateway를 통해 클라이언트에게 직접 전달된다.

> 💡 **이벤트 소스 매핑의 순서 보장과 병렬성** — SQS Standard 큐의 이벤트 소스 매핑은 배치 단위로 처리하며, 순서 보장 없음. SQS FIFO 큐는 메시지 그룹 ID 단위로 순서를 보장하며, 그룹 ID별로 병렬 처리된다. Kinesis와 DynamoDB Streams는 샤드/파티션 단위로 순서를 보장한다. 한 샤드당 하나의 Lambda 실행 컨텍스트가 순차 처리하므로, 샤드 수가 Lambda 병렬성의 한계다. Lambda 병렬 실행 개수를 늘리려면 Kinesis 샤드를 늘려야 한다(Resharding).

## 동시성 제어 — Reserved와 Provisioned의 차이

동시성(Concurrency)은 동시에 실행 중인 Lambda 함수 인스턴스 수를 의미한다. AWS 계정은 리전당 기본 1000개의 동시성 한도를 갖는다(Soft Limit, 증가 요청 가능). 이 1000개를 계정 내 모든 함수가 공유한다.

**Reserved Concurrency**: 특정 함수에 동시성을 "예약"한다. 예를 들어 함수 A에 Reserved Concurrency = 100을 설정하면, 계정 전체 1000개 중 100개가 이 함수 전용이다. 다른 함수들이 이 100개를 쓸 수 없고, 함수 A는 100개 초과 요청은 스로틀링(429 TooManyRequestsException)한다.

역할: 중요 함수를 **보호**(다른 함수의 폭증이 내 함수 동시성을 빼앗지 못하게)하고, 동시에 중요 함수의 **과도한 사용을 제한**(DB 과부하 방지). **콜드 스타트를 줄이지는 않는다.**

**Provisioned Concurrency**: 미리 지정한 수의 실행 환경을 "워밍업" 상태로 유지한다. 콜드 스타트 없이 즉시 응답할 수 있는 인스턴스를 준비해둔다. API Gateway 뒤에 있는 고성능 Lambda에서 콜드 스타트 지연을 허용할 수 없을 때 사용한다.

역할: **콜드 스타트 제거**. 비용 추가(워밍업 인스턴스만큼 항상 과금, 요청이 없어도).

```
[Reserved Concurrency = 100 설정]
계정 총 동시성: 1000
함수 A 전용: 100개 (나머지 함수들 접근 불가)
함수 A 101번째 동시 요청: 스로틀링 (429)
나머지 함수 공유: 900개

[Provisioned Concurrency = 10 설정]
10개 인스턴스가 항상 워밍업 상태 유지 (비용 항상 발생)
요청 0-10개: 콜드 스타트 없이 즉시 처리
11번째 동시 요청: 새 인스턴스 콜드 스타트로 처리
```

| 항목 | Reserved Concurrency | Provisioned Concurrency |
|------|---------------------|------------------------|
| 목적 | 동시성 격리 + 상한 제한 | 콜드 스타트 제거 |
| 비용 | 예약 자체 무료 (스로틀링만) | 워밍업 인스턴스 항상 과금 |
| 콜드 스타트 | 줄이지 않음 | 설정된 개수만큼 제거 |
| 스케일링 | 자동 (한도 내) | 한도 내에서 자동 + PC 범위 보장 |
| Auto Scaling 연동 | X | O (Application Auto Scaling) |

> 💡 **서버리스 패러다임과 Provisioned Concurrency의 역설** — Provisioned Concurrency의 비용 구조는 서버리스 패러다임과 묘하게 충돌한다. 서버리스는 "사용한 만큼만 낸다"를 표방하는데, Provisioned Concurrency는 사용 여부와 무관하게 비용이 발생한다. 이것은 마치 EC2 인스턴스를 Reserved Instance로 구매하는 것과 유사하다. 트레이드오프: 응답 지연 예측 가능성 vs 비용 효율성. 성능 SLA가 P99 지연 시간을 규정하는 경우(예: "99%의 요청은 100ms 이내"), Provisioned Concurrency가 그 SLA를 맞추는 유일한 방법이 될 수 있다. Application Auto Scaling을 연동해서 피크 시간에만 Provisioned Concurrency를 늘리면 비용을 최적화할 수 있다.

> 🔍 **Burst Concurrency와 스케일링 속도** — Lambda의 동시성은 갑작스러운 트래픽 폭증 시 처음에는 제한적으로 증가한다. 초기 Burst Limit는 리전별로 다르지만 보통 500-3000개다. 이 한도를 넘으면 분당 500개씩 추가로 증가한다. 즉, 트래픽이 갑자기 1000배 폭증하면 Lambda가 모두 처리할 수 있는 동시성에 도달하는 데 수 분이 걸릴 수 있다. 예상치 못한 트래픽 폭증은 스로틀링을 유발한다. SQS 이벤트 소스 매핑의 경우 Lambda가 처리하지 못한 메시지는 큐에 남아 있으므로 손실 없이 나중에 처리된다.

## Lambda 네트워킹 — VPC와 인터넷의 경계

Lambda 함수는 기본적으로 AWS가 관리하는 VPC 외부에서 실행된다. 이 상태에서 인터넷은 접근할 수 있지만, 고객의 VPC 안에 있는 프라이빗 리소스(RDS, ElastiCache, 프라이빗 EC2 등)에는 접근할 수 없다.

Lambda를 고객 VPC에 연결하면(VPC Configuration), Lambda 실행 환경에 ENI(Elastic Network Interface)가 할당되고 지정된 서브넷의 프라이빗 IP를 갖는다. 이제 VPC 안의 리소스에 접근할 수 있다. 그러나 이 상태에서 인터넷 접근은 서브넷의 라우팅 규칙을 따른다.

```
[기본 Lambda (VPC 외부 — AWS Managed VPC)]
Lambda → 인터넷 O (직접)
Lambda → 고객 VPC 내 RDS X

[Lambda + VPC 연결 (프라이빗 서브넷)]
Lambda → RDS O (같은 VPC, 프라이빗 통신)
Lambda → 인터넷 X (프라이빗 서브넷에 IGW 없음)

[Lambda + VPC 연결 + NAT Gateway]
Lambda (프라이빗 서브넷)
    → NAT GW (퍼블릭 서브넷) → IGW → 인터넷 O
    → RDS O (VPC 내부 직접)
```

중요한 함정: Lambda를 퍼블릭 서브넷에 배치해도 ENI는 퍼블릭 IP를 받지 않는다. Lambda ENI는 항상 프라이빗 IP만 가진다. 퍼블릭 서브넷 + IGW 라우팅이 있어도 Lambda는 인터넷으로 나갈 수 없다. 반드시 NAT Gateway를 거쳐야 한다.

VPC Lambda 비용 고려사항:
- NAT Gateway: 처리 데이터 GB당 요금 + 시간당 요금
- VPC Endpoint 사용: DynamoDB, S3 같은 AWS 서비스는 VPC Gateway Endpoint를 통해 NAT GW 없이 접근 가능 → 비용 절감

> 🔍 **Hyperplane ENI와 콜드 스타트 개선** — 과거 Lambda + VPC 구성에서 콜드 스타트가 극단적으로 길었던 이유는 각 함수 인스턴스마다 ENI를 새로 생성했기 때문이다. ENI 생성이 수 초가 걸렸다. 2019년 AWS는 "Hyperplane ENI"를 도입해서 이 문제를 해결했다. Hyperplane ENI는 VPC 연결 Lambda 함수들이 공유하는 ENI 풀 방식으로, 콜드 스타트 시 새 ENI를 생성할 필요가 없어졌다. 현재 VPC Lambda의 콜드 스타트는 비 VPC Lambda와 거의 차이가 없다. Hyperplane은 AWS의 내부 네트워크 가상화 시스템으로, VPC 피어링, Transit Gateway, PrivateLink 등도 이 위에 구축됐다.

> 📚 **Coinbase Lambda 성능 분석 사례** — 2021년 Coinbase는 Lambda 기반 백엔드 아키텍처의 성능 분석 블로그를 공개했다. 암호화폐 거래 플랫폼에서 API 지연이 P99 수준에서 예측 불가능한 문제가 발생했고, 분석 결과 Lambda 콜드 스타트가 주요 원인이었다. Provisioned Concurrency를 적용한 결과 P99 지연이 75% 감소했다고 보고했다. 특히 Java 기반 Lambda에서 SnapStart와 Provisioned Concurrency를 함께 적용하는 것이 효과적이었다. Coinbase는 더불어 `arm64` 아키텍처로 전환해서 동일 비용 대비 성능을 20% 추가 향상시켰다.

## Lambda Destinations — DLQ보다 더 유연한 오류 처리

비동기 Lambda 함수에서 실패한 이벤트를 처리하는 전통적 방법은 DLQ(Dead Letter Queue)였다. DLQ는 실패한 이벤트를 SQS 큐나 SNS 토픽에 전송한다.

Lambda Destinations(2019년 출시)는 DLQ보다 더 유연하다. 성공과 실패 두 가지 경우 모두에 대해 다음 대상을 지정할 수 있다.

지원 대상: SQS, SNS, EventBridge, **다른 Lambda 함수**.

DLQ와의 차이:
- DLQ는 실패 이벤트만 처리. Destinations는 성공과 실패 모두.
- DLQ는 SQS/SNS만 가능. Destinations는 SQS/SNS/EventBridge/Lambda.
- Destinations 페이로드에는 원본 이벤트 + 함수 실행 결과 + 오류 정보가 모두 포함된다.
- DLQ는 함수 설정, Destinations는 함수 이벤트 호출 설정(per-trigger)으로 세분화 가능.

```
비동기 Lambda 함수
       │
       ├─ 성공 → On-Success Destination
       │          ├─ EventBridge (다음 워크플로 트리거)
       │          ├─ SQS (성공 기록)
       │          └─ Lambda (후속 처리)
       │
       └─ 실패 (2회 재시도 후) → On-Failure Destination
                                    ├─ SQS DLQ (수동 재처리)
                                    ├─ SNS (알림 — 개발팀 이메일)
                                    ├─ EventBridge (조건부 라우팅)
                                    └─ Lambda (자동 복구 시도)
```

## 사양 한도와 비용 구조

Lambda의 주요 사양 한도는 시험에 자주 나오므로 암기가 필요하다.

| 항목 | 한도 |
|------|------|
| 최대 실행 시간 | 15분 |
| 메모리 | 128MB ~ 10,240MB (64MB 단위) |
| /tmp 스토리지 | 512MB ~ 10,240MB |
| 최대 패키지 크기 (ZIP, 업로드) | 50MB |
| 최대 패키지 크기 (unzipped) | 250MB |
| 컨테이너 이미지 크기 | 최대 10GB |
| 계정당 동시성 (기본) | 1000 (증가 가능) |
| 환경 변수 | 최대 4KB |
| 최대 페이로드 (동기) | 6MB (요청) / 6MB (응답) |
| 최대 페이로드 (비동기) | 256KB |
| 최대 레이어 수 | 5개 |
| 최대 레이어 크기 (unzipped) | 250MB (함수 + 모든 레이어 합계) |

비용 구조: 요청 수 × 요금 + 실행 시간(ms) × 메모리(GB) × 요금. 첫 100만 요청/월과 첫 40만 GB-초/월은 무료 (프리 티어 영구).

ARM(Graviton2/Graviton3) 아키텍처를 선택하면 x86 대비 약 20% 저렴하고, 같은 비용에서 더 많은 성능을 얻는다. 대부분의 Node.js, Python 함수는 ARM으로 변경하는 것이 비용 효율적이다.

다른 FaaS(Function as a Service)와의 비교:

| 항목 | AWS Lambda | GCP Cloud Functions | Azure Functions |
|------|-----------|--------------------|-----------------| 
| 최대 실행 시간 | 15분 | 60분 (HTTP), 10분 (Background) | 230초 (기본), 무제한 (Premium) |
| 메모리 | 128MB~10GB | 128MB~16GB | 128MB~14GB |
| 콜드 스타트 최소화 | Provisioned Concurrency, SnapStart | Min Instances | Premium Plan (항시 웜) |
| 컨테이너 이미지 | O (10GB) | O | O |
| 로컬 테스트 | SAM CLI, LocalStack | Functions Framework | Azure Functions Core Tools |
| 트리거 | 200+ 이벤트 소스 | 30+ | 10+ 바인딩 |

> ⚠️ **Lambda 15분 한도의 실전 함의** — "Lambda는 최대 15분 실행"이 허용되지만, 15분을 꽉 채우는 작업에 Lambda가 항상 적합한 것은 아니다. DB 마이그레이션, 대용량 파일 처리처럼 실패 시 재실행이 어려운 작업은 ECS Fargate나 Step Functions + Lambda 조합이 더 안전하다. Lambda는 무상태(Stateless)이므로 실패 시 재시도 전에 어디까지 했는지 추적하는 로직이 필요하다. 장기 실행 작업: ECS/Fargate. 복잡한 오류 처리와 재시도: Step Functions. 15분 내 처리 가능한 이벤트 응답: Lambda.

## CLI로 Lambda 핵심 작업 실습

```bash
# Lambda 함수 생성 (ARM + VPC + 환경 변수)
aws lambda create-function \
  --function-name prod-api-handler \
  --runtime python3.12 \
  --architectures arm64 \
  --role arn:aws:iam::111122223333:role/lambda-execution-role \
  --handler app.handler \
  --zip-file fileb://function.zip \
  --memory-size 512 \
  --timeout 30 \
  --vpc-config SubnetIds=subnet-private-a,subnet-private-b,SecurityGroupIds=sg-lambda \
  --environment Variables='{DB_HOST=prod-proxy.cluster-xxx.ap-northeast-2.rds.amazonaws.com}'

# Lambda 버전 게시 (Provisioned Concurrency는 버전 또는 Alias에만 적용 가능)
aws lambda publish-version --function-name prod-api-handler

# Provisioned Concurrency 설정 (버전 1에 20개)
aws lambda put-provisioned-concurrency-config \
  --function-name prod-api-handler \
  --qualifier 1 \
  --provisioned-concurrent-executions 20

# Reserved Concurrency 설정 (함수 전체)
aws lambda put-function-concurrency \
  --function-name prod-api-handler \
  --reserved-concurrent-executions 200

# Lambda Destinations 설정 (비동기 호출용)
aws lambda put-function-event-invoke-config \
  --function-name prod-processor \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --destination-config '{
    "OnSuccess": {"Destination": "arn:aws:sqs:ap-northeast-2:111:success-queue"},
    "OnFailure": {"Destination": "arn:aws:sqs:ap-northeast-2:111:dlq"}
  }'

# SQS 이벤트 소스 매핑 (배치 처리 + 부분 실패 처리)
aws lambda create-event-source-mapping \
  --function-name prod-processor \
  --event-source-arn arn:aws:sqs:ap-northeast-2:111:orders-queue \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures

# DynamoDB Streams 이벤트 소스 매핑 (bisect on error)
aws lambda create-event-source-mapping \
  --function-name ddb-stream-processor \
  --event-source-arn arn:aws:dynamodb:ap-northeast-2:111:table/Orders/stream/xxx \
  --starting-position LATEST \
  --batch-size 100 \
  --bisect-batch-on-function-error \
  --destination-config '{"OnFailure":{"Destination":"arn:aws:sqs:ap-northeast-2:111:stream-dlq"}}'

# SnapStart 활성화 (Java 런타임)
aws lambda update-function-configuration \
  --function-name java-api-handler \
  --snap-start ApplyOn=PublishedVersions

# Lambda 실행 시간 및 오류 모니터링
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=prod-api-handler \
  --start-time 2025-05-26T00:00:00Z \
  --end-time 2025-05-26T23:59:59Z \
  --period 300 \
  --statistics Sum
```

## 정리하며

Lambda는 "이벤트가 발생했을 때 코드를 실행하는" 가장 단순한 모델이다. 그 단순함 뒤에는 Firecracker MicroVM의 격리 보장, 콜드 스타트 물리학, 동기/비동기/폴링의 세 가지 호출 모델, 동시성의 Reserved와 Provisioned 구분, VPC 연결 시의 네트워킹 규칙이 있다.

시험에서 Lambda 문제는 거의 항상 이 중 하나를 묻는다. "콜드 스타트를 없애려면?" → Provisioned Concurrency. "VPC 안 RDS + 외부 API 호출이 동시에 필요하면?" → 프라이빗 서브넷 + NAT Gateway. "S3 이벤트 처리 실패 시 추적하려면?" → DLQ 또는 Lambda Destinations. "함수가 다른 함수의 동시성을 빼앗지 못하게?" → Reserved Concurrency.

내일은 Lambda 앞에 서는 API Gateway를 다룬다. REST, HTTP, WebSocket 세 종류의 차이, 그리고 API Key와 Usage Plan이 왜 REST에서만 가능한지를 내부 구조에서 이해한다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수가 API Gateway 뒤에서 사용자 인증 API를 처리한다. P99 응답 지연을 100ms 이내로 보장해야 하는 SLA가 있다. Java 런타임을 사용하고 있어서 콜드 스타트가 2-3초에 달한다. 가장 적합한 해결책은?

A) Python으로 런타임을 변경한다 (콜드 스타트 감소)
B) Provisioned Concurrency를 적용해서 함수 인스턴스를 미리 워밍업한다
C) Reserved Concurrency를 높게 설정한다
D) 메모리를 10,240MB로 늘린다

**정답: B**

해설: Provisioned Concurrency는 지정된 수의 Lambda 실행 환경을 항상 초기화된 상태로 유지해서 콜드 스타트를 제거한다. P99 100ms SLA를 만족하려면 99번째 백분위 요청도 콜드 스타트 없이 처리되어야 한다. A는 Python이 Java보다 콜드 스타트가 짧지만 완전히 제거할 수 없고, Java에서는 SnapStart도 유효한 옵션이다. C는 Reserved Concurrency는 동시성 한도를 예약하는 것이지 콜드 스타트를 없애지 않는다. D는 메모리 증가는 CPU도 비례해서 늘어나 실행 속도가 빨라질 수 있지만 콜드 스타트를 근본적으로 해결하지 못한다.

---

**문제 2.** Lambda 함수가 비동기적으로 SNS 토픽에서 이벤트를 받아 처리한다. 함수가 3회 시도 후에도 실패했을 때 이벤트를 재처리하거나 알림을 보내려면 어떻게 설정해야 하는가?

A) Lambda 함수 내부에서 try-catch로 직접 SQS에 전송한다
B) Lambda 함수에 SQS DLQ를 설정하고, 3회 재시도 후 DLQ로 이동하도록 구성한다
C) Lambda Destinations의 On-Failure를 SQS로 설정한다 (자동 2회 재시도 후)
D) CloudWatch Events로 Lambda 오류를 감지하고 다시 호출한다

**정답: C**

해설: 비동기 Lambda는 기본적으로 2회 자동 재시도(총 3번 시도)를 한다. Lambda Destinations의 On-Failure에 SQS를 설정하면, 모든 재시도 후에도 실패한 이벤트가 자동으로 SQS로 전달된다. Destinations는 원본 이벤트뿐만 아니라 실행 컨텍스트와 오류 정보도 포함해서 더 상세한 디버깅이 가능하다. B도 DLQ로 유효한 방법이지만, Destinations가 더 풍부한 정보를 제공하고 성공 케이스도 처리할 수 있어 더 유연하다. A는 함수 내부에서 처리하면 코드 복잡도가 올라가고 DLQ의 재시도 이점을 활용하지 못한다.

---

**문제 3.** Lambda 함수가 고객 VPC의 프라이빗 서브넷에 있는 RDS와 외부 결제 API(인터넷)를 모두 호출해야 한다. 어떻게 설정해야 하는가?

A) Lambda를 VPC 퍼블릭 서브넷에 배치하면 RDS와 인터넷 모두 접근 가능하다
B) Lambda를 VPC 프라이빗 서브넷에 배치하고, 인터넷 접근을 위해 NAT Gateway를 퍼블릭 서브넷에 추가한다
C) Lambda를 VPC 밖에 두고 RDS에 퍼블릭 엔드포인트를 활성화한다
D) Lambda를 두 개로 분리해서 하나는 VPC 안, 하나는 VPC 밖에 둔다

**정답: B**

해설: Lambda의 VPC ENI는 항상 프라이빗 IP만 가진다. 퍼블릭 서브넷에 배치해도 IGW를 통한 인터넷 접근이 되지 않는다. 프라이빗 서브넷 + NAT Gateway 경로가 VPC Lambda가 인터넷에 접근하는 표준 방법이다. RDS는 VPC 안에 있으므로 같은 VPC 안에 있는 Lambda에서 프라이빗으로 접근 가능하다. C는 RDS 퍼블릭 엔드포인트는 보안 위험이 크다. D는 복잡성이 높고 두 함수 간 통신 오버헤드가 발생한다.

---

**문제 4.** Lambda 함수가 DynamoDB Streams에서 이벤트를 배치로 받아 처리한다. 배치 중 일부 항목 처리에 실패했을 때, 실패한 항목만 재시도하고 성공한 항목은 중복 처리하지 않으려면?

A) 전체 배치를 실패 처리하고 재시도한다
B) 함수 응답에 ReportBatchItemFailures를 사용하고, 실패한 항목의 시퀀스 번호를 반환한다
C) 배치 크기를 1로 설정해서 항목 하나씩 처리한다
D) SQS DLQ를 설정한다

**정답: B**

해설: `ReportBatchItemFailures` 응답 타입을 사용하면 Lambda 함수가 실패한 특정 항목의 시퀀스 번호를 응답에 포함할 수 있다. Lambda 서비스는 그 항목부터 재시도하고, 이미 성공한 항목은 중복 처리하지 않는다. A는 전체 재시도로 성공한 항목도 다시 처리해서 중복이 발생한다. C는 처리량이 크게 감소하고 배치 처리의 이점이 없어진다. D는 DynamoDB Streams 이벤트 소스 매핑에서 On-Failure Destination을 사용할 수 있지만, SQS DLQ는 이 컨텍스트에서 직접 지원되지 않는다.

---

**문제 5.** 결제 처리 Lambda 함수가 있다. 이 함수는 계정 전체 동시성 한도를 모두 사용해서는 안 되며, 동시에 다른 덜 중요한 함수의 트래픽 폭증이 결제 함수의 실행을 방해해서도 안 된다. 어떻게 설정해야 하는가?

A) 결제 함수에 Provisioned Concurrency를 설정한다
B) 결제 함수에 Reserved Concurrency를 설정한다
C) 덜 중요한 함수에 Throttling 규칙을 추가한다
D) 계정의 전체 동시성 한도를 늘린다

**정답: B**

해설: Reserved Concurrency는 두 가지 역할을 동시에 한다. ① 설정된 수만큼 다른 함수가 사용하지 못하도록 격리 → 결제 함수의 용량 보장(다른 함수 폭증에서 보호). ② 설정된 수를 초과하는 요청은 스로틀링 → 결제 함수가 전체 한도를 독점하지 않음. 이것이 "보호"와 "제한" 두 가지를 동시에 달성한다. A는 Provisioned Concurrency는 콜드 스타트 제거용이지 동시성 격리를 해주지 않는다. C는 덜 중요한 함수를 직접 제한할 수 있지만 새로운 함수가 생기면 매번 설정해야 한다. D는 전체 한도를 늘려도 함수 간 격리가 되지 않는다.

---

**문제 6.** Lambda 함수가 Kinesis Data Streams에서 이벤트를 처리한다. 샤드당 처리량이 부족하고 병렬 처리를 늘리고 싶다. 어떻게 해야 하는가?

A) Lambda 함수의 메모리를 늘린다
B) Lambda Reserved Concurrency를 늘린다
C) Kinesis 샤드 수를 늘린다 (Resharding)
D) 배치 크기를 줄인다

**정답: C**

해설: Lambda의 Kinesis 이벤트 소스 매핑에서 병렬성은 샤드 수에 의해 결정된다. 각 샤드는 하나의 Lambda 실행 컨텍스트에 의해 처리된다(Enhanced Fan-Out 비활성화 시). 따라서 병렬 처리를 늘리려면 Kinesis 샤드를 추가해야 한다. A는 메모리 증가는 개별 함수 속도를 높이지만 병렬성을 늘리지 않는다. B는 Reserved Concurrency는 상한을 설정하지 병렬성을 늘리지 않는다. D는 배치 크기를 줄이면 더 많은 호출이 발생하지만, 샤드당 하나의 컨텍스트 제한은 변하지 않는다.

---
