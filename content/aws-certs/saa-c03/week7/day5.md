# Day 5 - Week 7 복습: 메시징의 네 가지 모델과 분산 시스템의 의사결정

Week 7 내내 우리가 본 네 가지 서비스 — SQS, SNS, EventBridge, Kinesis — 는 콘솔의 카테고리로 보면 모두 "Application Integration"에 묶여 있지만, 그 안에서 푸는 문제는 사실 서로 다른 종류다. 같은 화면에 나란히 놓여 있다고 해서 같은 결을 가진 서비스라고 오해하면 시험은 물론 실무에서도 잘못된 도구를 고른다.

이 글에서는 다섯째 날답게 새로운 서비스를 더 얹지 않는다. 대신 지난 4일 동안 본 모델들을 분산 시스템 이론과 시나리오 키워드의 관점에서 다시 한 번 정리하고, 시험에서 자주 헷갈리는 결정 축들을 한 번에 풀어본다. 마지막으로 12문항의 시나리오 문제로 그동안 쌓아둔 사고를 점검한다.

## 네 가지 서비스, 네 가지 문제 정의

각 서비스가 풀려는 문제부터 다시 짚자. 외울 정의가 아니라 "이 서비스가 없으면 어떤 고통이 있는가"의 관점이다.

**SQS (Day 31)** — 생산자와 소비자의 시간을 분리하는 큐. 핵심 추상화는 "*소비자가 잠시 죽어도 메시지는 큐에 남아있다*". 이걸로 사용자 요청 처리 속도와 워커 처리 속도의 불일치(burst)를 흡수한다. 한 메시지는 한 소비자가 가져가서 끝낸다(point-to-point).

**SNS (Day 32)** — 한 이벤트를 N개 시스템으로 동시에 전달하는 팬아웃. 핵심 추상화는 "*발행자는 누가 듣는지 모른다*". 토픽에 한 번 publish하면 모든 구독자(SQS, Lambda, HTTP, Email, SMS, Mobile Push, …)가 각자 받는다.

**EventBridge (Day 33)** — 이벤트의 모양과 규칙을 기반으로 라우팅하는 버스. 핵심 추상화는 "*이벤트가 왔을 때 어떤 규칙에 매칭되는지로 동작이 결정된다*". 즉 SNS가 "구독 채널" 모델이라면 EventBridge는 "필터링 라우팅" 모델. SaaS·AWS 서비스·내부 앱의 이벤트를 한 번에 받고, JSON 패턴으로 라우팅한다.

**Kinesis (Day 34)** — 시간 순서대로 정렬된 이벤트의 강(stream). 핵심 추상화는 "*같은 데이터를 여러 소비자가 자기 페이스로 재생할 수 있다*". 메시지를 가져가도 사라지지 않고, 보관 기간 동안 누구나 다시 읽을 수 있다. 분석·머신러닝 학습·재처리에 결정적이다.

> 💡 **관련 이론**: 메시징 시스템의 네 모델은 Enterprise Integration Patterns(EIP, Hohpe & Woolf, 2003)에서 정리한 4가지 핵심 패턴과 거의 1:1 대응된다. SQS = **Point-to-Point Channel**, SNS = **Publish-Subscribe Channel**, EventBridge = **Content-Based Router**, Kinesis = **Event Sourcing / Replayable Log**. 즉 AWS는 EIP를 매니지드 서비스로 구현한 셈이다. 시험에서 "어느 서비스" 문제는 결국 "어느 패턴" 문제로 환원되며, 이 매핑이 머리에 있으면 시나리오에서 키워드만 잡아도 답이 나온다.

> 🔍 **더 깊이**: 같은 "메시징"이라도 **at-least-once vs exactly-once**, **순서 보장 vs 무관**, **메시지 영속성 vs 일회성**, **fanout 1:N vs point-to-point** 네 축으로 분류하면 모든 메시징 시스템이 그 좌표 위 한 점이다. Kafka는 (at-least-once, partition 내 순서, replayable, 1:N), SQS Standard는 (at-least-once, 순서 없음, consume 후 삭제, 1:1), SNS는 (best-effort, 순서 없음, 일회성, 1:N), SQS FIFO는 (exactly-once-ish, group 내 순서, 1:1), EventBridge는 (at-least-once, 순서 없음, rule 기반 fanout). 이 좌표를 그리면 시험 시나리오 키워드가 어디로 가는지 보인다.

## 첫째 축: "한 명이 처리"인가 "여러 명에게 배달"인가

가장 먼저 묻는 질문이다. 메시지가 들어왔을 때 단 하나의 소비자가 처리해서 끝나는 일인지(점대점), 아니면 여러 시스템이 같은 사건을 듣고 각자 다른 행동을 해야 하는지(팬아웃).

