# Day 3 - EventBridge: Event Bus, Pipes, Scheduler의 통합 모델

마이크로서비스가 다섯 개를 넘어가는 순간, 시스템의 가장 큰 비용은 코드가 아니라 **결합(coupling)**이 된다. A 서비스가 B를 직접 호출하고 B는 C를 호출하는 식의 체인은 처음엔 단순해 보이지만, B의 장애가 A에게 전파되고 D 같은 새 서비스를 끼워 넣을 때마다 양쪽 코드를 모두 수정해야 한다. 이 문제를 푸는 패턴이 **Event-Driven Architecture(EDA)**다. 서비스는 이벤트를 발행하고, 다른 서비스가 그 이벤트를 구독한다. 발행자는 누가 듣는지 모르고, 구독자는 누가 보냈는지 모른다.

AWS의 EDA 도구는 SNS·SQS·Kinesis·EventBridge 등 여러 개가 있지만, 최근 5년간 가장 큰 변화는 **EventBridge가 사실상의 표준 라우터**가 됐다는 점이다. 2019년 CloudWatch Events의 후속으로 출시된 이후, Pipes(2022)와 Scheduler(2022)가 추가되면서 "이벤트의 모든 것"을 다루는 플랫폼으로 진화했다. SAP 시험에서 EventBridge는 도메인 1·2·3에 흩어져 출제되고, 특히 "SNS vs EventBridge" / "Pipes vs Step Functions" 같은 선택 시나리오가 단골이다.

## EDA가 왜 필요한가 — 분산 시스템의 결합 문제

Conway의 법칙은 "시스템 구조는 그 시스템을 만든 조직의 커뮤니케이션 구조를 닮는다"고 했다. 거꾸로 말하면, 시스템의 결합 구조가 조직의 결합 구조를 결정한다. 마이크로서비스를 100개 팀이 운영한다면, 동기 직접 호출 체인은 100개 팀이 서로의 배포 일정을 맞춰야 한다는 뜻이다.

EDA의 핵심 아이디어:
- **시간 디커플링(Temporal Decoupling)**: 발행자가 발행할 때 구독자가 살아있을 필요 없음
- **공간 디커플링(Spatial Decoupling)**: 발행자가 구독자의 위치(IP, 엔드포인트)를 모름
- **동기화 디커플링(Synchronization Decoupling)**: 발행자가 블로킹되지 않음

이 셋을 모두 제공하는 도구가 메시지 브로커(Message Broker)다. EventBridge는 그중 "이벤트 라우팅"에 특화된 변형이다.

> 💡 **관련 이론**: EDA의 고전적 모델은 1980년대 Linda Tuple Space와 1990년대 Publish/Subscribe(Eugster, "The many faces of publish/subscribe", ACM Computing Surveys 2003)에서 발전했다. 핵심 분류는 **Topic-based**(주제 기반, SNS·Kafka), **Content-based**(내용 기반 필터링, EventBridge), **Type-based**(타입 기반)다. EventBridge는 content-based 필터링을 매니지드로 제공하면서 200+ AWS 서비스를 target으로 묶었다는 점에서 독특한 위치다.

> 🔍 **더 깊이**: EventBridge 내부는 분산 라우팅 시스템으로 구성되어 있다. 이벤트가 도착하면 (1) Schema validation (옵션) (2) Rule pattern matching (3) Target dispatch가 순차로 일어난다. Pattern matching은 효율을 위해 **trie 자료구조**로 인덱싱되어 있어 수천 개 룰에서도 일정한 latency. SNS와 달리 EventBridge는 JSON 깊은 필드 기반 매칭(`detail.amount.value > 1000` 같은)을 지원하는 게 가장 큰 차이.

## Event Bus 3종 — 누가 발행하는가의 분류

EventBridge는 이벤트를 **Bus** 위에 라우팅한다. Bus는 종류가 셋이다.

| 종류 | 발행자 | 사용 시점 |
|------|--------|----------|
| **Default Bus** | AWS 서비스 (자동) | EC2 상태 변경, S3 객체 생성, ECS Task 종료 등 AWS 이벤트 |
| **Custom Bus** | 사용자 애플리케이션 (PutEvents API) | 도메인 이벤트 (OrderPlaced, UserRegistered 등) |
| **Partner Bus** | SaaS 파트너 (Shopify, Datadog, Auth0 등) | 외부 SaaS의 이벤트를 직접 수신 |

