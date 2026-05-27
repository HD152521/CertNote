# Day 32 - SNS: 토픽, 팬아웃, 그리고 1:N 알림이 만들어지는 방식

Day 1에서 본 SQS는 "두 컴포넌트를 시간적으로 떼어내되 메시지는 한 번 소비되고 사라진다"는 큐 모델이었다. 그런데 실제 시스템에서는 "주문이 들어왔다"는 한 사건을 결제·재고·배송·메일·검색 인덱스·데이터 웨어하우스 여섯 군데가 **각자 독립적으로** 알아야 하는 경우가 훨씬 흔하다. 큐는 한 메시지를 한 컨슈머가 가져가면 다른 컨슈머는 못 보므로, 이 시나리오를 큐로 풀려면 큐를 여섯 개 만들고 생산자가 여섯 번 send 해야 한다. 새 컨슈머가 추가될 때마다 생산자 코드를 고쳐야 하고, 이건 1968년 Edsger Dijkstra가 지적한 "tightly coupled module"의 정의 그 자체다.

**Publish/Subscribe**(Pub/Sub) 패턴은 이 문제에 대한 1987년 ISIS 시스템 시절부터의 답이다. 생산자는 "토픽"에 한 번만 발행하고, 누가 그걸 구독하는지는 모른다. 구독자는 자유롭게 추가·제거되며, 토픽이 둘 사이의 indirection 레이어다. AWS의 **SNS(Simple Notification Service)**는 2010년 4월 출시된 이 모델의 매니지드 구현이고, 2006년 출시된 SQS와 짝을 이뤄 거의 모든 AWS 이벤트 기반 아키텍처의 척추 역할을 한다. 이 글은 SNS가 왜 그렇게 설계됐고, 어떤 트레이드오프를 SQS와 분담했으며, 시험과 운영에서 무엇이 함정인지 본다.

## 토픽과 구독: indirection이 만드는 자유

SNS의 모델은 단순하다. **Topic**이 indirection point, **Subscription**이 그 토픽을 듣는 엔드포인트, **Publish**가 토픽에 메시지를 던지는 행위다. 한 번 publish하면 SNS가 그 토픽의 모든 구독을 fan-out해서 각자에게 push한다. push가 핵심인데, 이게 SQS의 pull(컨슈머가 ReceiveMessage를 부름)과 정반대 모델이고, 두 시스템의 설계 선택을 가르는 분기점이다.

구독 가능한 프로토콜은 시간이 지나며 계속 늘었다. 2010년 출시 당시엔 HTTP/HTTPS, Email, SQS, SMS가 전부였지만 지금은 Lambda(2015), Mobile Push(APNS·FCM·Baidu, 2010-2013), Kinesis Data Firehose(2021), EventBridge Pipes(2022)까지 추가됐다. 이게 SNS의 진짜 가치 — 한 번 publish하면 이메일도 가고, 모바일 푸시도 가고, 큐에도 들어가고, 데이터 웨어하우스에도 적재된다. 생산자는 이 다양성을 전혀 신경 쓸 필요가 없다.

| 항목 | SNS Standard | SNS FIFO |
|------|-------------|----------|
| 처리량 | region당 수만 TPS, 사실상 무제한 | 토픽당 300 TPS (배치 시 3,000) |
| 순서 | Best-effort | Strict per MessageGroupId |
| 중복 | At-least-once delivery | 5분 dedup window |
| 구독 가능 | SQS, Lambda, Email, SMS, HTTP, Mobile Push, Firehose, EventBridge | **SQS FIFO, Lambda (2023+)** 만 |
| 메시지 크기 | 256KB (Extended Library로 더 가능) | 256KB |
| 출시 | 2010년 4월 | 2020년 10월 |

표준 SNS는 SQS Standard와 비슷한 at-least-once + best-effort ordering이고, FIFO는 SQS FIFO와 짝이 되도록 2020년에 뒤늦게 출시됐다. SNS FIFO가 SQS FIFO만 구독으로 받을 수 있다는 점이 시험 함정인데, 이메일이나 HTTP는 본질적으로 순서·중복 보장이 불가능한 채널이라(이메일은 SMTP relay가 재정렬할 수 있고, HTTP는 4xx/5xx로 재시도) FIFO 의미가 깨지기 때문이다.

