# Day 2 - CloudWatch Logs: 그룹·스트림·구독·Insights의 깊은 이야기

로그는 운영의 블랙박스다. 무언가 잘못됐을 때 "무슨 일이 있었는지"를 알려주는 거의 유일한 일차 증거다. 그런데 분산 시스템에서 로그는 곧바로 문제가 된다. 수백 개의 Lambda, 수천 개의 컨테이너, 온프레미스 서버들이 각자 로그를 토해내는데, 이걸 어디에 모으고, 어떻게 시간순으로 정렬하고, 어떻게 검색하고, 실시간으로 특정 패턴을 어떻게 잡아내고, 그리고 — 가장 현실적으로 — 폭발하는 로그 비용을 어떻게 통제할 것인가. CloudWatch Logs는 AWS 위의 거의 모든 서비스가 로그를 흘려보내는 중앙 싱크이고, 그 위에 실시간 라우팅(Subscription)·메트릭 추출(Metric Filter)·대화형 분석(Insights)이 쌓여 있다.

오늘은 이 로그 파이프라인의 내부로 들어간다. 단순히 "로그가 그룹과 스트림으로 나뉜다"가 아니라, 왜 이 두 단계 계층이 존재하는지, Subscription Filter가 어떻게 로그를 거의 실시간으로 다른 서비스로 흘려보내는지, Logs Insights의 쿼리 엔진이 어떤 방식으로 동작하고 왜 스캔량으로 과금되는지, 그리고 로그가 왜 이렇게 비싸고 그 비용을 어떻게 잡는지를 파고든다. DOP 시험에서 로그는 "실시간으로 OpenSearch에 적재", "외부 NGINX 로그에서 알람", "멀티계정 중앙 집계", "로그 비용 폭증 통제" 같은 시나리오로 매 회 등장한다.

## Log Group과 Log Stream — 왜 두 단계인가

CloudWatch Logs의 가장 기초 구조는 **Log Group**과 **Log Stream**이라는 두 계층이다. 많은 사람이 이걸 단순한 폴더/파일 정도로 보지만, 이 두 계층의 분리에는 분명한 이유가 있다.

**Log Group**은 논리적 단위 — 보통 하나의 애플리케이션이나 서비스다(`/aws/lambda/MyFn`, `/ecs/checkout`). 보존 정책(retention), 암호화 키(KMS), 접근 권한, 메트릭 필터, 구독 필터가 **모두 그룹 레벨**에 걸린다. 즉 그룹은 "정책의 단위"다.

**Log Stream**은 물리적 단위 — 하나의 로그 출처다(특정 Lambda 함수 인스턴스, 특정 EC2, 특정 컨테이너). 로그 이벤트는 스트림 안에 시간순으로 적재된다.

이 분리가 왜 중요한가. **순서 보장의 경계가 스트림이기 때문**이다. CloudWatch는 한 스트림 안에서는 이벤트의 시간 순서를 보장하지만, 서로 다른 스트림 사이에는 보장하지 않는다. 만약 모든 출처가 하나의 스트림에 섞여 들어오면, 여러 출처가 동시에 쓸 때 순서가 엉키고 쓰기 경합이 생긴다. 출처마다 별도 스트림을 두면 각 출처는 자기 스트림에만 순차로 쓰면 되고, 그룹은 이 스트림들을 한 정책 우산 아래 묶는다.

> 💡 **관련 이론**: Log Group/Stream의 2단 구조는 분산 로그 시스템의 보편적 패턴이다. Apache Kafka의 토픽(topic)/파티션(partition)이 정확히 같은 발상 — 토픽이 논리 단위(정책·소비자 그룹), 파티션이 순서 보장의 물리 단위다. Kafka가 "순서는 파티션 안에서만 보장"하듯, CloudWatch도 "순서는 스트림 안에서만 보장"한다. 이 설계의 본질은 **병렬 쓰기 처리량과 순서 보장의 트레이드오프**다. 출처별로 스트림(파티션)을 쪼개면 병렬 쓰기가 가능해 처리량이 오르고, 각 출처 내부의 인과 순서는 유지된다. 전역 전순서(total order)를 포기하는 대신 확장성을 얻는 것 — 분산 시스템 설계의 고전적 절충이다.

## Retention — 기본값이 만드는 비용 함정

Log Group을 만들면 기본 보존 정책은 **Never Expire(무제한)**다. 이것이 가장 흔하고 비싼 함정이다. 명시적으로 retention을 설정하지 않으면 로그가 영원히 쌓이고, CloudWatch Logs의 저장 비용이 끝없이 누적된다.