**점대점이면 SQS.** 결제 처리 큐가 좋은 예다. 한 주문은 한 번만 결제되어야 하므로 워커 인스턴스 중 하나가 메시지를 가져가서 처리하면 다른 워커는 그 메시지를 보지 못한다. 가시성 타임아웃이 정확히 이 단일 소유권을 보장한다.

**팬아웃이면 SNS 또는 EventBridge.** "주문 완료 이벤트가 일어났는데 이메일도 보내고, 분석 시스템에도 기록하고, 창고 시스템에도 알리고, 추천 엔진에도 입력해야 한다." 이때 발행자가 그 모든 구독자를 직접 호출하면 결합도가 폭발하고, 새 구독자가 생길 때마다 발행자 코드가 바뀌어야 한다. 팬아웃이 그 결합을 끊는다.

| 축 | SQS | SNS | EventBridge | Kinesis |
|---|---|---|---|---|
| 전달 모델 | 점대점 (1:1) | 팬아웃 (1:N) | 규칙 기반 라우팅 (1:N) | 스트림 (1:N, replay) |
| 메시지 영속성 | 가져가서 삭제 | 일회 전달, 안 남음 | 일회 전달, 안 남음 | 보관 기간 동안 누구나 재read |
| 순서 | Standard 없음 / FIFO 그룹 내 | 없음 | 없음 | shard 내 엄격 |
| 처리 보장 | At-least-once / FIFO exactly-once | At-least-once | At-least-once | At-least-once |
| 백프레셔 | 큐 길이로 ASG 스케일 | 없음 (발행 즉시) | 없음 | 소비자 페이스로 재생 |
| 통합 | Lambda, EC2, ECS | Lambda, SQS, HTTP, Email, SMS | 100+ SaaS / AWS / 자체 | Lambda, Firehose, KCL |

## 둘째 축: "이벤트를 다시 읽을 수 있어야 하나"

이 질문 하나로 Kinesis가 다른 셋과 갈린다. SQS·SNS·EventBridge는 모두 메시지가 "한 번 전달되고 사라지는" 모델이다. 소비자가 처리에 실패하면 DLQ로 가거나(SQS) 재시도 큐로 가거나(SNS/EventBridge target에 따라) 사라진다. 어쨌든 그 시점이 지나면 다시 그 이벤트를 볼 수 없다.

Kinesis는 다르다. 메시지는 보관 기간(기본 24시간, 최대 365일) 동안 스트림에 남아 있고, 소비자가 이미 가져갔어도 그 자리에 그대로 있다. 다른 소비자가 같은 시점부터 다시 읽을 수 있고, 어제의 데이터를 오늘 모델 학습에 다시 쓸 수 있다.

> 💡 **관련 이론**: 이 차이는 분산 시스템에서 **immutable log 패턴**의 가치와 직결된다. Jay Kreps의 "*The Log: What every software engineer should know about real-time data's unifying abstraction*"(2013, LinkedIn Engineering)이 정리한 핵심이다. 데이터를 가변 상태(mutable state)가 아니라 변하지 않는 이벤트의 시퀀스로 보면, 새로운 소비자가 생겼을 때 처음부터 다시 재생해서 동일한 상태를 재구성할 수 있다. Event Sourcing 패턴, CDC(Change Data Capture), Lambda Architecture(batch + streaming) 모두 이 가정 위에서 동작한다. SQS는 가변 상태(메시지를 가져가면 사라짐)이고 Kinesis는 불변 로그라는 점이 두 서비스를 완전히 다른 도구로 만든다.