각 계정에는 Default Bus가 자동으로 하나 있고, Custom Bus는 도메인별로 여러 개 만들 수 있다. 일반적 패턴은 도메인 경계에 따라 Bus를 분리하는 것:
- `order-domain-bus` — 주문 이벤트
- `payment-domain-bus` — 결제 이벤트
- `inventory-domain-bus` — 재고 이벤트

각 Bus는 **Cross-account 정책**으로 다른 계정의 발행/구독을 허용할 수 있어, 멀티 계정 환경에서 자연스러운 이벤트 메시 구성이 가능하다.

> 📚 **사례**: Liberty Mutual은 사보험 청구 처리 시스템을 100+ 마이크로서비스로 운영하면서 도메인별 Custom Bus 12개를 사용한다. 각 Bus는 그 도메인의 소유 팀이 관리하고, 다른 도메인은 cross-account subscription으로 필요한 이벤트만 구독한다. 이 모델 덕분에 새 팀이 합류해도 기존 Bus에 영향 없이 자체 Bus를 만들고 발행/구독 정책으로 통신할 수 있다. AWS re:Invent 2022 발표.

## Rule = Pattern + Targets

Bus 위의 이벤트는 **Rule**이 매칭해서 **Target**으로 보낸다. 한 Rule은 최대 **5개 Target**까지 가능.

```json
{
  "source": ["myapp.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "amount": [{ "numeric": [">", 1000] }],
    "region": ["us-east-1", "eu-west-1"]
  }
}
```

이 룰은 source가 `myapp.orders`, detail-type이 `OrderPlaced`, amount > 1000, region이 두 곳 중 하나인 이벤트만 매칭. EventBridge의 패턴 언어는 다음 연산자를 지원:

- **Exact match**: 배열 안 값과 정확히 일치
- **Prefix match**: `{"prefix": "Order"}`
- **Suffix match**(2023): `{"suffix": ".jpg"}`
- **Numeric**: `{"numeric": [">", 100, "<=", 1000]}`
- **Exists**: `{"exists": true}`
- **Anything-but**: `{"anything-but": "test"}`
- **IP address**: CIDR 매칭
- **Equals-ignore-case**(2023): 대소문자 무시

Target은 200+ AWS 서비스 + API Destination(외부 HTTPS) + 다른 Bus + Pipes 등이 가능. Target별로 IAM Role을 지정해 최소 권한.

> ⚠️ **함정**: "한 룰은 최대 5개 Target"이 시험에 가끔 나온다. 더 많은 target이 필요하면 Step Functions를 target으로 두고 그 안에서 fan-out하거나, 동일 패턴의 룰을 여러 개 만든다. SNS와 다른 점: SNS는 한 Topic에 무제한 구독이 가능하지만 그것은 fan-out 패턴이지 EventBridge의 "rule-based routing"과는 다른 추상화.

> 🔍 **더 깊이**: API Destination(2021)은 매우 강력한 기능이다. 외부 SaaS의 HTTPS 엔드포인트를 target으로 등록하면, EventBridge가 자동으로 인증(API Key, OAuth, Basic), throttle, retry, DLQ를 처리한다. Slack 메시지 전송, Salesforce 업데이트, 자체 SaaS의 webhook receiver로 보내기 등에 쓴다. Lambda를 거치지 않아 운영 부담과 비용이 줄고, 표준 HTTP 헤더 + body 변환을 InputTransformer로 처리.

## EventBridge Pipes — 1:1 통합의 새 표준

Pipes(2022)는 EDA의 가장 흔한 패턴인 **"queue/stream → filter → enrich → target"**을 코드 없이 구성하는 도구다. 그 전에는 이걸 Lambda로 직접 짜야 했다.

```
[Source: SQS / Kinesis / DDB Stream / MQ / MSK]
    │
    ▼
[Filter: 이벤트 패턴 매칭]
    │
    ▼
[Enrich: Lambda / Step Functions / API Destination / API GW]
    │
    ▼
[Target: 20+ AWS 서비스]
```

각 단계가 옵션이라 가장 단순한 형태는 "Source → Target" 직결도 가능.

