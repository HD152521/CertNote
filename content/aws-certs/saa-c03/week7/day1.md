# Day 1 - SQS: 메시지 큐가 분산 시스템에 답하는 방식

분산 시스템을 처음 설계할 때 가장 흔하게 마주치는 함정은 "API가 동기적으로 다른 API를 호출하면 된다"는 단순함의 유혹이다. 주문 API가 결제 API를 부르고, 결제 API가 재고 API를 부르고, 재고 API가 배송 API를 부른다. 코드는 깔끔하지만 결제 API가 100ms 느려지는 순간 주문 API의 응답 시간도 100ms 늘어나고, 재고 API가 다운되면 주문 자체가 안 받아진다. 시간적·공간적 결합(temporal/spatial coupling)이 시스템 전체의 가용성을 곱셈으로 떨어뜨린다.

메시지 큐는 이 곱셈을 덧셈으로 바꾸기 위한 가장 오래된 도구다. 1980년대 IBM MQSeries부터 1990년대 RabbitMQ의 전신인 AMQP 표준, 2000년대 ActiveMQ를 거쳐 2006년 7월 AWS가 EC2와 S3보다 먼저 출시한 첫 번째 서비스 중 하나가 바로 **SQS(Simple Queue Service)**다. 이 글에서는 SQS가 어떤 분산 시스템 트레이드오프를 명시적으로 선택했는지, 그리고 그 선택이 시험과 실무 양쪽에서 어떤 시나리오를 만드는지를 본다.

## SQS의 메시지 모델: 두 가지 큐와 분산 시스템의 trade-off

SQS는 표준(Standard)과 FIFO 두 가지 큐 타입을 제공하는데, 이 둘의 차이는 단순한 "옵션 두 개"가 아니라 분산 시스템 이론에서 가장 유명한 trade-off의 양 끝단을 그대로 노출한 결과다. 표준 큐는 **at-least-once delivery + best-effort ordering**을 선택한 대신 **무제한 처리량**을 얻었고, FIFO 큐는 **exactly-once processing + strict ordering**을 선택한 대신 **per-API 처리량 제한**을 받아들였다.

| 항목 | 표준(Standard) | FIFO |
|------|---------------|------|
| 처리량 | 무제한 (region별 quota만) | 300 msg/s (배치 시 3,000), High Throughput 모드 시 9,000-70,000 |
| 순서 | Best-effort (보통 순서지만 보장 X) | **MessageGroupId 단위로 엄격 FIFO** |
| 중복 | At-least-once (가끔 중복) | Exactly-once-processing (5분 dedup window) |
| 큐 이름 | 자유 | `.fifo` 접미사 필수 |
| 가격 | 저렴 | 약 15-20% 비쌈 |
| 출시 | 2006년 7월 | 2016년 11월 |

표준 큐가 2006년부터 10년이나 단독으로 존재했다는 사실이 중요하다. AWS는 처음부터 "정확한 한 번 + 순서 보장"을 약속할 수 없다는 걸 알았다. 분산 큐 시스템에서 exactly-once는 본질적으로 **two generals problem**의 변형이고, 컨슈머가 메시지를 처리하고 나서 ack를 보내기 전에 죽으면 큐는 그 메시지가 처리됐는지 알 수 없기 때문이다. 그래서 표준 큐는 "처리됐을지 모르니 한 번 더 보낸다"는 at-least-once를 택했고, 클라이언트에게 **멱등성(idempotency)을 구현할 책임**을 떠넘겼다.

> 💡 **관련 이론**: at-most-once / at-least-once / exactly-once 세 가지 delivery semantics는 분산 메시징의 고전이다. Kafka 창시자 Jay Kreps의 2017년 글 "Exactly-once Support in Apache Kafka"에서 명확히 정리됐는데, 핵심은 "exactly-once **delivery**는 불가능하지만 exactly-once **processing**은 producer idempotency + transactional write + consumer offset commit의 조합으로 가능하다"는 것이다. SQS FIFO는 이 중 producer-side dedup(`MessageDeduplicationId` 5분 window)과 consumer-side ordering(MessageGroupId)을 제공하지만, "처리 자체의 멱등성"은 여전히 애플리케이션의 책임이다.