```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/MyFn \
  --retention-in-days 14
```

보존 가능한 값은 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653일(또는 무제한)로 이산적이다. 임의의 일수가 아니라 정해진 값만 된다.

> ⚠️ **함정**: 수십~수백 개의 Lambda 함수를 운영하는 조직에서, 함수가 자동 생성하는 Log Group(`/aws/lambda/<함수명>`)은 기본 무제한 보존으로 만들어진다. 개발자가 함수를 배포할 뿐 retention을 따로 안 걸기 때문이다. 1년이 지나면 아무도 안 보는 디버그 로그가 수 TB 쌓여 매달 상당한 저장 비용이 청구된다. 해법은 조직 차원의 자동화다 — 새 Log Group 생성을 EventBridge로 감지해 Lambda가 자동으로 retention을 거는 패턴, 또는 AWS Config 규칙으로 "retention 없는 Log Group"을 비준수로 잡아 자동 교정하는 패턴이 표준이다. "기본값은 비용에 최악"이라는 걸 잊으면 안 된다.

## Subscription Filter — 로그를 실시간으로 흘려보내는 파이프

Logs Insights가 "이미 쌓인 로그를 사후에 검색"하는 것이라면, Subscription Filter는 **로그가 도착하는 순간 실시간으로 다른 곳으로 흘려보낸다**. 이것이 CloudWatch Logs를 단순 저장소에서 실시간 이벤트 소스로 바꾸는 핵심 기능이다.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name ErrorAlerts \
  --filter-pattern '?ERROR ?Exception' \
  --destination-arn arn:aws:lambda:...:function:ErrorRouter
```

대상은 세 가지다. **Lambda**(커스텀 처리 — 에러를 파싱해 Slack으로), **Kinesis Data Streams**(고처리량 팬아웃 — 여러 소비자가 같은 로그를 병렬 소비), **Kinesis Data Firehose**(S3·OpenSearch·Splunk·Datadog로 버퍼링 적재). 어디로 보내느냐로 파이프라인의 성격이 갈린다.

Filter Pattern은 구독·메트릭 필터 공통 문법인데, 이게 의외로 정교하다:

- 단순 텍스트: `"ERROR"` — 이 문자열을 포함한 라인
- 다중 OR: `?ERROR ?WARN` — ERROR 또는 WARN
- JSON 매칭: `{ $.statusCode = 500 }` — JSON 로그의 특정 키-값
- 공백 구분 필드: `[ip, id, user, time, request, status_code=5*, ...]` — NGINX 같은 위치 기반 로그

> 🔍 **더 깊이**: 구독 대상 셋의 선택은 처리 모델의 차이다. **Lambda 직접 대상**은 가장 단순하지만 동시성 한도와 로그 폭주 시 throttling 위험이 있다 — 로그가 초당 수만 건 쏟아지면 Lambda가 따라가지 못한다. **Kinesis Data Streams**는 샤드 기반 버퍼로 폭주를 흡수하고 여러 소비자에게 팬아웃하지만 샤드 관리가 필요하다. **Kinesis Firehose**는 완전관리형 버퍼로 S3·OpenSearch에 배치 적재하기 가장 쉽고 샤드 관리가 없지만 분 단위 버퍼링 지연이 있다. 일반 원칙: 단순 변환·라우팅은 Lambda, 고처리량 다중 소비는 Data Streams, 저장소/검색 엔진 적재는 Firehose. 한 Log Group에는 구독 필터를 제한된 개수만 걸 수 있어, 여러 목적지로 보내려면 보통 Data Streams로 한 번 받아 팬아웃한다.

## Metric Filter — 로그에서 메트릭을 캐내다

Subscription Filter가 로그를 외부로 라우팅한다면, Metric Filter는 로그 라인에서 **숫자를 추출해 CloudWatch 메트릭으로 변환**한다. 그러면 그 메트릭에 알람을 걸 수 있다.

```bash
aws logs put-metric-filter \
  --log-group-name nginx-access \
  --filter-name 5xxCount \
  --filter-pattern '[ip, id, user, time, request, status_code=5*, size, ...]' \
  --metric-transformations \
    metricName=5xxErrors,metricNamespace=NginxLogs,metricValue=1