**Source 종류** (Lambda Event Source Mapping과 유사):
- SQS (Standard/FIFO)
- Kinesis Data Streams
- DynamoDB Streams
- Amazon MQ (RabbitMQ/ActiveMQ)
- MSK (Managed Kafka)
- Self-managed Kafka

**Target 종류**: SQS, SNS, EventBridge Bus, Step Functions, Lambda, ECS, Firehose, API Destination, API GW, Kinesis, CloudWatch Logs, Redshift Data, SageMaker Pipeline 등 20+.

> 🎯 **시나리오**: "DynamoDB Streams의 변경 이벤트를 필터링해 특정 패턴만 Step Functions로 보내고 싶다. Lambda 코드 작성 없이." — 답은 **EventBridge Pipes (Source=DDB Stream, Filter=패턴, Target=Step Functions)**. 이전에는 DDB Streams → Lambda(filter 로직) → Step Functions 패턴이 표준이었고, Lambda 운영(코드 배포, 에러 처리, 로깅)이 추가됐다. Pipes는 이를 매니지드로 대체하면서 비용도 Lambda보다 저렴.

### Pipes vs Step Functions — 헷갈리는 분기

| 도구 | 사용 시점 |
|------|----------|
| **Pipes** | 단일 source→target, 1:1 라우팅, 필터 + 단순 변환 |
| **Step Functions** | 복잡 분기, 병렬, 보상 트랜잭션, 외부 콜백, 다단계 워크플로우 |

흔한 패턴: **Pipes의 Target이 Step Functions**. SQS → Pipes(필터) → Step Functions(워크플로우)로 입구는 가볍게, 흐름은 풍부하게.

> 📚 **사례**: 2023년 Doordash는 주문 처리 파이프라인의 입구를 SQS + Lambda(필터 로직) → Step Functions에서 SQS + Pipes(필터) → Step Functions로 전환해 Lambda 운영 부담 제거와 함께 약 30% 비용 절감을 발표. 같은 처리량에 Pipes가 Lambda보다 단가가 낮고, 코드가 사라져서 장애 표면적도 줄었다.

## EventBridge Scheduler — 100만 cron의 시대

CloudWatch Events Rule의 cron 기능은 한 계정에 룰 수백 개가 한도였다. 사용자별 알림 시간 같은 케이스에 부적합. Scheduler(2022)는 이 한도를 깨고 **계정당 100만+ 스케줄**을 지원한다.

특징:
- **One-time** 또는 **Recurring (cron/rate)** 스케줄
- **Time zone** 지정 (IANA tz 데이터베이스)
- **Flexible time window**: 정확한 시각 대신 ±15분 등 윈도우로 분산
- **200+ AWS API 직접 호출** (Lambda 거치지 않고 SNS Publish, ECS RunTask 등)
- **Universal target**(2023): 모든 AWS SDK API를 호출 가능

Scheduler가 EventBridge Rule의 cron을 대체한 이유는 **scale + per-schedule customization**이다. 100만 사용자의 알림을 각자 다른 시간에 보내려면 Rule로는 불가능하지만 Scheduler로는 가능.

> 🎯 **시나리오**: "한 SaaS가 100만 사용자에게 각자 선호 시간에 일일 요약 이메일을 보낸다. 각 사용자의 시간대와 시간이 다르다." — 답은 **EventBridge Scheduler**. 사용자별로 cron 표현식을 가진 스케줄을 100만 개 생성하고, target으로 SNS Topic 또는 Lambda를 지정. Flexible time window를 15분으로 두면 같은 시각에 몰리는 부하도 분산.

> ⚠️ **함정**: "EventBridge Rule로 cron을 100만 개 만든다"는 보기는 함정이다. Rule은 한도(계정당 수천)에 막힌다. Scheduler가 정답.

## Schema Registry — 이벤트 진화 관리

이벤트 기반 아키텍처의 핵심 어려움 중 하나는 **schema evolution**이다. 발행자가 새 필드를 추가하거나 기존 필드를 바꾸면 모든 구독자가 깨질 수 있다. EventBridge Schema Registry는 이를 다음으로 해결:

- **Auto-discovery**: Bus를 통과하는 이벤트의 스키마를 자동 추출해 등록
- **Versioning**: 스키마 변경마다 새 버전 저장 (semver)
- **Code Binding**: Java/Python/TypeScript SDK 코드를 자동 생성해 strongly-typed로 이벤트 처리
- **OpenAPI 3 표준 export**

> 🔍 **더 깊이**: Schema Registry는 Kafka 생태계의 Confluent Schema Registry와 유사한 발상이다. 차이는 EventBridge가 **structural typing**(필드 형태 기반)이고 Kafka Schema Registry는 **nominal typing**(스키마 ID 기반)이라는 점. EventBridge는 backward/forward compatibility 검증을 직접 강제하지 않으므로 발행자가 규약을 깨뜨릴 수 있고, 구독자가 idempotent + tolerant readers 패턴(Postel's Law)을 따라야 안전하다.

## Archive와 Replay — 시간 여행으로 디버깅

EventBridge Archive는 Bus를 통과한 이벤트를 보존(최대 무기한)한다. Replay는 보존된 이벤트를 특정 시간 범위로 다시 흘려보낸다.

사용 사례:
- **Bug fix 후 누락 이벤트 재처리**: 어제 버그로 처리 안 된 이벤트만 archive에서 replay
- **새 구독자 도입 시 과거 이벤트로 초기 상태 빌드**: Event Sourcing 패턴의 onboarding
- **Disaster Recovery**: Region 장애 후 다른 Region에서 이벤트 재생

```bash
aws events start-replay \
  --replay-name fix-2024-03 \
  --event-source-arn arn:aws:events:...:archive/orders \
  --event-start-time 2024-03-01T00:00:00Z \
  --event-end-time 2024-03-02T00:00:00Z \
  --destination Arn=arn:aws:events:...:event-bus/order-domain,FilterArns=[...]
```

> 📚 **사례**: 2022년 Coinbase가 결제 처리 이벤트를 EventBridge Archive로 1년치 보존하다가, 한 partner 통합 버그로 며칠치 이벤트가 누락된 사고를 Replay로 복구했다. 이전이라면 발행자에게 재발행을 요청해야 했지만, Archive가 있어 수신자만의 책임으로 복구 완료. SAP 시험에서 "이벤트 재처리"가 키워드면 Archive + Replay.

## SNS vs EventBridge — 가장 헷갈리는 분기

이 둘은 발상이 비슷해 시험에서 자주 혼동된다.

| 항목 | SNS | EventBridge |
|------|-----|-------------|
| 본질 | Pub/Sub Topic | Content-based Event Router |
| 패턴 매칭 | Message attributes 기반 (단순) | JSON 깊은 필드 (풍부) |
| Throughput | 매우 높음 (Topic당 100,000 TPS+) | 보통 (Account/Region당 ~10,000 TPS, 증액 가능) |
| Target 종류 | Lambda, SQS, HTTP/S, SMS, Email, Mobile Push | 20+ AWS + API Destination + 다른 Bus |
| Schema | 없음 | Schema Registry |
| Archive | 없음 | 있음 |
| 비용 | Publish $0.50/M + delivery 비용 | $1.00/M custom + 무료 AWS 이벤트 |
| 사용 시점 | **단순 fan-out + 높은 처리량** | **풍부한 필터링 + 다양한 target** |

흔한 결정 트리:
- "5개 SQS에 같은 메시지 → 매우 높은 처리량" → **SNS Fan-out**
- "복잡한 조건 매칭 + 외부 SaaS target + 다른 Bus" → **EventBridge**
- "SaaS partner 이벤트 수신" → **EventBridge Partner Bus**
- "모바일 푸시·SMS·이메일 직접" → **SNS**

> 🎯 **시나리오**: "한 e-commerce가 '결제 완료' 이벤트를 5개 다운스트림(분석, 배송, CRM, 알림, audit log)에 fan-out한다. 모든 다운스트림은 같은 이벤트를 받고, 처리량은 초당 5,000건이다." — 답은 **SNS Topic + 5개 SQS 구독**. 단순 fan-out + 높은 처리량의 정확한 SNS sweet spot. EventBridge도 가능하지만 5개 룰이 같은 패턴을 매칭해야 하고 비용도 더 비쌈.

> 🎯 **시나리오 2**: "한 글로벌 SaaS가 Stripe webhook + Shopify webhook + 자체 도메인 이벤트를 모두 받아 amount > $1,000 이벤트만 Step Functions로, 나머지는 Lambda로 보낸다." — 답은 **EventBridge (Partner Bus + Custom Bus + 풍부한 패턴 매칭 + Step Functions/Lambda target)**. Partner Bus가 Stripe/Shopify에 직접 통합되고, content-based routing이 정답.

## DLQ와 Retry — EventBridge 자체의 실패 처리

EventBridge가 target에 이벤트 전달을 실패하면(target 오류, throttle 등):
- **Retry**: 기본 24시간, 지수 백오프
- **DLQ (SQS)**: 최종 실패한 이벤트를 격리

각 룰별로 DLQ를 지정할 수 있고, DLQ에 들어간 이벤트는 metadata(target ARN, 실패 이유, 시도 횟수)와 함께 분석 가능.

> ⚠️ **함정**: "EventBridge Target이 Lambda이고 Lambda가 실패하면 EventBridge가 재시도한다"는 보기는 부분적으로 맞다. 정확히는 EventBridge가 Lambda Invoke 자체가 실패하면 재시도하고, Lambda 함수 안의 비즈니스 로직 실패는 Lambda의 비동기 재시도 모델(2회 자동 재시도) + Destinations로 처리. 두 레이어를 혼동하면 시나리오를 잘못 푼다.

## EventBridge vs Kinesis vs Kafka — 스트리밍 시각

EventBridge는 **discrete event router**이고 Kinesis/Kafka는 **continuous stream platform**이다.

| 차원 | EventBridge | Kinesis Data Streams | Kafka (MSK) |
|------|-------------|---------------------|-------------|
| 모델 | Event router | Ordered stream | Distributed log |
| 보존 | Archive 옵션 | 24h~365d | 무제한 |
| 순서 | 보장 X | Shard 내 보장 | Partition 내 보장 |
| 처리량 | ~10K TPS (보통) | Shard당 1MB/s | Partition당 매우 높음 |
| 사용처 | 이벤트 라우팅, 워크플로우 트리거 | 실시간 분석, 시계열 | 로그 집계, 이벤트 소싱, 이식성 |
| 재처리 | Archive + Replay | Shard 내 재읽기 | Offset 재설정 |

EventBridge는 "이벤트 한 건씩 라우팅"에 최적화되어 있고, Kinesis/Kafka는 "스트림 전체를 순차 처리"에 최적화. 둘이 같이 쓰이기도 한다: Kafka → EventBridge Pipes → 다양한 target 라우팅.

> 📚 **사례**: 2023년 Capital One의 결제 사기 탐지 시스템은 거래 이벤트를 Kinesis Data Streams로 받고, 그중 의심 거래만 EventBridge Pipes로 필터링해 Step Functions(다단계 검증 + 인간 승인)로 보낸다. Kinesis가 raw stream의 순서·재처리를 담당, EventBridge가 라우팅·필터링을 담당하는 분담 패턴.

## 정리하며

EventBridge는 단순한 "이벤트 라우터"를 넘어 Bus(분류), Rule(매칭), Pipes(통합), Scheduler(시간), Schema Registry(진화), Archive(시간 여행)까지 묶은 **이벤트 플랫폼**이 됐다. 시험 시나리오의 키워드 매핑:

- "도메인 이벤트 + 풍부한 필터" → **Custom Bus + Rule**
- "SaaS 통합" → **Partner Bus**
- "큐 → 워크플로우, 코드 없이" → **Pipes**
- "100만 사용자 스케줄" → **Scheduler**
- "스키마 진화" → **Schema Registry**
- "과거 이벤트 재처리" → **Archive + Replay**
- "단순 fan-out + 매우 높은 처리량" → **SNS** (EventBridge가 아님)

다음 day에서는 AppSync(GraphQL)와 SQS/SNS 메시징 패턴을 더 깊이 본다. EventBridge가 "이벤트 분배"라면 SQS/SNS는 "메시징 기본기"고, AppSync는 "실시간 API"다. 셋이 어떻게 협력해 EDA를 완성하는지가 다음 글의 주제다.

---

## 📝 연습 문제

**문제 1.** 한 SaaS가 SQS 큐에 들어오는 메시지를 필터링해 특정 패턴만 Step Functions로 보내고, 나머지는 무시한다. Lambda 코드 작성 없이 가장 간단한 구성은?

A) Lambda(필터) → Step Functions
B) EventBridge Pipes (Source=SQS, Filter, Target=Step Functions)
C) SQS Redrive Policy
D) EventBridge Rule (Source=SQS)