> 💡 **관련 이론**: Pub/Sub와 Message Queue의 차이는 1996년 Gregor Hohpe와 Bobby Woolf의 *Enterprise Integration Patterns*에서 명확히 정리됐다. **Point-to-Point Channel**(큐)은 한 메시지 = 한 컨슈머, **Publish-Subscribe Channel**(토픽)은 한 메시지 = N 컨슈머. SNS+SQS의 fanout 패턴은 이 책에 나오는 "Publish-Subscribe Channel + Message Endpoint"의 정확한 매니지드 구현이다. 이 패턴은 Kafka의 consumer group, Google Pub/Sub의 subscription, Azure Service Bus의 topic+subscription에 모두 같은 형태로 존재한다.

> 🔍 **더 깊이**: SNS는 내부적으로 어떻게 fanout을 구현할까. 공식적으로 공개되진 않았지만 거동을 보면 **subscription registry + per-protocol delivery worker** 구조다. publish 한 번 → SNS가 subscription 목록을 lookup → 각 프로토콜별 worker(SQS sender, Lambda invoker, HTTP poster 등)가 병렬로 push. 각 worker는 자체 retry policy를 가지므로 한 구독이 느려도 다른 구독에 영향을 안 준다. HTTP/HTTPS 구독은 4xx면 즉시 포기, 5xx면 지수 백오프로 최대 100,015회 재시도(약 23일 동안)하는데, 이게 RFC 7807 권장 동작이고 다른 클라우드도 비슷하다.

## 팬아웃 패턴: SNS + SQS가 AWS 디커플링의 사실상 표준이 된 이유

이론적으로 SNS는 직접 Lambda나 HTTP에 push할 수 있다. 그런데 실제 운영 시스템 대부분은 **SNS → 여러 SQS → 각자 컨슈머**라는 한 단계가 더 추가된 형태로 설계된다. 왜일까.

답은 **buffer**다. SNS는 push 모델이라 구독자가 못 받으면 SNS의 retry에 의존해야 하는데, Lambda 구독이 처리 못 한 메시지가 너무 많아지면 throttle이 걸리고 SNS의 retry queue에 적체된다. 반면 SQS는 컨슈머가 자기 속도로 pull하므로 백로그가 큐에 안전하게 쌓이고, 컨슈머가 죽었다 살아나도 큐의 메시지를 그대로 처리한다. 즉 **SQS가 SNS의 push와 컨슈머의 처리 속도 사이의 충격 흡수재** 역할을 한다.

```
[ 주문 이벤트 팬아웃 ]

Order Service
   │ Publish (orderId, customerId, amount, items)
   ▼
SNS Topic: order-events
   │ fanout (병렬)
   ├─→ SQS-Payment       → Lambda payment-handler
   ├─→ SQS-Inventory     → ECS inventory-worker
   ├─→ SQS-Shipping      → Lambda shipping-handler
   ├─→ SQS-Notification  → Lambda email-sender
   ├─→ SQS-Analytics     → Firehose → S3 → Athena
   └─→ SQS-Search-Index  → Lambda → OpenSearch

각 SQS는 독립 DLQ, 독립 가시성 타임아웃, 독립 컨슈머 수
한 컨슈머가 다운돼도 다른 컨슈머는 영향 없음
```

이 패턴의 두 번째 효용은 **DLQ 분리**다. SNS도 DLQ를 가질 수 있지만(2019년 출시) "SNS가 SQS로 push 실패"하는 경우만 잡는다. 정작 운영에서 중요한 건 "메시지는 받았는데 처리에 실패한" 케이스이고, 그건 각 SQS의 DLQ가 잡아야 한다. SNS DLQ에 의존하면 어떤 컨슈머가 실패했는지 구분이 안 돼서 사후 분석이 어렵다.