> 🔍 **더 깊이**: FIFO 큐의 300 msg/s 제한은 어디서 온 숫자일까. SQS 내부적으로 FIFO는 MessageGroupId를 키로 메시지를 **단일 파티션에 직렬화**한다. 한 그룹 안의 메시지는 반드시 순서대로 처리돼야 하므로 동시 처리가 불가능하고, 따라서 그룹 단위 처리량이 단일 파티션의 한계에 묶인다. 2021년 출시된 **High Throughput FIFO**는 이 제약을 우회하기 위해 "그룹 자체를 여러 파티션에 분산"하는 방식으로 동작하고, 그래서 그룹 수가 충분히 많아야 효과가 나온다(소수의 그룹으로 활성화하면 효과 미미). region에 따라 9,000 ~ 70,000 msg/s까지 가능하다.

> 📚 **사례**: 2021년 12월 7일, AWS us-east-1에서 약 7시간 동안 내부 네트워크 장애가 발생해 SQS·DynamoDB·Lambda 등 광범위한 서비스가 영향을 받았다. 이때 많은 회사들이 깨달은 점은 "SQS는 region-resilient하지만 SQS endpoint 자체가 us-east-1 control plane에 의존한다"는 것이었다. Robinhood, Disney+, Slack, Coinbase가 모두 다운됐고, 이 사건 이후 멀티 리전 SQS 패턴(active-active queue + Route 53 health check)이 본격적으로 논의되기 시작했다. [AWS 공식 회고](https://aws.amazon.com/message/12721/).

## 가시성 타임아웃: SQS가 "한 번 이상" 뒤에 숨긴 메커니즘

SQS의 가시성 타임아웃(Visibility Timeout)을 단순히 "메시지를 다른 컨슈머에게 숨기는 시간"으로만 이해하면, 시험의 절반과 운영 사고의 80%를 놓친다. 이건 SQS가 **분산 lock 없이 한 메시지를 한 컨슈머에게만 보내는** 방식 자체다.

컨슈머가 `ReceiveMessage` API를 호출하면 SQS는 메시지를 주면서 동시에 그 메시지에 가시성 타임아웃(기본 30초, 최대 12시간) 동안 "invisible" 플래그를 단다. 그동안 같은 메시지를 다른 `ReceiveMessage` 호출자에게 주지 않는다. 컨슈머가 처리를 끝내고 `DeleteMessage`를 부르면 메시지는 사라지고, 못 부르고 타임아웃이 지나면 다시 visible로 돌아와 다른 컨슈머가 받는다. 즉 가시성 타임아웃은 **leasing(임대) 모델**이지 lock이 아니다.

```
[ Visibility Timeout 타임라인 ]

t=0   : Worker-A가 ReceiveMessage → 메시지 받음, invisible 시작 (30s)
t=10  : Worker-A 처리 중...
t=30  : Worker-A가 아직 DeleteMessage 못 보냄 → 메시지 visible 복귀
t=31  : Worker-B가 ReceiveMessage → 같은 메시지 또 받음
t=45  : Worker-A 처리 완료, DeleteMessage 시도
        → 하지만 이미 Worker-B도 처리 중! (이중 처리)
        → DB에 중복 결제 / 중복 메일 발송
```

이 시나리오가 시험에서 "Lambda 처리 60초인데 visibility 30초면 어떻게 되나"로 단골 출제되는 이유다. 답은 항상 "중복 처리"이고, 해결책은 세 가지 중 하나다. ① 가시성 타임아웃을 처리 시간보다 길게 설정. ② 처리 중간에 `ChangeMessageVisibility`로 동적 연장(긴 작업은 heartbeat 패턴). ③ 컨슈머 측 멱등성 구현(예: 메시지 ID를 DB에 unique key로 기록).

> ⚠️ **함정**: "가시성 타임아웃을 길게(예: 12시간) 잡으면 안전하다"고 생각하기 쉬운데 반대 함정이 있다. 컨슈머가 처리 도중 죽었을 때 메시지가 12시간 동안 "보이지 않게" 잠겨버리므로 retry가 12시간 뒤에야 일어난다. 일반적으로 "예상 처리 시간 × 2-3배" 정도가 적정선이고, 그 이상 걸릴 가능성이 있으면 차라리 `ChangeMessageVisibility`로 동적 연장하는 패턴이 안전하다.

> 🔍 **더 깊이**: SQS는 내부적으로 메시지를 여러 서버에 분산 저장하는데, 가시성 타임아웃 정보 역시 분산된다. 그래서 매우 드물게 "분산 시스템의 일시적 비일관성"으로 인해 가시성 타임아웃이 만료되지 않았는데도 다른 컨슈머가 같은 메시지를 받는 경우가 있다(공식 문서 명시). 이게 SQS가 표준 큐를 at-least-once로 분류하는 이유 중 하나다. FIFO 큐는 이 문제를 강한 일관성 메커니즘으로 해결하지만 그 대가로 처리량을 잃었다.

## DLQ와 maxReceiveCount: 실패를 격리하는 방식

가시성 타임아웃이 만료될 때마다 메시지는 다시 큐로 돌아와 재시도된다. 그런데 메시지 자체가 망가져서(poison message) 어떤 컨슈머도 처리할 수 없으면 이 재시도가 영원히 계속된다. 컨슈머는 매번 그 메시지에 막혀 다른 메시지 처리도 못 하게 되고, 결국 큐 전체가 정체한다. 이게 1990년대 RabbitMQ 시절부터 알려진 **poison message** 문제다.

해결책이 **DLQ(Dead Letter Queue) + maxReceiveCount** 조합이다. SQS는 각 메시지의 receive count(누가 몇 번 받았는지)를 추적하고, 설정된 maxReceiveCount(보통 3-5)를 초과하면 그 메시지를 원본 큐에서 빼서 DLQ로 옮긴다. DLQ는 별도의 SQS 큐일 뿐이지만, 운영자는 거기에 쌓인 메시지를 보고 무엇이 망가졌는지 분석할 수 있다. AWS는 2021년 **Redrive API**를 출시해서 DLQ의 메시지를 콘솔/CLI로 원본 큐로 다시 보내는 기능을 추가했다(이전엔 직접 코드를 짜야 했다).

DLQ 설계의 비대칭 규칙: 표준 큐의 DLQ는 표준이어야 하고, FIFO 큐의 DLQ는 FIFO여야 한다. 이건 메시지 ID 형식이 다르기 때문이고, 시험에 "FIFO 큐의 DLQ로 표준 큐를 쓸 수 있나"가 함정으로 나온다.

> 📚 **사례**: 2020년 Robinhood가 GameStop 사태 직후 결제 처리 큐가 비정상 폭증해 DLQ가 가득 차는 사고를 겪었다. 원인은 한 외부 결제 게이트웨이가 일부 거래에 대해 항상 500을 반환했고, 컨슈머가 재시도하며 maxReceiveCount를 다 소진하자 모든 거래가 DLQ로 빠졌다. 사후 분석에서 "DLQ에 메시지가 일정 수치 이상 쌓이면 CloudWatch Alarm + PagerDuty"를 빼먹은 게 직접적 원인이었다. 그 이후 회사 표준 SRE 체크리스트에 "모든 큐에 DLQ가 있고, 모든 DLQ에 알람이 있는가"가 들어갔다.

> 💡 **관련 이론**: Circuit Breaker 패턴(Netflix Hystrix, 2012)과 DLQ는 다른 레벨의 실패 격리다. Circuit Breaker는 "다운스트림이 망가졌으니 잠시 호출을 끊자"는 클라이언트 쪽 보호이고, DLQ는 "이미 받은 메시지가 망가졌으니 격리하자"는 큐 쪽 보호다. 잘 설계된 시스템은 두 가지를 다 갖는다 — Circuit Breaker로 외부 의존성 장애를 빠르게 차단하고, 그래도 흘러들어온 poison message는 DLQ로 격리.

## Long Polling, 배치, KMS — SQS의 비용·성능·보안 옵션들

표준 SQS API 호출은 1.5M까지는 무료지만 그 이상은 요청 100만 건당 $0.40다. 컨슈머가 `ReceiveMessage`를 1초에 한 번씩 부르면 한 컨슈머만으로도 월 260만 호출이 나오고, 100개 컨슈머면 2.6억 호출이 되어 SQS 비용이 메시지 비용보다 더 커지는 역설이 생긴다. AWS는 이걸 막기 위해 **Long Polling**을 만들었다.

Long Polling은 `ReceiveMessage` 호출 시 `WaitTimeSeconds`(0-20초)를 지정하면, SQS가 그 시간 동안 메시지가 들어올 때까지 응답을 보류한다. 빈 큐에서 100ms마다 폴링하던 짓이 사라지고, 메시지가 들어오는 순간 즉시 응답이 오므로 latency도 줄어든다. AWS 공식 권장은 항상 20초 long polling이고, short polling은 "1초 이내 응답이 꼭 필요한 특수 케이스"에만 쓴다.

배치 API(`SendMessageBatch`, `DeleteMessageBatch`)는 한 번에 10개 메시지를 처리하는 옵션이다. 256KB 페이로드 제한은 배치 전체에 적용되므로 메시지가 작을수록 효과가 크다. 10배 호출이 1배가 되니 비용이 1/10로 줄어든다.

256KB라는 메시지 크기 제한은 처음 보면 작아 보이지만, "메시지 큐는 큰 데이터를 옮기는 도구가 아니라 작은 시그널을 전달하는 도구"라는 AWS의 의도가 담겨 있다. 실제로 큰 파일을 보내야 하면 **SQS Extended Client Library**를 쓴다. 클라이언트가 페이로드를 S3에 업로드하고 SQS 메시지에는 S3 객체 reference만 넣는 패턴이다. 이걸 직접 구현해도 되지만 라이브러리가 download/cleanup까지 다 해준다.

> 🔍 **더 깊이**: Extended Client 패턴은 큐뿐 아니라 Kafka 진영에도 같은 이름(KIP-405)으로 존재하는 표준 기법이다. 메시징 시스템의 비용 모델이 "메시지 수 + 메시지 크기"인 반면 객체 스토리지(S3)는 GB·요청당 매우 저렴하므로, 큰 페이로드를 객체 스토리지로 우회시키는 게 거의 항상 경제적이다. 다만 트레이드오프가 있다: 컨슈머가 S3 GET까지 해야 하므로 latency가 늘고, S3 권한과 SQS 권한 두 가지를 IAM에서 관리해야 한다.

암호화는 SSE-SQS(AWS 관리 키, 2019년 출시)와 SSE-KMS(고객 관리 KMS 키) 두 옵션이 있다. SSE-KMS를 쓰면 키 사용 권한이 IAM 정책으로 통제되므로 "특정 그룹만 큐 메시지를 복호화"하는 식의 세밀한 보안이 가능하지만, KMS GenerateDataKey 호출이 메시지마다 일어나면 KMS API 한도와 비용을 잡아먹는다. SQS는 이를 완화하기 위해 **data key reuse** 옵션(기본 5분, 최대 24시간)을 제공한다.

```
[ SQS + SNS + Lambda 디커플링 패턴 ]

API Gateway
   │
   ▼
Lambda (생산자)
   │ SendMessage
   ▼
SQS Standard Queue ── Long Polling 20s
   │ Event Source Mapping (batch=10)
   ▼
Lambda (소비자, 멱등성 보장)
   │
   ├─ DynamoDB write
   ├─ SES email
   └─ 실패 → 재시도 → maxReceiveCount 초과
                       ▼
                    DLQ (CloudWatch Alarm)
                       ▼
                    Redrive API로 분석 후 재처리
```

## ASG와 Lambda — 컨슈머를 스케일하는 두 가지 모델

SQS의 큐 길이는 시스템 부하의 가장 직접적인 신호다. CloudWatch는 `ApproximateNumberOfMessagesVisible`을 1분 단위로 자동 발행하고, 이걸 보고 컨슈머 수를 조절하는 게 SQS 기반 워크로드의 표준 패턴이다.

EC2 Auto Scaling Group을 쓸 때는 **Backlog Per Instance** 메트릭을 만들어 쓰는 게 가장 정석이다. 단순히 "큐 길이 1000 이상이면 스케일아웃"으로 잡으면 인스턴스 수와 무관하게 매번 같은 임계값에서 스케일하는 문제가 있다. 대신 "메시지 수 ÷ 현재 인스턴스 수 = 인스턴스당 백로그" 같은 custom metric을 만들고 "인스턴스당 100개 이상이면 추가"라는 목표 추적(target tracking) 정책을 쓴다. 이 패턴은 AWS Auto Scaling 공식 백서의 권장 사항이다.

Lambda는 EC2와 모델이 완전히 다르다. Lambda + SQS는 **Event Source Mapping**(ESM)이라는 SQS poller가 Lambda 서비스 내부에서 동작하며 자동으로 컨슈머 수를 늘린다. 큐가 차면 ESM이 동시 실행 Lambda 수를 점진적으로 늘리는데(처음엔 5개, 1분마다 60개씩 추가, 표준 큐 기준 최대 1,000), 이걸 모르고 "Lambda는 무한히 스케일하니 안전하다"고 가정하면 큰 스파이크에서 처리 지연이 생긴다. 2022년 11월 출시된 **Maximum Concurrency** 옵션으로 ESM 자체에 Lambda 동시성 상한을 걸 수 있게 됐는데, 다운스트림(예: RDS connection pool)을 보호하는 데 필수다.

> 💡 **관련 이론**: Little's Law(L = λW)는 큐잉 이론의 기본 법칙으로, "큐의 평균 길이 L = 도착률 λ × 평균 대기시간 W"이다. SQS 운영에서 이 식이 의미하는 바는 "큐 길이를 줄이려면 도착률을 줄이거나(rate limit) 처리시간을 줄이거나(컨슈머 추가) 둘 중 하나"라는 것이다. ASG의 target tracking은 사실상 W를 일정하게 유지하기 위해 컨슈머 수를 조절하는 동작이다.

> 🔍 **더 깊이**: Lambda + SQS의 ESM은 2020년 11월에 출시된 **Batch Window**(0-5분)와 **Partial Batch Response** 기능이 운영성을 크게 바꿨다. Batch Window는 "메시지가 모일 때까지 기다린 뒤 배치 처리"를 가능하게 해서 비용을 낮춘다(짧은 호출 여러 번 → 긴 호출 한 번). Partial Batch Response는 배치 10개 중 일부만 실패했을 때 실패한 메시지만 가시성 복원하고 성공한 건 자동 삭제하는 기능으로, 그 전엔 배치 안에 1개라도 실패하면 전체 10개가 재시도돼 중복 처리가 심했다.

## 다른 메시징 시스템과의 비교

SQS의 설계를 다른 메시징 시스템과 나란히 놓으면 그 trade-off가 더 선명해진다.

| 시스템 | 모델 | 보존 | 순서 | 처리량 | 운영 부담 |
|--------|------|------|------|--------|----------|
| **SQS Standard** | 큐 (소비 후 삭제) | 1분 ~ 14일 | Best-effort | 무제한 | 매우 낮음 (서버리스) |
| **SQS FIFO** | 큐 + 순서 | 1분 ~ 14일 | Strict per group | 300 (HT FIFO 70K) | 낮음 |
| **Kafka / MSK** | 로그 (보존 후 재생) | 무제한 (스토리지에 따라) | Strict per partition | 매우 높음 | 높음 (브로커 운영) |
| **Kinesis Data Streams** | 로그 | 24h ~ 365일 | Per shard | 샤드당 1MB/s | 중간 (샤드 관리) |
| **RabbitMQ** | 큐 + exchange | 디스크 한도 | Per queue | 높음 | 매우 높음 (자체 운영) |
| **Google Pub/Sub** | 토픽+구독 (Pull/Push) | 7일 | 옵션 | 무제한 | 낮음 |
| **Azure Service Bus** | 큐 + 토픽 | 14일 | Session으로 가능 | 무제한 | 낮음 |

SQS의 강점은 **운영 부담이 거의 0**이라는 점이다. 브로커도 없고 노드도 없고 클러스터도 없다. 단점은 "한 번 소비되면 사라진다"는 큐 모델이므로 같은 메시지를 여러 시스템이 독립적으로 처리해야 하면 SNS fanout(다음 글) 또는 Kinesis(Day 4)로 가야 한다.

> 📚 **사례**: 2018년 New Relic이 자체 Kafka 클러스터를 운영하다가 일부 워크로드를 SQS로 옮기는 과정을 블로그에 공개했다. 핵심 교훈은 "Kafka는 처리량과 보존이 필요할 때 가치 있지만, 단순 디커플링에는 SQS가 운영 비용이 1/10"이었다. 모든 메시징 워크로드를 Kafka로 통일하는 게 아니라 워크로드 특성에 맞게 골라 쓰는 게 정답이라는 점이 이 시기부터 업계 컨센서스가 됐다.

## CLI로 직접 만져보기

```bash
# FIFO 큐 + DLQ 세트 생성
aws sqs create-queue --queue-name payment.fifo \
  --attributes 'FifoQueue=true,ContentBasedDeduplication=true,VisibilityTimeout=60,MessageRetentionPeriod=345600,KmsMasterKeyId=alias/aws/sqs'

aws sqs create-queue --queue-name payment-dlq.fifo \
  --attributes 'FifoQueue=true'

# DLQ 연결 (maxReceiveCount=5)
aws sqs set-queue-attributes --queue-url $URL \
  --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:ap-northeast-2:123456789012:payment-dlq.fifo\",\"maxReceiveCount\":\"5\"}"}'

# MessageGroupId로 순서 보장 (같은 고객 = 같은 그룹)
aws sqs send-message --queue-url $URL \
  --message-body '{"orderId":"o-1001","amount":12000}' \
  --message-group-id "customer-A"

# Long Polling으로 비용 최소화
aws sqs receive-message --queue-url $URL \
  --wait-time-seconds 20 \
  --max-number-of-messages 10 \
  --visibility-timeout 120

# CloudWatch에서 백로그 메트릭 확인
aws cloudwatch get-metric-statistics --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=payment.fifo \
  --start-time 2026-05-27T00:00:00Z --end-time 2026-05-27T01:00:00Z \
  --period 60 --statistics Average
```

## 정리하며

SQS는 분산 시스템의 가장 오래된 문제 — "두 컴포넌트를 시간적으로 분리하면서도 신뢰성 있게 메시지를 주고받기" — 에 대한 AWS의 답이다. 표준 큐는 무제한 처리량과 at-least-once를, FIFO 큐는 엄격한 순서와 exactly-once-processing을 택했다. 가시성 타임아웃은 분산 lock 없이 "한 메시지 = 한 컨슈머"를 보장하는 leasing 메커니즘이고, DLQ는 poison message 격리, Long Polling은 비용·지연 최적화, Extended Client는 256KB 한계를 우회하는 표준 패턴이다.

다음 글에서는 SQS가 답하지 못하는 "같은 이벤트를 N개 컨슈머가 각자 처리"라는 시나리오에 대한 답, SNS와 fanout 패턴을 본다. SQS + SNS 조합은 AWS에서 가장 자주 보이는 디커플링 아키텍처이고, 이 둘의 분업을 이해하면 EventBridge와 Kinesis로의 확장도 자연스럽게 따라온다.

---

## 📝 연습 문제

**문제 1.** 한 결제 서비스가 "같은 고객의 결제는 정확히 한 번, 발생 순서대로 처리"되어야 한다. 처리량은 고객당 초당 수십 건 수준이다. 가장 적합한 SQS 설정은?

A) Standard SQS + 클라이언트 멱등성 키
B) FIFO SQS + MessageGroupId = customerId + ContentBasedDeduplication
C) Standard SQS + 가시성 타임아웃을 매우 크게 설정
D) FIFO SQS + 모든 메시지에 같은 MessageGroupId

