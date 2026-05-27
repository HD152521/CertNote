# Day 33 - EventBridge: 이벤트 라우팅 허브가 SaaS·AWS·내부 앱을 한 곳에 모으는 방식

Day 1과 Day 2에서 본 SQS와 SNS는 둘 다 "내가 명시적으로 보내는 메시지"를 다룬다. 생산자가 SendMessage·Publish API를 부르고 그게 어디로 가는지를 코드로 정한다. 그런데 현대 클라우드 시스템에서 발생하는 이벤트의 대부분은 그렇지 않다. S3에 파일이 올라가는 순간, EC2 인스턴스가 상태 변경되는 순간, CloudFormation 스택이 배포 실패하는 순간, AWS Health가 region 장애를 알리는 순간 — 이것들은 "내가 명시적으로 보내는" 게 아니라 **AWS 인프라가 발생시키는 사건들**이다. 여기에 Datadog 알람, Zendesk 티켓 생성, Auth0 로그인 실패, GitHub PR merge 같은 SaaS 이벤트까지 합치면, 한 회사가 처리해야 할 이벤트 소스는 수십에서 수백 개다.

이걸 다 SNS 토픽 수백 개로 풀려면 운영이 폭주한다. **EventBridge**(2019년 7월 출시, 원래 2016년의 CloudWatch Events를 리브랜딩·확장한 서비스)는 이 문제에 답한다. AWS·SaaS·custom 이벤트를 **하나의 bus**에 모으고, **rule + pattern**으로 라우팅하고, **target**으로 보낸다. SNS가 "내가 publish한 메시지를 N명에게 fanout"이라면 EventBridge는 "온갖 곳에서 발생하는 사건을 받아서 조건에 맞게 어디로든 보낸다"는 한 차원 높은 추상화다. 이 글은 EventBridge가 왜 그렇게 설계됐고, SNS·SQS·Step Functions과 어떻게 분업하며, Pipes·Scheduler·Schema Registry 같은 신규 기능이 무엇을 푸는지 본다.

## 세 종류의 Bus와 이벤트 라우팅의 기본 모델

EventBridge의 모든 이벤트는 **Bus**라는 논리적 채널을 통해 흐른다. 계정·region 단위로 세 종류의 bus가 존재한다.

| Bus 종류 | 출처 | 사용 사례 |
|---------|------|----------|
| **Default Bus** | 모든 AWS 서비스 이벤트 자동 흐름 (S3·EC2·CodePipeline·Health·GuardDuty 등) | AWS 서비스 자동화 |
| **Partner Bus** | SaaS 통합 (Auth0, Datadog, MongoDB, PagerDuty, Salesforce, Stripe, Zendesk 등 약 40개) | SaaS → AWS 자동화 |
| **Custom Bus** | 내가 PutEvents API로 보내는 애플리케이션 이벤트 | 마이크로서비스 간 통신 |

이벤트는 모두 **CloudEvents 스타일의 JSON envelope**로 표준화된다.

```json
{
  "version": "0",
  "id": "9d7b7b1e-...",
  "detail-type": "Object Created",
  "source": "aws.s3",
  "account": "123456789012",
  "time": "2026-05-27T12:34:56Z",
  "region": "ap-northeast-2",
  "resources": ["arn:aws:s3:::my-bucket/photo.jpg"],
  "detail": {
    "bucket": {"name": "my-bucket"},
    "object": {"key": "photo.jpg", "size": 1024}
  }
}
```

이 표준 envelope이 EventBridge의 진짜 가치다. 모든 이벤트가 같은 모양이라 rule pattern을 일관되게 쓸 수 있고, 신규 소스가 추가돼도 라우팅 로직은 동일하다. 이게 2018년 출시된 **CNCF CloudEvents** 표준과 거의 같은 디자인인 것은 우연이 아니다 — EventBridge는 CloudEvents의 명시적 지원도 추가했다.

> 💡 **관련 이론**: 이벤트 envelope 표준화는 분산 시스템에서 매우 중요한 패턴이다. 1996년 *Enterprise Integration Patterns*의 **Canonical Data Model**과 1990년대 EAI(Enterprise Application Integration) 미들웨어인 TIBCO·webMethods가 같은 아이디어로 출발했다. 핵심은 "N개 시스템이 M개 시스템과 통합되려면 N×M개 어댑터가 필요한데, 가운데 표준 envelope을 두면 N+M개로 줄어든다"는 비용 구조. EventBridge는 이 30년 된 아이디어를 매니지드 클라우드 서비스로 구현했다.