세 번째 효용은 **신규 구독자 추가 비용 0**이다. 새 시스템이 주문 이벤트를 들어야 하면 새 SQS 큐를 만들고 SNS에 구독만 추가하면 끝. 기존 생산자도 다른 컨슈머도 코드 변경 없음. 이게 마이크로서비스 아키텍처에서 가장 자주 보이는 evolution 패턴이다.

> ⚠️ **함정**: "SNS → Lambda 직접 구독이 더 간단하지 않나"라고 생각하기 쉬운데, Lambda 동시성 제한·콜드 스타트·DLQ 부재(직접 구독 시) 때문에 트래픽 스파이크에 약하다. SNS → SQS → Lambda(Event Source Mapping) 패턴은 SQS가 자연스러운 버퍼가 되어 Lambda를 보호한다. 실무에서는 단순한 ad-hoc 알림(예: CloudWatch Alarm → SNS → Email)을 제외하면 거의 항상 SQS를 한 단계 끼우는 것이 표준이다.

## 메시지 필터링: 토픽 하나에 여러 이벤트 종류를 섞는 법

이론대로라면 이벤트 종류마다 토픽을 분리해야 한다. 주문 이벤트, 결제 이벤트, 환불 이벤트, 배송 상태 변경 이벤트 각각 별도 토픽. 그런데 실제 회사에서는 토픽이 30개가 넘으면 관리가 폭주한다. IAM 정책, 알람, 구독 그래프가 다 늘어나고, "이 이벤트가 어느 토픽으로 가지?"를 찾는 데 시간이 든다.

**Subscription Filter Policy**(2018년 출시)는 이 문제를 푼다. 한 토픽에 여러 종류 이벤트를 publish하되, 각 구독이 JSON 정책으로 "내가 받을 메시지의 조건"을 선언한다. SNS가 publish 시점에 필터링해서 매치되는 구독에만 push한다. 구독자는 자기 관심 이벤트만 받으니 처리 비용이 줄고, 토픽 수도 줄어 관리가 단순해진다.

```json
// Publisher가 보내는 메시지 속성
"MessageAttributes": {
  "event_type": {"DataType": "String", "StringValue": "order_placed"},
  "customer_tier": {"DataType": "String", "StringValue": "premium"},
  "amount": {"DataType": "Number", "StringValue": "150000"}
}

// 구독 A: 프리미엄 고객의 주문만 받음
{
  "event_type": ["order_placed"],
  "customer_tier": ["premium"]
}

// 구독 B: 10만원 이상 주문만 받음 (수치 비교)
{
  "amount": [{"numeric": [">=", 100000]}]
}

// 구독 C: 환불 제외한 모든 이벤트
{
  "event_type": [{"anything-but": "refund"}]
}
```

2023년 출시된 **Payload-Based Filtering**은 한 단계 더 나아가 메시지 속성이 아닌 본문(JSON body)의 필드로 필터링한다. 기존엔 publisher가 굳이 본문 데이터를 message attribute로 복제해서 넣어야 했는데, 이제 본문을 그대로 두고 필터링할 수 있다. 다만 본문이 반드시 JSON이어야 한다.

> 🔍 **더 깊이**: SNS 필터 정책 매치는 SNS 측에서 일어나므로 "필터에 안 맞는 메시지"는 구독자 비용이 0이다. SQS로 가는 메시지 비용, Lambda 호출 비용 둘 다 안 든다. 만약 필터링을 구독자 측(Lambda 내부 if-else)에서 하면 모든 메시지가 일단 Lambda를 호출해서 콜드 스타트·요청 비용이 다 나간다. 트래픽이 큰 토픽에서는 server-side filter가 비용 차이가 10배 이상 나는 경우가 흔하다.

> 📚 **사례**: 2022년 Netflix Tech Blog는 자체 이벤트 버스를 SNS 필터링 기반으로 재설계한 이야기를 공개했다. 이전엔 마이크로서비스마다 자체 Kafka 토픽을 운영해 토픽 수가 수천 개에 달했는데, "domain 단위로 하나의 SNS 토픽 + 필터 정책으로 구독자별 분기" 패턴으로 옮긴 뒤 토픽 수가 1/10로 줄고 신규 컨슈머 추가 시간이 일 단위에서 분 단위로 단축됐다. 다만 Netflix는 처리량 한계 때문에 Kafka를 완전히 대체하진 않았고, "낮은 처리량 + 다양한 구독자" 워크로드만 SNS로 옮겼다.

