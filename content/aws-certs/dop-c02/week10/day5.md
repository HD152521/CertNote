# Day 5 - Week 10 종합: 관찰성 스택을 인시던트로 엮다

한 주 동안 CloudWatch를 다섯 갈래로 쪼개 봤다. 메트릭(시계열·차원·알람), 로그(그룹·스트림·구독·Insights), 워크로드별 관찰성(Container/Lambda Insights·EMF), 사용자 경험 측정(Synthetics·RUM·Evidently). 그런데 시험과 실무에서 이들은 따로 놀지 않는다. 진짜 인시던트는 이 도구들이 한 줄기로 엮여 "탐지 → 진단 → 근본 원인 → 교정 → 예방"으로 흐른다. 오늘은 한 주의 개념을 다시 한번 압축하고, 그것들이 실제 상황에서 어떻게 함께 작동하는지를 시나리오 문제로 종합한다.

종합일의 목표는 단순한 복습이 아니다. 오늘 파고들 것은 도구들 사이의 **이음새(seam)** 다 — 메트릭이 알람을 깨우고, 알람이 Composite로 묶이고, SNS로 사람을 부르고, 그 사람이 Logs Insights로 로그를 뒤지고, 로그에 박힌 correlation ID가 X-Ray 추적으로 이어지는 한 줄기. 옵저버빌리티(observability)라는 단어 자체가 제어이론(Kalman, 1960)에서 왔다 — 시스템이 "관측 가능(observable)"하다는 것은 **출력만 보고 내부 상태 전체를 재구성할 수 있다**는 뜻이다. CloudWatch 스택의 목적도 정확히 그것이다 — 외부 신호(메트릭·로그·추적)만으로 분산 시스템 내부에서 무슨 일이 벌어졌는지를 사후에 재구성하는 능력.

> 💡 **관련 이론**: "모니터링"과 "옵저버빌리티"는 다른 층위다. 모니터링은 **미리 아는 질문**에 답한다("CPU가 80%를 넘었나?"). 옵저버빌리티는 **예상 못 한 질문**에 사후 답하는 능력이다("왜 유독 한국 안드로이드 사용자 결제만, 화요일 오후에만 실패하나?") — 장애 전엔 떠올릴 수조차 없는 질문이다. Charity Majors가 정식화한 이 구분의 핵심은 "고카디널리티 데이터를 임의로 슬라이스할 수 있어야 한다"이고, 그래서 옵저버빌리티는 로그·이벤트의 차원성에 의존한다. 메트릭(저카디널리티)=모니터링, 로그·추적(고카디널리티)=옵저버빌리티로 매핑하면 도구 선택이 명료해진다.

## Week 10 핵심 압축

**Day 1 — Metrics.** 메트릭의 정체성은 namespace+name+dimensions 전체 조합이고, 차원 카디널리티가 곧 메트릭 수이자 비용이다(Prometheus 시리즈와 동일). EMF는 Lambda/ECS에서 메트릭 API 호출 0으로 로그/메트릭을 통합한다. 알람은 "M out of N" + treat-missing-data라는 디바운싱 모델이라 지표 의미에 따라 missing 처리를 정반대로 골라야 한다(sparse=notBreaching, 하트비트=breaching). Composite Alarm은 알람의 부울 대수로 증상 상관을 표현하고, Anomaly Detection은 계절성 분해로 임계값을 학습하며, Metric Math는 비율 파생 지표를 만든다.

**Day 2 — Logs.** Log Group(정책 단위)/Log Stream(순서 보장 단위)은 Kafka 토픽/파티션과 같은 절충이다. 기본 retention은 무제한이라 비용 함정이다. Subscription Filter는 로그를 실시간으로 Lambda/Kinesis/Firehose로 라우팅하고, Metric Filter는 외부 로그(NGINX)에서 메트릭을 뽑는다(EMF는 내 코드용, Metric Filter는 남의 형식용). Logs Insights는 풀스캔 엔진(스캔량 과금)이고, 비용 통제는 로그 레벨(양)+짧은 retention(시간)+S3 cold(저장소)의 조합이다.

**Day 3 — Workload Observability.** 세 기둥(로그·메트릭·추적)은 워크로드별 무게중심이 다르다. Container Insights는 DaemonSet 수집기로 클러스터/노드/파드 자원을 본다(ECS는 클러스터 설정, EKS는 에이전트 배포). Lambda Insights는 Extension 사이드카로 함수 동결 중에도 콜드 스타트 init을 측정한다. EMF의 다중 차원 조합은 OLAP 사전 집계처럼 집계 관점을 미리 만들고, 카디널리티는 비용의 핵심 변수라 ID·URL은 정규화하거나 로그로 보낸다.

**Day 4 — User Experience.** 능동(Synthetics)과 수동(RUM)은 보완 관계다. Synthetics Canary 5종(Heartbeat/API/Broken Link/Visual/GUI Workflow)은 외부에서 선제 측정하고, RUM은 Cognito 익명 자격으로 실사용자 Web Vitals를 수집한다. Evidently는 A/B 실험(베이지안)이지만 deprecation으로 AppConfig Feature Flag로 통합되는 방향이다.