> 📚 **사례**: Netflix는 2016년 이후 Keystone Pipeline에서 하루 1조 건 이상의 이벤트를 Kinesis 기반으로 처리한다. "왜 SQS가 아닌 Kinesis인가"의 답이 곧 이 축이다 — A/B 테스트, 추천 모델 학습, 실시간 대시보드 등 같은 이벤트를 여러 소비자가 다른 목적으로 사용하기 때문. SQS는 한 소비자가 가져가면 끝이라 같은 데이터를 여러 시스템이 분석하려면 fanout(SNS→SQS) 패턴이 필요한데, 새 소비자가 생기면 그 시점부터의 이벤트만 받을 수 있다(이전 이벤트 재생 불가). Kinesis는 보관 기간 안이면 새 소비자도 처음부터 재생 가능. [Netflix Tech Blog 참고](https://netflixtechblog.com/keystone-real-time-stream-processing-platform-a3ee651812a).

## 셋째 축: "이벤트 모양으로 라우팅해야 하나"

SNS와 EventBridge가 자주 헷갈리는 지점이다. 둘 다 1:N 팬아웃처럼 보이지만, 결정 모델이 다르다.

**SNS는 토픽 = 채널**이다. 토픽에 publish하면 그 토픽을 구독한 모든 엔드포인트가 받는다. 구독자를 늘리거나 줄이는 식으로 동작을 바꾼다. 메시지 필터링(Message Filtering)도 가능하지만 단순한 속성 매칭 수준이다.

**EventBridge는 버스 + 규칙**이다. 같은 버스에 들어온 이벤트를 JSON 패턴으로 매칭하고, 매칭된 규칙별로 다른 타겟(Lambda, SQS, Step Functions, SNS, 다른 EventBridge bus, …)에 보낸다. 규칙은 `{"source": ["custom.order"], "detail-type": ["OrderPlaced"], "detail": {"amount": [{"numeric": [">", 1000]}]}}` 같은 식으로 이벤트의 구조 자체를 본다.

또 EventBridge는 SaaS 이벤트(Zendesk, Datadog, Stripe, Auth0, MongoDB 등)와 AWS 서비스 이벤트(EC2 상태 변화, S3 PutObject, CodePipeline 단계 등)를 같은 버스에서 받을 수 있다는 점에서 SNS보다 위쪽 추상화에 있다. SNS가 "내가 만든 토픽에 내가 발행"이라면, EventBridge는 "온갖 곳에서 오는 이벤트를 내가 받아서 라우팅"이다.

> 🔍 **더 깊이**: EventBridge의 라우팅은 내부적으로 finite state automaton 기반의 패턴 매처로, 규칙 패턴을 컴파일해서 들어오는 이벤트와 빠르게 매칭한다. 수천 개 규칙이 있어도 단일 이벤트의 라우팅 결정은 마이크로초 단위로 끝나기 때문에 표현력이 SNS Message Filtering(단순 string 비교)과 다른 차원이다 — 숫자 비교, IP 매칭, 존재 여부, 접두사 등이 가능. 다만 EventBridge는 PutEvents 이벤트당 평균 0.5초 지연(p99 < 1.5초)이 있어, 1초 미만 SLA가 필요한 hot path에서는 SNS 또는 SQS 직접 호출이 더 낫다.

> ⚠️ **함정**: "SaaS 통합", "스케줄링", "이벤트 패턴 필터링", "AWS 서비스 이벤트 라우팅" 키워드가 보이면 EventBridge가 답이다. "단순 fanout SQS + Lambda + 이메일"이면 SNS가 답이다. EventBridge로 모든 fanout을 하면 latency가 누적되고 비용도 SNS의 ~10배. 반대로 단순 SNS만 쓰면 SaaS 통합이 어려워서 매번 Lambda를 끼워야 한다.

## 넷째 축: "정확히 한 번"이라는 함정

분산 시스템에서 가장 자주 오해받는 단어가 "exactly-once delivery"다. SQS FIFO와 Kafka(EOS)와 SNS가 각자 다른 의미로 이 단어를 쓴다.

**SQS Standard / SNS** — at-least-once. 같은 메시지가 두 번 도착할 수 있다. 네트워크 재시도 때문에 발행자가 두 번 보낼 수도, 소비자가 ack 전에 죽어서 다시 가져갈 수도 있다. 해결은 **소비자 측 idempotency**(메시지 ID로 중복 체크).

**SQS FIFO** — "exactly-once processing"을 광고하지만 엄밀히는 **5분 deduplication window 안에서 중복 발행을 막아주는 것**이다. ContentBasedDeduplication 또는 명시적 MessageDeduplicationId 기준으로 5분 이내 같은 ID는 무시된다. 즉 5분 넘어서 또 보내면 여전히 중복 발행 가능. 그리고 소비자가 처리 후 ack 안 하고 죽으면 visibility timeout이 풀려 다시 가져간다(여전히 한 번 처리 ≠ 한 번 도착).

**Kinesis** — at-least-once. KCL이 consumer side에서 sequence number를 DynamoDB에 checkpoint하지만, 한 record가 두 워커에 동시에 보일 짧은 순간이 있다. consumer 코드에서 idempotency 보장 필수.

> 💡 **관련 이론**: Two Generals' Problem(1975)이 증명한 것 — 두 노드 간 안정적인 합의는 비동기 네트워크에서 불가능하다. 즉 발행자와 소비자 사이의 "정확히 한 번"은 메시징 시스템 단독으로는 절대 보장할 수 없고, 소비자 측의 멱등성(idempotency)이나 트랜잭션 outbox 패턴 같은 애플리케이션 협력이 반드시 필요하다. Confluent의 EOS(Exactly Once Semantics, KIP-98)도 transactional producer + read-process-write가 모두 같은 Kafka 클러스터 안에서 끝나야 가능한 좁은 의미의 보장이다. AWS 메시징을 설계할 때 "FIFO 쓰면 중복 없어"라고 외우면 함정에 빠진다.

## 다섯째 축: 비용과 운영 부담

같은 워크로드라도 어떤 도구를 쓰느냐에 따라 한 달 청구서가 10배 차이날 수 있다. 시험에서도 비용 키워드가 분명한 시나리오는 답이 거의 정해진다.

| 시나리오 | 저렴한 답 | 비싼 답 (오답) |
|---|---|---|
| 하루 100만 건 단순 fanout | SNS | EventBridge |
| 하루 1억 건 분석 스트림 | Kinesis Firehose → S3 (서버리스) | Kinesis Data Streams + 자체 KCL EC2 |
| 잦은 빈 폴링 비용 | Long Polling 20초 | Short Polling |
| SaaS 이벤트 라우팅 | EventBridge | Custom Lambda + 큐 |
| 단순 비동기 워커 | SQS | Step Functions |
| 200KB 이상 메시지 | S3 + SQS Extended Client | base64로 잘라 보내기 |

> 📚 **사례**: 2020년 한 핀테크 스타트업이 모든 비동기 처리를 EventBridge로 통일했다가 월 청구서가 SNS+SQS 조합 대비 12배 폭증한 사례가 회자된다. 원인은 EventBridge가 이벤트당 $1/M USD(처음 100M까지)인 데 비해 SNS는 publish가 $0.50/M USD + 구독자 전달은 SQS면 무료에 가까웠던 것. EventBridge의 가치는 "라우팅 표현력 + SaaS 통합"이고, 단순 fanout이라면 SNS가 비용 효율적이다. 시험에서도 "수억 건의 단순 fanout"이라면 비용 키워드가 SNS 쪽을 가리킨다.

## 처리량(Throughput) 한도와 partition/shard

시험에서 "갑자기 트래픽이 10배 늘어났다, 무엇이 부족한가" 류 문제가 자주 나온다. 각 서비스의 처리량 모델을 기억해두자.

| 서비스 | 처리량 |
|---|---|
| **SQS Standard** | 무제한 (사실상) |
| **SQS FIFO** | 300 TPS / 그룹 (배치 시 3,000), High Throughput FIFO는 그룹 분산으로 수만 |
| **SNS Standard** | 무제한 (지역별 publish quota 있음) |
| **SNS FIFO** | 300 TPS / 그룹 |
| **EventBridge** | default bus 400 TPS PutEvents, increase 가능 |
| **Kinesis Data Streams** | shard당 in 1MB/s 또는 1,000 record/s, out 2MB/s (Enhanced Fan-Out은 소비자별 2MB/s) |
| **Kinesis Firehose** | 자동 스케일 (관리형) |

> ⚠️ **함정**: Kinesis "shard"를 SQS와 같은 큐로 오해하지 말 것. shard는 partition key 해시로 결정되며, 한 partition key는 항상 같은 shard로 간다(순서 보장의 기반). hot partition key가 있으면 그 shard가 한도(in 1MB/s)에 막혀서 throttling이 일어나는데, 다른 shard는 한가해도 도움이 안 된다. 시험 시나리오에 "특정 키만 처리량이 막힌다"가 나오면 partition key 설계 문제 답.

## 여섯째 축: 보안과 멱등성 키 설계

메시징을 잘못 다루면 데이터 유출이나 중복 처리로 이어진다. 핵심 패턴 3개만 기억하면 안전하다.

**1) 암호화** — 모든 4개 서비스가 SSE(KMS 키)를 지원한다. SQS·SNS·Kinesis는 KMS data key caching으로 비용 최적화하고, EventBridge는 모든 이벤트가 자동 in-transit TLS + at-rest encryption.

