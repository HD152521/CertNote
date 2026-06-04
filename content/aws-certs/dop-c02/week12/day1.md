# Day 1 - EventBridge: 이벤트 버스의 라우팅 모델과 비동기 자동화의 신경계

자동화 시스템을 오래 들여다보면 결국 두 가지 질문으로 수렴한다. "무슨 일이 일어났는가"를 누가 감지하고, "그래서 무엇을 할 것인가"를 누가 결정하는가. 모놀리스 시절에는 이 둘이 같은 프로세스 안에 있었다. 주문이 들어오면 같은 함수가 재고를 까고 이메일을 보내고 결제를 호출했다. 호출자와 피호출자가 컴파일 타임에 서로를 알았다. 그런데 시스템이 커지면서 이 직접 호출(point-to-point) 방식은 무너진다. 새 기능 하나를 붙일 때마다 기존 코드를 수정해야 하고, 한 서비스가 느려지면 그를 동기로 호출하던 모든 서비스가 같이 느려지며, 누가 누구를 부르는지 아무도 전체 그림을 모르게 된다. EventBridge는 이 문제에 대한 AWS의 답이다 — 발생한 사실(event)을 중앙 버스에 던지면, 그에 관심 있는 자가 알아서 구독해 반응한다. 발신자는 수신자를 모른다. 이 "모름"이 바로 결합도를 끊는 핵심이다.

오늘은 EventBridge를 "규칙 만드는 콘솔"로 보지 않고, 그 밑에 깔린 메시징 모델을 판다. 메시지 큐(SQS)·발행/구독(SNS)과 콘텐츠 기반 라우팅(content-based routing)이 무엇이 다른지, Event Pattern 매칭이 왜 단순 문자열 비교가 아니라 트라이(trie) 기반 결정 엔진인지, EventBridge Pipes가 어떤 엔터프라이즈 통합 패턴의 구현인지, Archive/Replay가 이벤트 소싱(event sourcing)의 어떤 측면을 빌려왔는지를 본다. DOP 시험에서 EventBridge는 자동화 도메인의 중추로, "CodePipeline 실패를 어떻게 알림으로 연결하나", "GuardDuty 탐지를 어떻게 자동 대응으로 잇나", "수백만 개 스케줄을 어떻게 관리하나" 같은 시나리오로 거의 매 시험 등장한다.

## 이벤트 버스는 어디서 왔나 — EAI에서 EventBridge까지

EventBridge의 뿌리는 2000년대 초 엔터프라이즈 통합(Enterprise Application Integration, EAI)의 고민으로 거슬러 올라간다. 서로 다른 시스템 N개를 직접 연결하면 연결선이 N×(N-1)/2개로 폭발한다(이른바 "스파게티 통합"). 이를 풀기 위해 등장한 것이 **메시지 브로커**와 **메시지 버스** 아키텍처였고, Gregor Hohpe와 Bobby Woolf가 2003년 정리한 『Enterprise Integration Patterns』(EIP)가 그 정전(canon)이 됐다. EIP는 Message Channel, Message Router, Message Translator, Content-Based Router, Message Filter 같은 패턴에 이름을 붙였다. EventBridge를 뜯어보면 이 패턴들이 그대로 보인다 — Event Bus는 Message Channel, Rule은 Content-Based Router, Input Transformer는 Message Translator, Event Pattern은 Message Filter다.

AWS 내부 역사로 보면 EventBridge는 2019년 **CloudWatch Events**에서 분리·확장돼 태어났다. CloudWatch Events는 원래 "AWS 서비스 상태 변화를 cron이나 패턴으로 잡아 Lambda를 부른다"는 좁은 도구였는데, AWS가 여기에 커스텀 이벤트·SaaS 파트너 이벤트·스키마 레지스트리를 얹어 범용 이벤트 버스로 승격시킨 것이 EventBridge다. 그래서 지금도 둘은 같은 API 백엔드를 공유한다(`aws events put-rule`).

```
[EAI 스파게티: N개 시스템, N² 연결]      [버스: N개 시스템, N 연결]
   A ─ B                                   A ─┐
   │ ╳ │                                   B ─┼─ [Event Bus] ─ 라우팅 규칙
   C ─ D                                   C ─┘
   (연결 폭발)                              (발신자는 수신자를 모름)
```