**정답: B**
해설: "정확히 한 번 + 순서"는 FIFO의 정의이고, 고객 단위 순서가 필요하므로 MessageGroupId를 customerId로 잡아야 고객 간엔 병렬, 한 고객 안에선 직렬이 된다. ContentBasedDeduplication을 켜면 SHA-256으로 본문 해시를 dedup ID로 자동 사용해 5분 window 내 같은 메시지 중복 발행을 막는다. A는 "정확히 한 번"이라는 요구를 SQS가 아닌 애플리케이션에 떠넘기고 순서도 보장 안 한다. C는 가시성 타임아웃과 무관한 문제. D는 "모든 메시지가 한 그룹" = 모든 처리가 단일 파티션에 직렬화돼 처리량이 300 msg/s에 묶이고 고객 간 병렬성도 잃는다 — 흔한 실수.

---

**문제 2.** Lambda가 SQS 메시지를 처리하는 데 평균 80초가 걸린다. 큐의 가시성 타임아웃은 기본값(30초). 운영 중 어떤 현상이 관측될까?

A) 80초가 지나면 Lambda가 정상 완료되고 메시지는 자동 삭제된다
B) 같은 메시지를 여러 Lambda 인스턴스가 받아 중복 처리되고, DB에 중복 쓰기/중복 결제가 발생할 수 있다
C) 메시지가 영구히 손실된다
D) maxReceiveCount와 무관하게 즉시 DLQ로 이동한다