**2) VPC Endpoint** — Lambda 같은 VPC 안 워크로드가 SQS·SNS·Kinesis·EventBridge에 접근할 때 인터넷 우회 없이 PrivateLink로 연결. 보안 + NAT Gateway 비용 절감.

**3) Resource Policy로 cross-account** — SNS Topic Policy, SQS Queue Policy, EventBridge Bus Policy로 다른 계정의 ARN에 접근 허용. 멀티 계정 환경에서 중앙 audit 큐로 모든 계정 이벤트 모으기.

> 💡 **관련 이론**: 멱등성 키(idempotency key) 설계는 분산 시스템의 핵심 디펜스 라인이다. Stripe의 idempotency-key 헤더 패턴이 사실상 업계 표준 — 클라이언트가 UUID를 생성해서 보내면 서버는 그 키로 처리 결과를 캐싱하고, 동일 키 재요청은 캐시된 결과만 반환한다. SQS/SNS의 at-least-once를 다루는 워커도 같은 원리로 메시지 ID + 처리 결과를 DynamoDB(TTL)에 저장하면 중복 처리를 차단할 수 있다. RFC draft "*The Idempotency-Key HTTP Header Field*"(Sanyal & Vyas, IETF 2021)가 이 패턴을 표준화하려 한다.

## 다음 주 예고