> 🔍 **더 깊이**: EventBridge가 CloudWatch Events에서 분리·리브랜딩된 이유는 "이벤트 라우팅"이 모니터링과 별개의 first-class 서비스가 됐다는 신호다. 2016년 CloudWatch Events는 AWS 서비스 이벤트 위주였지만, 2019년 EventBridge는 SaaS·custom까지 확장됐고 2022년 Pipes·Scheduler가 추가되며 통합 허브로 자리잡았다. CloudWatch Events 시절의 API와 rule도 계속 동작하지만(`events.amazonaws.com` 그대로), 신규 기능은 EventBridge 쪽에만 추가된다.

## Rule과 Event Pattern: 이벤트의 어떤 부분에 반응할지를 선언적으로 쓰기

EventBridge의 모든 라우팅은 **Rule**로 정의된다. Rule은 두 종류 — Event Pattern(매치 기반)과 Schedule(시간 기반)이고, 매치되면 **Target**(rule당 최대 5개)으로 이벤트를 보낸다.

Event Pattern은 JSON으로 작성하는 선언적 매처다. 일치 검사·prefix·anything-but·numeric 비교·exists 등 풍부한 연산자를 지원한다.

```json
// S3에 PDF 파일이 업로드될 때만 매치
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],
  "detail": {
    "bucket": {"name": ["my-uploads"]},
    "object": {"key": [{"suffix": ".pdf"}]}
  }
}

// EC2 인스턴스가 stopped/terminated 상태로 변경
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["stopped", "terminated"]
  }
}

// CodePipeline 실패 + 특정 파이프라인만
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": [{"prefix": "prod-"}]
  }
}

// 결제 금액이 100만원 초과
{
  "source": ["app.payment"],
  "detail-type": ["PaymentCompleted"],
  "detail": {
    "amount": [{"numeric": [">", 1000000]}]
  }
}
```

Target은 무려 30개 이상의 AWS 서비스를 직접 지원한다. Lambda·SQS·SNS·Step Functions·Kinesis Data Streams·Kinesis Data Firehose·ECS Task·CodeBuild·CodePipeline·SSM Run Command·EC2 RebootInstances·SageMaker Pipeline·Redshift Query·EventBridge Bus(다른 bus로 forwarding)·API Destinations(외부 HTTPS) 등. 이게 EventBridge의 진짜 강점인데, **Lambda를 거치지 않고도 대부분의 AWS 동작을 직접 실행할 수 있다**. 예를 들어 "매일 새벽 3시에 RDS 스냅샷 → S3로 export → SNS 알림"을 Lambda 코드 한 줄 없이 EventBridge Rule + Target 체인으로 구성 가능.

> ⚠️ **함정**: Rule pattern은 JSON 모양 매치라 source/detail-type을 정확히 명시해야 한다. `"source": "aws.s3"`처럼 배열이 아닌 단일 값으로 쓰면 매치 실패다. 또한 `detail` 안의 필드는 정확한 키 경로가 필요한데, AWS 서비스마다 detail 구조가 다르므로 [Events Sample](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event.html) 문서를 보고 작성해야 한다. 운영에서 가장 흔한 버그는 "rule이 안 잡힌다"는 것이고, 99%가 pattern 오타·구조 오해·소스 이름 오기다.

> 🔍 **더 깊이**: EventBridge의 pattern matching engine은 내부적으로 NFA(non-deterministic finite automaton) 기반으로 동작한다는 게 AWS re:Invent 2022 세션(SVS323)에서 공개됐다. 즉 한 이벤트가 들어오면 등록된 모든 rule pattern을 O(1)에 가까운 시간으로 매치할 수 있다는 뜻이고, 그래서 한 bus에 수천 개 rule을 둬도 라우팅 지연이 거의 늘지 않는다. 이건 일반적인 if-else 체인이나 SQL where 절보다 훨씬 빠르고, EventBridge가 "수많은 rule을 한 bus에 올려도 안전"한 이유다.

## Input Transformation: target마다 다른 모양으로 이벤트 전달

같은 이벤트라도 target마다 받고 싶은 모양이 다르다. Slack webhook은 `{"text": "..."}` 형식을 원하고, Lambda는 원본 detail을 원하고, Step Functions는 특정 필드만 추출하길 원할 수 있다. **Input Transformer**가 이를 푼다.

