# Day 2 - 도메인 2 종합: 신규 솔루션 설계 (29%) — 컴퓨트 진화사, 데이터 일관성의 CS 이론, 이벤트 아키텍처의 내부 동작

SAP-C02 도메인 2 "Design Solutions for New Solutions"는 시험 비중 29%로 가장 크다(2023년 개정 시 26%→29% 상향). 이 도메인의 본질은 SAA의 "동작하는 설계"를 넘어 **가용성·성능·보안·비용·운영의 5축을 동시에 최적화하는 설계**를 묻는 것이다. 같은 문제에 정답처럼 보이는 선택지가 3~4개씩 깔리고, 그중 "가장 운영 부담이 낮고 요구를 정확히 충족하는 단 하나"를 골라야 한다.

오늘은 도메인 2를 컴퓨트·데이터·이벤트·가용성 4축으로 정리하되, 각 선택의 **역사적 배경·내부 동작 원리·CS 이론·실제 사고 사례**를 깊이 분해한다. 단순 매핑 표를 외우는 것을 넘어 "왜 이 서비스가 이 모양인가"를 이해하면, 처음 보는 변형 시나리오도 풀 수 있다.

## 컴퓨트 — 추상화 사다리의 역사

AWS 컴퓨트의 역사는 **추상화 사다리를 한 칸씩 올라온 역사**다. 2006년 EC2(가상 머신)로 시작해, 2014년 Lambda(함수), 2017년 Fargate(서버리스 컨테이너)로 진화했다. 각 단계는 "고객이 관리해야 할 표면적"을 줄였다 — EC2는 OS·패치·스케일링을 직접, Fargate는 컨테이너만, Lambda는 코드만 신경 쓰면 된다.

```
서버리스 가능? Yes → Lambda(이벤트·짧은 작업) / Fargate(컨테이너·장시간)
   │ No
컨테이너 오케스트레이션? Yes → ECS(AWS 단순) / EKS(K8s 표준·멀티클라우드)
   │ No
EC2 → ASG · Placement Group · Spot · Graviton
```

> 💡 **관련 이론**: Lambda의 콜드 스타트는 **컨테이너 초기화 비용**의 직접 발현이다. 호출이 없으면 AWS는 실행 환경(Firecracker microVM)을 회수하고, 새 호출 시 microVM 부팅 + 런타임 로드 + 코드 init을 다시 한다(수십~수백 ms). Firecracker(2018, Rust 작성)는 AWS가 만든 경량 가상화 기술로, microVM을 ~125ms에 부팅해 컨테이너의 격리 부족과 VM의 무거움 사이를 메운다. Provisioned Concurrency는 microVM을 미리 데워두는 것이고, SnapStart(Java)는 초기화된 메모리 스냅샷을 복원해 콜드 스타트를 줄인다. 시험에서 "Lambda 지연 변동성 제거 + 예측 가능 트래픽"은 Provisioned Concurrency, "Java 콜드 스타트"는 SnapStart가 직답이다.

> 🔍 **더 깊이**: ECS vs EKS의 선택은 **"표준 락인 vs 운영 단순성"**의 trade-off다. EKS는 Kubernetes API 표준을 제공해 멀티클라우드 이식성(GKE·AKS로 이동 가능)을 주지만, 컨트롤 플레인 비용($0.10/h)과 K8s 자체의 운영 복잡도(CNI·RBAC·Helm)를 짊어진다. ECS는 AWS 독자 오케스트레이터로 학습 곡선이 완만하고 비용이 없지만 AWS에 묶인다. Pro 시험 신호: "기존 K8s 전문성·온프레 K8s와 일관성"이면 EKS, "AWS만 쓰고 단순함 우선·소규모 팀"이면 ECS. 둘 다 데이터 플레인을 Fargate(서버리스) 또는 EC2(세밀 제어·GPU·Spot)로 고를 수 있다.

