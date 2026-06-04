# Day 39 - AppSync GraphQL과 SQS/SNS/Kinesis 메시징의 본질

마이크로서비스가 일정 규모를 넘어가면 클라이언트-서버 간의 데이터 계약이 큰 운영 비용이 된다. 모바일 앱이 "주문 상세 + 사용자 + 배송지 + 결제 수단"을 한 화면에 보여주려면 REST API 4-5개를 동시에 호출하고 클라이언트에서 합쳐야 한다. 화면이 바뀌면 백엔드 API도 바뀐다. 이 결합을 깨는 답이 **GraphQL**이고, AWS에서는 **AppSync**가 그 매니지드 서비스다.

한편 서비스 간 메시징은 SQS·SNS·Kinesis가 오랫동안 표준이었다. 셋은 비슷해 보이지만 본질이 다르다. SQS는 "1회 소비 큐", SNS는 "fan-out pub/sub", Kinesis는 "재처리 가능한 스트림". 시험에서는 이 셋을 구분하는 시나리오가 도메인을 가리지 않고 자주 출제된다. 오늘은 AppSync의 GraphQL 모델과 세 메시징 서비스의 내부 모델을 함께 본다.

## GraphQL이 REST를 보완한 이유

REST API의 두 가지 만성 문제:
- **Overfetching**: 클라이언트가 필요한 건 사용자 이름인데 응답에 30개 필드가 다 옴
- **Underfetching**: 한 화면에 여러 리소스가 필요해 N+1 API 호출

GraphQL(Facebook, 2015 공개)은 이를 **클라이언트 쿼리 언어**로 해결한다. 클라이언트가 필요한 필드와 그 관계를 선언하면, 서버가 정확히 그만큼만 반환한다.

```graphql
query GetOrderScreen($id: ID!) {
  order(id: $id) {
    id
    items { product { name price } quantity }
    customer { name email }
    shippingAddress { street city }
    payment { method last4 }
  }
}
```

한 번의 쿼리로 5개 리소스가 한 응답에 합쳐진다. 클라이언트가 화면을 바꾸면 쿼리만 바꾸면 되고, 백엔드 API는 그대로다.