Input Transformer는 두 부분으로 구성된다.
- **Input Path**: JSONPath로 이벤트의 일부 필드를 추출 (`{"orderId": "$.detail.orderId", "amount": "$.detail.amount"}`)
- **Input Template**: 추출된 변수를 placeholder로 사용한 새 payload

```json
// Slack webhook용 변환
"InputPathsMap": {
  "instance": "$.detail.instance-id",
  "state": "$.detail.state"
},
"InputTemplate": "{\"text\": \"EC2 <instance> changed to <state>\"}"
```

이 기능 덕분에 Lambda를 안 쓰고도 대부분의 메시지 변환이 가능하다. "EventBridge Rule + Input Transformer + Slack API Destination"으로 알림 시스템 전체가 코드 없이 구축된다.

## Archive와 Replay: 이벤트도 시간 여행이 가능해진다

분산 시스템에서 이벤트의 가장 큰 약점 중 하나는 "지나간 이벤트는 다시 볼 수 없다"는 것이다. SNS는 보존이 없고 SQS는 최대 14일이지만 한 번 소비되면 사라진다. 그런데 운영 중에 "어제 발생한 이벤트를 새로운 컨슈머가 다시 처리해야 한다" 또는 "버그 때문에 처리 못 한 이벤트를 며칠 뒤 재처리해야 한다"는 상황이 흔히 생긴다.

**EventBridge Archive**(2020년 출시)는 bus의 이벤트를 최대 무제한 보존하고, 나중에 **Replay**로 원하는 시간 범위의 이벤트를 원하는 rule로 다시 흘려보낼 수 있게 한다. Archive는 옵션 filter pattern을 가져서 모든 이벤트가 아니라 관심 이벤트만 보관할 수 있다.

```bash
# 결제 이벤트만 90일 보관
aws events create-archive --archive-name payment-archive \
  --event-source-arn arn:aws:events:ap-northeast-2:123:event-bus/saa-bus \
  --event-pattern '{"source":["app.payment"]}' \
  --retention-days 90

# 어제 오후 2-3시 이벤트 replay
aws events start-replay --replay-name payment-replay-2026-05-26 \
  --event-source-arn arn:aws:events:ap-northeast-2:123:archive/payment-archive \
  --event-start-time 2026-05-26T14:00:00Z \
  --event-end-time 2026-05-26T15:00:00Z \
  --destination 'Arn=arn:...:event-bus/saa-bus,FilterArns=[arn:...:rule/...]'
```

이게 event sourcing의 기본 빌딩 블록이다. 본격적인 event sourcing(EventStoreDB, Kafka)만큼 강력하진 않지만, "감사 추적 + 디버깅 + 부분 재처리" 정도의 시나리오는 충분히 커버한다.

> 📚 **사례**: 2021년 12월 Log4Shell(CVE-2021-44228) 취약점 사고 때 많은 회사가 "지난 N일간 어떤 시스템이 영향받았는가"를 알고 싶어 했다. CloudWatch Logs는 검색이 느렸고 SNS·SQS는 이미 소비된 이벤트라 추적이 불가능했다. EventBridge Archive를 설정해뒀던 회사들은 archive의 모든 이벤트를 분석 Lambda로 replay해 영향 범위를 빠르게 파악했다. 이 사건 이후 "보안 관련 이벤트는 EventBridge Archive를 기본으로 켠다"가 많은 회사의 표준이 됐다.

## API Destinations와 Connections: 외부 SaaS로 직접 호출

EventBridge target 중 가장 유연한 것이 **API Destinations**(2021년 출시)다. 임의의 외부 HTTPS endpoint를 target으로 등록하고, EventBridge가 직접 HTTP POST를 보낸다. Slack webhook, PagerDuty, Datadog, GitHub API, 사내 webhook 등 어디든 가능하다.

```bash
# Slack 인증 정보를 Connection으로 등록 (Secrets Manager에 저장됨)
aws events create-connection --name slack-conn \
  --authorization-type API_KEY \
  --auth-parameters 'ApiKeyAuthParameters={ApiKeyName=Authorization,ApiKeyValue=Bearer xoxb-...}'

# Slack webhook을 API Destination으로 등록
aws events create-api-destination --name slack-alerts \
  --connection-arn arn:...:connection/slack-conn \
  --invocation-endpoint https://hooks.slack.com/services/XXX/YYY/ZZZ \
  --http-method POST \
  --invocation-rate-limit-per-second 10
```