> ⚠️ **함정**: Lambda는 만능이 아니다. **15분 실행 제한, 10GB 메모리 상한, /tmp 10GB, 페이로드 6MB(동기)/256KB(비동기)**의 하드 리밋이 있다. "장시간 배치·대용량 처리·상태 유지"가 보이면 Lambda가 아니라 Fargate·Batch·Step Functions다. 또 Lambda는 VPC 내 ENI를 통해 RDS에 붙을 때 동시성만큼 ENI를 소비하므로, 고동시성 + VPC Lambda는 ENI/IP 고갈을 부른다(Hyperplane ENI로 완화됐지만 RDS Proxy로 커넥션 풀링이 정석). "Lambda + RDS 커넥션 폭발"은 RDS Proxy가 정답이다.

## 데이터 — 일관성 모델과 CAP 이론

데이터베이스 선택은 SAP-C02에서 가장 자주 나오는 결정이다. 핵심은 "관계형이냐 아니냐"를 넘어 **일관성·확장성·접근 패턴**을 읽는 것이다.

| 요구 | DB | 핵심 차별점 |
|------|-----|------------|
| RDB 표준 | RDS | Multi-AZ 동기 복제, 6엔진 |
| RDB 확장·글로벌 DR | Aurora / Aurora Global | 스토리지 분리, 6-way 복제, RPO<1s |
| 서버리스 RDB | Aurora Serverless v2 | ACU 단위 초당 스케일 |
| Key-Value 초고TPS | DynamoDB | 무제한 수평 확장, 単자리 ms |
| 문서(Mongo 호환) | DocumentDB | MongoDB API |
| 그래프 | Neptune | Gremlin·SPARQL, 관계 탐색 |
| 시계열 | Timestream | IoT·메트릭, 자동 티어링 |
| 원장(불변) | QLDB | 암호화 검증 가능 이력 |
| Cassandra 호환 | Keyspaces | 서버리스 Cassandra |
| Redis 호환 + 영속 | MemoryDB | Multi-AZ 내구성 |
| 검색·로그 | OpenSearch | 역색인 풀텍스트 |
| 데이터 웨어하우스 | Redshift | 컬럼형 MPP |

> 💡 **관련 이론**: 분산 DB 선택의 이론적 뼈대는 **CAP 정리(Brewer, 2000; Gilbert·Lynch가 2002년 형식 증명)**다. 네트워크 분할(Partition)이 발생하면 일관성(Consistency)과 가용성(Availability) 중 하나를 포기해야 한다. DynamoDB는 기본적으로 **AP**(가용성 우선, eventual consistency)지만 `ConsistentRead=true`로 강한 일관성을 선택할 수 있다. 더 정밀한 모델은 **PACELC(Abadi, 2012)**다 — 분할 시(P) A/C를 고르고, 정상 시(Else)엔 지연(L)/일관성(C)을 고른다. DynamoDB는 PA/EL(정상 시 지연 최소화 위해 일관성 완화), Aurora는 PC/EC(일관성 우선) 성향이다. 시험에서 "글로벌 쓰기 + 낮은 지연 + eventual OK"는 DynamoDB Global Tables(AP/EL), "강한 일관성 + 트랜잭션"은 Aurora가 갈린다.

> 🔍 **더 깊이**: Aurora의 혁신은 **"로그가 곧 데이터베이스(The log is the database)"** 아키텍처다(2017 SIGMOD 논문). 전통 RDBMS는 데이터 페이지와 redo 로그를 둘 다 네트워크로 복제해 I/O 증폭이 심했다. Aurora는 redo 로그 레코드만 6개 스토리지 노드(3 AZ × 2)로 보내고, 스토리지 계층이 백그라운드에서 페이지를 재구성한다. 쓰기는 6개 중 **4개(4/6 쿼럼)** 응답으로 커밋, 읽기는 3/6 쿼럼으로 가능 — 이 쿼럼 수학(W+R>N, 4+3>6)이 한 AZ 전체가 죽어도 쓰기를, 한 AZ + 한 노드가 죽어도 읽기를 보장한다. 그래서 Aurora는 컴퓨트와 스토리지가 분리돼 리드 레플리카가 동일 스토리지를 공유(복제 지연 거의 0)하고 빠르게 추가된다.