```

이 필터는 NGINX 액세스 로그의 6번째 필드(status_code)가 5로 시작하는 라인마다 `5xxErrors` 메트릭을 1씩 증가시킨다. 이제 이 메트릭에 알람을 걸면 "NGINX 5xx 급증 시 알림"이 완성된다.

여기서 어제 배운 EMF와의 관계가 중요하다. **새 코드를 직접 짠다면 EMF가 정답**이다 — 로그와 메트릭을 한 번에 통합 게시하니까. 하지만 NGINX·Apache·syslog처럼 **내가 형식을 못 바꾸는 외부 로그**에서 메트릭을 뽑아야 한다면 Metric Filter가 표준이다. EMF는 "내가 짜는 애플리케이션", Metric Filter는 "남이 만든 형식의 로그"라는 역할 분담이다.

> 💡 **관련 이론**: Metric Filter는 로그 스트림을 실시간으로 패턴 매칭해 집계하는 **스트림 처리(stream processing)의 한 형태**다. 무한히 흐르는 로그 이벤트에 패턴(필터)을 적용하고, 매칭되면 카운터를 증가시키는 것은 스트림 위의 윈도우 집계(windowed aggregation)다. 이는 ELK 스택에서 Logstash의 grok 필터 + 메트릭 출력, Splunk의 검색 시 추출(search-time extraction), Fluentd/Fluent Bit의 필터 플러그인과 같은 계보다. 핵심 발상은 **저장 시점 구조화(schema-on-write) vs 읽기 시점 구조화(schema-on-read)**의 절충 — Metric Filter는 적재 시점에 패턴을 평가해 메트릭을 미리 만들어두므로(schema-on-write에 가까움), 사후 Insights 쿼리(schema-on-read)보다 알람이 즉각적이지만 미리 정의한 패턴만 잡는다.

## Logs Insights — 대화형 로그 쿼리 엔진

쌓인 로그를 사후에 탐색할 때는 Logs Insights를 쓴다. SQL은 아니지만 파이프(`|`)로 단계를 잇는 자체 쿼리 언어를 제공한다.

```
fields @timestamp, @message
| filter level = "error"
| stats count() by service
| sort count desc
| limit 20
```

`fields`(표시 필드) → `filter`(WHERE 조건) → `stats`(집계: count/sum/avg/percentile) → `sort` → `limit`로 이어지고, `parse`로 정규식 추출도 한다. JSON 로그라면 `level`, `service` 같은 키가 자동 파싱되어 바로 필터·집계에 쓰인다.

핵심 제약은 두 가지다. **시간 범위를 반드시 지정**해야 하고(전체 로그를 스캔하지 않음), **과금이 스캔한 데이터량 기준**이다. 쿼리가 처리하는 GB당 비용이 붙는다.

> 🔍 **더 깊이**: Logs Insights가 "스캔량 과금"인 것은 엔진이 본질적으로 **분산 풀스캔(distributed full scan)** 이기 때문이다. 미리 만든 역색인(inverted index)으로 검색하는 Elasticsearch/OpenSearch와 달리, Insights는 쿼리 시점에 지정 시간 범위의 로그를 병렬로 읽어 필터·집계한다(Athena가 S3를 스캔하는 것, BigQuery가 컬럼을 스캔하는 것과 같은 모델). 장점은 인덱스 유지 비용이 없고 임의 쿼리가 자유롭다는 것, 단점은 스캔 범위가 클수록 비용·지연이 선형으로 는다는 것이다. 그래서 시간 범위를 좁히고 `filter`를 일찍 거는 것이 성능·비용의 핵심이다. 반대로 상시 빠른 텍스트 검색이 필요하면 로그를 OpenSearch로 흘려 역색인을 쓰는 게 맞다 — 둘은 "인덱스를 미리 만드냐(OpenSearch) 쿼리 때 스캔하냐(Insights)"의 트레이드오프다.

## Live Tail — 실시간 디버깅

Logs Insights가 사후 분석이라면, **Live Tail**은 로그가 도착하는 순간을 실시간으로 흘려보는 `tail -f`의 클라우드 버전이다. 배포 직후나 장애 한가운데서 "지금 무슨 일이 일어나고 있나"를 본다.

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:...:log-group:/aws/lambda/MyFn
```

세션당 시간 제한이 있고, 필터를 걸어 특정 패턴만 흘려볼 수 있다. Insights(사후 통계)와 Live Tail(실시간 관찰)은 같은 로그 데이터의 다른 인터페이스다 — 하나는 "무엇이 일어났나", 하나는 "지금 무엇이 일어나나".

## Cross-Account Logs — 멀티계정 중앙 집계의 두 시대