**정답: B**
해설: Pipes는 정확히 이 패턴(SQS/Kinesis/DDB Stream → 필터 → target)을 코드 없이 구성하기 위한 도구. A는 Lambda 운영 부담 추가. C(Redrive)는 실패 메시지 격리 용도이지 필터링이 아님. D(EventBridge Rule)는 EventBridge Bus에 들어온 이벤트를 매칭하지 SQS를 직접 source로 못 받음. 함정: "코드 없이"가 키워드면 Pipes. 추가: Pipes의 enrichment 단계로 Lambda나 Step Functions를 끼워 가벼운 변환 가능. 입출력 모두 EventBridge 패턴 매칭 가능.

---

**문제 2.** 한 글로벌 SaaS가 100만 사용자에게 각자 선호 시간(타임존 + 시각)에 일일 요약 이메일을 발송한다. 각 사용자의 스케줄을 개별 관리해야 한다. 가장 적합한 구성은?

A) EventBridge Rule 100만 개
B) EventBridge Scheduler 100만 스케줄
C) Lambda + cron Worker
D) Step Functions Wait State

**정답: B**
해설: Scheduler는 계정당 100만+ 스케줄을 지원하고 타임존, cron, flexible time window를 제공. EventBridge Rule(A)은 계정당 한도(수천)에 막힌다. C(Lambda cron)는 자체 스케줄 저장·관리 인프라가 필요. D(Step Functions Wait)는 한 워크플로우 안 대기이지 100만 사용자 스케줄 관리가 아님. 함정: "사용자별 다른 시간"이면 Scheduler가 정답. 추가: Flexible time window(±15분)로 동시 부하 분산. Target은 200+ AWS API 직접 호출(Lambda 거치지 않고 SNS Publish 등).