Week 8은 데이터베이스의 깊이로 들어간다. RDS · Aurora · DynamoDB · ElastiCache가 각각 어떤 워크로드를 풀고, 같은 "데이터 저장" 문제를 어떤 분산 모델로 접근하는지를 본다. Week 7에서 본 "메시징은 시간을 분리한다"는 결의 그림이, Week 8의 "데이터베이스는 일관성과 가용성을 분리한다"는 그림과 같은 분산 시스템의 두 얼굴이라는 것을 알게 될 것이다.

---

## 📝 연습 문제

**문제 1.** 한 e-commerce 회사의 주문 시스템이 "주문 완료" 이벤트를 발생시키면 다음 4가지를 동시에 해야 한다: (1) 결제 처리 큐로 메시지 전송, (2) 분석 시스템에 기록, (3) 사용자에게 이메일 알림, (4) 창고 시스템에 알림. 또한 향후 새로운 구독자가 추가될 수 있다. 가장 적합한 아키텍처는?

A) 주문 서비스가 결제·분석·이메일·창고 4개 SQS 큐에 각각 SendMessage를 직접 호출하고 새 구독자 추가 시 코드 배포
B) SNS 토픽 → SQS 큐 4개 fanout (SNS-SQS fanout 패턴)
C) Kinesis Data Stream에 주문 이벤트를 넣고 4개 시스템이 각자 KCL 애플리케이션 + DynamoDB checkpoint 테이블로 consume
D) EventBridge custom bus에 4개 rule을 만들고 각 rule이 동일한 OrderPlaced 패턴으로 4개 타겟에 라우팅

**정답: B**

해설: 단순 fanout이고 구독자 확장이 예상되는 시나리오의 모범답안이 SNS→SQS 패턴이다. SNS가 토픽으로 한 번 발행하면 모든 SQS 구독자가 받고, 각 큐의 워커가 자기 페이스로 처리한다. 새 구독자는 SQS 큐 만들고 SNS 토픽에 구독 추가만 하면 됨 — 발행자 코드는 안 바뀜. (A)는 결합도 폭발, 새 구독자 추가마다 발행자 수정 필요. (C) Kinesis는 보관 기간/재read가 필요한 분석 워크로드용이고 fanout이 목적이 아니다. 비용도 비싸고 운영 부담 큼. (D) EventBridge도 가능하지만 단순 fanout에 비싸고 latency도 큼. 단, 만약 시나리오에 "이벤트 패턴 필터링"이나 "SaaS 통합"이 있으면 EventBridge가 답.

---

**문제 2.** 결제 시스템에서 "한 결제는 정확히 한 번 처리되어야 한다 + 같은 고객의 결제는 순서대로 처리되어야 한다"가 요구된다. 가장 적합한 큐 구성은?

A) SQS Standard + DynamoDB 멱등성 키 테이블로 워커가 중복 처리를 차단
B) SQS FIFO + MessageGroupId=customer_id
C) SNS FIFO 토픽 + Lambda 구독자가 결제를 직접 수행
D) Kinesis Data Streams + partition key=customer_id + KCL 워커가 shard에서 순서대로 결제 처리

**정답: B**

해설: FIFO 큐는 MessageGroupId 단위로 순서를 보장하고, ContentBasedDeduplication 또는 MessageDeduplicationId로 5분 윈도우 안에서 중복 발행을 차단한다. customer_id를 그룹 ID로 쓰면 "같은 고객의 결제는 순서대로 + 정확히 한 번"이 자연스럽게 보장된다. (A) Standard + 멱등성은 순서를 보장 못 함. (C) SNS FIFO는 fanout 용으로, 워커 큐 모델에 직접 어울리지 않음 — SNS FIFO → SQS FIFO 조합이면 가능하지만 한 단계 추가. (D) Kinesis도 partition key로 같은 고객 순서를 보장하지만, 결제는 1:1 큐 모델(한 워커가 가져가서 처리)이지 스트림 분석이 아님. Kinesis는 재read·분석이 필요할 때 가치가 있고, 결제 워커 큐는 SQS FIFO가 자연스럽다. 그리고 Kinesis는 비용이 훨씬 비싸다.

---

**문제 3.** 한 회사가 자사 워크로드에서 GitHub, Stripe, Datadog 같은 SaaS의 이벤트를 받아 자동화 규칙으로 다른 AWS 서비스(Lambda, Step Functions, SQS)에 라우팅하려고 한다. 가장 적합한 솔루션은?

A) SaaS마다 webhook을 받는 API Gateway + Lambda를 만들어 인증·재시도를 직접 구현하고 SNS 토픽으로 fanout
B) EventBridge SaaS Partner Source + bus + rules
C) 각 SaaS의 webhook을 Kinesis Data Streams로 수집한 뒤 Lambda가 source 필드를 읽어 분기
D) Step Functions 상태 머신에서 각 SaaS API를 polling 태스크로 직접 호출해 통합