## SNS FIFO와 순서 보장의 본질

Day 1에서 SQS FIFO의 300 msg/s 제한이 "MessageGroupId 단위 단일 파티션 직렬화" 때문이라고 했는데, SNS FIFO도 정확히 같은 메커니즘이다. 토픽 자체가 FIFO 토픽이고, publish 시 MessageGroupId를 지정하면 그 그룹 안에서 발행 순서가 모든 SQS FIFO 구독에 그대로 전파된다. ContentBasedDeduplication을 켜면 본문 SHA-256 해시가 자동 dedup ID가 되어 5분 window 내 중복 publish가 무시된다.

SNS FIFO의 진짜 가치는 "여러 구독자가 같은 순서로 같은 메시지를 받는다"는 것이다. 만약 fanout 없이 각 컨슈머가 별도로 SQS FIFO에 send했다면 컨슈머마다 미세하게 다른 순서를 볼 수 있는데, SNS FIFO를 거치면 모든 구독자가 동일한 발행 순서를 본다. 분산 시스템에서 "global ordering as seen by all subscribers"는 비싸기로 유명한 보장이고, Kafka도 partition 안에서만 보장한다.

다만 제약이 만만치 않다.
- 구독 가능: SQS FIFO + Lambda(2023년 추가). 이메일·HTTP·Mobile Push 불가.
- 처리량: 토픽당 300 TPS(배치 시 3,000). High Throughput FIFO는 아직 SQS만 지원.
- 가격: 표준 SNS의 ~10배 정도 단가.

> 💡 **관련 이론**: 분산 시스템에서 "total order broadcast"(모든 노드가 같은 순서로 메시지를 봄)는 합의(consensus)와 등가라는 게 1996년 Tushar Chandra와 Sam Toueg의 유명한 정리다. Paxos/Raft 같은 합의 알고리즘으로 구현 가능하지만 latency와 처리량을 희생한다. SNS FIFO + SQS FIFO 조합이 처리량 300 TPS에 묶이는 것도 이 fundamental 비용을 우회할 방법이 없기 때문이다. exactly-once + total order가 필요하면 "정말로 필요한가, MessageGroupId로 partition할 방법은 없나"를 먼저 물어봐야 한다.

## 다른 Pub/Sub 시스템과의 비교

| 시스템 | 모델 | 순서 보장 | Push/Pull | 보존 | 운영 부담 |
|--------|------|----------|-----------|------|----------|
| **SNS Standard** | Topic + Subscription | Best-effort | Push | 없음(실패 시 retry만) | 매우 낮음 |
| **SNS FIFO** | Topic + Subscription | Per MessageGroupId | Push | 없음 | 낮음 |
| **EventBridge** | Bus + Rule + Target | Best-effort | Push | 없음(Archive로 가능) | 매우 낮음 |
| **Kafka topic** | Log (replayable) | Per partition | Pull | 무제한 | 높음 |
| **Google Pub/Sub** | Topic + Subscription | Optional ordering key | Push or Pull | 7일 (replay 가능) | 낮음 |
| **Azure Service Bus Topic** | Topic + Subscription | Per Session | Push (long polling) | 14일 | 낮음 |
| **Redis Pub/Sub** | Channel | None | Push (실시간) | 없음 (offline 구독자 손실) | 중간 |

이 표에서 가장 큰 분기점은 **보존 여부**다. SNS는 보존이 없어서 "publish 시점에 구독자가 없거나 구독자가 다운돼 있으면 그 메시지는 손실"이다(SNS DLQ가 없으면). Kafka·Google Pub/Sub·Service Bus는 보존이 있어서 컨슈머가 며칠 뒤에 lag을 따라잡을 수 있다. AWS에서 이 "replay 가능한 로그"가 필요하면 Kinesis(Day 4)나 MSK로 가야 한다.

