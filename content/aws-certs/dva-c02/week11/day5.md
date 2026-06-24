# Day 5 - Week 11 종합: 메시징의 모델을 가르는 질문들

Week 11에서 다룬 다섯 서비스—SQS, SNS, Kinesis, Step Functions, AppSync—는 표면적으로 모두 "데이터나 작업을 한 곳에서 다른 곳으로 옮긴다." 그래서 시험은 거의 항상 "이 시나리오에 무엇이 맞는가"를 묻는다. 단편적 암기로는 헷갈리는 비교(SQS vs Kinesis, SNS vs EventBridge, Standard vs Express)를 매번 틀린다. 이번 복습은 다섯 서비스를 다시 나열하는 대신, **이들을 가르는 근본 질문 몇 가지**로 재구성한다. 어떤 시나리오를 만나든 이 질문들을 순서대로 던지면 답이 좁혀진다.

## 모델을 가르는 네 가지 질문

### 질문 1: 한 메시지를 몇 명이 받는가? (1:1 vs 1:N)

이것이 SQS와 SNS를 가르는 첫 갈림길이다.

- **1:1 (한 작업 = 한 처리자)** → **SQS**. 주문 처리, 이미지 변환 같은 "작업 큐". 한 메시지는 한 소비자가 가져가 처리하면 사라진다(포인트-투-포인트).
- **1:N (한 이벤트 → 여러 반응)** → **SNS**(또는 EventBridge). 주문 생성 하나에 재고·결제·알림이 동시 반응. 발행 즉시 모든 구독자에게 푸시(발행-구독).

둘을 결합한 **팬아웃**(SNS→여러 SQS)은 "1:N으로 퍼뜨리되 각 소비자는 안정적 버퍼·재시도를 갖는다"를 동시에 얻는 구조다.

### 질문 2: 소비하면 데이터가 사라지는가? (파괴적 읽기 vs 보존 로그)

이것이 SQS와 Kinesis를 가르는 가장 본질적인 질문이다.

- **소비 = 삭제** → **SQS**. 한 번 처리하면 끝. 재처리·다중 소비 불가.
- **읽어도 보존(로그)** → **Kinesis Data Streams**. 여러 소비자가 각자 위치에서 동시에 읽고, 어제 데이터를 새 코드로 재처리(replay)할 수 있다. 소비자는 체크포인트로 자기 위치를 책임진다.

"여러 분석 시스템이 같은 스트림을 동시에", "버그 수정 후 과거 데이터 재처리", "초당 수십만 이벤트 + 순서"가 보이면 Kinesis다.

### 질문 3: 내가 처리하는가, 그냥 보내기만 하는가? (Data Streams vs Firehose)

Kinesis 안에서의 갈림길이다.

- **코드로 직접 처리(실시간, 낮은 지연)** → **Data Streams** + Lambda/KCL.
- **목적지로 자동 적재(코드 없이, 1분 지연 허용)** → **Firehose** → S3/Redshift/OpenSearch/Splunk.

"S3에 자동 저장", "Parquet 변환", "서버리스 ETL"이면 Firehose. "초저지연 실시간"이면 Data Streams.

### 질문 4: 흐름을 명시적으로 엮어야 하는가? (떼어놓기 vs 오케스트레이션)

- **단계들을 순서·분기·재시도·롤백으로 엮음** → **Step Functions**. 가시성과 에러 처리가 필요한 멀티스텝 비즈니스 프로세스.
- **다중 백엔드 데이터를 한 쿼리로 + 실시간** → **AppSync**(GraphQL).

> 💡 **관련 이론**: 이 네 질문은 사실 메시징·통합의 고전 분류축과 일치한다 — (1) point-to-point vs pub/sub, (2) destructive read vs log-based, (3) processing vs delivery, (4) choreography vs orchestration. Gregor Hohpe의 *Enterprise Integration Patterns*(2003)와 Jay Kreps의 로그 중심 사상(2013)이 이 축들을 정립했다. AWS의 다섯 서비스는 이 보편적 축들 위의 각기 다른 좌표다. 그래서 한 서비스의 특성을 외우기보다 "이 서비스는 어느 축의 어느 쪽인가"로 위치를 잡으면, 비교 문제가 좌표 읽기로 바뀐다.