---

**문제 3.** Shopify에서 발생하는 주문 이벤트를 AWS 워크플로우에 통합한다. Webhook 인프라 운영 없이 직접 받으려면?

A) API Gateway + Lambda webhook receiver
B) EventBridge Default Bus
C) EventBridge Partner Event Bus
D) SNS HTTPS subscription

**정답: C**
해설: Partner Bus는 AWS가 SaaS 파트너(Shopify, Stripe, Datadog, Auth0, MongoDB 등)와 직접 통합해 이벤트를 받는 매니지드 채널. 사용자는 partner 이벤트 source를 활성화하고 룰을 만들면 끝. A는 webhook receiver를 직접 운영해야 함(보안, 인증, 재시도, 스케일링). B(Default Bus)는 AWS 서비스용. D(SNS HTTPS)는 outbound 알림 용도. 함정: "SaaS partner 이벤트"는 거의 Partner Bus가 답. 추가: Stripe, Shopify, Datadog 등 메이저 SaaS가 모두 등록되어 있고 콘솔에서 한 번에 활성화.

---

**문제 4.** EventBridge Bus의 1년치 이벤트를 보존하다가 특정 시간 범위(예: 2024-03-01~03)의 이벤트만 다시 흘려보내 새 다운스트림을 초기화한다. 가장 적합한 기능은?

A) S3 + Athena 쿼리
B) EventBridge Archive + Replay
C) CloudTrail Lake
D) Kinesis Firehose 백업

**정답: B**
해설: EventBridge Archive는 Bus 이벤트를 보존(최대 무기한), Replay는 시간 범위 + 필터로 다시 흘려보냄. A는 분석은 가능하지만 다운스트림에 재투입하려면 별도 로직 필요. C(CloudTrail Lake)는 API 활동 감사용이지 application 이벤트가 아님. D는 데이터 저장이지 재생 메커니즘이 아님. 함정: "이벤트 재처리·재생"이면 거의 Archive + Replay. 추가: Event Sourcing 패턴의 새 구독자 도입, bug fix 후 누락 이벤트 복구에 표준 패턴.

---