> 💡 **관련 이론**: Week 10의 모든 도구를 관통하는 한 가지 프레임이 있다 — **MELT(Metrics, Events, Logs, Traces)** 또는 옵저버빌리티의 신호 분류다. 각 신호는 "카디널리티 대 집계"의 스펙트럼 위 다른 지점에 있다. 메트릭은 저카디널리티·고집계(싸고 빠른 알람), 로그/이벤트는 고카디널리티·저집계(비싸지만 상세), 추적은 인과 연결에 특화. 좋은 관찰성 설계는 "무엇을 메트릭으로, 무엇을 로그로, 무엇을 추적으로 둘지"를 카디널리티와 비용으로 판단하는 일이다. Week 10 내내 반복된 "ID는 로그 필드로, 저카디널리티만 차원으로"가 바로 이 원칙의 적용이다.

> 🔍 **더 깊이**: 인시던트 대응에서 이 도구들은 **MTTD(탐지)→MTTA(인지)→MTTR(복구)** 의 타임라인 위에 배치된다. Synthetics/Alarm은 MTTD를 줄이고(빨리 발견), Composite Alarm/SNS는 MTTA를 줄이며(정확히 알림, 노이즈 제거), Logs Insights/X-Ray/Lambda Insights는 MTTR을 줄인다(빠른 근본 원인 규명). 관찰성 투자의 목표는 결국 이 세 시간의 합을 줄이는 것이다. 어느 도구가 어느 단계를 줄이는지를 의식하면, 시나리오에서 "탐지가 늦다"면 Synthetics/알람 민감도를, "원인 규명이 늦다"면 추적/구조화 로그/correlation ID를 답으로 고르게 된다.

## 세 기둥을 하나의 표로 — 신호별 자리표

Week 10을 한 장으로 압축하면 다음 표가 된다. 시험장에서 "이 시나리오는 어느 신호인가"를 고를 때 이 표의 행을 머릿속에서 훑으면 답이 좁혀진다.

| 신호 | 카디널리티 | 비용 모델 | 주 용도 | AWS 도구 | 줄이는 시간 |
|------|-----------|----------|---------|----------|-----------|
| 메트릭 | 저(차원 제한) | 시계열 수 + 알람 수 | 임계 알람, 오토스케일 | CW Metrics, EMF, Anomaly Detection | MTTD |
| 로그 | 고(임의 필드) | 적재량 + 스캔량 + 보관 | 사후 상세 검색, 감사 | CW Logs, Insights, Subscription Filter | MTTR |
| 추적 | 고(요청 단위) | 추적 수 + 샘플링 비율 | 단계 간 인과, 병목 | X-Ray, ADOT | MTTR |
| 합성 모니터링 | 저(시나리오 수) | Canary 실행 수 | 외부 가용성, SLA | Synthetics | MTTD |
| 실사용자 모니터링 | 중(세션 단위) | 이벤트 수 | 체감 성능, Web Vitals | RUM | MTTD/진단 |

이 표의 핵심은 "비용 모델이 신호마다 다르다"는 것이다. 메트릭은 **차원을**, 로그는 **양·보관·스캔을**, 추적은 **샘플링을** 줄인다. 같은 "비용 절감"도 신호별 손잡이가 다르다는 사실이 시나리오의 단골 함정이다.

> 🔍 **더 깊이**: 왜 메트릭은 "저카디널리티"여야만 하는가? 시계열 DB는 각 고유 차원 조합마다 별도 메모리 인덱스 항목과 압축 청크를 유지한다. Prometheus가 죽는 가장 흔한 원인이 `user_id`·`request_id`를 label로 넣어 시리즈가 수백만 개로 터지는 "cardinality explosion"이다. CloudWatch는 OOM 대신 시계열당 과금으로 비용을 전가한다 — **차원=인덱스=메모리=돈**. "고카디널리티 식별자는 차원이 아니라 로그 필드로"는 취향이 아니라 자료구조의 강제다. 로그는 순차 append 후 풀스캔(schema-on-read)이라 카디널리티에 무관하게 받아낸다.

## 인시던트 라이프사이클 — 도구를 타임라인에 못 박기

도구를 외우는 것과 인시던트 흐름에 배치하는 것은 다른 능력이다. 장애 한 건을 타임라인으로 펼치면 Week 10의 모든 도구가 제 위치에서 한 번씩 등장한다. 가상의 결제 장애를 따라가 보자.

`T+0초`. 결제 Lambda의 다운스트림 DynamoDB가 throttle을 뱉기 시작한다. 사용자는 아직 모른다. `T+30초`. Synthetics API Canary가 결제 엔드포인트를 5분 주기로 찌르다가 5xx를 받는다 — 또는 5xx율 메트릭 알람이 "3 out of 5" 조건을 충족한다. **여기까지가 MTTD(탐지)** 다. `T+1분`. 5xx 알람과 지연 p99 알람이 Composite Alarm의 `AND`를 만족해 단 하나의 페이지가 온콜에게 SNS로 간다 — 개별 알람 노이즈가 아니라 "사용자가 실제로 영향받는 증상 조합" 하나만. **여기가 MTTA(인지)** 다. `T+3분`. 온콜이 Logs Insights를 열어 `filter @message like /ProvisionedThroughputExceeded/`로 원인을 좁히고, 로그에 박힌 correlation ID로 X-Ray 추적을 열어 "API GW→Lambda→DynamoDB" 중 DynamoDB 단계가 빨갛게 물든 것을 본다. **여기가 MTTR(복구)의 시작** 이다. `T+8분`. On-Demand 전환 또는 용량 증설로 복구. `T+1일`. 포스트모템에서 "DynamoDB 용량 알람이 없었다"는 예방 항목이 나와 새 알람과 Anomaly Detection 밴드가 추가된다.