**정답: B**
해설: 가시성 타임아웃이 처리 시간보다 짧으면 컨슈머가 DeleteMessage를 부르기 전에 메시지가 visible로 돌아와 다른 컨슈머가 받게 된다. 이게 SQS at-least-once의 직접적 귀결이고 운영에서 가장 흔한 버그다. 해결책은 ① 가시성 타임아웃을 처리 시간의 2-3배로 늘리거나 ② 처리 중 `ChangeMessageVisibility`로 heartbeat 연장 ③ 컨슈머 측 멱등성(메시지 ID를 unique key로 기록) 중 하나 이상이다. 이상적으로는 ①+③ 조합이 안전하다. A는 가시성 타임아웃의 정의를 잘못 이해한 것, C는 메시지 보존 기간(기본 4일) 안에는 손실되지 않음, D는 maxReceiveCount를 초과해야 DLQ로 이동한다.

---

**문제 3.** 한 회사의 SQS 컨슈머가 외부 결제 API 호출 실패로 인해 일부 메시지를 5번 이상 처리 시도했고, 그 메시지들이 무한 재시도되어 큐가 정체됐다. 이 문제를 가장 효과적으로 해결하는 방법은?

A) maxReceiveCount=3 + DLQ 설정 + DLQ 메시지 수에 대한 CloudWatch Alarm
B) Visibility Timeout을 12시간으로 늘려 재시도 빈도를 줄임
C) SQS Standard를 FIFO로 변경
D) Lambda 동시성을 무제한으로 설정