EventBridge(Day 3)는 SNS와 비슷해 보이지만 다른 도구다. EventBridge는 SaaS·AWS 서비스 이벤트·custom 이벤트를 한 bus로 모으고 rule로 라우팅하는 데 특화돼 있고, SNS는 단순 pub/sub에 특화돼 있다. 처리량은 SNS가 압도적으로 높고, 통합성은 EventBridge가 압도적으로 풍부하다.

> 📚 **사례**: 2017년 2월 28일 AWS S3 us-east-1 대규모 장애 때 많은 회사들이 "S3 이벤트 알림 → SNS → 다운스트림" 체인이 모두 끊겨 알람이 안 왔다. 사후 분석에서 "단일 region SNS에 모든 알림을 의존하지 말고, 멀티 region SNS publish + Route 53 failover로 알림 자체의 가용성을 분리하라"는 권장이 나왔다. 이후 PagerDuty, Datadog 같은 모니터링 회사들은 자체 multi-region notification fabric을 구축했다.

## DLQ, 암호화, 그리고 운영의 세부

SNS Subscription DLQ는 2019년에 출시됐다. 한 구독이 push에 반복 실패하면(예: HTTP 엔드포인트가 영구히 5xx) 그 메시지를 지정된 SQS DLQ로 보낸다. 주의할 점은 **SNS DLQ는 구독 단위**라는 것이다. 토픽 단위가 아니라. 그래서 같은 토픽의 구독 A는 DLQ가 있고 구독 B는 없을 수 있고, 운영 표준화를 위해 모든 구독에 DLQ를 강제하는 SCP를 두는 회사가 많다.

암호화는 SSE-SNS(AWS 관리 키, 기본 무료)와 SSE-KMS(고객 관리 KMS, IAM으로 키 사용 권한 통제). SSE-KMS를 쓰면 publish/subscribe 양쪽에 KMS Decrypt 권한이 필요한데, Lambda 구독이 KMS 권한이 없어 메시지 복호화 실패로 push 실패가 발생하는 사고가 흔하다. 토픽 정책뿐 아니라 KMS 키 정책에도 구독자 principal을 추가해야 한다.

Cross-account 구독은 토픽 정책(resource-based policy)에 다른 계정의 ARN을 명시적으로 허용해야 한다. 큰 조직에서는 중앙 이벤트 계정에 토픽을 두고 워크로드 계정들이 cross-account로 구독하는 hub-and-spoke 패턴이 표준이다.

VPC Endpoint(Interface, AWS PrivateLink 기반)를 쓰면 publish 트래픽이 인터넷을 거치지 않고 AWS 백본으로 흐른다. 금융·헬스케어 같은 컴플라이언스 요구가 있는 도메인에서 거의 필수이고, NIST SP 800-53 SC-7 (boundary protection) 통제와 직접 매핑된다.

## 메시지 아카이브와 Replay

SNS FIFO는 2023년 출시된 **Message Archive and Replay** 기능으로 토픽에 publish된 메시지를 최대 365일 보관하고, 새 구독자가 과거 메시지를 replay받을 수 있다. 표준 토픽은 아직 미지원. 이 기능이 나오기 전엔 SNS → SQS로 받아 SQS의 14일 보존을 활용하거나, SNS → Firehose → S3로 archive해야 했다.

Replay는 "새 시스템이 추가될 때 과거 이벤트도 처리해야 한다"는 시나리오에 유용한데, 사실 이런 시나리오는 본질적으로 event sourcing(EventStoreDB, Kafka)에 더 적합하다. SNS FIFO Archive는 단기간(며칠~몇 달)의 부분적 replay 정도의 용도로 보는 게 맞고, 진정한 event sourcing이 필요하면 Kinesis나 MSK로 가야 한다.