이 타임라인의 교훈은 **각 도구가 줄이는 시간이 정해져 있다**는 것이다. "장애를 너무 늦게 알았다(MTTD)"면 Synthetics 주기·"M out of N"의 N을, "알람은 떴는데 뭐가 진짜인지 몰랐다(MTTA)"면 Composite·알람 통폐합을, "원인 찾는 데 한 시간 걸렸다(MTTR)"면 구조화 로그·correlation ID·X-Ray를 고른다.

> 📚 **사례**: 2017년 2월 AWS S3 us-east-1 대규모 장애. 엔지니어의 명령어 입력 실수로 의도보다 많은 서버가 제거돼 S3 인덱스 서브시스템 재시작에 4시간 가까이 걸렸다. 관찰성 측면 교훈이 유명하다 — **상태 대시보드(Service Health Dashboard) 자체가 S3에 의존해서, S3가 죽자 "S3가 죽었다"를 표시하지 못했다.** 관측 시스템이 관측 대상에 의존하면 정작 필요할 때 눈이 먼다. 그래서 통보 경로(SNS·상태 페이지)는 모니터링 대상과 blast radius가 분리돼야 한다. DOP 시험의 "모니터링 스택이 워크로드와 같은 리전·계정에 있을 때의 위험" 변형이 여기서 나온다.

## 능동 대 수동, 화이트박스 대 블랙박스 — 모니터링의 두 축

Week 10의 사용자 경험 파트(Synthetics·RUM)는 모니터링 분류학의 두 직교 축을 정확히 보여준다. 이 두 축을 분리해 두면 시나리오에서 도구가 즉시 갈린다.

| | 화이트박스(내부 신호) | 블랙박스(외부에서 본 증상) |
|---|---|---|
| **능동(synthetic·트래픽 무관)** | 계측된 헬스체크 엔드포인트 | Synthetics Canary |
| **수동(passive·실트래픽 의존)** | 애플리케이션 메트릭·로그·추적 | RUM, 외부 ISP 관점 |

화이트박스 모니터링은 "시스템 내부가 무엇을 아는가"를 본다(CPU, 큐 길이, 에러 카운터). 블랙박스는 "밖에서 보면 어떻게 보이는가"를 본다(HTTP 200을 받는가, 페이지가 2초 안에 뜨는가). 능동/수동 축은 "트래픽이 없어도 측정하는가(능동)" 대 "실사용자 트래픽에 얹혀 측정하는가(수동)"를 가른다.

Google SRE 책의 유명한 명제가 여기 걸린다 — **"증상 기반 알람(symptom-based)을 원인 기반(cause-based)보다 우선하라."** 사용자가 느끼는 증상(블랙박스: 느림, 에러)으로 알람을 걸고, 원인(화이트박스: CPU, 디스크)은 진단용으로 둔다. 왜냐하면 원인은 무수히 많고 계속 변하지만(어제는 CPU, 오늘은 디스크, 내일은 새 의존성), 사용자가 느끼는 증상은 적고 안정적이기 때문이다. "CPU 80% 알람"은 CPU가 80%여도 사용자가 멀쩡하면 거짓 양성(false positive)이고, 새벽 GC 때문에 울리는 단골 노이즈다. "결제 성공률 99% 미만 알람"은 무엇이 원인이든 사용자가 아프면 운다.

> ⚠️ **함정**: 그래서 "서버 메트릭은 다 녹색인데 사용자는 느리다"는 시나리오의 답은 거의 항상 **사용자·외부 관점 도구(RUM·Synthetics·Internet Monitor)** 다. 시스템 메트릭을 더 촘촘히 보자는 선택지는 화이트박스를 더 파라는 말인데, 문제는 블랙박스(네트워크 경로·CDN·DNS·클라이언트)에 있을 수 있다. 화이트박스가 전부 녹색이라는 사실 자체가 "원인이 화이트박스 밖에 있다"는 강한 신호다. 이 함정은 RUM 학습의 핵심 메시지이자 종합일 시나리오 10번의 뼈대다.

## 알람 노이즈와 경보 피로 — Composite Alarm의 진짜 가치

인시던트 대응에서 가장 과소평가되는 적은 장애 자체가 아니라 **경보 피로(alert fatigue)** 다. 온콜이 밤마다 의미 없는 페이지에 깨면, 진짜 페이지가 왔을 때 "또 거짓 알람이겠지" 하고 무시한다 — 이른바 "양치기 소년" 실패 모드. 의료 현장에서는 이것이 "alarm fatigue"라는 정식 환자안전 문제로, 모니터 알람의 85~99%가 임상적 조치가 불필요한 것으로 보고되어 간호사들이 알람을 끄거나 무시하다 사고로 이어진 사례가 다수 기록됐다(미국 Joint Commission이 2013년 국가 환자안전 목표로 지정).

소프트웨어 온콜도 구조가 같다. Composite Alarm의 가치는 단지 "AND/OR 조합"이라는 기능이 아니라, **개별 알람을 통보에서 분리해 노이즈를 죽이는 설계 패턴**에 있다. 개별 알람 10개가 각각 SNS를 때리면 장애 한 건에 페이지가 10번 온다. 대신 개별 알람은 무음(통보 없음)으로 두고 신호로만 쓰고, Composite Alarm 한 개에 "이것들이 이렇게 조합될 때만 사람을 부른다"를 부울 대수로 정의해 통보를 거기에만 건다. 장애 한 건에 페이지 한 번.