> 💡 **관련 이론**: GraphQL은 SDL(Schema Definition Language)로 타입 시스템을 정의하고, 쿼리는 그 타입에 대한 선언적 traversal이다. 본질적으로 **dependency-typed query language**라고 볼 수 있다. 트레이드오프: REST의 단순 HTTP 캐싱(URL 기반)이 안 되고, query complexity 공격(클라이언트가 무거운 쿼리로 백엔드를 마비)을 막기 위한 depth limit / cost analysis가 필요. Apollo 팀의 *Production-Ready GraphQL*(O'Reilly)이 운영 관점에서 가장 좋은 참고서.

## AppSync — AWS의 매니지드 GraphQL

AppSync는 GraphQL 서버를 매니지드로 제공하면서 AWS 데이터 소스(DynamoDB, Lambda, HTTP, RDS Aurora Serverless, OpenSearch, EventBridge)에 직접 resolver를 매핑한다. resolver는 VTL(Velocity Template Language) 또는 JavaScript로 작성.

핵심 기능:
1. **Schema-first**: GraphQL SDL로 타입·쿼리·뮤테이션·구독 정의
2. **Direct data source resolvers**: Lambda 없이 DynamoDB·Aurora 직접 호출 (cold start, 비용 절감)
3. **Real-time Subscriptions**: WebSocket 기반 pub/sub
4. **Authorization 5종**: API Key, IAM, Cognito User Pool, OIDC, Lambda Authorizer
5. **Caching**: per-resolver Redis 호환 캐시
6. **Offline sync**: Amplify DataStore와 통합

### Direct Resolver — Lambda 없이 DynamoDB 직접

전통적 BFF(Backend For Frontend)는 GraphQL 서버 → Lambda → DynamoDB 3-hop이다. AppSync direct resolver는 GraphQL 서버 → DynamoDB 1-hop으로 줄인다. Lambda 비용·콜드 스타트·운영 부담이 사라진다.

```javascript
// JavaScript resolver (2022~)
export function request(ctx) {
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: ctx.args.id })
  };
}
export function response(ctx) {
  return ctx.result;
}
```

이 resolver는 DynamoDB GetItem을 직접 호출. 100ms 이내에 응답.

> 🔍 **더 깊이**: AppSync resolver는 historically VTL(Velocity Template Language)이었다. Apache Velocity 기반의 옛 템플릿 언어로, 디버깅이 까다롭고 진입 장벽이 높았다. 2022년 **APPSYNC_JS** 런타임이 추가되면서 ES6 JavaScript로 작성 가능해졌고, 이제 거의 모든 신규 프로젝트는 JS resolver를 쓴다. VTL은 legacy 호환 목적으로만 유지.

### Real-time Subscription — WebSocket pub/sub

AppSync의 subscription은 GraphQL 표준의 subscription 타입을 WebSocket으로 구현. 클라이언트가 `subscription onOrderUpdated($id: ID!)` 같은 쿼리를 발행하면 WebSocket 연결이 유지되고, 서버 측에서 mutation 발생 시 자동으로 push.

```graphql
subscription OnOrderUpdate($id: ID!) {
  onOrderUpdated(id: $id) {
    id
    status
    updatedAt
  }
}
```

mutation이 발생하면 AppSync가 매칭되는 모든 구독자에게 push. 모바일 채팅, 실시간 알림, 협업 도구(Figma 스타일)의 표준 패턴.

> 📚 **사례**: 2020~2022년 코로나 시기 음식 배달앱 GrubHub은 "주문 상태 실시간 추적"을 AppSync subscription으로 구현했다. 배달원이 위치를 업데이트하면 고객 앱이 WebSocket으로 즉시 받는 구조. 이전에는 long polling + Lambda로 운영했는데, 동시 사용자 100만 명에서 비용이 폭증했다. AppSync는 WebSocket 연결당 비용이 매우 저렴해 80% 절감.

### Authorization 5종 — 시나리오별 선택

| 모드 | 사용처 |
|------|--------|
| **API Key** | 공개 또는 simple 데모, 만료 기간 (최대 1년) |
| **IAM** | 서비스 간 호출, SigV4 서명 |
| **Cognito User Pool** | 사용자 인증 + group 기반 인가 |
| **OIDC** | 외부 IdP(Google, Okta 등) |
| **Lambda Authorizer** | 커스텀 인증(legacy JWT 등) |

한 API에 여러 모드를 동시 활성화 가능. 예: 익명 조회는 API Key, 사용자 데이터 변경은 Cognito.

> ⚠️ **함정**: AppSync API Key는 **인증이 아니라 식별**이다. throttling·analytics에는 유용하지만 보안 경계로 보면 안 된다. 운영 환경에서는 거의 Cognito 또는 IAM이 답.

## SQS — 1회 소비 큐의 표준

SQS는 가장 단순한 메시지 큐다. 발행자가 메시지를 큐에 넣고, 소비자가 polling으로 가져가 처리하고 삭제한다. 한 메시지는 보통 한 소비자만 처리(워커 풀에서 N개 워커가 폴해도 한 메시지는 한 워커만).

### Standard vs FIFO

| 특성 | Standard | FIFO |
|------|---------|------|
| Throughput | 거의 무한 (수만 TPS) | 300 TPS (배치 시 3,000) |
| 순서 보장 | 없음 (best-effort) | MessageGroupId 내 보장 |
| 중복 | 가능 (at-least-once) | 5분간 중복 제거 (exactly-once-ish) |
| 사용처 | 일반 작업 큐 | 결제, 회계, 순서 중요 |
| 이름 규칙 | 임의 | `.fifo` 접미사 필수 |

FIFO의 throughput 한도(기본 300)는 **High Throughput FIFO** 옵션으로 partition 단위 확장이 가능해 수천 TPS까지. SAP 시험에서는 두 가지의 분기와 함께 "정확히 1회" 키워드 매핑.

> 💡 **관련 이론**: 분산 시스템에서 "exactly-once delivery"는 이론적으로 불가능하다. FLP impossibility(1985) + Two Generals 문제 때문. SQS FIFO의 "exactly-once processing"은 정확히는 "5분 deduplication window 안에서 idempotent processing"이다. 소비자가 메시지를 처리하고 ack 보내기 직전에 죽으면 재전송되어 중복 처리될 수 있다. 그래서 application 레벨 idempotency(예: `idempotencyKey`)가 여전히 필요.

### Visibility Timeout — 처리 중 잠금

소비자가 메시지를 받으면 **visibility timeout**(기본 30초) 동안 다른 소비자에게 안 보이게 잠긴다. 그동안 처리 완료 + delete 호출하면 큐에서 사라지고, 실패하면 timeout 후 다시 가시화되어 다른 워커가 가져간다.

설정 기준: **메시지 평균 처리 시간 × 1.5~2배**. 너무 짧으면 처리 중인 메시지가 중복 처리되고, 너무 길면 실패 메시지의 재시도가 늦어진다.

### Long Polling — Empty receive 비용 절감

기본 `ReceiveMessage`는 short polling이고 큐가 비어 있으면 즉시 빈 응답을 반환. 워커가 1초마다 폴하면 일별 86,400 empty 호출. SQS 비용은 API 호출당이라 이것만으로 월 수십 달러.

**Long polling**(`WaitTimeSeconds=20`)을 설정하면 최대 20초 동안 메시지를 기다린다. Empty 호출이 1/20로 줄고, 메시지 도착 latency도 거의 0(즉시 푸시). 운영 환경 표준.

### DLQ — 영구 실패 메시지 격리

`maxReceiveCount` 초과한 메시지를 DLQ(Dead Letter Queue)로 이전. 보통 5~10회로 설정. DLQ는 별도 SQS 큐이고, 운영자가 분석·재처리·삭제.

DLQ로 가는 메시지의 원인 분석은:
- 메시지 페이로드의 malformed JSON
- 다운스트림 서비스의 영구 장애
- 코드 버그로 무한 throw

> 📚 **사례**: 2018년 한 음악 스트리밍 회사가 "결제 처리 SQS 큐의 DLQ에 메시지 5,000건 쌓임" 알림을 받았다. 원인 분석 결과 며칠 전 결제 게이트웨이 SDK 업데이트가 특정 카드 번호 형식을 reject하는 버그를 도입했다. fix 배포 후 DLQ 메시지를 main 큐로 redrive해 5,000건 모두 정상 처리. DLQ가 없었다면 메시지가 영원히 손실됐을 것. SAP 시험 단골 패턴: "처리 실패 메시지 격리 + maxReceiveCount" → DLQ.

## SNS — Pub/Sub Fan-out의 표준

SNS는 **Topic**에 publish하면 모든 **Subscriber**에게 push. 한 메시지를 N명에게 동시 전달.

### Subscriber 종류

- **Lambda** (가장 흔함)
- **SQS** (SQS Fan-out 패턴)
- **HTTPS/HTTP** (webhook)
- **Email / SMS** (직접 알림)
- **Mobile Push** (APNS/FCM/ADM)
- **Firehose** (S3·Redshift 저장)

### Message Filtering — Subscriber별 패턴 매칭

Topic에 publish된 메시지를 각 subscriber가 모두 받지 않고, 필터 정책으로 일부만 받게 함.

```json
// SQS subscription의 FilterPolicy
{ "type": ["high_value"], "region": ["us-east-1"] }
```

이 subscription은 `type=high_value AND region=us-east-1`인 메시지만 받는다. 같은 Topic에 다양한 subscriber가 각자 다른 필터로 붙어 fan-out + selective routing 둘 다 제공.

### FIFO Topic — 순서 fan-out

2020년 추가. SQS FIFO만 subscriber로 둘 수 있고, MessageGroupId 단위로 순서 + 중복 제거를 보장하면서 fan-out.

```
[Publisher FIFO] → [SNS FIFO Topic] ─┬─► SQS FIFO A (분석)
                                     ├─► SQS FIFO B (회계)
                                     └─► SQS FIFO C (audit)
```

순서가 중요한 결제·회계 도메인에서 fan-out도 필요한 시나리오.

### Cross-account / Cross-region

SNS Topic 정책에 다른 계정 ARN을 허용하면 cross-account subscription. EventBridge처럼 멀티 계정 fan-out에 쓰인다. Cross-region delivery는 subscriber endpoint가 다른 region이면 자동.

> ⚠️ **함정**: "SNS는 메시지 보존을 안 한다"는 사실이 시험에 자주 출제. SNS는 publish 즉시 fan-out하고 저장하지 않는다. Subscriber가 일시적으로 다운돼도 SNS가 retry는 하지만, retry 한도 초과하면 메시지 손실. 보존이 필요하면 SNS → SQS subscription으로 SQS에 버퍼링하거나 EventBridge Archive로 보존.

## SNS Fan-out + SQS — 가장 흔한 패턴

```
[Publisher]
   │ Publish
   ▼
[SNS Topic: order-events]
   │
   ├──Filter:type=high──► [SQS high-value-queue] → Worker (재시도 5회) → DLQ
   ├──Filter:type=low──── [SQS low-value-queue] → Worker
   └──Lambda(분석) 직접 구독
```

SQS subscription으로 fan-out하는 이유:
- 각 다운스트림이 **자체 폴 속도**로 처리 (slow consumer가 fast publisher를 막지 않음)
- DLQ로 실패 격리
- Visibility timeout으로 처리 중복 방지

> 🎯 **시나리오**: "한 OTT 서비스가 비디오 업로드 완료 이벤트를 발생시키면 (1) 트랜스코딩 (2) 썸네일 생성 (3) 검색 인덱싱 (4) audit log 4개 다운스트림이 각자 처리한다. 가장 적합한 구성은?" — 답은 **SNS Topic + 4개 SQS subscription**. 각 다운스트림이 자체 속도로 폴 + 실패 시 DLQ로 격리. EventBridge도 가능하지만 단순 fan-out 4개면 SNS가 가장 저렴.

## Kinesis Data Streams — 재처리 가능한 스트림

Kinesis는 SQS와 본질이 다르다. SQS가 "메시지 1회 소비 후 삭제"라면, Kinesis는 "스트림을 시간 순서대로 흐르게 유지하고, 여러 소비자가 각자 offset으로 읽음".

### Shard 모델

스트림은 **Shard**라는 partition으로 나뉜다. 각 shard:
- Write: 1MB/s 또는 1,000 records/s
- Read: 2MB/s
- 보존: 24시간(기본)~365일(설정 가능)

처리량이 부족하면 shard를 split, 남으면 merge. 또는 **On-Demand 모드**(2021)로 자동 스케일링.

### Partition Key — 순서 보장의 단위

Producer가 record를 보낼 때 partition key를 지정. 같은 key는 같은 shard로 가서 **shard 내 순서 보장**. 예를 들어 user_id를 partition key로 쓰면 한 사용자의 이벤트는 순서대로.

> 🔍 **더 깊이**: Partition key 선택이 핵심이다. 잘못 고르면 **hot shard**가 생긴다. 예: `region`을 key로 쓰면 us-east-1 region 트래픽이 한 shard에 몰림. 일반적으로 user_id, session_id 같이 cardinality가 충분히 높은 키를 선택. AWS는 partition key를 MD5로 해싱해 shard에 매핑하므로 키 분포가 균일하면 자동으로 균등 분산.

### Consumer 모델 — Standard vs Enhanced Fan-out

- **Standard (shared)**: 모든 consumer가 shard당 2MB/s를 공유. 5개 consumer면 각자 약 400KB/s.
- **Enhanced Fan-out (EFO)**: consumer마다 2MB/s 전용. 최대 20 consumer/shard. push 모델(HTTP/2 long polling)로 latency 70% 감소.

다중 소비자가 같은 스트림을 동시에 읽어야 하면 EFO. SQS와 가장 큰 차이.

### Kinesis vs SQS — 진짜 차이

| 차원 | SQS | Kinesis |
|------|-----|---------|
| 모델 | 큐 (1회 소비) | 스트림 (재처리 가능) |
| 보존 | 14일 (default 4일) | 24h~365d |
| 순서 | FIFO만 보장 | Shard 내 보장 |
| 다중 소비자 | X (한 메시지 한 워커) | O (각자 offset) |
| 재처리 | X (delete 후 사라짐) | O (재읽기 가능) |
| 사용처 | 작업 큐, 백그라운드 처리 | 실시간 분석, 시계열, 다중 소비 |
| 가격 | 요청당 | Shard-hour + PUT payload unit |

> 🎯 **시나리오**: "한 광고 플랫폼이 사용자 클릭 이벤트를 실시간 분석(시간당 집계)과 동시에 ML 학습용 raw 데이터로 7일간 보존해 재처리한다. 가장 적합한 구성은?" — 답은 **Kinesis Data Streams (7일 보존) + Lambda(실시간 집계 consumer) + Firehose(S3 보존 consumer, EFO)**. SQS는 다중 소비자와 재처리 불가. EFO로 두 consumer가 서로 영향 없이 동시 처리.

## Kinesis Firehose — Delivery Stream

Firehose는 Kinesis Data Streams과 이름은 비슷하지만 본질이 다르다. **목적지에 자동 배달**하는 서비스.

- **목적지**: S3, Redshift, OpenSearch, Splunk, Datadog, MongoDB Atlas, 3rd party HTTP endpoint
- **버퍼링**: 시간(60~900초) 또는 크기(1~128MB) 기준으로 배치
- **변환**: Lambda 호출로 ETL, Parquet/ORC 자동 변환
- **압축**: GZIP, Snappy

Firehose는 shard 관리·partition key·offset 같은 개념이 없다. 그냥 데이터를 받아 buffer + transform + deliver. ELT 파이프라인의 표준 입구.

## MSK (Managed Kafka)

Apache Kafka의 매니지드 버전. Kafka 표준 클라이언트 그대로 사용 가능. Kinesis와의 분기:
- **이식성 필요** (멀티 클라우드, Kafka 표준 도구 활용) → MSK
- **AWS 위주 + 운영 부담 최소** → Kinesis
- **Schema Registry, Connect, KSQL 같은 Kafka 생태계 도구 필요** → MSK

MSK Serverless(2022)는 cluster 관리도 매니지드. 처리량 기반 과금.

## Lambda Event Source Mapping (ESM) — 메시징 → Lambda

SQS·Kinesis·DDB Streams·MQ·MSK를 Lambda의 source로 연결. Lambda가 자체 poll + invoke를 처리.

핵심 파라미터:
- **BatchSize**: 한 호출에 처리할 records (SQS 10/Kinesis 100/MSK 1만)
- **MaximumBatchingWindow**: 배치 모으는 최대 시간
- **ParallelizationFactor**(Kinesis/DDB): shard당 동시 처리 워커 (1~10)
- **ReportBatchItemFailures**: 배치 내 일부 실패를 정확히 보고 (전체 재시도 방지)

> ⚠️ **함정**: ESM의 **ReportBatchItemFailures** 패턴은 시험에 자주 출제. 기본 동작은 "배치 중 한 개라도 실패하면 전체 배치 재시도"인데, 이는 idempotent하지 않으면 중복 처리 문제. ReportBatchItemFailures를 활성화하고 함수가 실패한 message ID 리스트를 반환하면, Lambda가 그것만 재시도하고 나머지는 ack한다.

## AppSync + Pipes + EventBridge — 통합 패턴

현대 EDA는 한 가지 도구로 끝나지 않는다. 흔한 조합:

```
[모바일 앱] ─GraphQL─► [AppSync]
                        │ Mutation
                        ▼
                [DynamoDB] ─Streams─► [EventBridge Pipes]
                                       │ Filter
                                       ▼
                                 [EventBridge Bus]
                                       │ Rule
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
            [Step Functions]    [SNS Topic]          [Kinesis Firehose]
              (워크플로우)       (Fan-out)           (S3 보존·ML)
                                    │
                            ┌───────┴───────┐
                            ▼               ▼
                       [SQS 분석]      [SQS 알림] → Worker
```

AppSync가 client interface, DDB Streams가 source-of-truth 변경 이벤트, EventBridge가 분배, Step Functions/SNS/Kinesis가 각자 역할.

> 📚 **사례**: 2023년 Goldman Sachs의 내부 트레이딩 플랫폼은 AppSync로 클라이언트 GraphQL을 받고, mutation이 발생하면 DDB Streams → EventBridge로 이벤트 흘러나가 risk engine, audit, downstream alert에 fan-out하는 구조를 발표. 이전 모놀리식 REST + 직접 호출 체인에서 마이크로서비스 EDA로 전환하면서 새 기능 개발 속도가 2배 빨라졌다고 보고.

## 정리하며

GraphQL·SQS·SNS·Kinesis·MSK·Firehose는 모두 "데이터를 어떻게 옮기느냐"의 도구지만 본질이 다르다:

- **AppSync**: 클라이언트와 서버 간의 데이터 계약 (GraphQL + Subscription)
- **SQS**: 1회 소비 큐 (Standard 무한 / FIFO 순서)
- **SNS**: Pub/Sub fan-out (Topic + Subscription, FIFO 가능)
- **Kinesis**: 재처리 가능한 스트림 (Shard, Partition Key, EFO)
- **Firehose**: Delivery stream (S3/Redshift/OpenSearch 자동 배달)
- **MSK**: Kafka 표준 (이식성)

시험 키워드 매핑:
- "GraphQL + 실시간 + 모바일" → **AppSync**
- "1회 처리 + 순서" → **SQS FIFO**
- "fan-out + 매우 높은 처리량" → **SNS**
- "재처리 + 다중 소비자" → **Kinesis Data Streams + EFO**
- "S3에 자동 저장" → **Firehose**
- "Kafka 표준 + 이식성" → **MSK**

다음 day(week 마무리)는 종합 시나리오 10문항으로 week 8 전체를 정리한다.

---

## 📝 연습 문제

**문제 1.** 모바일 앱이 "사용자 + 주문 + 배송지 + 결제" 4개 리소스를 한 화면에 보여준다. 클라이언트가 필요한 필드만 받고, 실시간 주문 상태 push도 받아야 한다. Cognito 인증 필수. 가장 적합한 백엔드는?

A) REST API Gateway + Lambda + WebSocket API
B) AppSync GraphQL + Subscription + Cognito User Pool
C) ALB + ECS Service
D) GraphQL on Lambda + DynamoDB