**Connections**는 인증 정보(API Key, Basic Auth, OAuth Client Credentials)를 안전하게 보관한다. 내부적으로 Secrets Manager를 쓰고 IAM으로 접근 제어한다. OAuth Client Credentials flow의 token 자동 갱신까지 지원한다 — 즉 Salesforce처럼 1시간마다 token 갱신이 필요한 SaaS도 코드 없이 통합된다.

`invocation-rate-limit-per-second`는 외부 API의 rate limit을 보호한다. 갑작스러운 이벤트 폭증이 외부 API를 죽이지 않도록 EventBridge가 자체 throttle을 한다. 초과 이벤트는 자동으로 retry queue로 들어가고, 최종 실패 시 DLQ로 격리된다.

> 💡 **관련 이론**: API Destinations는 "API Gateway가 inbound라면 outbound 버전"이라 볼 수 있다. 두 가지 모두 인증·rate limit·retry를 매니지드로 처리한다는 점이 같다. 옛날엔 외부 SaaS 호출을 Lambda로 직접 짜야 했고, 그 Lambda 안에서 retry·인증·token refresh·error handling을 다 관리해야 했다. API Destinations는 이걸 모두 인프라 레이어로 옮겨 "코드 0"으로 만든다.

## EventBridge Pipes: Source → Filter → Enrich → Target의 직접 통합

2022년 11월 출시된 **EventBridge Pipes**는 EventBridge의 가장 큰 패러다임 변화다. 기존 EventBridge는 "이벤트를 bus에 던지면 라우팅한다"였는데, Pipes는 **AWS 메시징 서비스 간 점대점 통합**을 코드 없이 만든다.

```
Source (Pull-based)            Filter      Enrich            Target
─────────────────              ──────      ──────            ──────
SQS / Kinesis Stream    →    JSON  →    Lambda     →     SQS / SNS
DynamoDB Streams              pattern    Step Functions      Step Functions
MSK / Self-managed Kafka                 API Destination     Lambda
Amazon MQ                                EventBridge Bus     ECS / Batch
                                                             Kinesis / Firehose
                                                             SageMaker Pipeline
                                                             Many more
```

이게 왜 중요하냐면, 옛날 같으면 "DynamoDB Streams → 가공 → Step Functions"를 Lambda 코드로 직접 짜야 했다. Lambda를 만들고, DynamoDB Stream을 event source로 연결하고, 코드 안에서 필터링하고, 변환하고, Step Functions StartExecution을 호출하고, 에러 처리하고, 재시도 로직을 짜고... 이걸 Pipes 한 줄 설정으로 대체한다.

특히 **Enrichment 단계**가 강력하다. Source에서 받은 이벤트가 부족하면 Lambda나 API Destination을 호출해 추가 데이터를 가져오고 합쳐서 target에 보낸다. 예를 들어 "DynamoDB Stream에 사용자 ID가 들어오면 → API Destination으로 사용자 프로필을 조회해 합치고 → SNS로 환영 메시지". 이걸 Lambda 한 줄 없이 Pipes로 구성.

> 🔍 **더 깊이**: Pipes는 사실상 AWS 버전의 **Apache Kafka Connect**나 **Confluent ksqlDB**의 일부 기능을 매니지드로 제공한다. Source connector + transform + sink connector라는 패턴은 데이터 통합 업계에서 오래된 표준이고, AWS는 이를 자체 매니지드 서비스(Lambda·SFN·API Destination)로 묶어 운영 부담을 0으로 만들었다. 다만 Kafka Connect만큼 transform library가 풍부하진 않아서 복잡한 변환은 여전히 Lambda enrichment가 필요하다.

> 📚 **사례**: 2023년 한 핀테크 회사가 "Kinesis Stream → Lambda(파싱+필터+enrich) → Step Functions"라는 파이프라인을 Lambda 코드 500줄로 운영했는데, Pipes로 옮긴 뒤 코드가 0줄이 되고 운영 사고가 70% 줄었다는 사례를 공개했다. Lambda 콜드 스타트·동시성 관리·에러 처리 같은 문제가 모두 Pipes의 매니지드 레이어로 흡수됐기 때문. 다만 Pipes는 source-target이 1:1이고 fanout이 안 되므로 fanout이 필요하면 여전히 SNS나 bus를 거쳐야 한다.

## EventBridge Scheduler: 1초 단위 정밀도, 1억 스케줄 규모

2022년 11월 출시된 **EventBridge Scheduler**는 기존 EventBridge Rule의 schedule 기능을 분리·확장한 별도 서비스다. 기능 차이가 꽤 큰데 시험에서는 둘을 구분해서 물어본다.