**문제 5.** 한 e-commerce가 OrderPlaced 이벤트를 분석·배송·CRM·알림·audit 5개 다운스트림에 동일 메시지로 fan-out한다. 처리량은 초당 5,000건. 가장 적합한 구성은?

A) EventBridge + 5개 Rule
B) SNS Topic + 5개 SQS 구독
C) Kinesis Data Streams + 5개 Consumer
D) Step Functions Parallel state

**정답: B**
해설: 단순 fan-out + 매우 높은 처리량은 SNS의 정확한 sweet spot. Topic당 100,000 TPS+를 지원하고 SQS subscription으로 다운스트림이 자체 폴 속도로 처리. A(EventBridge)도 가능하지만 5개 룰이 같은 패턴을 매칭해야 하고, EventBridge 단가가 더 비싸며 throughput 한도가 더 낮음. C(Kinesis)는 순서·재처리가 필요한 스트리밍 분석용이지 fan-out 최적이 아님. D는 한 워크플로우 안 병렬이지 다운스트림 fan-out이 아님. 함정: "단순 fan-out + 높은 처리량"이면 SNS, "풍부한 필터·다양한 target"이면 EventBridge.

---

**문제 6.** 이벤트 발행 팀이 자주 새 필드를 추가한다. 구독 팀이 strongly-typed 코드(Java/Python)로 안전하게 이벤트를 처리하면서 스키마 진화를 추적하려면?

A) Glue Schema Registry
B) EventBridge Schema Registry + Code Binding
C) OpenAPI Swagger
D) Avro 직접 관리

**정답: B**
해설: EventBridge Schema Registry는 Bus 이벤트 스키마를 auto-discovery로 추출·버전 관리하고, Java/Python/TypeScript code binding을 자동 생성. 구독 팀은 generated SDK로 strongly-typed로 처리. A(Glue Schema Registry)는 Kinesis·Kafka용으로 별도 서비스. C(OpenAPI)는 REST API용이지 이벤트 스키마 표준이 아님(다만 EventBridge가 OpenAPI 3로 export 가능). D는 자체 운영 부담이 큼. 함정: EventBridge 이벤트의 스키마는 EventBridge Schema Registry, Kafka/Kinesis는 Glue Schema Registry. 두 가지를 혼동 주의.

---

**문제 7.** Lambda가 EventBridge Rule의 target이고 Lambda 함수 실행 중 비즈니스 로직 오류로 예외가 발생한다. 실패한 이벤트를 격리해 분석하려면?

A) EventBridge Rule의 DLQ
B) Lambda 함수의 비동기 Destinations (OnFailure)
C) CloudTrail
D) EventBridge Archive

**정답: B**
해설: EventBridge → Lambda 호출은 비동기 invoke이고, Lambda 함수 안의 실행 실패는 **Lambda 자체의 비동기 재시도 모델 + Destinations**가 처리. EventBridge Rule의 DLQ(A)는 **EventBridge가 Lambda Invoke 자체에 실패**(throttle, IAM 거부 등)할 때만 트리거되고, 함수 안의 비즈니스 오류는 잡지 못함. C는 API 활동 감사. D(Archive)는 이벤트 보존이지 실패 격리가 아님. 함정: 두 레이어(EventBridge의 target dispatch vs Lambda 함수 실행)를 혼동하면 시나리오를 잘못 푼다.

---

## 📌 오늘의 요약

1. **EDA 3대 디커플링**(시간/공간/동기화), Conway 법칙으로 조직 결합 영향
2. **Bus 3종**: Default(AWS) / Custom(도메인) / Partner(SaaS) + Cross-account 정책
3. **Rule = Pattern + 최대 5 Targets**, JSON 깊은 필드 매칭 + API Destination
4. **Pipes**: SQS/Kinesis/DDB Stream/MQ/MSK → Filter → Enrich → Target, 코드 없이
5. **Scheduler**: 100만+ 스케줄, time zone, flexible window, 200+ API 직접 호출
6. **Schema Registry** + **Archive/Replay** — 진화 관리 + 시간 여행
7. **SNS vs EventBridge**: 단순 fan-out·고처리량 vs 풍부 필터·다양 target
8. **Pipes vs Step Functions**: 1:1 라우팅 vs 복잡 워크플로우 (자주 Pipes→SF 조합)