> 💡 **관련 이론**: EventBridge는 EIP의 **Content-Based Router** 패턴의 직접적 구현이다. 전통적 메시지 라우터는 메시지의 헤더나 본문 내용을 검사해 목적지를 정하는데, EventBridge의 Rule이 정확히 이 일을 한다 — 이벤트 JSON의 `source`·`detail-type`·`detail` 내용을 보고 어느 Target으로 보낼지 결정한다. 핵심은 발신자가 라우팅 로직을 모른다는 점이다(EIP에서 이를 "라우터가 메시지 흐름에 대한 지식을 캡슐화한다"고 표현한다). 새 구독자를 추가해도 발신자 코드는 0줄 바뀐다. 이 속성을 **발행자-구독자 분리**(publisher-subscriber decoupling)라 하고, 마이크로서비스의 독립 배포 가능성(independent deployability)을 떠받치는 토대다.

> 🔍 **더 깊이**: EventBridge와 SNS·SQS를 자주 헷갈리는데, 셋은 메시징 스펙트럼의 다른 지점에 있다. **SQS**는 점대점 큐(point-to-point queue)로, 메시지를 한 컨슈머 그룹이 가져가 소비한다(work queue, competing consumers 패턴). **SNS**는 발행/구독(pub/sub)으로, 한 메시지를 여러 구독자에게 팬아웃하지만 라우팅이 "토픽" 단위로 거칠다(coarse-grained) — 구독자는 토픽 전체를 받거나 못 받거나다(SNS 필터 정책으로 일부 완화). **EventBridge**는 여기에 **콘텐츠 기반 정밀 라우팅**을 더한다 — 같은 버스에 들어온 이벤트를 내용에 따라 서로 다른 Target으로 잘게 나눈다. 처리량(throughput)과 지연(latency)이 최우선이면 SNS/SQS가 빠르고 싸지만, 풍부한 필터링·다수의 AWS 서비스 통합·스키마 관리가 필요하면 EventBridge다. 시험에서 "한 이벤트를 내용에 따라 15개 다른 서비스로 분기"는 EventBridge, "단순 팬아웃"은 SNS, "버퍼링·재시도 큐"는 SQS로 읽으면 된다.

## Event Bus 3종과 멀티 계정 라우팅

EventBridge에는 세 종류의 버스가 있고, 그 구분은 "이벤트가 어디서 오는가"에 달려 있다.

| 종류 | 출처 | 특징 |
|------|------|------|
| **Default Bus** | AWS 서비스 이벤트 | 계정마다 자동 존재. AWS 서비스(EC2, CodePipeline, S3...)의 상태 변화가 자동 유입. AWS 이벤트 수신은 무료 |
| **Custom Bus** | 애플리케이션 `PutEvents` | 사용자가 직접 만든 도메인 이벤트용. 100만 이벤트당 $1 |
| **Partner Bus** | SaaS 파트너 | Datadog, MongoDB Atlas, Auth0, Shopify 등이 직접 이벤트를 보냄. 파트너별 SaaS 통합 |

도메인 이벤트를 Default Bus가 아닌 **Custom Bus에 분리**하는 것이 실무 정석이다. Default Bus에는 모든 AWS 서비스 이벤트가 섞여 들어오므로, 비즈니스 이벤트(`OrderPlaced`, `PaymentFailed`)를 별도 Custom Bus에 두면 권한 경계·규칙 관리·관측이 깔끔하다. 이는 도메인 주도 설계(DDD)의 **바운디드 컨텍스트**(bounded context)별로 버스를 나누는 것과 닿아 있다.

크로스 계정 라우팅은 두 단계다. 수신 측 버스에 리소스 정책(resource policy)으로 송신 계정의 `PutEvents`를 허용하고, 송신 측은 그 버스를 Target으로 지정한다.

```bash
# 수신 측(Target 계정): 송신 계정에 PutEvents 허용
aws events put-permission \
  --event-bus-name central-bus \
  --action events:PutEvents \
  --principal 111122223333 \
  --statement-id allow-app-account

# 송신 측: 다른 계정의 버스를 Target으로 (Rule의 Target ARN을 상대 버스로)
```