**정답: A**
해설: Poison message 문제의 표준 해결책은 DLQ + maxReceiveCount다. 3번 실패하면 자동으로 DLQ로 격리되어 큐 정체를 막고, 운영자는 DLQ에서 원인을 분석한 뒤 Redrive API로 재처리할 수 있다. DLQ에 메시지가 쌓이는 것 자체가 비정상이므로 반드시 CloudWatch Alarm으로 알림을 받아야 하는데, 이게 빠진 사고가 2020년 Robinhood 사례. B는 문제를 12시간 늦출 뿐 해결하지 못함. C는 메시지 모델 변경이지 실패 격리와 무관. D는 오히려 외부 API에 더 큰 부하를 주어 상황을 악화시킨다.

---

**문제 4.** 비용 절감을 위해 SQS의 ReceiveMessage API 호출 수를 최소화하면서 메시지 도착 시 빠르게 처리하고 싶다. 가장 적절한 설정은?

A) ReceiveMessage를 100ms마다 짧게 폴링 (short polling)
B) WaitTimeSeconds=20으로 long polling, MaxNumberOfMessages=10 배치
C) Standard 큐를 FIFO로 변경
D) CloudWatch Events로 메시지 도착 트리거

**정답: B**
해설: Long polling(최대 20초)은 빈 응답 비용을 거의 0으로 만들고, 메시지가 들어오는 순간 즉시 응답이 오므로 latency도 좋다. AWS 공식 권장이고 거의 모든 시나리오에서 정답이다. 배치 10개를 함께 받으면 호출당 비용이 1/10이 된다. A는 빈 폴링이 비용 폭탄. C는 메시지 모델 문제이지 폴링 비용과 무관. D는 SQS 메시지 도착을 트리거로 쓰는 직접적인 EventBridge 통합은 없다(Lambda Event Source Mapping이 내부적으로 long polling을 한다).