```bash
# Standard Topic
aws sns create-topic --name order-events
aws sns subscribe --topic-arn arn:...:order-events \
  --protocol sqs --notification-endpoint arn:...:order-payment-queue

# Filter Policy (server-side filtering)
aws sns set-subscription-attributes --subscription-arn arn:... \
  --attribute-name FilterPolicy \
  --attribute-value '{"event_type":["order_placed"],"amount":[{"numeric":[">=",10000]}]}'

# FIFO Topic
aws sns create-topic --name order-events.fifo \
  --attributes FifoTopic=true,ContentBasedDeduplication=true

# Subscription DLQ (실패 메시지 격리)
aws sns set-subscription-attributes --subscription-arn arn:... \
  --attribute-name RedrivePolicy \
  --attribute-value '{"deadLetterTargetArn":"arn:aws:sqs:ap-northeast-2:123:order-events-dlq"}'

# Publish with attributes (필터링 키로 사용됨)
aws sns publish --topic-arn arn:...:order-events \
  --message '{"orderId":"o-1001","amount":15000}' \
  --message-attributes '{"event_type":{"DataType":"String","StringValue":"order_placed"},"amount":{"DataType":"Number","StringValue":"15000"}}'

# Cross-account publish 허용 (토픽 정책)
aws sns set-topic-attributes --topic-arn arn:... \
  --attribute-name Policy \
  --attribute-value file://cross-account-policy.json
```

## 정리하며

SNS는 SQS의 "1:1 작업 분배" 모델이 풀 수 없는 "1:N 이벤트 브로드캐스트"를 위해 존재한다. 그리고 SNS + SQS fanout 패턴은 두 서비스의 강점(SNS의 다양한 push 프로토콜 + SQS의 안전한 buffer)을 합쳐서 AWS에서 가장 자주 보이는 디커플링 아키텍처가 됐다. 메시지 필터링은 토픽 폭증을 막고, FIFO는 순서가 필요한 도메인을 위한 옵션이며, 구독 DLQ와 cross-account 구독은 대규모 조직에서 필수 운영 기능이다.

다음 글에서는 SNS와 비슷하지만 다른 차원의 문제 — AWS 서비스 이벤트·SaaS 이벤트·custom 이벤트를 한 곳에 모아 rule로 라우팅하는 **EventBridge**를 본다. SNS가 "내가 publish하는 이벤트를 N명에게 알린다"라면 EventBridge는 "온갖 곳에서 발생하는 이벤트를 받아서 조건에 맞게 어디로 보낸다"는 한 단계 위 추상화이고, 둘이 어떻게 분업하는지가 시험과 실무 모두의 핵심이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 주문 이벤트를 결제·재고·배송·알림 네 시스템이 각자 독립적으로 처리하길 원한다. 한 시스템이 다운돼도 다른 시스템 처리에 영향이 없어야 한다. 가장 적합한 아키텍처는?

A) SQS 큐 하나에 네 컨슈머가 모두 ReceiveMessage
B) SNS 토픽 하나 + 네 개의 SQS 큐 구독 (fanout)
C) Lambda를 SNS에 직접 네 번 구독
D) DynamoDB Stream → Lambda 트리거 네 개

**정답: B**

해설: SQS 한 큐는 한 메시지를 한 컨슈머만 받으므로 1:N 브로드캐스트 불가(A 탈락). SNS → 여러 SQS fanout이 표준 디커플링 패턴인데, 각 SQS가 독립 DLQ·독립 가시성 타임아웃·독립 컨슈머를 갖고 한 시스템 다운이 다른 시스템에 영향 없다. C(Lambda 직접 구독)도 fanout은 되지만 SQS 같은 buffer가 없어 트래픽 스파이크에 Lambda throttle 위험, DLQ도 SNS subscription DLQ로만 가능해 부분 실패 처리가 약하다. D는 주문 데이터가 DynamoDB에 있다는 별도 가정이 필요하고, Stream consumer 수에 제약(KCL shard 수 = 컨슈머 수)이 있어 일반적 fanout에는 부적합하다.

---

**문제 2.** "같은 고객의 결제 이벤트는 모든 구독자가 동일한 순서로, 정확히 한 번 보아야 한다"는 요구사항. 가장 적합한 조합은?

A) SNS Standard → SQS Standard 여러 개
B) SNS FIFO + ContentBasedDeduplication=true + MessageGroupId=customerId → SQS FIFO 여러 개
C) SQS FIFO 하나에 모든 컨슈머가 ReceiveMessage
D) Kinesis Data Streams + Multi-shard