> 💡 **관련 이론**: 이것은 신뢰성 공학의 **신호 대 잡음(signal-to-noise)** 문제이자, 분산 알람을 부울 대수로 합성하는 일이다. 알람 하나하나가 명제 변수이고, Composite Alarm은 그 변수들의 논리식이다 — `(highErrorRate AND highLatency) OR diskFull`처럼. "M out of N" 평가는 각 명제에 시간적 디바운싱(temporal debouncing)을 더하는 것으로, 회로 설계의 스위치 채터링 제거(debounce)와 정확히 같은 발상이다. 또한 Composite Alarm의 **알람 억제(suppression)** 는 "상위 의존성 알람이 울리는 동안 하위 알람을 묻는다"로, 단일 근본 원인이 수십 개 하위 알람을 터뜨리는 "alert storm"을 막는다 — PagerDuty·Opsgenie의 alert correlation/deduplication을 AWS 네이티브로 구현한 것이다.

## 비용 통제의 세 손잡이 — 신호별로 다른 곳을 잡아라

관찰성은 공짜가 아니고, 대규모에서는 그 비용이 워크로드 비용에 근접하기도 한다. 시나리오는 종종 두 개의 독립된 비용 문제(운영 조회 + 장기 보관)를 섞어 "둘 다 푸는" 답을 요구한다.

로그 비용은 **세 손잡이의 곱**이다 — 로그 레벨(양: DEBUG를 끄면 적재량이 준다), retention(시간: 14일이면 보관비가 준다), 저장소 계층(S3 cold/Glacier로 cold path 분리). 핫(CloudWatch, 14일)과 콜드(S3+Glacier, 7년)를 나누고 드문 장기 조회는 Athena로 직접 쿼리하는 것이 컴플라이언스 보관의 표준 패턴이다. 메트릭 비용은 차원(카디널리티)이 손잡이고, 추적 비용은 샘플링 비율이 손잡이다. X-Ray는 보통 "고정 비율 샘플링 + 에러·고지연 전수 수집"으로, 정상 트래픽은 5%만 보되 비정상은 빠짐없이 잡는 절충을 쓴다.

> 💡 **관련 이론**: 핫/웜/콜드 데이터 계층화는 CPU의 L1/L2/L3 캐시→RAM→SSD→HDD→테이프로 내려가는 메모리 계층(memory hierarchy)과 동형이다. 관찰성에서 CloudWatch Logs(빠름·비쌈)→S3 Standard→Glacier→Deep Archive(느림·아주 쌈)가 그 계층이고, 접근 빈도에 따라 배치하는 원리는 캐싱의 지역성(locality)과 같다. retention 정책과 S3 Lifecycle은 계층 간 자동 강등(demotion) 규칙이다.

> ⚠️ **함정**: 로그 비용 절감을 "retention만 줄이면 된다"로 좁게 보는 것이 함정이다. retention은 **보관 시간** 손잡이일 뿐, 이미 적재되는 **양**은 그대로다 — CloudWatch Logs 과금의 큰 몫이 적재량(ingestion)이라, DEBUG를 초당 수만 줄 찍으면서 retention만 1일로 줄여도 적재비는 그대로 나간다. 진짜 절감은 로그 레벨(양)+retention(시간)+cold 계층(저장소) 세 손잡이의 조합이다.

## 통합과 연동 — 폴링에서 스트리밍으로

마지막 이음새는 CloudWatch를 외부 도구(Datadog, Splunk, Grafana, OpenSearch)와 잇는 방식이다. 여기서 반복되는 안티패턴이 **폴링(polling)** 이다. 외부 도구가 `GetMetricData`/`ListMetrics`를 주기적으로 호출해 메트릭을 끌어오면(pull), 메트릭 수가 많아질수록 API 호출 한도(throttling)에 걸리고 폴링 주기만큼 지연이 누적된다. 메트릭이 수십만 개면 한 번 다 끌어오는 데 분 단위가 걸리고, 그 사이 데이터는 이미 낡는다.

해법은 **푸시(push) 스트리밍** 이다. CloudWatch Metric Streams는 CloudWatch가 메트릭을 Kinesis Firehose로 거의 실시간(수 초 지연) 푸시하고, Firehose가 이를 외부 대상으로 흘린다. 폴링이 사라지므로 API throttling이 근본적으로 없어지고 지연이 분에서 초로 떨어진다. 로그도 같은 구조다 — Subscription Filter가 로그를 실시간으로 Lambda/Kinesis/Firehose로 푸시한다.

> 💡 **관련 이론**: pull 대 push는 모니터링 아키텍처의 근본 대립이다. Prometheus의 pull(스크레이프)은 "타깃 생존 자체가 헬스 신호"라는 장점과 "타깃 폭증 시 스크레이프 부하 폭증"이라는 단점을, push(StatsD, Metric Streams, OTLP)는 "수집기 확장이 쉽지만 침묵한 타깃이 죽은 건지 조용한 건지 구분이 어렵다"는 절충을 가진다. CloudWatch 외부 통합이 pull(GetMetricData)에서 push(Metric Streams)로 진화한 동인이 "대규모에서 pull은 API 한도에 막힌다"는 제약이다.

> 🎯 **시나리오**: 한 기업이 멀티 계정·멀티 리전 환경의 모든 CloudWatch 메트릭을 중앙 관측 계정의 Grafana 대시보드로 모으려 한다. 각 계정에서 cross-account `GetMetricData`로 폴링하자 계정이 늘수록 한도에 걸리고 대시보드가 1~2분 늦게 갱신된다. 해법은 각 소스 계정·리전에서 **Metric Streams → 중앙 Firehose → 중앙 저장소(또는 Grafana 데이터소스)** 로 푸시하는 구조다. 폴링 N개를 스트림 N개로 바꾸면 API 한도가 사라지고 지연이 초 단위로 떨어진다. "멀티 계정 관측 통합 + 폴링 지연/throttling" 조합이 보이면 Metric Streams를 떠올린다.