## 핵심 숫자 — 시험은 이 경계값을 노린다

| 서비스 | 항목 | 값 |
|--------|------|-----|
| SQS | 메시지 최대 크기 | **256 KB** (초과 시 Extended Client → S3, 2GB) |
| SQS | 보존 기간 | 60초 ~ **14일** (기본 4일) |
| SQS | 가시성 타임아웃 | 0 ~ **12시간** (기본 30초) |
| SQS | 메시지 지연 | 0 ~ 15분 |
| SQS FIFO | 처리량 | 300 msg/s, 배치 3,000, 고처리량 70,000+ |
| SNS | 메시지 보존 | **없음** (전달 실패 시 소실) |
| SNS | 구독자 수/토픽 | 12,500,000 |
| Kinesis | 샤드 쓰기 | 1 MB/s 또는 1,000 records/s |
| Kinesis | 샤드 읽기(클래식) | 2 MB/s 공유 / (EFO) 2 MB/s 소비자별 |
| Kinesis | 보존 | 24시간 ~ **365일** |
| Kinesis | On-Demand 한도 | 200 MB/s, 200,000 RPS |
| Firehose | 최소 지연 | **60초** (Near Real-Time) |
| Step Functions | Standard / Express | 1년·exactly-once / 5분·at-least-once |

> ⚠️ **함정**: 가장 자주 틀리는 경계값 셋 — (1) **Firehose는 실시간이 아니다**(최소 60초). "실시간"이 보이면 Data Streams. (2) **SNS는 보존이 없다**. "전달 실패 시 유실 방지"는 SQS를 끼우거나 구독 DLQ. (3) **Lambda-SQS 가시성 타임아웃은 함수 타임아웃의 6배**. 이걸 안 지키면 중복 처리.

## 헷갈리는 비교 정리

| A | B | 핵심 차이 |
|---|---|----------|
| SQS Standard | SQS FIFO | 무제한·순서X·중복가능 vs 300/s·순서·5분 dedup |
| SQS | SNS | Pull·1:1·보존 vs Push·1:N·비보존 |
| SNS | EventBridge | 단순 복제 배포·속성 필터 vs 풍부한 이벤트 패턴 라우팅·스키마 |
| Kinesis Data Streams | SQS | 보존 로그·다중 소비·재처리 vs 파괴적 읽기·단일 소비 |
| Data Streams | Firehose | 직접 처리·실시간 vs 자동 적재·60초+ |
| Classic | Enhanced Fan-Out | 공유 2MB/s·폴링 vs 소비자별 2MB/s·HTTP/2 푸시 |
| SF Standard | Express | 1년·exactly-once·비쌈 vs 5분·at-least-once·고처리량 |
| `.sync` | `.waitForTaskToken` | 기계 작업 완료 대기 vs 외부/인간 콜백 대기 |
| AppSync | API Gateway | GraphQL·다중 소스·내장 구독 vs REST·단일 백엔드 |

> 🔍 **더 깊이**: SNS와 EventBridge의 구분은 최근 시험에서 비중이 커졌다. 둘 다 "이벤트를 여러 대상에 보낸다"지만, SNS는 **단순·고속 복제 배포**(속성 기반 필터, 초고처리량)에 강하고, EventBridge는 **풍부한 라우팅**(이벤트 본문 전체에 대한 패턴 매칭, 스키마 레지스트리, SaaS 통합, 스케줄링)에 강하다. 대략의 기준: "같은 메시지를 여러 큐/함수에 빠르게 뿌린다"면 SNS, "이벤트 내용에 따라 복잡하게 분기·변환·외부 SaaS 연동"이면 EventBridge다. 시험이 "정석적 팬아웃"을 물으면 여전히 SNS+SQS가 기본 답이지만, "내용 기반 복잡 라우팅"이면 EventBridge다.

## 실패 처리 — 서비스마다 다른 안전망

각 서비스가 "실패한 메시지/작업"을 어떻게 다루는지는 단골 출제 포인트다.