큰 조직은 계정이 수십 개다. 로그를 한곳에 모아야 하는데, AWS는 이를 두 세대에 걸쳐 풀었다.

**1세대 — Subscription Destination.** 중앙 계정이 `put-destination`으로 수신 지점(보통 Kinesis Data Stream)을 만들고, 거기에 `put-destination-policy`로 출처 계정의 접근을 허용한다. 출처 계정들은 자기 Log Group에 구독 필터를 걸어 그 destination ARN으로 로그를 흘린다.

```bash
# 중앙(수신) 계정
aws logs put-destination \
  --destination-name CrossAcctDest \
  --target-arn arn:aws:kinesis:...:stream/CentralLogStream \
  --role-arn arn:aws:iam::...:role/CWLogsToKinesisRole
aws logs put-destination-policy \
  --destination-name CrossAcctDest \
  --access-policy '{...출처 계정 허용...}'

# 출처 계정
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name CentralizeLogs --filter-pattern '' \
  --destination-arn arn:aws:logs:...:destination:CrossAcctDest
```

**2세대 — Cross-Account Observability(2023+).** 훨씬 단순하다. 모니터링 계정이 Sink를 만들고, 출처 계정이 그 Sink를 신뢰하도록 연결하면, 모니터링 계정 콘솔에서 출처 계정들의 로그·메트릭·추적을 통합 조회한다. 별도 Kinesis 파이프라인 없이 콘솔에서 바로 본다. 단방향이라 출처는 모니터링 계정 데이터를 못 본다.

두 방식은 목적이 다르다. 1세대는 **로그를 물리적으로 중앙으로 이동·가공·재적재**할 때(예: 중앙 S3 데이터레이크, 중앙 OpenSearch), 2세대는 **이동 없이 통합 조회·검색**만 할 때 쓴다.

## 로그 비용 — 왜 비싸고 어떻게 잡는가

로그를 다루는 모든 결정의 배경에는 비용이 있다. CloudWatch Logs 비용은 세 축이다: **수집(ingestion, GB당)**, **저장(storage, GB-월)**, **Insights 쿼리(스캔 GB당)**. 이 중 수집과 저장이 가장 크고, S3 같은 저비용 저장소보다 비싸다.

비용 통제의 표준 패턴은 셋이다. 첫째, **retention을 짧게** 잡아 CloudWatch에는 최근 로그만 두고 오래된 건 만료시킨다. 둘째, **장기 보관이 필요한 로그는 Firehose 구독으로 S3에 흘려** 저비용으로 두고, 검색이 필요하면 Athena로 질의한다. 셋째, **구조화 로그로 양 자체를 줄인다** — 한 줄에 모든 컨텍스트를 담은 JSON 한 줄이 산만한 멀티라인 디버그 출력보다 적게 들고 검색도 쉽다.

> 📚 **사례**: 한 SaaS 기업이 모든 마이크로서비스의 DEBUG 레벨 로그를 CloudWatch에 무제한 보존으로 쏟아냈다. 트래픽이 커지자 로그 비용이 컴퓨트 비용을 넘어섰다 — 정작 아무도 6개월 지난 DEBUG 로그를 조회하지 않는데도. 교정은 세 단계였다: (1) 프로덕션 로그 레벨을 INFO로 올려 수집량 자체를 줄이고, (2) Log Group retention을 14일로 통일하며, (3) 컴플라이언스용 장기 보관 로그만 Firehose로 S3에 보내 Glacier로 전환했다. 이후 로그 비용이 1/5로 줄었다. 교훈: **로그 비용의 대부분은 "아무도 안 보는 로그를 비싼 곳에 오래 두는 것"**이고, 해법은 레벨 조정(양) + 짧은 retention(시간) + S3 cold(저장소)의 조합이다.