> 📚 **사례**: 2012년 **Knight Capital**의 4억 4천만 달러 손실(45분)은 데이터·배포 설계 실패의 교과서다. 새 거래 코드를 8대 서버 중 7대에만 배포하고 1대에 옛 플래그를 재사용한 코드가 남아, 그 1대가 폭주 주문을 쏟아냈다. 교훈은 (1) **불변 인프라·블루그린으로 부분 배포 금지**, (2) **킬 스위치(Stop Condition)**, (3) **상태를 코드에 숨기지 말 것**이다. 이것이 Pro가 "배포 안전성 + 즉시 롤백"에 CodeDeploy Blue/Green, FIS Stop Condition을 정답으로 미는 역사적 이유다.

> ⚠️ **함정**: DynamoDB의 **핫 파티션**은 흔한 함정이다. 파티션 키 카디널리티가 낮으면(예: `status=active`) 한 파티션에 쓰기가 몰려 스로틀된다. On-Demand나 충분한 RCU/WCU여도 단일 파티션 한도(3000 RCU/1000 WCU)를 넘으면 throttle된다. 해결은 **고카디널리티 파티션 키 설계 + write sharding(키에 접미사)**이다. "DynamoDB 일부 키만 스로틀"이 보이면 용량 증설이 아니라 키 설계가 답이다.

## 이벤트·메시징 — 결합도를 낮추는 도구들

이벤트 기반 아키텍처는 **시간적·공간적 결합(coupling)을 끊는** 설계다. 동기 호출은 호출자가 응답을 기다려야 하고(시간 결합), 대상의 주소를 알아야 한다(공간 결합). 큐·토픽·버스는 이 둘을 끊어 한쪽이 죽어도 다른 쪽이 살게 한다.

| 서비스 | 모델 | 순서 | 내부 동작 핵심 |
|--------|------|------|---------------|
| **SQS Standard** | 큐(point-to-point) | 무순서 | At-Least-Once, 무제한 처리량 |
| **SQS FIFO** | 큐 | MessageGroupId 단위 순서 | Exactly-Once, 300 TPS(배치 3000) |
| **SNS** | Pub/Sub fan-out | FIFO 옵션 | 다수 구독자 동시 전달 |
| **EventBridge** | 이벤트 버스·라우팅 | 무순서 | 룰 기반 필터·변환, SaaS 소스 |
| **Kinesis Data Streams** | 스트림 | 샤드 내 순서 | 보존(1~365일), 다중 컨슈머 재생 |
| **MSK** | Kafka | 파티션 내 순서 | 오픈소스 Kafka 호환 |
| **Step Functions** | 워크플로 | 명시적 순서 | 상태 머신, 시각적 |

> 💡 **관련 이론**: SQS의 "At-Least-Once + 무순서"는 우연이 아니라 **분산 시스템의 근본 한계**다. 정확히 한 번(exactly-once) 전달은 분산 환경에서 일반적으로 불가능에 가깝고(네트워크는 메시지 손실·중복을 허용), 그래서 대부분 시스템은 "최소 한 번 전달 + 멱등 소비(idempotent consumer)"로 우회한다. SQS Standard는 가시성 타임아웃(visibility timeout) 동안 메시지를 숨겨 중복 처리를 줄이지만, 컨슈머가 타임아웃 내 삭제 못 하면 재전달된다. 그래서 컨슈머는 **멱등하게** 설계해야 한다(같은 메시지 두 번 처리해도 결과 동일). FIFO는 dedup으로 exactly-once를 흉내내지만 처리량을 희생한다. 시험에서 "정확히 한 번·엄격 순서"는 FIFO, "초고처리량·멱등 소비 가능"은 Standard다.

> 🔍 **더 깊이**: Kinesis vs SQS의 본질 차이는 **"소비 후 삭제 vs 보존 후 재생"**이다. SQS는 컨슈머가 메시지를 처리하면 삭제해 단일 소비자 모델이고, Kinesis는 메시지를 샤드에 보존(기본 24h, 최대 365일)해 여러 컨슈머가 각자의 체크포인트로 같은 데이터를 독립 소비·재생할 수 있다. 이것이 "다중 컨슈머 + 재처리 + 순서 보장"이 Kinesis인 이유다. 샤드는 1MB/s 또는 1000 rec/s 쓰기, 2MB/s 읽기 한도가 있어, 처리량을 늘리려면 샤드를 늘린다(re-sharding). Enhanced Fan-Out은 컨슈머별 전용 2MB/s를 줘 다중 컨슈머 경합을 없앤다. "다중 컨슈머 + 메시지 재생"은 Kinesis(C), "단순 작업 분배"는 SQS다.