**정답: B**

해설: "모든 구독자가 같은 순서"는 SNS FIFO + SQS FIFO 조합으로만 보장된다. SNS FIFO가 토픽 레벨에서 발행 순서를 fix하고, 그 순서가 모든 구독 SQS FIFO에 동일하게 전파된다. MessageGroupId=customerId면 고객 단위 순서가 보장되고 고객 간엔 병렬 처리 가능. ContentBasedDeduplication은 본문 해시 기반 자동 dedup. A는 best-effort 순서라 구독자마다 다른 순서를 볼 수 있다. C는 한 큐에 여러 컨슈머가 ReceiveMessage하면 각자 다른 메시지를 받는 작업 분배 모델이라 fanout이 아니다. D는 shard 단위 순서만 보장하고 shard 키 설계가 까다로우며, 여기서는 SNS FIFO가 더 단순한 답.

---

**문제 3.** SNS 토픽 하나에 다양한 종류의 이벤트(주문/환불/배송/리뷰)를 publish하고 있다. 구독자 중 한 Lambda는 "주문 + 결제 금액 5만원 이상"만 처리하고 싶다. Lambda 호출 비용을 최소화하면서 구현하는 방법은?

A) 모든 메시지를 Lambda에 보내고 Lambda 내부에서 if-else로 필터링
B) 이벤트 종류마다 별도 토픽을 만들어 분리
C) 구독에 Filter Policy를 걸어 server-side filtering
D) DynamoDB에 이벤트를 먼저 저장하고 Lambda가 polling

**정답: C**

해설: SNS Subscription Filter Policy는 publish 시점에 SNS 측에서 매치를 수행하므로 필터에 안 맞는 메시지는 Lambda 호출 자체가 일어나지 않는다 — 호출 비용 0. `{"event_type":["order_placed"],"amount":[{"numeric":[">=",50000]}]}` 같은 정책으로 종류+수치 조합 필터링 가능. A는 모든 메시지가 Lambda 호출을 일으켜 비용이 폭증, 콜드 스타트도 누적. B는 토픽 수가 폭증해 관리 비용이 커지고 구독·IAM·알람이 다 늘어난다. D는 SNS의 push 모델을 깨고 polling으로 회귀하는 안티패턴.

---

**문제 4.** 한 회사가 SNS 토픽으로 HTTPS 엔드포인트에 알림을 보내는데, 일부 메시지가 엔드포인트의 일시 장애로 손실되는 것이 의심된다. 가장 적절한 대응은?

A) SNS Standard를 FIFO로 변경
B) HTTP 구독에 Subscription DLQ(SQS)를 설정하고 실패 메시지를 격리
C) 토픽을 여러 region에 복제
D) Retry는 SNS가 자동으로 하므로 추가 조치 불필요

**정답: B**

해설: SNS는 HTTPS 5xx에 대해 지수 백오프로 최대 100,015회(약 23일)까지 재시도하지만, 그 후엔 메시지가 버려진다. Subscription DLQ를 설정하면 재시도 실패 메시지가 SQS DLQ로 들어가 사후 분석·재처리 가능. A는 FIFO는 HTTPS 구독 불가하므로 오답. C는 가용성을 더 높이는 방법이긴 하나 손실 자체 해결이 아니다. D는 부분적으로 맞지만 최종 실패 메시지 손실을 막지 못해 운영상 불충분.

---

**문제 5.** 한 SaaS 회사가 회사 내부 이벤트를 외부 파트너 50곳에 webhook으로 전달해야 한다. 새 파트너 추가가 잦고, 파트너마다 받는 이벤트 종류가 다르다. 가장 운영 효율적인 아키텍처는?

A) 회사 코드에서 파트너마다 HTTP POST를 직접 호출
B) SNS 토픽 + 파트너마다 HTTPS 구독 + 각 구독에 Filter Policy로 이벤트 종류 분기
C) Kinesis Data Streams + 파트너마다 KCL 컨슈머
D) SQS 큐 + 파트너가 ReceiveMessage