| 항목 | EventBridge Rule Schedule | EventBridge Scheduler |
|------|---------------------------|----------------------|
| 정밀도 | 분 단위 (cron/rate) | 초 단위 (cron/rate/one-time) |
| 최대 스케줄 수 | account당 ~300개 | 1억 개 |
| 시간대 | UTC 고정 | 270+ 시간대 지원 |
| Flexible time window | 없음 | ±15분 등 분산 실행 가능 |
| 일회성 스케줄 | 없음 | `at(2026-12-31T23:59:00)` 지원 |
| Target | EventBridge target들 | 270+ AWS API 직접 호출 |
| 가격 | 무료 (rule 부분) | 호출당 과금 ($1 / 100만 호출) |

Scheduler의 진짜 가치는 **1억 스케줄까지 확장**과 **270+ AWS API 직접 호출**이다. 예를 들어 "각 고객의 구독 만료일에 정확히 알림을 보낸다"는 시나리오 — 고객이 100만 명이면 스케줄 100만 개가 필요하고, 이걸 EventBridge Rule로는 불가능하지만 Scheduler로는 가능하다. Universal Target 덕에 Lambda를 거치지 않고 SES SendEmail 같은 API를 직접 부를 수 있다.

> ⚠️ **함정**: Scheduler가 새로 나왔다고 EventBridge Rule schedule을 쓰지 말라는 건 아니다. 단순한 cron 작업(매일 새벽 3시 청소 Lambda) 수십 개라면 Rule이 무료라 비용이 0이지만, Scheduler는 호출당 과금이다. 한 번에 수만 건 발화되는 시나리오에서는 비용 차이가 의미 있을 수 있다. "대규모 + 정밀도 + 시간대 필요" = Scheduler, "단순 cron + 소수" = Rule.

## Schema Registry와 이벤트 스키마 진화

이벤트 기반 시스템의 가장 어려운 운영 문제 중 하나가 **스키마 진화**다. 한 마이크로서비스가 publish하는 이벤트 모양이 시간이 지나며 변하고(`v1`: `{orderId, amount}` → `v2`: `{orderId, amount, currency}`), 구독자들이 그 변화를 따라잡지 못하면 silent break가 일어난다. 이건 Avro·Protobuf 진영에서 forward/backward compatibility라는 이름으로 오래 다뤄진 문제다.

EventBridge **Schema Registry**는 두 가지를 푼다.
1. **Schema Discovery**: bus에 흐르는 이벤트를 자동으로 분석해 스키마를 추론하고 버전 관리.
2. **Code Bindings**: 발견된 스키마를 Java·TypeScript·Python·Go 클래스로 자동 생성해 IDE에서 타입 안전 사용.

```bash
# Discovery 활성화 (이후 흐르는 이벤트가 자동 분석됨)
aws schemas create-discoverer --source-arn arn:...:event-bus/saa-bus

# 발견된 스키마 목록
aws schemas list-schemas --registry-name discovered-schemas

# TypeScript 코드 생성
aws schemas get-code-binding-source \
  --registry-name discovered-schemas \
  --schema-name aws.s3@ObjectCreated \
  --schema-version 1 --language TypeScript3
```

Schema Registry는 OpenAPI 3.0 또는 JSONSchema Draft 4 형식으로 스키마를 저장한다. 자체 스키마를 등록하면 구독자들이 같은 스키마를 import해 타입 안전성을 얻고, 변경 시 자동으로 새 버전이 생기며 호환성 검사를 할 수 있다.

> 💡 **관련 이론**: 스키마 진화의 호환성 모드는 Apache Avro에서 정립된 4가지 패턴이 표준이다 — **Backward**(새 reader가 옛 데이터 읽기 가능), **Forward**(옛 reader가 새 데이터 읽기 가능), **Full**(양방향), **None**. 마이크로서비스에서 가장 안전한 모드는 Full이지만 가장 제약이 많다. 보통은 Backward(새 구독자가 옛 producer 데이터를 읽을 수 있어야 함)를 기본으로 잡고, 신규 필드는 optional + default value, 기존 필드 제거·타입 변경 금지가 룰이다. EventBridge Schema Registry는 이 검사를 자동화한다.

## 다른 이벤트 라우팅 시스템과의 비교