- **SQS**: `maxReceiveCount` 초과 시 **DLQ**(같은 유형끼리). 독이 든 메시지 격리.
- **SNS**: 비보존이지만 **구독 DLQ**(redrive)로 전달 실패 메시지 보존.
- **Kinesis**: 순서 보존 때문에 실패 레코드가 **뒤를 막음**(head-of-line blocking). Lambda ESM의 `BisectBatchOnFunctionError`·`MaximumRetryAttempts`·실패 대상(SQS/SNS)으로 완화.
- **Step Functions**: 상태별 `Retry`(백오프)와 `Catch`(오류 분기), 보상 트랜잭션(Saga).

> 📚 **사례**: 세 종류의 DLQ를 시험이 교묘하게 섞는다. **SQS DLQ**(큐 메시지가 maxReceiveCount 초과), **SNS 구독 DLQ**(구독자 전달 실패), **Lambda DLQ**(Lambda 비동기 호출 실패). 같은 "DLQ"여도 잡는 실패의 계층이 다르다. 예: "SNS가 HTTPS 엔드포인트 전달에 실패한 메시지 보존" → SNS 구독 DLQ. "Lambda가 비동기 이벤트 처리에 실패" → Lambda DLQ(또는 Destinations). "SQS 메시지가 3번 처리 실패" → SQS DLQ. 문구에서 "어느 단계의 실패인가"를 먼저 짚어야 한다.

## 약어 빠른 참조

| 약어 | 풀네임 |
|------|--------|
| SQS / SNS | Simple Queue / Notification Service |
| DLQ | Dead Letter Queue |
| KDS / KDF | Kinesis Data Streams / Firehose |
| KCL / KPL | Kinesis Client / Producer Library |
| EFO | Enhanced Fan-Out |
| ESM | Event Source Mapping |
| FSM | Finite State Machine (Step Functions의 토대) |
| Saga | 분산 트랜잭션 보상 패턴 |
| APNs / FCM | Apple / Google 모바일 푸시 |
| WAL | Write-Ahead Log (로그 모델의 뿌리) |

---

## 📝 Week 11 종합 연습 문제

**문제 1.** 결제 트랜잭션을 고객별 순서대로, 중복 없이 정확히 한 번 처리해야 한다. 초당 약 4,000건이 발생한다. 적절한 구성은?

A) SQS 표준 큐에 멱등 소비자를 두고 시퀀스 번호로 고객별 순서를 애플리케이션에서 재정렬한다

B) 고처리량 FIFO 큐 + 고객 ID를 메시지 그룹 ID로 사용

C) 모든 메시지에 동일한 단일 그룹 ID를 부여한 FIFO 큐로 전역 순서를 강제한다

D) Kinesis Data Streams 단일 샤드에 고객 ID를 파티션 키로 넣어 순서를 보장한다

**정답: B**

해설: 순서가 **고객별**로만 필요하므로, **고처리량 FIFO**에 **고객 ID를 메시지 그룹 ID**로 쓰면 같은 고객 안에서만 순서·dedup을 지키고 서로 다른 고객은 병렬 처리되어 4,000건/s를 소화한다. A) 표준은 순서·정확히-1회를 보장하지 않는다. C) 단일 그룹은 전역 순서를 주지만 300 msg/s에 묶여 4,000건/s를 못 받는다. D) 단일 샤드는 1MB/s·1,000 RPS로 부족하다.

---

**문제 2.** S3 객체 업로드 하나에 썸네일 생성·바이러스 검사·검색 색인 세 작업이 독립적으로(한 작업의 실패가 다른 작업에 영향 없이) 반응해야 한다. 가장 정석적인 패턴은?

A) S3 이벤트 → 단일 Lambda에서 썸네일·바이러스 검사·색인을 try/catch로 묶어 순차 실행

B) S3 → SNS → 세 개의 SQS(각각 Lambda) 팬아웃

C) S3 → 단일 SQS → Lambda가 메시지를 받아 세 작업을 모두 수행하고 ack한다

D) 동일 객체를 세 버킷에 복제 업로드해 각 버킷 이벤트가 작업 하나씩 트리거하게 한다

**정답: B**