> 🎯 **시나리오**: "전자상거래에서 주문 1건이 결제·재고·배송·알림 4개 서비스를 트리거해야 한다. 한 다운스트림이 일시 장애여도 다른 서비스는 영향받지 말아야 하고, 장애 서비스는 복구 후 누락 없이 처리해야 한다. 설계는?" — 답: **SNS(주문 토픽) → 4개 SQS 큐 fan-out, 각 서비스는 자기 큐를 소비**. SNS가 4개 큐에 동시 fan-out하고, 각 큐가 버퍼 역할을 해 한 서비스가 죽어도 그 큐에 메시지가 쌓였다 복구 후 처리된다(다른 큐는 무관). DLQ로 반복 실패 메시지를 격리한다. SNS 직접 Lambda 호출은 장애 시 버퍼가 없어 누락 위험이 크다. 이 "SNS→다중 SQS fan-out"이 결합도를 끊는 정석 패턴이다.

## 가용성 — 격리 경계의 사다리

가용성 설계의 핵심은 **장애를 격리하는 경계를 어디에 두느냐**다. AWS는 AZ → Region → Account의 사다리를 제공한다. 비용과 복잡도는 위로 갈수록 커지므로, 요구 RTO/RPO에 맞는 최소 경계를 고른다.

| 경계 | 격리 대상 | 대표 패턴 |
|------|----------|----------|
| Multi-AZ | 데이터센터 장애 | RDS Multi-AZ, ASG 다중 AZ |
| Multi-Region | 리전 전체 장애·재해 | Aurora Global, DDB Global Tables, Route 53 Failover |
| Multi-Account | 침해·블래스트 반경 | Organizations, 워크로드 격리 |

> 📚 **사례**: 2021년 12월 **US-EAST-1 대장애**는 단일 리전 의존의 위험을 드러냈다. 내부 네트워크 자동화 버그로 us-east-1의 API가 수 시간 마비됐고, 글로벌 서비스(IAM·일부 콘솔)가 us-east-1에 의존하던 탓에 다른 리전 사용자까지 영향받았다. 교훈은 (1) **단일 리전·단일 AZ 설계는 SLA를 못 채운다**, (2) **us-east-1 의존성을 줄여라**(글로벌 엔드포인트·STS 리전 엔드포인트 사용), (3) **DR 리전은 평소에도 일부 트래픽을 받아 검증된 상태여야 한다**(콜드 스탠바이는 막상 페일오버 시 실패하기 쉽다). 시험에서 "리전 장애 견딤 + RTO 분 단위"는 Active-Active나 Warm Standby가 정답 신호다.

> 🔍 **더 깊이**: 캐싱은 가용성·성능·비용을 동시에 개선하는 지렛대다. **CloudFront**(엣지 CDN)는 정적·동적 콘텐츠를 사용자 근처 엣지에 캐시해 오리진 부하와 지연을 줄이고, **ElastiCache**(Redis/Memcached)는 DB 앞 인메모리 캐시로 읽기를 흡수하며, **DAX**는 DynamoDB 전용 마이크로초 캐시다. 캐싱의 함정은 **캐시 무효화(cache invalidation)** — "컴퓨터 과학의 두 어려운 문제 중 하나"라는 농담처럼, 갱신된 데이터가 캐시에 stale하게 남는 문제다. TTL·write-through·이벤트 기반 무효화로 다룬다. "읽기 폭주 DB 보호 + 마이크로초 지연 + DynamoDB"는 DAX, "범용 DB 읽기 캐시"는 ElastiCache다.

## 시나리오 키워드 → 정답 매핑