**정답: B**
해설: GraphQL은 클라이언트가 필요 필드만 선언적으로 요청 → overfetch/underfetch 해소. AppSync는 매니지드 GraphQL + WebSocket subscription + Cognito 통합을 한 서비스로 제공. A는 GraphQL이 아니고 클라이언트가 4개 호출을 직접 합쳐야 함. C는 어떤 API 스타일도 결정 안 됨. D는 GraphQL 서버를 직접 운영해야 하고 subscription 구현 부담. 함정: "GraphQL + 실시간 + 모바일 + Cognito" 키워드 조합은 거의 AppSync. 추가: AppSync direct resolver로 DynamoDB 직접 호출하면 Lambda 콜드 스타트 제거.

---

**문제 2.** 결제 처리 큐 — 순서 보장 + 중복 제거(같은 결제 두 번 처리 방지) + 최대 1,000 TPS. 가장 적합한 구성은?

A) SQS Standard + idempotency in code
B) SQS FIFO with content-based deduplication (High Throughput 모드)
C) Kinesis Data Streams (단일 shard)
D) SNS Topic + Lambda

**정답: B**
해설: SQS FIFO는 MessageGroupId 단위 순서 보장 + 5분 중복 제거. 기본 300 TPS이지만 High Throughput 모드로 partition 확장해 3,000+ TPS 가능. Content-based deduplication은 메시지 body 해시로 자동 중복 제거. A는 순서 보장 없음(Standard는 best-effort). C(Kinesis 단일 shard)는 1MB/s = 1,000 records/s 한도이지만 ack·visibility 모델이 결제 워크플로우에 어색하고, 재처리 필요 없는 결제에 과한 도구. D(SNS)는 큐가 아니라 fan-out이라 부적합. 함정: "exactly-once" 표현은 SQS FIFO도 strict하게는 보장 안 됨(5분 dedup window). application 레벨 idempotency 권장.