> 💡 **관련 이론**: 여러 계정의 이벤트를 하나의 **중앙 버스**(central event bus)로 모으는 패턴은 AWS의 멀티 계정 거버넌스(multi-account strategy)와 결합해 **이벤트 메시 **(event mesh) 또는 허브-앤-스포크(hub-and-spoke) 토폴로지를 만든다. 각 워크로드 계정(spoke)이 자기 이벤트를 보안/감사 계정의 중앙 버스(hub)로 보내면, 중앙에서 조직 전체의 이벤트를 한 곳에서 감지·대응할 수 있다. 이는 AWS Organizations의 위임 관리자(delegated administrator) 패턴과 같은 거버넌스 사상이다 — 권한과 관측을 중앙으로 모으되, 워크로드는 계정별로 격리한다.

## Event Pattern — 매칭은 비교가 아니라 결정 트리다

EventBridge의 심장은 **Event Pattern** 매칭이다. 들어온 이벤트 JSON과 규칙의 패턴을 대조해 일치하면 Target으로 보낸다. 겉보기엔 단순 JSON 비교 같지만, 내부는 그렇게 동작하지 않는다.

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": [{ "prefix": "MyApp-" }]
  }
}
```

패턴은 **AND/OR 의미론**을 가진다. 서로 다른 키(`source`, `state`)는 AND로 묶이고(모두 만족해야 함), 한 키 안의 배열은 OR다(하나만 맞으면 됨). 값에는 단순 등치 외에 풍부한 연산자가 있다.

| 연산자 | 의미 | 예 |
|--------|------|-----|
| `prefix` / `suffix` | 접두/접미 일치 | `{"prefix": "MyApp-"}` |
| `numeric` | 수치 비교 | `{"numeric": [">=", 7]}` |
| `cidr` | IP 대역 | `{"cidr": "10.0.0.0/24"}` |
| `anything-but` | 부정 | `{"anything-but": ["SUCCEEDED"]}` |
| `exists` | 필드 존재 | `{"exists": true}` |
| `equals-ignore-case` | 대소문자 무시 | |
| `wildcard` | `*` 와일드카드 | `{"wildcard": "*.prod.*"}` |

> 🔍 **더 깊이**: EventBridge 매칭 엔진은 모든 규칙을 매 이벤트마다 순차 비교하지 않는다. 그렇게 하면 규칙 수에 비례해 느려진다(O(규칙수)). 대신 AWS는 모든 규칙의 패턴을 하나의 **상태 기계(state machine) / 결정 트리**로 컴파일한다 — 여러 규칙이 공유하는 조건(예: `source`가 같은)을 한 노드로 합쳐, 이벤트 하나가 트리를 한 번 통과하면서 매칭되는 모든 규칙을 동시에 찾는다. 이 기법은 이벤트 처리 시스템의 고전인 **Rete 알고리즘**(1979, 규칙 엔진의 패턴 매칭 최적화)이나 정규식 엔진의 NFA→DFA 컴파일과 같은 발상이다. 핵심 이점: 규칙이 수천 개여도 이벤트당 매칭 비용이 패턴 수가 아니라 **이벤트의 복잡도**에 비례한다. AWS가 이 엔진을 오픈소스로 일부 공개한 것이 `quamina`(Go 라이브러리)다 — 내부 동작이 궁금하면 이 코드가 곧 답이다.

> ⚠️ **함정**: Event Pattern은 **부분 일치(subset match)**다. 패턴에 명시한 필드만 검사하고, 이벤트에 그 외 필드가 더 있어도 무시한다. 그래서 `{"detail": {"state": ["FAILED"]}}`는 `state`가 FAILED인 모든 이벤트를 잡되, `state`가 없거나 다른 이벤트는 거른다. 흔한 실수는 이를 "정확히 이 JSON과 같아야 한다"로 오해하는 것이다. 또 하나: 패턴의 값은 **항상 배열**이어야 한다. `"state": "FAILED"`(문자열)는 틀리고 `"state": ["FAILED"]`(배열)가 맞다. 배열이 OR이므로, 단일 값도 1개짜리 배열로 감싼다.

## Input Transformer — 이벤트를 Target의 언어로 번역하다

Target(예: Slack용 SNS)이 원하는 페이로드 형식과 EventBridge가 받은 원본 이벤트 형식은 거의 항상 다르다. 원본 이벤트 그대로 던지면 Slack에는 거대한 JSON 덩어리가 찍힌다. **Input Transformer**가 이 사이에서 번역한다 — 이벤트에서 필요한 값만 JSONPath로 뽑아 새 템플릿에 끼워 넣는다.

```json
"InputTransformer": {
  "InputPathsMap": {
    "pipelineName": "$.detail.pipeline",
    "state": "$.detail.state"
  },
  "InputTemplate": "{\"text\":\"Pipeline <pipelineName> is <state>\"}"
}
```

이것이 EIP의 **Message Translator** 패턴이다. 송신 시스템의 메시지 형식과 수신 시스템의 형식을 중간에서 변환해, 양쪽이 서로의 형식을 몰라도 되게 만든다. 라우팅(어디로)과 변환(무엇을)을 분리한 덕에, 같은 이벤트를 Target마다 다른 형식으로 줄 수 있다.

## EventBridge Scheduler — 왜 CloudWatch cron을 갈아치웠나

cron으로 "매일 새벽 3시 백업"을 거는 것은 오래된 패턴이다. 과거에는 CloudWatch Events의 scheduled rule을 썼지만, 2022년 AWS는 **EventBridge Scheduler**라는 별도 서비스를 내놨다. 이유는 규모다 — CloudWatch Events 스케줄은 계정·리전당 규칙 수에 빠듯한 한계가 있어, 수십만 개의 사용자별 스케줄(예: "각 사용자의 구독 갱신일에 결제")을 표현하기 어려웠다.

```bash
aws scheduler create-schedule \
  --name nightly-backup \
  --schedule-expression "cron(0 3 * * ? *)" \
  --target '{
    "Arn": "arn:aws:lambda:...:function:BackupFn",
    "RoleArn": "arn:aws:iam::...:role/SchedulerRole"
  }' \
  --flexible-time-window Mode=OFF