해설: 세 작업의 **독립성**(개별 버퍼·재시도·DLQ)이 핵심이므로 **SNS→여러 SQS 팬아웃**이 정석이다. 바이러스 검사가 실패해도 썸네일·색인에는 영향이 없고, SQS가 각 소비자 다운 시 메시지를 보존한다. A) 순차 실행은 한 작업 실패가 전체를 막고 독립 확장이 안 된다. C) 단일 큐는 한 소비자만 가져가 1:N이 안 된다. D) 같은 객체 삼중 업로드는 비현실적이다. (EventBridge 다중 타깃도 가능하나 "정석적 팬아웃"은 SNS+SQS.)

---

**문제 3.** 클릭스트림을 Lambda로 실시간 이상 탐지하면서, 동시에 모든 원본을 S3에 아카이브해 나중에 Athena로 분석하려 한다. 적절한 구성은?

A) SQS 큐 하나에 이상 탐지 Lambda와 아카이브 Lambda 두 소비자를 붙여 같은 메시지를 둘 다 받게 한다

B) Kinesis Data Streams에 Lambda 소비자와 Firehose 소비자를 동시 연결(Firehose→S3)

C) SNS 토픽 → 탐지 SQS와 아카이브 SQS 두 개로 팬아웃해 각각 Lambda·S3로 보낸다

D) DynamoDB Streams로 클릭 테이블 변경을 캡처해 Lambda 탐지와 S3 적재를 동시에 한다

**정답: B**

해설: Kinesis Data Streams의 **다중 독립 소비**로, 한 스트림을 Lambda(실시간 탐지)와 Firehose(S3 아카이브)가 동시에 읽는다. 데이터가 로그에 보존되므로 둘이 간섭 없이 각자 위치에서 소비한다. A) SQS는 한 메시지를 한 소비자만 가져가 같은 데이터를 둘이 못 읽는다. C) SNS는 비보존·스트리밍 부적합. D) DDB Streams는 테이블 변경 캡처용이지 클릭스트림 수집용이 아니다.

---

**문제 4.** Firehose로 로그를 S3에 적재 중인데 "데이터가 1분 정도 늦게 도착한다"는 불만이 있다. 1초 이내 실시간 처리가 필수라면?

A) Firehose 버퍼 크기를 128MB로 키워 한 번에 더 많이 flush하면 도착이 빨라진다

B) Kinesis Data Streams를 직접 소비(Lambda/EFO)하도록 변경한다

C) Firehose 버퍼 간격(buffer interval)을 0초로 설정해 즉시 전달되게 한다

D) Firehose 앞단을 SQS로 전환해 짧은 가시성 타임아웃으로 1초 내 처리한다

**정답: B**

해설: Firehose는 구조적으로 **최소 60초 버퍼링**(Near Real-Time)이라 1초 이내 처리가 불가능하다. 초저지연이 필수면 **Data Streams를 직접 소비**해야 하고, 더 낮은 지연이 필요하면 EFO(~70ms)를 쓴다. A) 버퍼를 키우면 지연이 더 커진다. C) Firehose 버퍼 시간은 60초 미만으로 못 내린다. D) SQS는 스트리밍·다중 소비에 부적합하다.

---

**문제 5.** SNS를 통해 Lambda로 직접 푸시하던 중, Lambda가 잠시 다운된 사이 발행된 알림이 영구 유실됐다. 내구성을 확보하려면?

A) SNS 토픽에 메시지 보존 기간을 7일로 설정해 Lambda 복구 후 재전달되게 한다

B) SNS → SQS → Lambda로 바꿔 SQS가 메시지를 보존하게 한다

C) Lambda 예약 동시성을 높여 다운 시간을 줄이고 재시도 처리량을 확보한다

D) SNS 발행 속도를 스로틀링해 Lambda가 감당할 수 있는 만큼만 보내 유실을 막는다

**정답: B**

해설: **SNS는 비보존**이라 재시도 소진 시 메시지가 사라진다. SNS가 **SQS에 푸시**하면 SQS가 최대 14일 보존해 Lambda가 살아날 때까지 안전하게 대기한다. (또는 SNS 구독 DLQ로 실패 메시지를 잡을 수도 있다.) A) SNS에는 설정할 보존 기간이 없다. C·D는 유실 원인과 무관하다.

---