---

**문제 3.** 한 이벤트를 5개 다운스트림(분석·CRM·배송·알림·audit)에 각자 처리 속도로 fan-out. 각 다운스트림은 실패 시 재시도 + 격리가 필요. 가장 적합한 구성은?

A) SNS Topic + 5개 SQS subscription + 각 SQS의 DLQ
B) Kinesis Data Streams + 5개 Consumer
C) EventBridge Rule 5개
D) Lambda chain

**정답: A**
해설: SNS는 매우 높은 throughput의 fan-out에 최적, SQS subscription으로 각 다운스트림이 자체 폴 속도로 처리 + visibility timeout으로 처리 중복 방지 + DLQ로 영구 실패 격리. B(Kinesis)는 재처리·시계열 분석용이고 fan-out 5개는 SNS가 더 적합·저렴. C(EventBridge)도 가능하지만 단순 fan-out + 높은 처리량에는 SNS가 단가가 낮음. D는 결합도 높음. 함정: "다양한 필터 + 외부 SaaS target"이면 EventBridge, "단순 fan-out + 매우 높은 처리량"이면 SNS. 추가: SNS subscription에 FilterPolicy 적용으로 다운스트림별 필터링 가능.

---

**문제 4.** 처리 실패 메시지를 5회 시도 후 영구 격리해 운영자가 분석한다. 어떤 구성?