```

Scheduler의 차별점은 셋이다. 첫째, **수백만 개 스케줄**을 지원한다(개별 일정을 1급 객체로 취급). 둘째, **Flexible Time Window** — 정확히 그 시각이 아니라 "이 15분 안 어디든"으로 실행을 분산시켜, 새벽 3시 정각에 수만 개 작업이 한꺼번에 터지는 **thundering herd**(쇄도 현상)를 막는다. 셋째, **one-time schedule**(한 번만 실행 후 자동 삭제)을 지원해 "3일 뒤 이 토큰 만료" 같은 지연 작업을 큐 없이 표현한다.

> 💡 **관련 이론**: Flexible Time Window는 분산 시스템에서 **지터(jitter)**를 의도적으로 주입하는 고전 기법이다. 모든 클라이언트가 똑같은 시각(또는 똑같은 백오프 간격)에 행동하면 부하가 한 점에 몰려 다운스트림이 무너진다(thundering herd). 여기에 무작위 시간차를 더하면 부하가 시간축으로 퍼진다. 같은 원리가 재시도 백오프의 "exponential backoff with jitter"(AWS Architecture Blog의 고전), DNS TTL 분산, 캐시 만료 분산(cache stampede 방지)에 쓰인다. Scheduler는 이 패턴을 cron 스케줄링에 내장한 것이다.

## EventBridge Pipes — 폴링 통합을 코드 없이

2022년 등장한 **Pipes**는 EventBridge의 결을 바꾼 기능이다. 기존 Rule은 "버스에 들어온 이벤트를 Target으로 라우팅"하는 **푸시(push)** 모델인데, Pipes는 SQS·Kinesis·DynamoDB Streams·MSK처럼 **폴링(poll)**해야 하는 소스를 1급 시민으로 받아, 그것을 필터링·보강해 Target으로 연결한다.

```
Source → Filter → Enrichment → Target
(SQS/Kinesis/    (이벤트     (Lambda/    (EventBridge
 DDB Stream/      패턴)       Step Fn/    표준 Target)
 MSK/MQ)                      API Dest)