**문제 6.** Kinesis 스트림에서 특정 샤드만 `ProvisionedThroughputExceededException`이 나고 다른 샤드는 한가하다. 원인과 해결은?

A) 보존 기간이 짧아 레코드가 만료된 것 — 보존을 24시간에서 7일로 늘려 해결한다

B) 파티션 키 편향으로 핫 샤드 발생 — 키 카디널리티를 높여 고르게 분산

C) 소비자가 EFO를 안 써서 읽기 경합 발생 — EFO를 활성화해 쓰기 스로틀을 해소한다

D) On-Demand 모드가 아니라 용량이 막힌 것 — On-Demand에서 Provisioned로 전환한다

**정답: B**

해설: 특정 샤드만 스로틀링되는 것은 **핫 샤드**의 증상으로, 편향된 파티션 키(낮은 카디널리티)가 레코드를 한 샤드로 몰아 1MB/s·1,000 RPS에서 막힌 것이다. 키를 고르게 분산되도록 설계해야 한다(DynamoDB 핫 파티션과 같은 원리). A) 보존은 쓰기 처리량과 무관. C) EFO는 읽기 측이다. D) On-Demand로 가면 완화될 수 있으나 근본 원인은 키 설계다.

---

**문제 7.** 여러 Lambda를 순서대로 실행하고, 중간 실패 시 이전 단계를 보상(롤백)하며, 운영자가 전체 흐름을 시각적으로 추적해야 한다. 적절한 서비스는?

A) Lambda가 다음 Lambda를 직접 호출하는 체인 + 실패 시 역순 보상 Lambda 호출

B) Step Functions (Retry/Catch + Saga 보상)

C) 단계마다 SQS 큐를 두고 한 Lambda가 끝나면 다음 큐로 메시지를 넘기는 체인

D) EventBridge 규칙으로 각 단계 완료 이벤트를 다음 단계 Lambda에 라우팅하는 체인

**정답: B**

해설: "멀티스텝 + 보상 + 가시성"은 **오케스트레이션**(Step Functions)의 영역이다. 흐름이 상태 언어로 한곳에 명시되어 시각화·추적되고, Catch로 실패를 잡아 보상 단계로 분기하며(Saga), Retry로 자동 재시도한다. A) 직접 체인은 흐름이 코드에 흩어져 롤백·추적이 어렵다. C·D는 순서·분기·보상을 명시적으로 관리·시각화하기 어렵다.

---

**문제 8.** 환불 워크플로에서 고액 건은 관리자 승인을 받아야 하며, 승인까지 며칠이 걸릴 수 있다. 적절한 구성은?

A) Express 워크플로 + Wait 상태로 승인이 올 때까지 며칠간 대기시킨다

B) Standard 워크플로 + `.waitForTaskToken`으로 승인 콜백 대기

C) Standard 워크플로 + `.sync`로 승인 작업이 완료될 때까지 동기 대기한다

D) SQS 지연 큐에 환불 메시지를 넣고 며칠 뒤 자동 처리되게 한다

**정답: B**

해설: 인간 승인(며칠)을 기다리려면 **Standard**(최대 1년)와 **`.waitForTaskToken`**(외부 콜백 대기)을 결합한다. 토큰을 발급해 멈추고, 관리자가 승인하면 `SendTaskSuccess` 콜백으로 재개한다. A) Express는 5분 한도라 며칠 대기 불가. C) `.sync`는 기계 작업 완료 대기용이지 인간 콜백용이 아니다. D) 지연 큐는 고정 지연일 뿐 "승인될 때까지"가 아니다.

---

**문제 9.** 모바일 앱이 한 화면에 사용자(DynamoDB)·주문(Lambda)·추천(OpenSearch)을 한 번에 가져오고, 주문 상태 변경을 실시간으로 받아야 한다. 적절한 서비스는?

A) API Gateway REST에 통합 백엔드 Lambda를 두어 세 소스를 합쳐 응답하고 상태 변경은 주기 폴링한다

B) AWS AppSync (다중 리졸버 + `@aws_subscribe` 실시간 구독)

C) 사용자·주문·추천 각각의 REST 엔드포인트 3개를 호출하고 상태 변경은 클라이언트 폴링으로 받는다