---

**문제 5.** 한 시스템이 평균 500KB의 PDF 첨부 파일을 큐로 전달해야 한다. SQS의 256KB 제한을 어떻게 해결하는가?

A) 메시지를 256KB 청크로 분할해 여러 메시지로 전송
B) S3에 파일 업로드 후 SQS 메시지에는 S3 객체 참조만 포함 (Extended Client Library)
C) FIFO 큐로 변경하면 1MB까지 가능
D) Kinesis Data Streams로 전환

**정답: B**
해설: SQS Extended Client Library는 페이로드를 자동으로 S3에 업로드하고 메시지에는 S3 reference만 넣는다. 컨슈머 측 라이브러리가 자동으로 S3에서 다운로드하고 처리 후 cleanup까지 한다. Kafka 진영의 KIP-405와 같은 표준 패턴이다. A는 메시지 순서·일관성 보장이 깨지고 컨슈머 측 재조립이 복잡하다. C는 잘못된 정보로, FIFO도 256KB는 동일. D는 Kinesis도 레코드당 1MB 제한이 있고 SQS의 큐 모델을 대체하지도 못한다. 다만 Kinesis로 옮기는 게 옳은 시나리오(여러 컨슈머가 같은 데이터 독립 처리)도 있는데 그건 Day 4에서 다룬다.