**정답: B**

해설: EventBridge는 정확히 이 시나리오를 위해 설계됐다. SaaS Partner Source가 30+ SaaS와 native 통합되어 있어서 webhook 처리·인증·재시도가 모두 매니지드. 받은 이벤트는 같은 bus에서 JSON 패턴 규칙으로 다양한 타겟에 라우팅. (A) Lambda + SNS로도 가능하지만 SaaS마다 webhook 엔드포인트·인증·재시도를 각자 구현해야 함. EventBridge는 그걸 매니지드로 제공. (C) Kinesis는 스트림 분석용이고 라우팅이 아님. (D) Step Functions는 워크플로 오케스트레이션이지 이벤트 수신·라우팅 허브가 아님. SaaS · 패턴 매칭 · 라우팅 키워드가 보이면 거의 항상 EventBridge.

---

**문제 4.** IoT 디바이스 100만 대가 초당 평균 50,000건의 텔레메트리 데이터를 보내고, 이 데이터를 (1) S3에 원본 저장, (2) Lambda로 실시간 이상 탐지, (3) 다음 분기에 ML 모델 학습용으로 재사용해야 한다. 가장 적합한 솔루션은?

A) SQS Standard 큐 + Lambda가 polling해 이상 탐지 후 S3로 배치 export, ML 학습은 S3에서 재로드
B) SNS 토픽 → SQS / Lambda / S3 fanout으로 세 소비자에 동시 전달
C) Kinesis Data Streams + Lambda + Firehose → S3
D) EventBridge bus → Lambda·S3·분석 등 여러 타겟에 rule로 라우팅

**정답: C**

해설: 핵심 키워드는 "재사용" — 같은 데이터를 여러 소비자가 다른 목적으로 본다. SQS·SNS·EventBridge는 가져가면 사라지는 모델이라 ML 학습용 재read가 어렵다. Kinesis는 보관 기간(기본 24시간, 최대 365일) 동안 데이터가 그대로 남아 새 소비자도 처음부터 재생 가능. Lambda가 shard를 polling해서 실시간 이상 탐지, 같은 스트림에 Firehose가 붙어 S3로 자동 적재(원본 저장 + ML 학습용). 50,000 TPS는 50 shard 정도. (A)(B) SQS·SNS는 재read 불가. (D) EventBridge는 처리량 한도가 더 작고 비용도 비싸다.

---

**문제 5.** 한 회사의 워커가 SQS에서 메시지를 받아 외부 API를 호출하는데, 외부 API 호출이 평균 45초 걸리고 가끔 90초까지 간다. 그런데 같은 메시지가 두 번 처리되는 사고가 가끔 발생한다. 원인과 해결은?

A) Standard 큐를 FIFO 큐로 변경해 MessageGroupId 단위 단일 소비자 보장으로 중복 제거
B) Visibility Timeout이 처리 시간보다 짧음 → Visibility Timeout 늘리거나 ChangeMessageVisibility로 동적 연장
C) Standard 큐의 at-least-once 한계이므로 멱등성 키 테이블만 추가하면 visibility 설정과 무관하게 해결
D) DLQ + maxReceiveCount=3 + Redrive Policy로 재처리되는 메시지를 격리해 중복 차단

**정답: B**

해설: 기본 Visibility Timeout이 30초인데 처리가 45-90초 걸리면, 처리 중에 다른 워커가 같은 메시지를 또 가져간다. 해결은 두 가지: (1) Visibility Timeout을 처리 시간보다 충분히 길게 설정 (예: 120초), (2) 처리 시간이 가변적이면 워커가 처리 중 주기적으로 ChangeMessageVisibility API를 호출해 visibility를 연장. (A) FIFO도 visibility timeout 문제는 똑같다. (C) 멱등성 키로 중복 효과는 완화되지만 근본 원인은 그대로. (D) DLQ는 처리 실패 메시지 격리용이지 중복 처리 방지가 아님. 실무에서는 (B)와 (C)를 같이 한다 — visibility를 늘리고 + 멱등성 키도 두 번째 방어선으로.

---

**문제 6.** 한 회사는 CodePipeline 배포가 실패할 때만 Slack에 알림을 보내고 싶다. 가장 적합한 구성은?

A) CodePipeline의 모든 단계 이벤트를 SNS 토픽으로 보내고 Lambda가 state=FAILED만 필터링해 Slack webhook 호출
B) CodePipeline → EventBridge rule (실패 이벤트만) → SNS → Chatbot → Slack
C) CodePipeline 이벤트를 SQS 큐로 보내고 Lambda가 polling하며 실패 여부를 판별해 Slack 전송
D) CodePipeline 이벤트를 Kinesis Data Streams로 흘리고 KCL 소비자가 실패 레코드만 골라 Slack 전송