| 시스템 | 강점 | 약점 | 적합한 시나리오 |
|--------|------|------|---------------|
| **EventBridge** | AWS·SaaS·Custom 통합, 풍부한 rule, archive, scheduler | 처리량 한계(account당 PutEvents 10K TPS 기본), latency 0.5-1s | 이벤트 라우팅 허브, 자동화 |
| **SNS** | 매우 높은 TPS, push-only, 매우 낮은 비용 | rule 패턴 단순, archive는 FIFO만, 단일 방향 fanout | 단순 fanout, 알림 |
| **Kinesis Data Streams** | 매우 높은 처리량, replay, 순서 보장 | 운영 복잡, 컨슈머 직접 구현 | 스트림 처리, 분석 |
| **Apache Kafka (MSK)** | 무제한 보존, 복잡한 stream processing | 운영 부담 매우 큼 | event sourcing, log aggregation |
| **Google Eventarc** | EventBridge와 유사 | GCP 한정 | GCP 환경 |
| **Azure Event Grid** | EventBridge와 유사 | Azure 한정 | Azure 환경 |
| **Apache Camel / Spring Integration** | 매우 풍부한 통합 패턴 | 자체 운영 | 온프레 통합 |

EventBridge의 가장 큰 약점은 **처리량**이다. account당 PutEvents 기본 quota가 10K TPS(region별로 다름), 한 rule당 target 5개 제한. 대규모 트래픽이 필요하면 SNS나 Kinesis로 가야 한다. 또한 **latency**가 SNS보다 살짝 높다(보통 500ms~1s) — 실시간성이 중요한 경우엔 SNS가 낫다.

반대로 EventBridge가 가장 강한 영역은 **SaaS 통합 + 다양한 AWS target + Scheduler**다. Zendesk나 Auth0 이벤트를 받아 Lambda·Step Functions·Slack을 트리거하는 식의 "통합 자동화" 시나리오는 다른 어떤 서비스로도 이만큼 쉽지 않다.

> 📚 **사례**: 2022년 한 e-commerce 회사가 "100개 SaaS 통합"을 자체 Lambda 코드 베이스로 운영하다가 EventBridge Partner Source + Pipes로 옮긴 후 통합 코드가 80% 감소했다. 가장 큰 효용은 "신규 SaaS 통합 시간이 1주에서 1시간으로"였다. 다만 처리량이 큰 워크로드(검색 인덱싱)는 EventBridge 대신 Kinesis로 분리해야 했다 — EventBridge가 만능은 아니다.

## Cross-Account, Cross-Region Bus Forwarding

큰 조직에서는 계정·region이 분리돼 있고 이벤트가 이를 가로질러 흘러야 한다. EventBridge는 bus가 다른 bus를 target으로 가질 수 있어서 cross-account/cross-region forwarding이 가능하다.

```
[ Hub-and-Spoke 아키텍처 ]

각 워크로드 계정 (us-east-1, eu-west-1)
  └─ 자체 EventBridge Bus
       └─ Rule: 모든 이벤트를 중앙 보안 계정 bus로 forwarding
            └─ Target: arn:aws:events:us-east-1:central-account:event-bus/security-hub

중앙 보안 계정
  └─ Hub Bus
       └─ Rule: GuardDuty Finding → SecurityHub
       └─ Rule: Config Compliance → ServiceNow
       └─ Rule: CloudTrail anomaly → Slack
```

이 패턴이 SecurityHub·Control Tower 같은 multi-account 자동화의 기반이다. 다만 cross-region forwarding은 region당 별도 PutEvents 비용이 들고, 네트워크 latency가 추가되므로 동기적 응답이 필요한 워크플로엔 부적합하다.

```bash
# 다른 계정의 bus를 target으로 사용 (cross-account)
aws events put-targets --rule audit-all --event-bus-name local-bus \
  --targets 'Id=1,Arn=arn:aws:events:us-east-1:111122223333:event-bus/central-audit,RoleArn=arn:...'

# 대상 계정에서 송신 계정에게 PutEvents 허용
aws events put-permission --event-bus-name central-audit \
  --action events:PutEvents --principal 444455556666 --statement-id allow-acc-444
```

## 정리하며

EventBridge는 SNS·SQS와 같은 메시징 layer이지만 한 차원 다른 추상화다. SNS가 "publish-subscribe", SQS가 "queue", EventBridge가 "**event routing hub**". AWS·SaaS·Custom 이벤트를 하나의 모델로 흡수하고, JSON pattern으로 라우팅하고, 30+ target으로 직접 보내고, archive로 시간 여행을 허용하고, Pipes로 점대점 통합을 코드 없이 만든다. Scheduler는 cron의 차세대 버전이고, Schema Registry는 이벤트 진화 문제에 답한다.