```

- **Source**: SQS, Kinesis, DynamoDB Streams, Amazon MSK, self-managed Kafka, MQ
- **Filter**: Event Pattern으로 1차 거르기 (불필요한 이벤트는 Enrichment·Target 비용 없이 버림)
- **Enrichment**: Lambda/Step Functions/API Gateway/API Destination으로 데이터 보강 (예: ID만 든 이벤트에 상세 정보 붙이기)
- **Target**: EventBridge의 모든 표준 Target

핵심 가치는 **글루 코드(glue code) 제거**다. 과거 "SQS에서 폴링 → 필터 → 외부 API로 보강 → DynamoDB 저장"을 하려면 Lambda를 직접 짜고 폴링 로직·배치·에러 처리를 손으로 관리했다. Pipes는 이 배관(plumbing)을 관리형으로 흡수한다.

> 🔍 **더 깊이**: Pipes는 EIP의 **파이프-필터(pipes and filters)** 아키텍처를 그대로 구현한 이름이다(이름부터 그렇다). 파이프-필터는 데이터를 일련의 처리 단계(필터)에 통과시키되, 각 단계가 파이프로 연결돼 독립적으로 교체·재배치 가능한 구조다 — Unix 셸의 `cat | grep | sort`가 원형이다. Pipes의 4단계(Source-Filter-Enrich-Target)는 각각 독립 구성 가능하고, 한 단계를 바꿔도 나머지는 그대로다. 또한 Pipes의 Filter 단계는 **early filtering**의 경제학을 보여준다 — Enrichment(Lambda 호출, 과금)나 Target 전송 전에 불필요한 이벤트를 버리면, 비싼 다운스트림 작업을 아낀다. "필터를 파이프라인 앞쪽으로 밀어라(predicate pushdown)"는 데이터베이스 쿼리 최적화의 원리와 같다.

## Archive & Replay — 이벤트 소싱의 그림자

EventBridge는 버스를 지나는 이벤트를 **Archive**에 보관하고, 나중에 **Replay**로 다시 흘려보낼 수 있다.

```bash
aws events create-archive --archive-name PaymentEvents \
  --event-source-arn arn:aws:events:...:event-bus/default \
  --retention-days 90 \
  --event-pattern '{"source":["custom.payments"]}'

aws events start-replay --replay-name fix-bug-20260601 \
  --event-source-arn arn:aws:events:...:archive/PaymentEvents \
  --event-start-time 2026-06-01T00:00:00Z \
  --event-end-time 2026-06-01T06:00:00Z \
  --destination 'Arn=arn:...:event-bus/default,FilterArns=[arn:...:rule/ReprocessRule]'