| 키워드 | 답 | 한 줄 근거 |
|--------|-----|-----------|
| "운영 부담 최소·이벤트·짧은 작업" | Lambda | 함수 단위, 유휴 비용 0 |
| "서버리스 컨테이너·장시간" | Fargate | 15분 제한 없음 |
| "Lambda 지연 변동 제거" | Provisioned Concurrency | microVM 사전 워밍 |
| "Lambda + RDS 커넥션 폭발" | RDS Proxy | 커넥션 풀링 |
| "장시간·복잡 워크플로·에러 처리" | Step Functions | 상태 머신 |
| "이벤트 다중 소스→다중 대상·필터" | EventBridge | 룰 기반 라우팅 |
| "다중 컨슈머 + 재처리 + 순서" | Kinesis Data Streams | 보존·재생·샤드 순서 |
| "정확히 한 번 + 엄격 순서" | SQS FIFO | dedup·MessageGroupId |
| "한 서비스 장애가 타 서비스 영향 X" | SNS → 다중 SQS fan-out | 큐 버퍼 격리 |
| "글로벌 SQL·RPO<1s" | Aurora Global Database | 스토리지 비동기 복제 |
| "글로벌 양쪽 쓰기 NoSQL" | DynamoDB Global Tables | 멀티 리전 active-active |
| "트래픽 0일 때 비용 0 RDB" | Aurora Serverless v2 | ACU 초당 스케일 |
| "수십만 TPS Key-Value·단자리 ms" | DynamoDB On-Demand | 무제한 수평 확장 |
| "DynamoDB 일부 키만 스로틀" | 파티션 키 재설계·write sharding | 핫 파티션 |
| "실시간 검색·로그 분석" | OpenSearch | 역색인 |
| "불변 감사 가능 원장" | QLDB | 암호화 검증 이력 |
| "DynamoDB 마이크로초 읽기 캐시" | DAX | 전용 인메모리 캐시 |

## 정리하며

도메인 2는 **5축(가용성·성능·보안·비용·운영) 동시 최적화**가 본질이다. 핵심 통찰: (1) 컴퓨트는 추상화 사다리 — 요구를 충족하는 가장 관리형 옵션을 고른다, (2) 데이터는 CAP/PACELC로 일관성 vs 가용성·지연을 읽는다 — 글로벌 + eventual은 DynamoDB, 강일관 + 트랜잭션은 Aurora, (3) 이벤트는 결합도를 끊는 도구 — At-Least-Once 멱등 소비가 기본, 다중 컨슈머·재생은 Kinesis, 격리 fan-out은 SNS→SQS, (4) 가용성은 격리 경계 사다리 — 요구 RTO/RPO에 맞는 최소 경계. 같은 정답처럼 보이면 **더 운영 부담 낮고 요구를 정확히 충족하는 쪽**이다.

내일(Day 78)은 도메인 3 마이그레이션·현대화를 7R 결정 트리와 도구 내부 동작으로 깊이 정리한다.

---

## 📝 연습 문제

**문제 1.** 한 스타트업이 이미지 업로드 시 썸네일을 생성한다. 트래픽은 하루 중 몇 시간만 몰리고 나머지는 거의 0이다. 운영 부담과 유휴 비용을 최소화하려 한다. 가장 적합한 컴퓨트는?

A) EC2 ASG에 처리 데몬 상주

B) S3 이벤트 → Lambda 썸네일 생성

C) Fargate 상시 서비스

D) EC2 Spot 플릿 상주

**정답: B**

해설: "이벤트 트리거 + 짧은 작업(썸네일 생성) + 유휴 시 비용 0 + 운영 부담 최소"는 Lambda의 정의역이다. S3 PutObject 이벤트가 Lambda를 호출하고, 호출이 없으면 과금이 0이다(서버 상주 없음). A·C·D는 모두 트래픽이 없을 때도 인스턴스가 돌아 유휴 비용이 발생하고, OS·스케일링 운영 부담이 있다. C(Fargate)는 서버리스지만 상시 서비스로 띄우면 유휴 과금이 생기며, 이벤트 기반 짧은 작업에는 Lambda가 더 적합하다. 함정: "Fargate도 서버리스"지만 이벤트·단발 작업은 Lambda가 직답.

---

**문제 2.** 글로벌 게임이 전 세계 리전에서 플레이어 프로필을 읽고 쓴다. 각 리전이 로컬 지연(단자리 ms)으로 읽고 쓰되, 다른 리전의 변경도 결국 반영되면 된다(strong consistency 불필요). 가장 적합한 설계는?

A) 단일 리전 Aurora + 글로벌 Read Replica

B) DynamoDB Global Tables

C) Aurora Global Database

D) 리전별 독립 RDS + 야간 배치 동기화

**정답: B**