> 🎯 **시나리오**: "보안팀이 모든 VPC Flow Log와 애플리케이션 로그를 7년간 보관(컴플라이언스)하되, 평소 운영 조회는 최근 2주만 하면 된다고 한다. CloudWatch에 7년 무제한 보존하면 비용이 감당 안 된다." — 답은 계층 분리다. CloudWatch Logs는 retention 14일로 두어 운영 조회만 담당하고, 동시에 Subscription Filter(빈 패턴 `''`로 전량) → Kinesis Firehose → S3로 모든 로그를 흘려 7년 보관한다. S3는 라이프사이클 정책으로 일정 기간 후 Glacier/Deep Archive로 전환해 보관 비용을 최소화하고, 드물게 필요한 장기 조회는 Athena로 S3를 직접 쿼리한다. "뜨거운 최근 로그는 CloudWatch, 차가운 장기 로그는 S3"라는 핫/콜드 계층화가 핵심이다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **Log Group(정책 단위)/Log Stream(순서 보장 단위)의 2단 구조**는 Kafka의 토픽/파티션과 같은, 병렬 쓰기와 순서 보장의 절충이다. 둘째, **기본 retention은 무제한이라 비용 함정**이고, 조직 차원의 자동 retention 강제가 필요하다. 셋째, **Subscription Filter는 로그를 실시간으로 Lambda/Kinesis/Firehose로 라우팅**하며 대상 선택이 처리 모델을 결정한다. 넷째, **Metric Filter는 외부 로그(NGINX 등)에서 메트릭을 추출**하는 schema-on-write 도구로 EMF와 역할을 나눈다. 다섯째, **Logs Insights는 스캔 기반 풀스캔 엔진**(스캔량 과금)이라 시간 범위·조기 필터가 핵심이고, 비용 통제는 짧은 retention + S3 cold + 구조화 로그의 조합이다.

다음 글에서는 Container Insights와 Lambda Insights, 그리고 EMF를 깊이 본다. 워크로드 종류별로 관찰성을 어떻게 다르게 계측하는지, EMF의 다중 차원 조합이 어떻게 동작하는지, 그리고 카디널리티가 어떻게 비용 폭탄이 되는지로 이어진다.

---

## 📝 연습 문제

**문제 1.** 여러 출처(컨테이너 인스턴스)가 같은 서비스의 로그를 보낸다. CloudWatch가 시간 순서를 보장하는 경계는?

A) Log Group 전체
B) Log Stream 내부 — 한 스트림 안에서만 순서 보장
C) 리전 전체
D) 계정 전체

**정답: B**

해설: CloudWatch Logs는 한 Log Stream 내부에서만 이벤트의 시간 순서를 보장하고, 서로 다른 스트림 사이에는 보장하지 않는다. Kafka가 파티션 안에서만 순서를 보장하는 것과 같은 모델로, 출처마다 스트림을 분리해 병렬 쓰기 처리량을 얻으면서 각 출처 내부의 인과 순서를 유지한다. Log Group(A)은 정책·권한·필터의 단위일 뿐 순서 보장 단위가 아니다.

---

**문제 2.** 수백 개 Lambda 함수의 Log Group이 자동 생성되며 로그 비용이 누적된다. 근본 원인과 해법은?

A) Lambda 메모리 과다 — 메모리 축소
B) 기본 retention이 무제한 — EventBridge로 새 Log Group 생성을 감지해 자동 retention 적용 또는 Config 규칙으로 비준수 교정
C) 리전이 비쌈 — 리전 변경
D) IAM 권한 과다

**정답: B**

해설: Lambda가 자동 생성하는 Log Group의 기본 retention은 Never Expire(무제한)라 로그가 영원히 쌓인다. 조직 차원의 해법은 새 Log Group 생성 이벤트를 EventBridge로 잡아 Lambda가 자동으로 retention을 걸거나, AWS Config 규칙으로 "retention 없는 Log Group"을 비준수로 탐지해 자동 교정하는 것이다. 메모리(A)·리전(C)·IAM(D)은 로그 보존 비용과 무관하다.

---

**문제 3.** 로그를 실시간으로 OpenSearch에 적재하려 한다. 가장 적절한 경로는?

A) Subscription Filter → Kinesis Data Firehose → OpenSearch
B) 매시간 export task로 S3에 내린 뒤 수동 색인
C) Lambda가 Log Group을 1분마다 폴링
D) S3 동기화

**정답: A**

해설: Subscription Filter는 로그 도착 즉시 실시간으로 라우팅하고, Kinesis Firehose는 완전관리형 버퍼로 OpenSearch에 배치 적재하기 가장 단순한 경로다. 샤드 관리가 없고 버퍼링·재시도를 자동 처리한다. export task(B)는 일회성 배치라 실시간이 아니고, 폴링(C)은 지연·비용·throttling 문제가 있으며, S3 동기화(D)는 OpenSearch로 직접 가지 않는다.

---

**문제 4.** 형식을 바꿀 수 없는 외부 NGINX 액세스 로그에서 5xx만 메트릭으로 만들어 알람을 걸려면?

A) EMF로 NGINX 로그를 재작성
B) Metric Filter `[..., status_code=5*, ...]` + 그 메트릭에 CloudWatch Alarm
C) Logs Insights를 5분마다 수동 실행
D) X-Ray