```

용도는 사고 복구다. "결제 처리 Lambda에 버그가 있어 6월 1일 새벽 이벤트가 잘못 처리됐다 → 버그를 고친 뒤 그 시간대 이벤트를 Replay해 재처리"가 전형적이다.

> 💡 **관련 이론**: Archive/Replay는 **이벤트 소싱**(event sourcing)의 핵심 통찰을 빌렸다 — 상태가 아니라 "일어난 사건의 로그"를 진실의 원천(source of truth)으로 삼으면, 그 로그를 다시 재생해 어떤 시점의 상태든 복원하거나 재처리할 수 있다. 이벤트 소싱에서는 이를 "이벤트 스트림을 리플레이해 read model을 재구축한다"고 부른다. 다만 EventBridge Archive는 완전한 이벤트 소싱 저장소는 아니다 — 순서 보장이 약하고(at-least-once, 순서 비보장) 무기한 보존이 아니다(retention 설정). 그래서 EventBridge Replay는 "감사용 영구 원장"이 아니라 "최근 기간의 사고 복구·재처리"에 맞다. 진짜 이벤트 소싱이 필요하면 Kinesis Data Streams나 전용 이벤트 스토어(예: EventStoreDB)를 쓴다. 시험에서 "장애 후 이벤트 재처리"는 Replay, "영구 감사 원장"은 다른 답이다.

## 전달 보장과 안전망 — DLQ, 재시도, 멱등성

EventBridge의 전달은 **at-least-once**(최소 1회)다. 즉 같은 이벤트가 두 번 전달될 수 있다. 이는 분산 시스템의 근본 한계로, "정확히 한 번(exactly-once)"은 일반적으로 불가능하거나 매우 비싸다.

```json
"DeadLetterConfig": {"Arn": "arn:aws:sqs:...:dlq"},
"RetryPolicy": {"MaximumRetryAttempts": 185, "MaximumEventAgeInSeconds": 86400}
```

Target 전달이 실패하면 EventBridge가 지수 백오프로 재시도하고, 최대 재시도 횟수나 이벤트 수명(age)을 넘기면 **DLQ**(SQS)로 보내 영구 손실을 막는다.

> ⚠️ **함정**: at-least-once이므로 **컨슈머가 멱등(idempotent)**해야 한다. "결제 이벤트가 두 번 와도 한 번만 청구"되려면, 이벤트 ID를 키로 중복 처리를 막는 멱등성 로직(예: DynamoDB conditional write, Lambda Powertools의 Idempotency 유틸)이 필요하다. EventBridge가 정확히 한 번을 보장해 주리라 믿고 멱등성을 생략하면, 재시도·중복 전달 시 이중 처리가 터진다. 시험에서 "이벤트가 중복 처리됨"의 답은 거의 항상 "컨슈머 멱등성 부재"다.

## Schema Registry — 이벤트의 계약을 코드로

EventBridge **Schema Registry**는 버스를 지나는 이벤트의 구조를 자동 탐색(discovery)하거나 직접 등록해, 그 스키마로부터 타입 안전한 코드 바인딩(Java/Python/TypeScript)을 생성한다. 이벤트 발신자와 수신자 사이의 **계약(contract)**을 명시화하는 것이다.

> 💡 **관련 이론**: Schema Registry는 분산 시스템에서 **스키마 진화(schema evolution)**와 **계약 우선(contract-first) 설계**의 한 형태다. 발신자가 이벤트 형식을 바꾸면 수신자가 깨지는 문제를, 스키마를 공유 계약으로 명시하고 호환성 규칙(하위 호환 필드 추가만 허용 등)을 강제해 푼다. Confluent Schema Registry(Kafka 생태계의 Avro/Protobuf 스키마 관리)가 같은 사상이며, gRPC의 `.proto`, GraphQL 스키마도 같은 "계약을 코드 생성의 원천으로"라는 발상이다. 이벤트 기반 아키텍처가 커질수록 "누가 어떤 이벤트를 내고 그 형식이 무엇인가"를 추적하는 스키마 거버넌스가 운영 우수성의 핵심이 된다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **EventBridge는 EAI/EIP의 메시지 버스·콘텐츠 기반 라우터 패턴**을 AWS에 구현한 것으로, 발신자가 수신자를 모르게 해 결합도를 끊는다. 둘째, **Event Pattern 매칭은 순차 비교가 아니라 결정 트리/상태 기계로 컴파일**되어 규칙 수에 무관하게 빠르며, 부분 일치 의미론과 배열=OR 규칙을 가진다. 셋째, **Scheduler는 수백만 스케줄과 Flexible Time Window(지터)**로 thundering herd를 막는 CloudWatch cron의 후계자다. 넷째, **Pipes는 파이프-필터 아키텍처**로 폴링 소스의 글루 코드를 관리형으로 흡수하고, early filtering으로 비용을 아낀다. 다섯째, **Archive/Replay는 이벤트 소싱의 재처리 통찰**을 빌렸고, at-least-once 전달이므로 컨슈머는 멱등해야 한다.

다음 글에서는 이 이벤트들이 트리거하는 **SSM Automation Runbook** — 운영 절차를 코드로 만들고 사람 승인을 워크플로에 끼워 넣는 법을 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 한 이벤트를 그 내용(state, pipeline 이름)에 따라 서로 다른 15개 AWS 서비스로 정밀하게 분기해야 한다. 단순 팬아웃이 아니라 콘텐츠 기반 라우팅이 필요하다. 가장 적합한 서비스는?

A) SNS 토픽 하나에 모두 구독시킨다

B) EventBridge — Rule의 Event Pattern으로 콘텐츠 기반 라우팅(Content-Based Router 패턴)

C) SQS 큐를 15개 만들어 직접 분배한다

D) Lambda가 모든 분기 로직을 if-else로 처리

**정답: B**

해설: EventBridge Rule은 EIP의 Content-Based Router 패턴 구현으로, 이벤트 JSON의 내용(`source`·`detail-type`·`detail`)을 검사해 서로 다른 Target으로 정밀 분기한다. SNS(A)는 토픽 단위의 거친 팬아웃이라 내용 기반 정밀 라우팅에 약하고(필터 정책으로 일부만 보완), SQS 15개(C)는 발신자가 분배 로직을 떠안아 결합도가 생기며, Lambda if-else(D)는 새 분기를 추가할 때마다 코드를 고쳐야 해 결합도를 끊지 못한다. EventBridge의 핵심 가치는 발신자가 수신자를 모르고, 새 구독자 추가 시 발신자 코드가 0줄 바뀐다는 것이다.

---

**문제 2.** 매일 새벽 3시 정각에 5만 개의 사용자별 백업 작업이 한꺼번에 실행되면서 다운스트림 시스템이 부하로 무너진다. 표준 해법은?

A) cron을 02:59로 당긴다

B) EventBridge Scheduler의 Flexible Time Window로 실행을 15분 윈도우에 분산(지터 주입)

C) Lambda 동시성 한도를 늘린다

D) 작업을 5개 그룹으로 수동 분할해 각각 다른 cron을 건다

**정답: B**

해설: 모든 작업이 같은 시각에 터지는 thundering herd(쇄도)는 분산 시스템의 고전 문제이며, 해법은 지터(jitter) 주입이다. EventBridge Scheduler의 Flexible Time Window는 "정확히 그 시각"이 아니라 "이 윈도우 안 어디든"으로 실행을 시간축에 퍼뜨려 부하를 분산한다. 같은 원리가 재시도의 exponential backoff with jitter, 캐시 만료 분산에 쓰인다. 시각을 당기거나(A) 동시성을 늘리는 것(C)은 근본 원인인 동시 쇄도를 해결하지 못하고, 수동 분할(D)은 운영 부담만 늘린다.

---

**문제 3.** SQS 큐의 메시지를 폴링해 이벤트 패턴으로 거르고, 부족한 정보를 외부 API로 보강한 뒤 DynamoDB에 저장하는 흐름을 글루 코드 없이 구성하려 한다. 가장 적합한 것은?

A) Lambda를 직접 작성해 폴링·필터·보강·저장을 모두 처리

B) EventBridge Pipes (Source → Filter → Enrichment → Target)

C) SNS 팬아웃

D) Kinesis Data Analytics

**정답: B**

해설: EventBridge Pipes는 파이프-필터 아키텍처의 구현으로, 폴링이 필요한 소스(SQS/Kinesis/DynamoDB Streams/MSK)를 받아 Filter(이벤트 패턴) → Enrichment(Lambda/Step Functions/API Destination) → Target으로 관리형으로 연결한다. 폴링·배치·에러 처리 같은 배관 코드를 AWS가 흡수하므로, 직접 Lambda를 짜는 것(A) 대비 글루 코드가 사라진다. 또한 Filter 단계가 Enrichment 앞에 있어, 불필요한 이벤트를 비싼 보강 전에 버리는 early filtering(predicate pushdown) 경제학을 제공한다. SNS(C)는 폴링 소스 통합·보강 단계가 없다.

---

**문제 4.** 결제 처리 Lambda의 버그로 6월 1일 새벽 시간대 이벤트가 잘못 처리됐다. 버그를 고친 뒤 그 시간대 이벤트만 재처리하려 한다. 전제로 미리 해뒀어야 할 것과 해법은?

A) CloudTrail 로그를 파싱해 이벤트를 수동 재구성

B) EventBridge Archive를 미리 설정해 뒀다면 start-replay로 해당 기간 이벤트를 다시 흘려보냄

C) DynamoDB 백업에서 복원

D) S3 버전 관리로 롤백

**정답: B**

해설: EventBridge Archive는 버스를 지나는 이벤트를 보관하고, Replay로 특정 기간의 이벤트를 다시 버스로 흘려보낸다. 이는 이벤트 소싱의 "이벤트 스트림 리플레이로 재처리"라는 통찰을 빌린 것으로, 버그 수정 후 해당 시간대 이벤트를 재처리하는 전형적 사고 복구 패턴이다. 단, Archive는 사전에 설정돼 있어야 하며 보존 기간 내여야 한다. CloudTrail(A)은 API 호출 감사용이지 이벤트 페이로드 재생용이 아니고, DynamoDB 백업(C)·S3 버전(D)은 이벤트 재처리가 아니라 데이터 상태 복원이다.

---

**문제 5.** EventBridge로 결제 이벤트를 처리하는데, 같은 이벤트가 가끔 두 번 처리돼 이중 청구가 발생한다. 근본 원인과 해법은?

A) EventBridge가 고장났다 — 지원팀에 문의

B) EventBridge 전달은 at-least-once라 중복이 정상 — 컨슈머에 멱등성 로직(이벤트 ID 기반 중복 차단)을 추가

C) RetryPolicy를 0으로 설정

D) DLQ를 제거

**정답: B**

해설: EventBridge 전달 보장은 at-least-once(최소 1회)로, 분산 시스템 특성상 같은 이벤트가 두 번 전달될 수 있다. exactly-once는 일반적으로 보장되지 않으므로, 중복 처리를 막는 책임은 컨슈머에 있다 — 이벤트 ID를 키로 한 멱등성 로직(DynamoDB conditional write, Lambda Powertools Idempotency 등)을 둬야 한다. RetryPolicy를 0으로(C) 하면 일시 실패 시 이벤트가 유실되고, DLQ 제거(D)는 영구 실패 이벤트를 잃는다. 중복은 버그(A)가 아니라 설계된 동작이다.

---

**문제 6.** 여러 워크로드 계정의 이벤트를 보안 계정의 중앙 버스로 모아 조직 전체를 한 곳에서 감지·대응하려 한다. 올바른 구성은?

A) 각 계정에서 Lambda로 보안 계정 API를 직접 호출

B) 수신 측 중앙 버스에 put-permission으로 송신 계정의 PutEvents를 허용하고, 송신 측 Rule의 Target을 중앙 버스로 지정(hub-and-spoke 이벤트 메시)

C) VPC Peering으로 이벤트 전달

D) S3 크로스 계정 복제

**정답: B**

해설: 크로스 계정 이벤트 라우팅은 두 단계다 — 수신 측 버스에 리소스 정책(put-permission)으로 송신 계정의 events:PutEvents를 허용하고, 송신 측은 Rule의 Target을 상대 계정 버스 ARN으로 지정한다. 이렇게 워크로드 계정(spoke)이 중앙 보안 계정 버스(hub)로 이벤트를 보내면 hub-and-spoke 이벤트 메시가 된다. 이는 AWS Organizations의 위임 관리자처럼 관측·권한을 중앙으로 모으되 워크로드는 격리하는 거버넌스 사상이다. VPC Peering(C)은 네트워크 계층이지 이벤트 라우팅이 아니고, S3 복제(D)는 객체 복제다.

---

**문제 7.** Event Pattern `{"detail": {"state": ["FAILED"]}}`에 대한 설명으로 옳은 것은?

A) 이벤트 JSON이 이 패턴과 정확히 같아야(완전 일치) 매칭된다

B) 부분 일치(subset match)로, detail.state가 FAILED인 모든 이벤트를 잡고 그 외 필드는 무시한다

C) state 값을 배열이 아닌 `"FAILED"` 문자열로 써도 동일하게 동작한다

D) 여러 키는 OR, 한 키 안의 배열은 AND로 묶인다

**정답: B**

해설: Event Pattern은 부분 일치(subset match)다 — 패턴에 명시한 필드만 검사하고 이벤트의 나머지 필드는 무시하므로, state가 FAILED이기만 하면 다른 필드가 무엇이든 매칭된다. 값은 항상 배열이어야 하며 `"FAILED"` 문자열(C)은 틀리고 `["FAILED"]` 배열이 맞다. 의미론은 서로 다른 키가 AND(모두 만족), 한 키 안의 배열이 OR(하나만 만족)로, D의 설명은 정반대다. 완전 일치(A)가 아니라 부분 일치라는 점이 EventBridge 패턴의 핵심이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, EventBridge는 EAI/EIP의 메시지 버스·Content-Based Router·Message Translator 패턴을 AWS에 구현했고, 발신자가 수신자를 모르게 해 결합도를 끊으며, SNS(거친 팬아웃)·SQS(점대점 큐)와 메시징 스펙트럼의 다른 지점에 있다. 둘째, Event Pattern 매칭은 순차 비교가 아니라 결정 트리/상태 기계(quamina, Rete 계열)로 컴파일되어 규칙 수에 무관하게 빠르고, 부분 일치 의미론과 "키=AND, 배열=OR" 규칙을 가진다. 셋째, EventBridge Scheduler는 수백만 스케줄과 Flexible Time Window(지터)로 thundering herd를 막는 CloudWatch cron의 후계자다. 넷째, Pipes는 파이프-필터 아키텍처로 폴링 소스의 글루 코드를 관리형으로 흡수하고 early filtering으로 비용을 절감한다. 다섯째, Archive/Replay는 이벤트 소싱의 재처리 통찰을 빌렸고, EventBridge는 at-least-once 전달이므로 컨슈머는 멱등해야 하며, Schema Registry로 이벤트 계약을 코드화한다.