**정답: B**

해설: 파트너 추가/제거가 잦으면 코드 변경 없이 구독만 조작하면 되는 SNS 모델이 가장 효율적. 파트너마다 받는 종류가 다른 건 Filter Policy로 server-side 분기. 회사 publish 코드는 한 번만 publish하면 50명에게 자동 fanout. A는 파트너 추가 시 코드 변경 + 한 파트너 응답이 느리면 다른 파트너 호출까지 지연되는 결합. C는 외부 파트너가 KCL 라이브러리를 써야 해서 진입 장벽이 높고 webhook 모델 아님. D는 큐는 1:1 모델이라 50 파트너 = 50 큐 + 회사가 50번 send해야 함.

---

**문제 6.** SNS FIFO 토픽으로 이벤트를 publish 중이고, 일부 구독자는 SQS FIFO, 일부는 이메일 알림으로 받고 싶다. 구현 가능한가?

A) 가능. SNS FIFO는 모든 프로토콜 구독을 지원
B) 부분 가능. SQS FIFO 구독은 되지만 이메일은 SNS FIFO에서 불가하므로 별도 SNS Standard 토픽을 만들어 dual publish
C) 가능. 이메일 구독에 자동으로 dedup이 적용됨
D) 불가능. FIFO 토픽은 SQS FIFO만 발행 가능하므로 이메일 알림은 포기해야 함

**정답: B**

해설: SNS FIFO는 SQS FIFO와 Lambda(2023+)만 구독 가능. 이메일·HTTP·Mobile Push는 본질적으로 순서·중복 보장이 깨지는 채널이라 SNS FIFO 의미가 사라지므로 지원 안 한다. 이메일 알림이 필요하면 별도 SNS Standard 토픽을 만들어 publisher가 두 토픽에 dual publish하거나, SQS FIFO 구독에서 Lambda가 받아 SES로 이메일 전송하는 패턴. A는 잘못된 정보, C는 SNS FIFO의 dedup이 이메일에 적용되지도 않음, D는 우회 패턴이 존재하므로 과한 결론.

---

**문제 7.** 멀티 계정 조직에서 결제 계정의 SNS 토픽을 데이터 분석 계정의 SQS 큐에서 구독하려 한다. 어떤 권한 설정이 필요한가?

A) 결제 계정 SNS 토픽 정책에 분석 계정 SQS ARN을 허용 + 분석 계정 SQS 정책에 결제 계정 SNS principal 허용
B) IAM 사용자에게 cross-account role 부여만 하면 됨
C) AWS Organizations SCP만 설정
D) VPC Peering 설정

**정답: A**

해설: SNS와 SQS 모두 resource-based policy를 가지고 cross-account 통신에는 양쪽 모두에 명시적 허용이 필요. SNS 토픽 정책에 분석 계정 SQS를 구독자로 허용하고, SQS 큐 정책에 결제 계정 SNS principal(`sns.amazonaws.com`)에 대한 SendMessage 권한을 부여한다. 둘 중 하나만 빠뜨려도 메시지가 전달 안 됨 — 실무에서 가장 흔한 cross-account SNS 사고. B는 사용자 권한과 무관(서비스 간 호출), C는 SCP는 권한 boundary일 뿐 명시적 허용이 따로 필요, D는 SNS/SQS는 public endpoint라 VPC Peering 불필요.

---

해설 보강: SNS는 단순해 보이지만 운영에서 중요한 세부가 의외로 많다. ① fanout = SNS + SQS가 표준이지 SNS 직접 구독은 ad-hoc 알림에만 적합, ② Filter Policy는 비용·관리 측면에서 server-side가 항상 우월, ③ FIFO 구독 제약(SQS FIFO + Lambda만), ④ Cross-account = 양쪽 resource policy 모두 필요, ⑤ Subscription DLQ는 구독 단위, ⑥ SSE-KMS 시 구독자에게도 KMS Decrypt 권한이 필요. 이 여섯이 SAA 시험과 실무 양쪽에서 가장 자주 등장하는 SNS 함정이다.