---

**문제 6.** EC2 Auto Scaling Group으로 SQS 컨슈머를 운영 중이다. 가장 권장되는 스케일링 메트릭은?

A) CPU 사용률 70% 이상
B) 큐 길이가 1,000 이상이면 무조건 +1 인스턴스
C) ApproximateNumberOfMessagesVisible ÷ InService 인스턴스 수 (Backlog per Instance) 목표값
D) 5분 단위 고정 스케줄

**정답: C**
해설: 단순 큐 길이 기반(B)은 인스턴스가 1대든 100대든 같은 임계값에서 스케일하는 비효율이 있다. CPU 기반(A)은 SQS 워커가 I/O bound일 때 CPU가 낮아도 백로그가 쌓이는 문제가 있다. Backlog per Instance(인스턴스당 처리해야 할 메시지 수)를 목표 추적(target tracking) 정책으로 잡으면 부하에 비례해 인스턴스 수가 자동으로 조절된다. AWS 공식 백서의 권장 패턴이다. D는 트래픽 변동에 대응 못 함. Lambda 컨슈머라면 자동이지만 EC2/ECS는 직접 custom metric을 만들어야 한다.

---

**문제 7.** 한 회사가 한 SNS 토픽에서 SQS 표준 큐로 메시지를 받고 있는데, 일부 메시지가 1분 내 두 번 도착하는 현상을 관측했다. 가장 가능성 높은 원인과 해결책 조합은?