A) Visibility Timeout 길게
B) SQS DLQ + RedrivePolicy maxReceiveCount=5
C) Long Polling
D) Delay Queue 사용

**정답: B**
해설: DLQ + maxReceiveCount=5는 5회 receive 시도 후 메시지를 DLQ로 자동 이전. DLQ는 별도 SQS이고 운영자가 분석·재처리·삭제. A는 처리 시간 잠금일 뿐 영구 격리 아님. C는 polling 효율화이지 실패 처리 아님. D(Delay Queue)는 새 메시지 지연(0~15분). 함정: maxReceiveCount는 receive 횟수이지 처리 실패 횟수가 아님. 메시지가 폴되었다가 visibility timeout 초과 시 count +1. 추가: DLQ 분석 후 fix 배포되면 redrive로 main 큐에 다시 흘려보냄(2021 콘솔 기능).

---

**문제 5.** 한 광고 플랫폼이 클릭 스트림을 실시간 집계와 동시에 7일치 raw 데이터를 ML 학습용으로 보존, 재처리 가능. 두 consumer가 서로 latency 영향 없이 동시 처리.

A) SQS
B) Kinesis Data Streams + Enhanced Fan-Out (EFO)
C) SNS Topic
D) EventBridge Pipes

**정답: B**
해설: Kinesis는 재처리 + 다중 소비자 + 7일 보존 모두 지원. EFO는 consumer마다 shard당 2MB/s 전용 + push 모델로 latency 70% 감소. 두 consumer(실시간 집계 Lambda, S3 보존 Firehose)가 서로 throughput 영향 없이 동시. A(SQS)는 1회 소비 + 다중 consumer 불가. C(SNS)는 보존·재처리 없음. D는 단일 source→target 파이프. 함정: "다중 소비자 + 재처리"는 거의 Kinesis. EFO와 standard consumer의 차이는 시험에 자주 출제. 추가: shard 보존 기간은 24h(default)~365d로 설정.