---

## 📝 연습 문제

**문제 1.** Lambda가 초당 수천 번 호출되며 주문 메트릭을 게시한다. PutMetricData를 매 호출 동기로 부르자 API throttling과 응답 지연이 동시에 발생했다. 가장 적절한 개선은?

A) 메트릭 차원만 줄여 PutMetricData 호출당 페이로드를 작게 만들어 TPS 한도 여유를 확보한다

B) EMF로 전환 — 로그에 메트릭을 임베드해 메트릭 API 호출을 0으로

C) High-Resolution Metric(1초 해상도)으로 전환해 게시 간격을 늘리고 버스트를 분산한다

D) PutMetricData를 비동기 워커 스레드로 옮겨 핫 패스의 응답 지연에서 분리한다

**정답: B**

해설: 핫 패스의 동기 PutMetricData는 계정·리전 TPS 한도에 걸려 throttling을 일으키고 호출 지연이 Lambda 실행 시간에 더해진다. EMF는 메트릭을 별도 API가 아니라 출력 로그 JSON의 `_aws` 블록에 임베드해 CloudWatch가 적재 시 자동 추출하므로, 메트릭 API 호출이 0이 되어 throttling과 지연이 동시에 사라진다. 차원 축소(A)는 부분 완화, High-Resolution(C)은 비용 증가, 비동기 스레드(D)는 Lambda 실행 모델상 실행이 끝나면 동결되어 백그라운드 스레드가 flush를 보장하지 못하므로 throttling 자체도 못 없앤다. EMF가 구조적으로 우월한 이유는 "메트릭을 보내는 행위" 자체를 "로그를 찍는 행위"로 흡수했기 때문이다.

---

**문제 2.** "외부 API의 5xx 비율이 1%를 넘으면서(AND) 지연 p99가 500ms를 넘을 때만" 온콜을 깨우고 싶다. 개별 지표가 잠깐 튈 때마다 깨우긴 싫다. 설계는?

A) 5xx 알람 하나만 두고 "5 out of 5" 조건으로 디바운스해 일시적 튐을 흡수한다

B) 5xx율 알람 + 지연 p99 알람을 만들고(Metric Math로 비율 계산), Composite Alarm `AND`로 결합해 통보는 Composite에만 건다

C) Lambda로 1분마다 두 지표를 폴링해 코드에서 AND 조건을 평가하고 SNS를 발행한다

D) Synthetics Canary로 5xx와 지연을 동시에 측정해 단일 Canary 알람으로 통보한다

**정답: B**

해설: 5xx "비율"은 Metric Math `(5xx/요청)*100`로 만들고, 지연 p99는 확장 통계 알람으로 만든 뒤, Composite Alarm의 `AND`로 "둘 다 위반"일 때만 페이지를 보낸다. 개별 알람은 신호로만 두고 Composite만 통보하면 노이즈가 줄고 "사용자가 실제로 영향받는 증상 조합"을 정의한다. 각 알람의 "M out of N"으로 일시적 튐도 디바운스한다 — 이는 회로의 스위치 채터링 제거와 같은 시간적 필터링이다. 단일 5xx 알람(A)은 지연 조건을 못 걸고, 폴링(C)·Synthetics(D)는 부적절하다. 이 패턴의 핵심은 "개별 알람을 통보에서 분리해 경보 피로를 막는다"는 설계 철학이다.

---

**문제 3.** 결제 실패 메트릭은 평소 0이라 데이터포인트가 아예 없다. 실패가 임계 이상일 때만 알람이 울려야 한다. 동시에 "하트비트가 끊기면(데이터 없음) 곧 장애"인 별도 지표도 있다. 각각의 `treat-missing-data`는?

A) 둘 다 breaching — 데이터 없음을 항상 위반으로 봐 누락 구간을 놓치지 않는다

B) 결제 실패=notBreaching, 하트비트=breaching

C) 둘 다 notBreaching — 데이터 없음을 항상 정상으로 봐 거짓 알람을 막는다

D) 둘 다 missing — 데이터 없음 시 직전 ALARM 상태를 그대로 유지하게 둔다

**정답: B**

해설: sparse 지표(결제 실패)는 데이터 없음이 정상이므로 `notBreaching`이라야 실패가 임계를 넘을 때만 ALARM이 된다(breaching이면 데이터가 없어 영구 ALARM에 갇힌다). 하트비트는 데이터 없음이 곧 장애 신호이므로 `breaching`이라야 끊김을 잡는다. 같은 "데이터 없음"이라도 지표 의미가 반대라 정반대로 설정하는 것이 핵심이다. 더 깊이 보면 이것은 "데이터의 부재(absence)를 어떻게 해석할 것인가"라는 의미론적 결정이며, 코드로 자동 추론할 수 없고 도메인 지식으로만 정할 수 있다 — sparse 카운터냐 연속 하트비트냐는 사람이 안다.

---

**문제 4.** 형식을 바꿀 수 없는 외부 NGINX 액세스 로그에서 5xx만 추출해 메트릭·알람으로 만들고, 동시에 그 로그 전체를 실시간으로 OpenSearch에도 적재하려 한다. 조합은?

A) EMF로 NGINX 로그를 `_aws` 블록 포함해 재작성한 뒤 메트릭 추출 + S3 export로 OpenSearch 적재