해설: "전 리전에서 로컬 쓰기(active-active) + 낮은 지연 + eventual consistency 허용"은 DynamoDB Global Tables의 정확한 사용처다. 각 리전이 로컬 복제본에 직접 쓰고, 백그라운드로 모든 리전에 전파된다(last-writer-wins 충돌 해소). PACELC로 보면 PA/EL — 정상 시 지연을 위해 일관성을 완화한다. A·C(Aurora Global)는 **단일 리전에만 쓰기**가 가능하고 다른 리전은 읽기 전용이라 "각 리전 로컬 쓰기" 요구를 못 채운다(쓰기는 항상 primary 리전으로 가야 해 지연 발생). D는 실시간성이 없고 충돌 해소가 수동이다. 함정: "각 리전 로컬 쓰기 + eventual OK"는 Aurora Global이 아니라 DynamoDB Global Tables.

---

**문제 3.** 주문 처리 시스템이 결제·재고·배송·알림 4개 마이크로서비스를 트리거한다. 한 서비스가 일시 장애여도 나머지는 정상 처리되어야 하고, 장애 서비스는 복구 후 누락 없이 밀린 메시지를 처리해야 한다. 가장 적합한 패턴은?

A) 주문 서비스가 4개 서비스를 동기 HTTP 호출

B) SNS 주문 토픽 → 4개 SQS 큐 fan-out, 각 서비스가 자기 큐 소비

C) 단일 SQS 큐를 4개 서비스가 공유 소비

D) EventBridge 룰로 4개 Lambda 직접 호출

**정답: B**

해설: "한 서비스 장애가 타 서비스에 무영향 + 복구 후 누락 없는 처리"는 **SNS fan-out + 서비스별 전용 SQS 큐**의 정석이다. SNS가 4개 큐에 동시 복제하고, 각 큐가 독립 버퍼가 되어 한 서비스가 죽어도 그 큐에만 메시지가 쌓였다 복구 후 소비된다(다른 큐·서비스는 무관). DLQ로 반복 실패를 격리한다. A(동기 호출)는 한 서비스 장애가 전체를 막는 시간 결합이다. C(단일 큐 공유)는 한 메시지를 한 컨슈머만 가져가므로 4개 서비스가 모두 같은 메시지를 받지 못한다(fan-out 불가). D(EventBridge→Lambda 직접)는 큐 버퍼가 없어 다운스트림 장애 시 누락·재시도 한계가 있다. 함정: "fan-out + 서비스별 격리 버퍼"는 SNS→다중 SQS.

---

**문제 4.** IoT 센서 데이터를 여러 분석 팀이 각자 독립적으로 소비하고, 특정 팀은 7일 전 데이터를 재처리(replay)해야 한다. 데이터는 디바이스별 시간 순서를 유지해야 한다. 가장 적합한 서비스는?

A) SQS Standard

B) SNS

C) Kinesis Data Streams

D) EventBridge Bus

**정답: C**

해설: "다중 독립 컨슈머 + 과거 데이터 재처리(replay) + 순서 보장"은 Kinesis Data Streams의 핵심 차별점이다. Kinesis는 데이터를 샤드에 보존(최대 365일)해 여러 컨슈머가 각자의 체크포인트로 같은 스트림을 독립 소비하고, 과거 시점으로 되감아 재처리할 수 있다. 디바이스별 파티션 키로 샤드 내 순서를 보장한다. A(SQS)는 소비 후 삭제라 재처리·다중 독립 소비가 안 된다. B(SNS)는 fan-out은 되지만 메시지를 보존·재생하지 못한다. D(EventBridge)는 라우팅·필터 중심이고 Archive/Replay가 있으나 고처리량 순서 스트리밍·다중 컨슈머 체크포인트 모델은 Kinesis가 적합하다. 함정: "재생 + 다중 컨슈머 + 순서"는 Kinesis.

---

**문제 5.** 한 SaaS 백오피스 RDB가 업무 시간에만 트래픽이 있고 야간·주말엔 거의 0이다. 사용량에 비례한 비용을 원하며, 트래픽 급증 시 자동으로 확장되어야 한다. 가장 적합한 DB는?

A) RDS MySQL Multi-AZ(고정 인스턴스)

B) Aurora Serverless v2

C) DynamoDB On-Demand