**정답: B**

해설: EMF는 내가 짜는 애플리케이션 코드에 적용하는 것이라 형식을 바꿀 수 없는 외부 로그(NGINX·Apache·syslog)에는 못 쓴다. Metric Filter는 공백 구분 위치 기반 패턴으로 status_code 필드가 5로 시작하는 라인을 매칭해 메트릭을 추출하고, 그 메트릭에 알람을 건다. Insights 수동 실행(C)은 실시간 알람이 아니고, X-Ray(D)는 분산 추적으로 로그 메트릭 추출과 무관하다.

---

**문제 5.** Logs Insights 쿼리 비용이 높다. 비용·성능을 개선하는 가장 직접적 방법은?

A) Log Group을 더 많이 만든다
B) 쿼리의 시간 범위를 좁히고 `filter`를 일찍 걸어 스캔 데이터량을 줄인다
C) retention을 늘린다
D) Live Tail로 대체

**정답: B**

해설: Logs Insights는 역색인 없이 쿼리 시점에 지정 시간 범위를 풀스캔하는 엔진이라 과금이 스캔 데이터량 기준이다. 시간 범위를 좁히고 파이프 초반에 `filter`를 걸어 스캔·처리할 데이터를 줄이면 비용과 지연이 함께 준다. retention 증가(C)는 오히려 비용을 늘리고, Live Tail(D)은 실시간 관찰용이라 사후 통계 쿼리를 대체하지 못한다.

---

**문제 6.** 모든 로그를 7년 컴플라이언스 보관하되 운영 조회는 최근 2주만 필요하다. 비용 최적 설계는?

A) CloudWatch에 7년 무제한 보존
B) CloudWatch retention 14일 + Subscription Filter(전량) → Firehose → S3, S3 라이프사이클로 Glacier 전환, 장기 조회는 Athena
C) 모든 로그를 매일 수동 다운로드
D) OpenSearch에 7년 보관

**정답: B**

해설: 핫/콜드 계층화가 정답이다. CloudWatch Logs는 retention 14일로 운영 조회만 담당하고, 동시에 빈 패턴 구독 필터로 전량을 Firehose → S3로 흘려 7년 보관한다. S3는 라이프사이클로 Glacier/Deep Archive 전환해 보관 비용을 최소화하고, 드문 장기 조회는 Athena로 직접 쿼리한다. CloudWatch 7년 보존(A)·OpenSearch 7년(D)은 저장 비용이 과도하고, 수동 다운로드(C)는 비현실적이다.

---

**문제 7.** 멀티계정 조직에서 로그를 물리적으로 이동·가공하지 않고 중앙 모니터링 계정에서 통합 조회만 하려면(2023+ 모던 방식)?

A) Subscription Destination + Kinesis(1세대)
B) Cross-Account Observability — 모니터링 계정 Sink + 출처 계정 연결로 콘솔 통합 조회
C) 각 계정 로그를 S3로 복사
D) 계정마다 별도 대시보드 수동 운영

**정답: B**

해설: Cross-Account Observability(2023+)는 모니터링 계정이 Sink를 만들고 출처 계정이 이를 신뢰하도록 연결하면, 별도 Kinesis 파이프라인 없이 모니터링 계정 콘솔에서 출처 계정의 로그·메트릭·추적을 통합 조회한다(단방향). 1세대 Subscription Destination(A)은 로그를 물리적으로 중앙으로 이동·재적재할 때 쓰는 방식이고, 이동 없는 통합 조회에는 2세대가 단순하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Log Group(정책·권한·필터의 단위)/Log Stream(순서 보장의 단위)의 2단 구조는 Kafka 토픽/파티션과 같은 병렬 쓰기 대 순서 보장의 절충이다. 둘째, 기본 retention은 무제한이라 비용 함정이며 EventBridge/Config로 자동 retention 강제가 표준이다. 셋째, Subscription Filter는 로그를 실시간으로 Lambda(단순 처리)/Kinesis Data Streams(고처리량 팬아웃)/Firehose(저장소 적재)로 라우팅한다. 넷째, Metric Filter는 형식을 못 바꾸는 외부 로그에서 메트릭을 추출하는 schema-on-write 도구로 EMF와 역할을 나눈다. 다섯째, Logs Insights는 역색인 없는 풀스캔 엔진(스캔량 과금)이라 시간 범위·조기 필터가 핵심이고, 로그 비용 통제는 로그 레벨 조정(양) + 짧은 retention(시간) + S3 cold(저장소)의 조합이다.