B) Metric Filter `[..., status_code=5*, ...]` + Alarm (5xx 메트릭), 그리고 Subscription Filter → Kinesis Firehose → OpenSearch (전량 적재)

C) Logs Insights를 5분마다 수동 실행해 5xx를 집계하고 결과를 OpenSearch로 색인

D) Lambda가 로그 그룹을 1분마다 폴링해 5xx를 세어 메트릭을 게시하고 전문을 OpenSearch에 적재

**정답: B**

해설: EMF는 내가 짜는 코드용이라 외부 NGINX 형식엔 못 쓴다(EMF는 schema-on-write로 내 출력에 `_aws` 블록을 넣는 것이라 남의 로그 형식엔 적용 불가). 두 목적을 각각의 도구로 푼다 — Metric Filter로 status_code 5* 라인에서 5xx 메트릭을 뽑아 알람을 걸고(적재 시점 추출, 즉각), Subscription Filter로 전량을 Firehose 통해 OpenSearch에 실시간 적재한다(검색용 역색인). 수동 Insights(C)는 실시간 알람이 아니고, 폴링(D)은 지연·비용·throttling 문제가 있다. 핵심 구분: Metric Filter는 "남의 형식에서 메트릭 추출", EMF는 "내 코드에서 메트릭 임베드".

---

**문제 5.** 수백 개 Lambda의 자동 생성 Log Group으로 로그 비용이 누적되고, 별도로 모든 로그를 7년 컴플라이언스 보관해야 한다. 운영 조회는 최근 2주면 충분하다. 설계는?

A) 모든 Log Group을 무제한 보존하고 Logs Insights로 7년치를 그때그때 조회

B) EventBridge로 새 Log Group 생성 감지→자동 retention 14일 적용, 동시에 Subscription Filter(전량)→Firehose→S3 보관, S3 라이프사이클로 Glacier 전환, 장기 조회는 Athena

C) 매일 스크립트로 로그를 수동 다운로드해 S3에 백업하고 원본은 즉시 삭제

D) 모든 로그를 OpenSearch 도메인에 7년 색인해 검색·보관을 단일 계층으로 통합

**정답: B**

해설: 두 문제를 분리해 푼다. 비용 누적은 EventBridge가 새 Log Group 생성(`CreateLogGroup` API 이벤트)을 감지해 Lambda로 자동 retention(14일)을 거는 자동화로 막는다 — 수백 개를 수동으로 설정하는 것은 비현실적이다. 7년 보관은 핫/콜드 계층화(메모리 계층 원리와 동형) — CloudWatch는 14일 운영 조회만, 전량은 Firehose로 S3에 흘려 Glacier/Deep Archive로 전환하고 드문 조회는 Athena로 직접 쿼리한다. 무제한 보존(A)·OpenSearch 7년(D)은 비용 과도(둘 다 핫 계층에 콜드 데이터를 둠), 수동(C)은 비현실적이다.

---

**문제 6.** EKS 클러스터의 파드별 CPU·메모리를 자동 수집하되, 작은 클러스터라 관찰성 비용을 의식하고 싶다. 또 Lambda 함수의 콜드 스타트 지연도 별도로 분석해야 한다. 각각의 도구는?

A) 둘 다 Container Insights — Lambda도 컨테이너 런타임이므로 동일 에이전트로 수집

B) EKS는 Container Insights(ADOT/CloudWatch Agent DaemonSet, 범위 한정), Lambda는 Lambda Insights(Extension Layer, init duration)

C) 둘 다 Lambda Insights — Extension Layer를 노드와 함수 양쪽에 붙여 통일

D) Synthetics Canary로 두 워크로드의 엔드포인트를 외부에서 찔러 자원·콜드스타트를 추정

**정답: B**

해설: EKS 파드 자원은 노드마다 DaemonSet으로 배포한 수집 에이전트가 cAdvisor/kubelet 데이터를 긁어 Container Insights로 보낸다. 작은 클러스터는 관찰성 비용이 워크로드를 넘을 수 있으니 핵심 네임스페이스만 켜는 식으로 범위를 좁힌다(관찰성 비용이 워크로드 비용에 근접하는 전형). Lambda 콜드 스타트는 Lambda Insights Extension이 함수 동결 중에도 init duration을 측정해 분석한다 — Extension은 함수와 별개 프로세스라 함수가 동결돼도 측정을 마무리한다. 두 워크로드는 각자 전용 Insights를 쓴다. 컨테이너는 DaemonSet(노드당 한 개), Lambda는 Extension(함수당 사이드카)이라는 배포 모델 차이가 핵심이다.

---

**문제 7.** 메트릭 차원에 URL `path`를 넣었는데 `/orders/{order_id}`처럼 주문 ID가 박혀 시계열이 폭발하고 비용이 급증했다. 근본 해법은?

A) 차원을 더 추가해 시계열을 여러 메트릭으로 분산시켜 단일 메트릭 부하를 낮춘다

B) path를 정규화 — 변수 부분을 `/orders/{id}` 플레이스홀더로 치환해 카디널리티를 유한하게, ID 자체는 로그 필드로

C) High-Resolution Metric으로 전환해 집계 단위를 잘게 쪼개 시계열당 저장 비용을 낮춘다

D) Composite Alarm으로 폭발한 시계열의 알람들을 하나로 묶어 비용을 통제한다

**정답: B**