D) Kinesis Firehose로 세 소스를 모아 S3에 적재한 뒤 클라이언트가 조회하게 한다

**정답: B**

해설: **AppSync**는 한 GraphQL 쿼리에서 필드별로 다른 데이터 소스를 리졸버로 매핑해 한 번에 모으고(under-fetching·다중 왕복 해결), WebSocket 기반 실시간 구독을 내장한다. A·C) REST는 여러 왕복이 필요하고 실시간 구독이 기본 제공되지 않으며 폴링은 비효율적이다. D) Firehose는 데이터 적재용이지 클라이언트 API가 아니다.

---

**문제 10.** Lambda가 SQS 큐를 소비하는데 같은 메시지가 중복 처리된다. 함수 타임아웃은 60초다. 가장 적절한 조치는?

A) 가시성 타임아웃을 30초로 줄인다

B) 가시성 타임아웃을 함수 타임아웃의 6배 이상(약 360초)으로 설정

C) 롱 폴링을 끈다

D) FIFO로 바꾸면 무조건 해결된다

**정답: B**

해설: 처리(함수 실행 + 배치 + 폴러 지연)가 가시성 타임아웃보다 길면 잠금이 만료되어 메시지가 재출현하고 중복 처리된다. AWS는 Lambda ESM에서 가시성 타임아웃을 **함수 타임아웃의 최소 6배**로 권고한다. A) 줄이면 중복이 악화된다. C) 롱 폴링은 빈 응답 비용 문제이지 중복과 무관하다. D) FIFO도 dedup은 5분 윈도우 한정이고 소비자 측 재처리까지 막진 못한다 — 근본 조치는 가시성 타임아웃 정렬과 멱등성이다.

---

**문제 11.** SNS가 HTTPS 엔드포인트로의 전달에 반복 실패한 메시지를 보존해 분석하려 한다. 적절한 방법은?

A) SNS 토픽에 메시지 보존을 켜서 전달 실패분이 토픽에 남도록 한다

B) 해당 구독에 redrive policy로 SNS DLQ(SQS 큐)를 설정한다

C) 구독 대상 함수에 Lambda DLQ를 붙여 비동기 호출 실패 메시지를 보존한다

D) HTTPS 엔드포인트 앞에 SQS를 두고 maxReceiveCount 초과분을 SQS DLQ로 보낸다

**정답: B**

해설: SNS 자체는 비보존이지만, **구독 단위 DLQ(redrive policy)** 를 설정하면 재시도 소진 후 전달 실패 메시지를 지정 SQS 큐로 보내 보존한다. A) SNS에 켤 보존 기능은 없다. C) Lambda DLQ는 "Lambda 비동기 호출 실패"용 다른 계층이다. D) SQS DLQ는 "SQS 큐 메시지가 maxReceiveCount 초과"용이라 여기 상황(SNS 전달 실패)과 다르다 — 같은 "DLQ"라도 잡는 실패 계층이 다르다.

---

**문제 12.** 세 소비자가 같은 Kinesis 스트림을 각각 수십 ms 지연으로 읽어야 하고 서로 처리량을 빼앗으면 안 된다. 적절한 기능은?

A) 클래식 공유 읽기에 GetRecords 폴링 간격을 줄여 세 소비자가 충분히 빠르게 읽게 한다

B) Enhanced Fan-Out으로 소비자별 전용 2 MB/s를 HTTP/2 푸시 제공

C) 샤드를 3배로 늘려 소비자마다 사실상 전용 처리량을 확보하고 지연을 낮춘다

D) Firehose로 전환해 세 소비자가 각자 버퍼링된 배치를 받게 한다

**정답: B**

해설: 클래식 읽기는 샤드당 2 MB/s를 **모든 소비자가 공유**하고 폴링이라 지연이 크다(소비자 3개면 각 ~0.67 MB/s). **Enhanced Fan-Out**은 소비자별 전용 2 MB/s를 HTTP/2 푸시로 줘, 간섭 없이 ~70ms로 읽는다. A) 공유는 처리량을 나눠 쓰고 지연이 크다. C) 샤드를 늘려도 클래식은 여전히 공유라 근본 해결이 아니다. D) Firehose는 60초 버퍼링이라 낮은 지연 요건에 부적합하다.