시험 관점에서 핵심 분기점은 — **단순 fanout = SNS**, **작업 큐 = SQS**, **이벤트 라우팅 + SaaS 통합 + 스케줄 + archive = EventBridge**, **점대점 통합 = Pipes**. 운영 관점에서는 "Lambda 코드로 정의하던 통합을 EventBridge 인프라 설정으로 옮긴다"는 게 가장 큰 변화고, 이걸 잘 활용하면 코드 베이스가 극적으로 작아진다.

다음 글에서는 EventBridge가 처리할 수 없는 영역 — 초당 수십만 건의 실시간 스트림 데이터·순서가 중요한 시계열·replay가 필요한 event sourcing — 에 답하는 **Kinesis** 패밀리(Data Streams, Firehose, Data Analytics)를 본다.

---

## 📝 연습 문제

**문제 1.** Datadog 알람이 발생하면 AWS Lambda를 트리거하고 Slack에도 알림을 보내야 한다. 가장 적합한 구성은?

A) Datadog → SNS → Lambda, SNS → Slack HTTPS 구독
B) Datadog → API Gateway → Lambda + Slack
C) EventBridge Partner Source(Datadog) → Rule → Lambda target + API Destination(Slack) target
D) Datadog → Kinesis → Lambda

**정답: C**

해설: EventBridge는 Datadog을 포함한 약 40개 SaaS Partner Source를 제공하고, Partner Bus에 자동으로 이벤트가 들어온다. Rule에 두 target(Lambda + Slack API Destination)을 등록하면 한 이벤트가 둘 다 트리거. A는 Datadog → SNS 통합이 직접 없고 webhook 중간 변환 필요. B는 API Gateway + Lambda 둘 다 코드를 짜야 하고 SaaS 인증 처리도 직접. D는 Kinesis는 스트림 처리용이라 단발 이벤트에 과한 인프라.

---

**문제 2.** 매일 새벽 3시 KST에 RDS 스냅샷을 만들고 S3로 export하는 작업을 코드 없이 자동화하려 한다. 가장 적합한 설정은?

A) Lambda + cron 라이브러리로 자체 스케줄링
B) EventBridge Scheduler + Universal Target(RDS API 직접 호출) + 시간대 Asia/Seoul
C) EC2 인스턴스에 crontab 설정
D) AWS Batch + Job Queue

**정답: B**

해설: EventBridge Scheduler는 270+ 시간대 지원과 270+ AWS API Universal Target을 가지므로 RDS CreateDBSnapshot을 Lambda 없이 직접 호출 가능. 기존 EventBridge Rule schedule은 UTC 고정이라 KST 변환을 직접 해야 하지만 Scheduler는 시간대 명시 가능. A는 코드 작성 필요 + Lambda 자체 cron은 안티패턴. C는 EC2 운영 부담. D는 Batch는 컴퓨팅 큐 모델이지 단순 시간 트리거 도구가 아니다.

---

**문제 3.** SQS 큐에서 메시지를 받아 일부 필터링한 뒤 Lambda로 enrich하고 Step Functions로 보내는 파이프라인이 있다. 현재 Lambda 코드 약 300줄이 이 작업을 한다. 가장 단순화하는 방법은?

A) Lambda를 더 잘 최적화
B) EventBridge Pipes로 Source=SQS, Filter, Enrich=Lambda, Target=Step Functions 설정
C) SQS를 SNS로 변경
D) Step Functions에서 직접 SQS poll

**정답: B**

해설: 정확히 EventBridge Pipes의 사용 케이스. Source(SQS) → Filter(JSON pattern) → Enrich(Lambda) → Target(Step Functions)을 코드 없이 설정으로 구성. Lambda는 enrich 로직만 남고 batch poll·error handling·target 호출은 Pipes가 매니지드로 처리. A는 근본 단순화가 아님. C는 SQS의 buffer 특성을 잃음. D는 SFN은 SQS poller가 아니다.

---

**문제 4.** 한 외부 SaaS(예: Salesforce)에 이벤트를 webhook으로 전달하려 한다. OAuth 인증과 token 자동 갱신이 필요하고, SaaS rate limit(초당 10 호출)을 보호해야 한다. 가장 적합한 구성은?

A) Lambda에서 직접 OAuth 처리 + 자체 throttle
B) EventBridge API Destination + Connection(OAuth Client Credentials) + invocation-rate-limit-per-second=10
C) API Gateway → SaaS
D) Step Functions에서 HTTP Invoke 사용