해설: 경로에 ID가 박히면 요청마다 다른 차원값이 되어 무한 카디널리티가 된다 — 시계열 DB에서 각 고유 조합이 별도 인덱스 항목이므로 메모리이자 비용이다(Prometheus가 OOM으로 죽는 cardinality explosion과 같은 물리). 차원으로 쓰기 전 변수 부분을 `{id}` 플레이스홀더로 정규화하면 경로 패턴 수가 유한해지고, 정작 필요한 order_id별 조회는 메트릭이 아니라 로그 필드 + Logs Insights로 한다(로그는 풀스캔이라 카디널리티 무관). "저카디널리티만 차원, 고카디널리티는 로그"라는 Week 10의 핵심 원칙이자 자료구조의 강제다. 차원 추가(A)는 악화, 해상도(C)·Composite(D)는 무관하다.

---

**문제 8.** "외부에서 API 가용성을 5분마다 확인"(시나리오 X), "실사용자 LCP를 지역별로 실측"(시나리오 Y), "신기능을 10%에 노출해 전환율 통계 비교"(시나리오 Z). 각 시나리오의 도구는?

A) X=RUM, Y=Synthetics, Z=Synthetics

B) X=Synthetics, Y=RUM, Z=Evidently(또는 AppConfig+분석)

C) X=Evidently, Y=Synthetics, Z=RUM

D) 셋 다 Synthetics

**정답: B**

해설: X(외부·트래픽 무관 가용성)는 능동 프로브인 Synthetics Canary(블랙박스·능동), Y(실사용자 체감 Web Vitals)는 수동 모니터링인 RUM(블랙박스·수동), Z(변형 비교·통계 검증)는 A/B 실험인 Evidently(또는 AppConfig Feature Flag + 자체 분석)다. 능동/수동/실험이라는 세 패러다임이 각 시나리오에 정확히 대응한다. Google SRE의 "증상 기반 알람 우선" 관점에서 보면 X·Y는 모두 블랙박스(사용자가 보는 증상)를 측정하되, 능동(트래픽 없어도)이냐 수동(실트래픽에 얹혀)이냐로 갈린다.

---

**문제 9.** 시간대·요일별로 정상 범위가 변하는 비즈니스 지표(주문 수)에 정적 임계값을 걸었더니 새벽마다 거짓 알람이 난다. 그리고 트래픽이 10배로 늘며 X-Ray·메트릭 비용도 폭증했다. 두 문제의 해법은?

A) 임계값을 새벽 최저치 기준으로 낮춰 거짓 알람을 없애고 X-Ray 추적을 전부 비활성화해 비용을 잡는다

B) 주문 지표는 Anomaly Detection(계절성 학습 밴드)으로, 비용은 X-Ray 고정 비율 샘플링(5%)+에러 전수 수집 및 고카디널리티 차원의 로그 강등으로

C) 주문 알람과 비용 알람을 Composite Alarm으로 결합해 새벽 시간대 통보를 억제한다

D) 메트릭을 High-Resolution으로 전환해 새벽 변동을 더 촘촘히 포착하고 샘플링 정밀도를 높인다

**정답: B**

해설: 계절성 있는 지표는 정적 임계값으로 다룰 수 없으니 Anomaly Detection이 시간대·요일별 정상 밴드를 학습해 이탈만 알람한다(시계열의 계절성 분해 — trend/seasonality/residual로 분리해 residual의 이상만 잡음). 비용 폭증은 "전수→표본+예외 전수"로 — X-Ray를 5% 샘플링하되 에러·고지연은 높은 비율로 별도 수집하고, UserId·OrderId 같은 고카디널리티 차원을 로그 필드로 강등한다. 추적 전부 끄기(A)는 디버깅 능력(MTTR)을 통째로 잃는 과잉 대응이고, Composite(C)·High-Resolution(D)은 두 문제를 풀지 못한다. 핵심은 "비용 손잡이가 신호별로 다르다(추적=샘플링, 메트릭=카디널리티)"는 인식이다.

---

**문제 10.** 서버 메트릭(CPU·지연)은 전부 정상인데 특정 국가 사용자만 "느리다"고 한다. 진단 도구 조합은?

A) 서버 CPU·지연을 High-Resolution으로 더 촘촘히 모니터링해 숨은 마이크로 버스트를 찾는다

B) RUM 지역별 분리로 실측 + Internet Monitor로 ISP·인터넷 경로 도달성 확인 + 해당 리전 Synthetics Canary로 외부 재현

C) 해당 국가 트래픽을 처리하는 Lambda 메모리를 증설해 처리 지연을 줄인다

D) 지연·에러 알람을 Composite Alarm으로 묶어 지역별 증상 조합을 정의한다

**정답: B**

해설: 서버가 정상인데 특정 지역만 느린 건 애플리케이션 밖(네트워크 경로·CDN·DNS) 문제 가능성이 높다 — 화이트박스(시스템 내부)가 전부 녹색이라는 사실 자체가 "원인이 화이트박스 밖에 있다"는 강한 신호다. RUM 지역별 데이터로 어느 환경이 느린지 실측하고(블랙박스·수동), Internet Monitor로 그 지역 ISP·경로 도달성 문제를 가시화하며, 해당 리전 Synthetics로 외부에서 재현한다(블랙박스·능동). "사용자가 느낄 때는 시스템 메트릭이 아니라 사용자·네트워크 관점 도구로"가 핵심이며, 이는 Google SRE의 증상 기반 진단 원칙과 일치한다. 서버 메트릭 강화(A)·메모리(C)·알람(D)은 외부 경로 문제와 무관하다.

---