**정답: B**

해설: AWS 서비스 이벤트를 EventBridge가 자동으로 받는다. CodePipeline은 `aws.codepipeline` 소스로 모든 단계 이벤트를 발행하고, 규칙 패턴 `{"source": ["aws.codepipeline"], "detail-type": ["CodePipeline Stage Execution State Change"], "detail": {"state": ["FAILED"]}}` 로 실패만 필터링한다. 타겟은 SNS → Chatbot이 Slack과 native 통합 (또는 SNS → Lambda → Slack webhook). (A) SNS는 이벤트 필터링이 제한적이고 CodePipeline은 SNS로 모든 이벤트를 보내야 함 → Lambda에서 필터링하므로 비용/지연 비효율. (C) SQS는 라우팅 없음, 어차피 Lambda 필터링 필요. (D) Kinesis 부적합. AWS 서비스 이벤트 라우팅은 EventBridge가 정답.

---

**문제 7.** Kinesis Data Streams 소비자가 1개일 때는 잘 동작하지만, 같은 데이터를 분석하는 두 번째 소비자를 추가하니 둘 다 throttling이 자주 발생한다. 원인과 해결은?

A) Shard 수가 부족함 → UpdateShardCount로 shard를 2배로 늘려 총 out 대역폭 확보
B) Classic consumer는 shard당 2MB/s out을 모든 소비자가 공유 → Enhanced Fan-Out 사용
C) 특정 partition key가 hot해 한 shard에 레코드가 몰림 → key 분산 재설계로 throttling 해소
D) 소비자의 Visibility Timeout이 짧아 레코드가 중복 노출됨 → timeout을 처리 시간보다 길게 설정

**정답: B**

해설: Kinesis classic consumer (GetRecords API polling) 모드는 shard당 out 2MB/s 또는 5 GetRecords/s를 **모든 소비자가 공유**한다. 소비자가 2개면 각자 1MB/s 정도로 제한되어 throttling. Enhanced Fan-Out (HTTP/2 push 기반)은 소비자별로 독립적인 2MB/s 대역폭을 제공해 N개 소비자가 있어도 각자 full bandwidth. (A) shard 추가도 가능하지만 비용 큼, EFO가 더 직접적인 답. (C) 키가 hot하면 그 shard만 막히는 다른 문제. (D) SQS 개념. EFO는 추가 비용($0.015/consumer-shard-hour + data retrieval)이 있지만 multi-consumer 시나리오의 표준 해법.

---

**문제 8.** 한 회사가 SQS 큐의 메시지를 Lambda로 처리하는데, 가끔 외부 API의 일시적 장애로 한 메시지의 처리가 5번 연속 실패한다. 정상 메시지는 계속 처리되어야 하고, 실패한 메시지는 격리해서 나중에 분석 후 재처리하고 싶다. 어떻게?

A) Lambda 예약 동시성을 낮춰 실패 메시지가 재시도 큐를 점유하지 못하게 throttle
B) Visibility Timeout을 충분히 늘려 외부 API 복구를 기다린 뒤 같은 메시지를 재처리
C) DLQ + maxReceiveCount=5 + Redrive Policy
D) SNS 토픽으로 fanout해 실패 메시지를 별도 분석 구독자가 받도록 분기

**정답: C**

해설: DLQ(Dead Letter Queue) + Redrive 패턴이 정확히 이 시나리오를 위한 설계다. 큐 속성에 RedrivePolicy를 설정해 `{deadLetterTargetArn: ..., maxReceiveCount: 5}` 지정하면 receive count가 5를 넘은 메시지는 자동으로 DLQ로 이동. 정상 메시지는 계속 처리, 실패 메시지는 격리. 나중에 DLQ Redrive 기능(2021 출시)으로 원본 큐로 한 번에 재전송 가능. (A) 동시성 낮추는 건 처리 속도만 떨어뜨림. (B) Visibility는 처리 시간 문제, 횟수 문제 아님. (D) SNS는 무관.

---

**문제 9.** 한 회사가 EventBridge로 SaaS·AWS·내부 이벤트를 모두 받아 라우팅하는데, **장애 시 모든 이벤트를 검사해서 재처리해야 한다**. 가장 적합한 백업 전략은?

A) 모든 rule에 SQS DLQ를 붙여 전달 실패 이벤트를 백업하고 장애 시 큐에서 재드라이브
B) EventBridge Archive + Replay 기능
C) bus의 모든 이벤트를 Kinesis Data Streams로 복제하고 보관 기간 동안 재처리 시 다시 읽기
D) Firehose 타겟으로 모든 이벤트를 S3에 적재하고 장애 시 Lambda로 다시 PutEvents 발행

**정답: B**