A) SNS 버그 / AWS 지원에 문의
B) SQS Standard의 at-least-once 특성 / 컨슈머 측 메시지 ID 기반 멱등성 구현
C) 네트워크 문제 / VPC Endpoint 설정
D) DLQ 잘못 설정 / DLQ 제거

**정답: B**
해설: SQS Standard는 정의상 at-least-once이고, SNS → SQS 통합에서도 이 특성은 그대로 유지된다. 같은 메시지가 두 번 도착하는 것은 버그가 아니라 명세된 동작이다. 해결책은 컨슈머가 메시지 ID(또는 비즈니스 idempotency key)를 받아 DynamoDB conditional write 같은 메커니즘으로 중복 처리를 막는 것이다. 만약 두 번 처리가 절대 안 되면 SNS FIFO + SQS FIFO 조합으로 가야 한다(다만 처리량 제약). A는 정상 동작을 버그로 오인. C는 무관. D는 DLQ와 무관한 문제.

---

해설 보강: 이번 글에서 본 SQS 패턴은 분산 시스템의 fundamental trade-off(처리량 vs 순서, at-least-once vs exactly-once)를 AWS가 어떻게 두 가지 큐로 분리해 노출했는지의 사례 연구다. SAA 시험에서는 "키워드 → 큐 타입 매핑"으로 빠르게 풀 수 있지만, 실무에서 가장 자주 마주치는 사고는 ① 가시성 타임아웃 < 처리 시간 → 중복 처리, ② DLQ 알람 누락 → 큐 정체, ③ FIFO 모든 메시지 단일 그룹 → 처리량 병목 셋이다. 이 셋을 코드 리뷰 체크리스트로 만들어두면 운영 사고의 절반을 미리 막을 수 있다.