---

**문제 6.** SNS Topic 한 개에 모든 메시지가 publish되고, subscriber마다 특정 속성(type=high)만 받게 한다. 코드 작성 없이.

A) SNS Message Filtering (FilterPolicy)
B) SQS Visibility Timeout
C) EventBridge Archive
D) Kinesis Sharding

**정답: A**
해설: SNS Message Filtering은 subscription에 FilterPolicy를 지정해 매칭되는 메시지만 받게 함. exact/prefix/anything-but/numeric/IP 등 패턴 지원. 코드 작성 없이 매니지드. B는 처리 잠금이지 필터링 아님. C는 EventBridge 기능이고 SNS와 무관. D는 Kinesis 영역. 함정: SNS의 filtering은 message attribute 기반(혹은 message body 기반, 2020~)이고 EventBridge의 풍부한 JSON 필드 매칭과는 차이. 단순 필터는 SNS, 복잡 매칭은 EventBridge가 답.

---

**문제 7.** Lambda Event Source Mapping(SQS source)에서 배치 size=10. 한 메시지가 실패하면 기본 동작은 배치 전체 재시도이지만, 실패한 메시지만 재시도하려면?

A) Visibility Timeout 짧게
B) ReportBatchItemFailures 활성화 + 함수가 실패 message ID 반환
C) DLQ에 즉시 보내기
D) BatchSize=1로 설정