**정답: B**

해설: API Destinations + Connections는 OAuth Client Credentials flow의 token 자동 갱신을 지원하고, invocation-rate-limit-per-second로 자체 throttle을 한다. 초과 이벤트는 retry queue로 들어가고 최종 실패 시 DLQ. A는 OAuth refresh·throttle·retry를 다 직접 구현해야 함. C는 inbound API용이지 outbound용이 아님. D는 SFN HTTP Task가 가능하지만 인증·throttle을 직접 구성해야 하고 EventBridge API Destination이 더 적합.

---

**문제 5.** 어제 발생한 일부 결제 이벤트가 버그 때문에 처리되지 못했다. 같은 이벤트들을 다시 처리 파이프라인에 흘려보내야 한다. EventBridge로 구성된 시스템이라면?

A) DLQ에서 메시지를 수동으로 복사
B) EventBridge Archive + Replay로 어제 특정 시간 범위 이벤트를 다시 흘림
C) S3 백업에서 복원 후 PutEvents로 재발행
D) 불가능. 이벤트는 일회성

**정답: B**

해설: EventBridge Archive를 미리 설정해두면 bus의 이벤트가 자동으로 archive에 보존되고, Replay API로 원하는 시간 범위·필터로 이벤트를 다시 흘려보낼 수 있다. 어제 14:00-15:00 결제 이벤트만 결제 처리 rule로 다시 보내는 식. A는 DLQ는 다른 시스템(SQS) 메커니즘이고 EventBridge에는 다른 흐름. C는 가능하지만 매우 비효율적이고 archive가 없으면 S3에 백업이 있어야. D는 archive 기능을 모르는 답.

---

**문제 6.** 한 회사 조직에서 200개 워크로드 계정의 GuardDuty Finding을 중앙 보안 계정의 SecurityHub로 보내야 한다. 가장 단순한 아키텍처는?

A) 각 계정 Lambda → 중앙 계정 SQS → SecurityHub
B) 각 계정 EventBridge Default Bus에 rule → 중앙 계정 EventBridge Bus를 target으로 cross-account forwarding → 중앙 rule이 SecurityHub로
C) 각 계정 SNS → 중앙 계정 SQS → Lambda
D) AWS Config로만 처리

**정답: B**

해설: GuardDuty Finding은 자동으로 각 계정의 Default Bus에 발행된다. 각 계정 rule이 이벤트를 중앙 보안 계정 bus로 forwarding하고, 중앙 bus의 rule이 SecurityHub Import target으로 보낸다. 모두 EventBridge 설정만으로 코드 0. A는 Lambda 200개 운영. C는 SNS 200개 + 중앙 처리 코드. D는 Config는 리소스 설정 변경 추적용이지 Finding 라우팅이 아님.

---

**문제 7.** EventBridge bus에 흐르는 이벤트 스키마가 마이크로서비스마다 다르고 시간에 따라 진화한다. 구독 Lambda 팀이 안전하게 코드를 작성하길 원한다. 가장 적합한 도구는?

A) DynamoDB에 스키마 저장
B) EventBridge Schema Registry + Schema Discovery + Code Bindings
C) Lambda 내부 try-except로 모든 케이스 처리
D) Step Functions의 input validation

**정답: B**

해설: Schema Registry는 bus의 이벤트를 Discovery로 자동 분석해 스키마를 추론하고 버전 관리한다. Code Bindings로 Java·TypeScript·Python·Go 클래스 자동 생성해 IDE에서 타입 안전 사용 가능. 스키마 변경 시 호환성 검사도 자동. A는 직접 운영 필요. C는 방어 코드일 뿐 진짜 해결책 아님. D는 SFN 한정이고 스키마 관리 기능 없음.

---

해설 보강: EventBridge는 단순한 "고급 SNS"가 아니라 분류상 다른 추상화다. SNS·SQS·Kinesis가 메시지 채널이라면, EventBridge는 **이벤트 통합 허브**다. 시험에서는 ① SaaS 통합 키워드 → EventBridge, ② cron + 시간대 + 대규모 → Scheduler, ③ AWS 서비스 간 점대점 통합 → Pipes, ④ archive/replay → EventBridge, ⑤ 단순 fanout → SNS, ⑥ 작업 큐 → SQS를 키워드 매핑으로 풀면 90%가 풀린다. 실무에서는 "Lambda 코드를 EventBridge 인프라로 옮기는 게 거의 항상 단순화"라는 원칙이 적용된다.