**문제 11.** 한 요청이 API Gateway→Lambda→SQS→다른 Lambda→DynamoDB를 거친다. 장애 시 "어느 요청의 로그가 어느 단계 것인지" 연결되지 않아 근본 원인 규명(MTTR)이 길다. 가장 직접적인 개선은?

A) 모든 단계의 로그 레벨을 DEBUG로 올려 단계별 상세 로그를 남겨 수동으로 시간순 대조한다

B) Powertools 등으로 correlation ID를 모든 로그·메트릭·추적에 주입해 한 요청의 신호를 묶고, X-Ray로 단계 간 인과를 추적

C) 각 단계 로그 그룹의 retention을 늘려 과거 요청까지 거슬러 대조할 시간을 확보한다

D) 단계별 지연을 High-Resolution Metric으로 게시해 어느 단계가 느린지 시계열로 식별한다

**정답: B**

해설: 분산 시스템에서 신호를 한 요청으로 묶으려면 공통 correlation ID(W3C Trace Context의 `traceparent` 헤더가 운반하는 trace ID 계보)가 모든 로그·메트릭·추적에 박혀 있어야 한다. Powertools가 이를 데코레이터로 자동 주입하고 X-Ray가 단계 간 인과를 연결하면, 장애 시 "이 요청이 어디서 무엇 때문에 실패했나"를 빠르게 추적해 MTTR을 줄인다. SQS 같은 비동기 경계를 넘을 때 컨텍스트 전파가 끊기지 않도록 메시지 속성에 trace context를 실어야 한다는 점이 분산 추적의 까다로운 지점이다. DEBUG 상향(A)은 양만 늘려 오히려 건초더미를 키워 찾기 어렵고(신호 대 잡음 악화), retention(C)·해상도(D)는 연결 문제와 무관하다.

---

**문제 12.** 조직이 Datadog을 표준 관측 플랫폼으로 쓴다. 수십만 AWS 메트릭을 Datadog이 GetMetricData로 폴링하는데 API throttling과 분 단위 지연이 발생한다. 개선은?

A) 폴링 주기를 늘려 GetMetricData 호출 빈도를 낮춰 API 한도 압박을 줄인다

B) CloudWatch Metric Streams로 메트릭을 Firehose 통해 Datadog에 푸시 — 폴링 제거로 throttling·지연 해소

C) Datadog에 전달할 메트릭을 핵심 지표로 추려 폴링 대상 시계열 수 자체를 줄인다

D) 멀티 리전 메트릭을 단일 리전으로 통합해 cross-region 폴링 호출 수를 감축한다

**정답: B**

해설: 폴링 기반 통합(GetMetricData/ListMetrics)은 메트릭 수가 많으면 API 한도에 걸리고 지연이 누적된다 — pull 모델의 근본 한계로, Prometheus 스크레이프가 타깃 폭증 시 겪는 문제와 동형이다. Metric Streams는 CloudWatch가 메트릭을 Kinesis Firehose로 푸시하므로 폴링이 사라지고, 지연이 분 단위에서 수 초로 줄며, API throttling이 근본적으로 없어진다. "폴링→푸시 스트리밍" 전환이 핵심이다. 주기 증가(A)는 지연 악화, 메트릭 축소(C)는 가시성 손실, 리전 통합(D)은 무관하다. 같은 패턴이 멀티 계정·멀티 리전 중앙 관측 통합에도 그대로 적용된다.

---

## 📌 Week 10 마무리

이번 주의 한 문장 요약: **관찰성은 "무엇을 메트릭으로, 무엇을 로그로, 무엇을 추적으로, 무엇을 사용자 관점으로 둘지"를 카디널리티와 비용으로 판단하는 일이며, 그 도구들은 인시던트의 MTTD(Synthetics·알람)→MTTA(Composite·SNS)→MTTR(Insights·X-Ray·correlation ID) 타임라인 위에 배치된다.** 메트릭은 싸고 빠른 알람, 로그는 비싸지만 상세, 추적은 인과 연결, RUM/Synthetics는 사용자 현실 — 각자 자리를 알면 어떤 시나리오든 도구가 보인다.

그리고 종합일이 남긴 더 깊은 교훈 셋. 첫째, **모니터링(아는 질문)과 옵저버빌리티(모르는 질문)는 다른 층위**이고 후자는 고카디널리티 로그·추적에 의존한다. 둘째, **증상(블랙박스)으로 알람하고 원인(화이트박스)으로 진단하라** — 서버가 녹색인데 사용자가 아프면 답은 사용자·네트워크 관점에 있다. 셋째, **관측 시스템도 의존성과 비용을 가진다** — 관측 대상과 운명을 공유하면 정작 필요할 때 눈이 멀고, 비용은 신호마다 다른 손잡이(차원·양·샘플링)로 잡아야 한다.

## 🔜 Week 11 예고

**관찰성 심화 - X-Ray, ADOT, OpenSearch/Prometheus**

이번 주가 "신호를 모으고 보는" 기초였다면, Week 11은 분산 추적(X-Ray)으로 요청의 인과를 따라가고, OpenTelemetry(ADOT)로 벤더 중립 계측을 표준화하며, OpenSearch/Prometheus로 대규모 로그·메트릭 분석을 다룬다. 오늘 본 correlation ID(W3C Trace Context), pull 대 push, 카디널리티 관리, 세 기둥이 거기서 본격적으로 확장된다.

> 💪 Week 10 완료! 메트릭·로그·워크로드·사용자 경험을 한 줄기로 엮었다.