D) Redshift

**정답: B**

해설: "업무 시간만 부하 + 사용량 비례 비용 + 자동 확장 + 관계형"은 Aurora Serverless v2의 정확한 사용처다. ACU(Aurora Capacity Unit) 단위로 초 단위 스케일링하며, 부하가 낮으면 ACU를 줄여 비용을 절감하고 급증 시 즉시 확장한다(v2는 v1과 달리 0으로 완전 정지하진 않지만 최소 ACU를 0.5까지 낮춤). A(고정 인스턴스)는 야간·주말에도 풀 비용이 든다. C(DynamoDB)는 NoSQL이라 관계형 워크로드(조인·복잡 쿼리)에 부적합할 수 있다. D(Redshift)는 분석 웨어하우스로 OLTP 백오피스에 부적합하다. 함정: "관계형 + 사용량 비례 + 자동 확장"은 Aurora Serverless v2.

---

**문제 6.** 고동시성 Lambda 함수가 RDS PostgreSQL에 접속하면서 "too many connections" 에러가 발생한다. Lambda 동시 실행 수가 커지면 DB 커넥션이 폭증한다. 최소 변경으로 해결하려면?

A) RDS 인스턴스 크기 상향

B) RDS Proxy 도입

C) Lambda 동시성 무제한 설정

D) Aurora로 마이그레이션

**정답: B**

해설: Lambda는 동시 실행마다 독립 실행 환경에서 DB 커넥션을 열어, 동시성이 커지면 커넥션이 폭증해 RDS의 max_connections를 초과한다. **RDS Proxy**는 Lambda와 DB 사이에서 커넥션 풀을 유지·재사용해 다수의 Lambda 호출이 소수의 DB 커넥션을 공유하게 한다 — 코드 최소 변경으로 커넥션 고갈을 해결한다. A(인스턴스 상향)는 max_connections를 늘리지만 근본 해결이 아니고 비용만 증가한다. C(동시성 무제한)는 문제를 악화시킨다. D(Aurora 전환)는 과한 변경이며 그 자체로 커넥션 풀링을 주지 않는다(Aurora도 RDS Proxy 권장). 함정: "Lambda + DB 커넥션 폭발"은 RDS Proxy.

---

**문제 7.** 글로벌 SQL 데이터베이스가 주 리전 장애 시 다른 리전에서 RPO 1초 미만, RTO 1분 내로 복구되어야 한다. 평소엔 보조 리전이 읽기 부하를 분담한다. 가장 적합한 설계는?

A) RDS Multi-AZ

B) Aurora Global Database

C) DynamoDB Global Tables

D) Cross-Region Read Replica 수동 승격

**정답: B**

해설: "글로벌 SQL + RPO<1s + RTO 분 단위 + 보조 리전 읽기 분담"은 Aurora Global Database의 정확한 사용처다. 스토리지 계층 비동기 복제로 일반적으로 RPO 1초 미만을 달성하고, 보조 리전은 읽기 전용 레플리카로 부하를 분담하다 재해 시 1분 내로 승격(promote)된다. A(Multi-AZ)는 단일 리전 내 AZ 장애만 견디고 리전 장애엔 무력하다. C는 NoSQL이라 "SQL" 요구에 안 맞는다. D(수동 승격 Read Replica)는 복제 지연이 크고 승격이 수동·느려 RTO를 못 맞춘다(Aurora Global은 전용 복제 인프라로 훨씬 빠름). 함정: "글로벌 SQL + RPO 초 단위 + 빠른 승격"은 Aurora Global Database.

---

## 📌 오늘의 요약

1. 컴퓨트는 추상화 사다리(EC2→Fargate→Lambda) — Firecracker·콜드 스타트·하드 리밋 이해
2. 데이터는 CAP/PACELC — 글로벌+eventual은 DynamoDB(AP/EL), 강일관은 Aurora(PC/EC), Aurora는 "로그=DB" 쿼럼 4/6
3. 이벤트는 결합도 분리 — At-Least-Once 멱등 소비 기본, 재생·다중컨슈머는 Kinesis, 격리 fan-out은 SNS→SQS
4. 가용성은 격리 사다리(AZ→Region→Account), us-east-1 의존 주의, 캐시 무효화 함정