해설: EventBridge Archive는 bus에 들어오는 이벤트를 자동으로 보관(365일까지)하고, Replay 기능으로 특정 시간 범위의 이벤트를 다시 같은 bus에 발행할 수 있다. 즉 archive가 곧 "재처리 가능한 백업". (A) DLQ는 처리 실패 메시지 격리이지 모든 이벤트 백업이 아님. (C) Kinesis로 별도 파이프라인 만드는 건 운영 부담 큼 (이미 EventBridge 쓰는 중). (D) S3 적재는 가능하지만 재처리 시 다시 EventBridge로 발행하는 로직을 직접 구현해야 함. Archive + Replay는 매니지드.

---

**문제 10.** 한 회사가 글로벌하게 분산된 모바일 앱에서 푸시 알림을 보내야 한다 (iOS APNs, Android FCM, 웹 푸시). 최소한의 운영 부담으로 어떻게?

A) Lambda가 APNs·FCM·웹 푸시 SDK를 각각 호출하고 인증서·토큰 만료를 직접 관리
B) SNS Mobile Push (Platform Application + Endpoint)
C) EventBridge rule이 디바이스 플랫폼별로 매칭해 각 푸시 서비스 API 타겟으로 라우팅
D) Kinesis Data Streams → Lambda 소비자가 디바이스 토큰을 읽어 각 푸시 채널로 전송

**정답: B**

해설: SNS Mobile Push는 이런 시나리오를 위해 설계된 매니지드 서비스. APNs, FCM, ADM(Amazon), Baidu, MPNS, WNS 등의 푸시 서비스를 Platform Application 추상화로 통합하고, 디바이스 토큰을 Endpoint로 등록해서 SNS publish 한 번이면 적절한 채널로 라우팅된다. 인증서 관리·재시도·전송 보고서까지 매니지드. (A) Lambda 직접은 OS별 SDK·인증·만료 토큰 처리를 모두 직접 구현. (C)(D) 모두 푸시 서비스 통합이 자체 솔루션이 아니므로 추가 코드 필요.

---

**문제 11.** 한 회사가 SQS 큐의 메시지 수에 따라 EC2 워커 수를 자동 조정하려고 한다. 가장 적절한 메트릭과 패턴은?

A) 워커 EC2의 평균 CPU Utilization을 기준으로 한 Target Tracking 정책으로 인스턴스 수 조정
B) `ApproximateNumberOfMessagesVisible / 인스턴스 수 = Backlog per Instance` Custom Metric + Target Tracking
C) 트래픽 피크 시간대를 미리 정의한 Scheduled Scaling으로 인스턴스 수를 예약 증감
D) CloudFront의 Requests/CacheHitRate 메트릭을 기준으로 워커 ASG를 스케일

**정답: B**

해설: AWS 공식 권장 패턴(Backlog per Instance scaling). 큐 길이 자체로 스케일하면 워커가 늘면서 큐가 비는 시점에 다 죽이지 못해 출렁임이 생긴다. "*인스턴스당 처리해야 할 backlog*"를 메트릭으로 쓰면 인스턴스 수가 변할 때 자연스럽게 안정 상태를 찾는다. CloudWatch에 custom metric 푸시 + ASG Target Tracking. (A) 큐 워커는 CPU가 idle인 채로 메시지를 기다리는 경우 많아 CPU 기반은 부적합. (C) 예측 가능한 주기일 때만 유효. (D) 무관.

---

**문제 12.** 한 회사가 메시지 크기 600KB의 PDF 데이터를 SQS로 보내야 한다. SQS 메시지 최대 크기는 256KB. 가장 적절한 방법은?

A) 600KB PDF를 256KB 미만 3개 청크로 잘라 sequence 번호와 함께 보내고 소비자가 순서대로 조립
B) S3에 PDF 저장 + SQS 메시지에는 S3 ARN/Key만 (Extended Client / 직접 구현)
C) FIFO 큐로 변경해 MessageGroupId로 청크 순서를 보장하며 대용량 본문 전송
D) 메시지당 1MB까지 허용하는 Kinesis Data Streams로 PDF 레코드를 직접 전송

**정답: B**

해설: SQS Extended Client Library가 정확히 이 패턴을 위해 제공된다 — large payload는 S3에 자동 저장하고 SQS에는 reference만 보낸다. 직접 구현도 가능. (A) 메시지 분할/재조립은 순서·중복·실패 복구가 복잡해지고, FIFO조차도 boundaries 보장이 안 됨. (C) FIFO도 256KB 한도는 동일. (D) Kinesis가 1MB까지 가능하지만 큐 모델이 아닌 스트림 모델이라 워크로드 미스매치. 그리고 "PDF를 큐로 통과" 자체가 안티패턴 — S3가 본문 저장에 최적이고 SQS는 reference만 흘리는 게 cloud-native 패턴.

---