**정답: B**
해설: ReportBatchItemFailures는 Lambda ESM의 partial batch response 기능. 함수가 `batchItemFailures: [{itemIdentifier: "msg-id-1"}, ...]` 형태로 응답하면, Lambda는 실패한 메시지만 재시도하고 나머지는 ack(큐에서 삭제). 기본 동작(전체 배치 재시도)은 idempotent 안 되면 중복 처리 문제. A는 무관. C는 DLQ는 maxReceiveCount 초과 후. D(BatchSize=1)는 효율 매우 낮음. 함정: "배치 처리 + 부분 실패"는 ReportBatchItemFailures가 답. 추가: Kinesis/DDB Streams ESM도 동일 기능 지원.

---

## 📌 오늘의 요약

1. **AppSync GraphQL**: schema-first + direct resolver(Lambda 없이 DDB) + Subscription(WebSocket) + 5 인증 모드
2. **SQS Standard**(무한 TPS, 순서 X) vs **FIFO**(300 TPS, 순서 + dedup 5분) + High Throughput FIFO
3. **Visibility Timeout** = 처리 평균 × 1.5~2, **Long Polling** = empty 호출 절감
4. **DLQ + maxReceiveCount** = 영구 실패 격리, redrive로 복구
5. **SNS Topic + SQS subscription** = fan-out 표준, **Message Filtering** + **FIFO Topic**(2020)
6. **Kinesis Data Streams** = 재처리 + 다중 소비자, **Shard + Partition Key**, **EFO** 2MB/s 전용
7. **Firehose** = S3/Redshift/OpenSearch 자동 배달(60~900초 buffer + 변환)
8. **MSK** = Kafka 표준 이식성, **MSK Serverless**(2022)
9. **Lambda ESM**: BatchSize, MaximumBatchingWindow, ParallelizationFactor, **ReportBatchItemFailures**
