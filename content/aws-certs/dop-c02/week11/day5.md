# Day 5 - Week 11 종합: 옵저버빌리티 추적·텔레메트리의 실전 의사결정

Week 11은 옵저버빌리티의 세 기둥 중 **추적(tracing)**을 중심으로, 그것을 표준화하는 텔레메트리 파이프라인(ADOT)과 데이터가 흘러 들어가는 백엔드들(OpenSearch·AMP·AMG)까지 한 줄로 꿰었다. 오늘은 다섯 날의 개념을 흩어진 사실이 아니라 **하나의 의사결정 체계**로 재구성한다. 시험은 "X-Ray가 무엇인가"를 묻지 않는다. "이 상황에서 trace가 끊긴 이유는", "이 비용 문제를 풀 샘플링 구성은", "이 멀티 클라우드 요구에 맞는 도구 조합은"을 묻는다. 그 판단을 연습하는 것이 오늘의 목표다.

## Week 11 핵심 재정리 — 다섯 개의 관통하는 원리

**1. 분산 추적은 context propagation 위에 선다.** X-Ray의 Trace/Segment/Subsegment는 Google Dapper(2010)의 trace-span 모델의 후손이고, 모든 마법은 Trace ID를 프로세스 경계 너머로 전파하는 것 하나에 달려 있다. 멀티 SDK 환경에서 trace가 끊기는 첫 번째 원인은 거의 항상 propagation 헤더 불일치(`X-Amzn-Trace-Id` vs W3C `traceparent`)다.

**2. 추적의 모든 것은 카디널리티와 비용의 균형이다.** Annotation은 인덱싱(검색 가능, 50개 제한, 저카디널리티), Metadata는 비인덱싱(상세). 샘플링은 Reservoir(저트래픽 보장) + FixedRate(초과분 비율)로 가시성과 비용을 동시에 잡는다. 고카디널리티는 trace·메트릭의 적이고 로그(역인덱스)의 친구다.

**3. 표준화가 벤더 락인을 푼다.** ADOT(OpenTelemetry)는 계측과 백엔드를 분리(의존성 역전)해, 코드는 한 번 계측하고 백엔드는 exporter 설정으로 자유롭게 바꾼다. Collector의 receiver-processor-exporter 파이프라인이 fan-out·가공·라우팅을 한곳에서 한다.

**4. 저장소 선택은 데이터 본질의 문제다.** 임의 텍스트 검색은 역인덱스(OpenSearch), 수치 시계열 집계는 TSDB(Prometheus/AMP). 둘은 자료구조가 근본적으로 달라 합칠 수 없다.

**5. 시각화는 백엔드와 분리된다.** AMG(Grafana)는 이질적 데이터 소스를 단일 대시보드로 묶는 중립 계층이고, EKS 관찰성 표준 스택은 ADOT + AMP + AMG다.

> 💡 **관련 이론**: Week 11을 관통하는 메타 원리는 **관심사의 분리(separation of concerns)**다. 추적은 계측(코드)과 수집(Daemon/Collector)과 저장(백엔드)과 시각화(Grafana)를 각각 독립 계층으로 나눈다. 이 분리 덕에 각 계층을 독립적으로 교체·확장할 수 있다 — SDK를 바꿔도 백엔드가 그대로고, 백엔드를 바꿔도 대시보드가 그대로다. 옵저버빌리티 아키텍처 전체가 OTel이 구현한 "계측-전송-저장-시각화"의 4계층 파이프라인이며, 이것이 모놀리식 관찰성 도구(한 벤더가 전부를 묶음)와의 근본적 차이다.

> 🔍 **더 깊이**: 옵저버빌리티의 "세 기둥"(metrics·logs·traces)이라는 표현은 사실 비판받는다. 세 신호를 별개로 다루면 상관관계를 사람이 맞춰야 하기 때문이다. 더 현대적인 관점은 **"하나의 넓은 이벤트(wide event)에서 세 신호를 파생"**하는 것이다(Week 10 Day 1의 EMF·canonical log line과 같은 사상). OTel이 logs·metrics·traces를 OTLP 하나로 통합하고 공통 trace ID·resource를 공유시키는 것이 이 방향이다. 시험에서 "trace에서 메트릭으로, 메트릭에서 로그로 드릴다운"이 자연스럽게 묻는 이유 — 세 신호가 같은 식별자로 묶여야 인시던트 조사가 빨라진다. 기둥이 아니라 직조(weave)로 보는 것이 성숙한 관점이다.

## 의사결정 트리 — 무엇을 언제 고르나

실전에서 도구를 고르는 질문 흐름:

```
Q1. 무슨 신호인가?
  ├─ 추적(trace) → X-Ray(AWS 단순) 또는 ADOT(멀티 백엔드)
  ├─ 메트릭(수치 시계열) → CloudWatch(AWS) 또는 AMP(Prometheus 생태계)
  └─ 로그(텍스트 검색) → CloudWatch Logs / OpenSearch(전문 검색)

Q2. 벤더 중립·멀티 클라우드가 필요한가?
  ├─ 예 → OpenTelemetry/ADOT + Prometheus/Grafana
  └─ 아니오(AWS만) → X-Ray + CloudWatch

Q3. 단일 대시보드로 여러 백엔드를 봐야 하나?
  └─ 예 → AMG(Grafana)로 데이터 소스 통합

Q4. 비용/가시성 균형은?
  └─ Reservoir(중요 경로 보장) + FixedRate(노이즈 비율) + Priority 분리
```

이 트리를 머릿속에 두면, 시나리오 문제의 키워드("멀티 클라우드", "Prometheus", "전문 검색", "코드 변경 없이", "trace가 끊긴다")가 곧바로 답으로 연결된다.

> 📚 **사례**: 한 조직이 X-Ray로 시작했다가 관찰성 도구를 Datadog으로 표준화하기로 결정했는데, 모든 마이크로서비스에 X-Ray SDK가 깊이 박혀 있어 마이그레이션 비용이 수개월로 추산됐다. 만약 처음부터 OpenTelemetry로 계측했다면 exporter 설정 한 줄(awsxray → datadog)로 끝날 일이었다. 교훈: **초기에 표준(OTel)으로 계측하는 작은 결정이 나중의 거대한 마이그레이션 비용을 좌우한다.** "지금 AWS만 쓴다"는 이유로 X-Ray SDK에 깊이 묶이면, 미래의 도구 변경이 코드 재작성이 된다. 락인 비용은 락인 시점이 아니라 탈출 시점에 청구된다.

## 통합 시나리오 — 다섯 날을 한 문제로

> 🎯 **종합 시나리오**: "글로벌 이커머스가 AWS EKS와 온프레미스 K8s를 함께 운영한다. (a) 결제 경로의 trace는 한 건도 놓치면 안 되고 헬스체크는 추적 제외, (b) 추적 도구를 미래에 바꿀 수 있어야 하며, (c) Pod 메트릭은 PromQL로, 애플리케이션 로그는 전문 검색으로 다루고, (d) AWS·온프레미스를 하나의 대시보드에서 회사 SSO로 본다. 전체 설계는?"
>
> **계측(Day 1·3)**: 모든 서비스를 OpenTelemetry로 계측(또는 auto-instrumentation)해 벤더 중립화 → 미래 도구 변경은 exporter 설정만. propagator는 W3C + X-Ray 호환 설정으로 trace 단절 방지.
>
> **수집(Day 3)**: EKS에 ADOT Collector를 DaemonSet(수집)+gateway(tail 샘플링) 2계층으로. agent가 Prometheus scrape·OTLP 수신, gateway가 "에러·고지연 trace 100% 유지" tail 샘플링.
>
> **샘플링(Day 2)**: 결제(`/checkout/*`)는 Priority 낮게 + Reservoir 크게 + Rate 1.0(전수), 헬스체크는 Reservoir 0 + Rate 0(제외), 나머지는 Default 5%.
>
> **저장(Day 4)**: 메트릭 → AMP(remote_write, PromQL), 로그 → OpenSearch(Subscription→Firehose, 역인덱스 전문 검색), trace → X-Ray(또는 미래엔 다른 백엔드).
>
> **시각화(Day 4)**: AMG에 AMP·OpenSearch·X-Ray·CloudWatch + 온프레미스 Prometheus를 데이터 소스로 연결, IAM Identity Center SSO. PromQL 공유로 AWS·온프레미스 단일 대시보드.
>
> 이 한 문제가 Week 11 전체를 관통한다 — 계측은 표준으로, 샘플링은 경로별 차등, 저장은 데이터 본질별, 시각화는 중립 계층으로.

---

## 🧠 시나리오 문제 12개

**문제 1.** 주문 서비스(X-Ray SDK)와 신규 결제 서비스(OpenTelemetry)를 함께 쓰는데 Service Map에서 주문→결제 구간 trace가 두 동강 난다. 가장 가능성 높은 원인과 해결은?

A) X-Ray trace retention(30일) 만료로 결제 구간만 소실 — 보존 기간을 연장해 연결 복원

B) context propagation 헤더 불일치(`X-Amzn-Trace-Id` vs W3C `traceparent`) — ADOT에 양쪽 propagator 설정으로 헤더 상호 변환

C) 결제 서비스 task role의 `xray:PutTraceSegments` 권한 부족 — IAM 정책에 X-Ray 쓰기 권한 추가

D) 결제 구간 샘플링 Rate가 0이라 segment 미수집 — 해당 규칙 Rate를 상향해 전수 수집

**정답: B**

해설: 멀티 SDK 환경에서 trace가 끊기는 첫 번째 실패 지점은 거의 항상 propagation 포맷 불일치다. X-Ray SDK는 `X-Amzn-Trace-Id`, OTel은 W3C `traceparent`를 기대하므로, 받는 쪽이 보낸 쪽 헤더를 이해 못 하면 부모 컨텍스트 복원에 실패해 새 trace로 시작하고 Service Map이 분리된다. ADOT Collector에 X-Ray·W3C propagator를 모두 두어 헤더를 양방향 변환하면 trace가 이어진다. retention·IAM·샘플링은 단절과 무관한 별개 문제다.

---

**문제 2.** "결제는 trace 전수 수집, 헬스체크는 완전 제외, 나머지는 비용을 위해 5%"를 X-Ray 샘플링으로 구성하려면?

A) 모든 규칙을 FixedRate 100%로 두고 헬스체크만 사후에 필터링해 비용을 사용량으로 통제

B) `/checkout/*`을 Priority 낮게(먼저 평가) Reservoir 크게 + Rate 1.0, `/health`를 Reservoir 0 + Rate 0, Default(Priority 9000) Rate 0.05

C) 모든 규칙 Reservoir 0 + Rate 0.05로 통일해 경로 무관하게 일정 비율만 수집

D) 경로별 X-Ray Group으로 분리해 Group마다 다른 수집 비율을 부여

**정답: B**

해설: 샘플링 규칙은 Priority 오름차순으로 평가되어 첫 매칭만 적용된다. 구체적 규칙을 낮은 Priority로 먼저 두어야 한다 — `/checkout/*`을 Reservoir 크게+Rate 1.0(전수), `/health`를 Reservoir 0+Rate 0(제외), 포괄 Default를 Priority 9000에서 5%로. 전부 100%(A)는 비용 폭증, 전부 Reservoir 0(C)은 가시성 상실, Group(D)은 샘플링이 아니라 Service Map 슬라이싱이다.

---

**문제 3.** "에러가 난 trace와 p99로 느린 trace는 반드시 100% 보존, 정상은 1%만"을 구현하려면?

A) X-Ray head-based 샘플링을 FixedRate 1%로 두고 에러는 별도 규칙 Rate 1.0으로 보강

B) ADOT Collector의 tail-based 샘플링(gateway 모드) — trace 완성 후 결과를 보고 에러·고지연만 유지

C) Reservoir를 크게 확대해 입구에서 더 많은 trace를 보장 수집한 뒤 에러를 가려낸다

D) 에러·지연을 High-Resolution Metric으로 게시해 이상 trace를 메트릭으로 대체 추적

**정답: B**

해설: X-Ray 네이티브는 head-based(입구에서 결정)라 결과를 모른 채 동전을 던지므로 "에러·느린 것만 유지"가 불가능하다. tail-based 샘플링은 trace 완성 시점에 결과(에러·지연)를 보고 선택하므로 이 요구를 정확히 푼다. tail 샘플링은 한 trace의 모든 span이 모여야 하므로 gateway 모드 Collector가 필요하다. FixedRate 1%(A)는 에러 trace의 99%를 무작위로 버린다.

---

**문제 4.** EKS Pod 메트릭(Prometheus 형식)을 수집해 PromQL로 쿼리하고 관리형으로 운영하려면?

A) CloudWatch 에이전트로 Pod 메트릭을 커스텀 메트릭으로 게시하고 Metrics Insights로 쿼리

B) ADOT Collector가 scrape → AMP에 remote_write → AMG에서 PromQL 쿼리

C) X-Ray로 Pod 요청을 추적해 segment에서 자원 사용량을 파생 집계

D) DynamoDB 시계열 테이블에 메트릭을 적재하고 PartiQL로 PromQL을 모사 쿼리

**정답: B**

해설: EKS Prometheus 메트릭의 표준 스택은 ADOT(scrape) + AMP(관리형 Prometheus, remote_write·PromQL) + AMG(Grafana 시각화)다. ADOT Collector가 Pod `/metrics`를 scrape해 AMP에 remote_write하고, AMG가 AMP를 PromQL로 쿼리한다. CloudWatch 커스텀 메트릭(A)은 Prometheus 생태계·PromQL과 단절되고, X-Ray(C)는 추적, DynamoDB(D)는 시계열 집계에 부적합하다.

---

**문제 5.** "수억 줄 애플리케이션 로그에서 특정 에러 메시지를 전문 검색"하려면 어떤 백엔드와 적재 경로가 표준인가?

A) Prometheus + PromQL — 로그를 카운터 메트릭으로 변환해 에러 메시지를 시계열로 질의

B) OpenSearch(역인덱스) + CloudWatch Logs Subscription Filter → Firehose → OpenSearch

C) X-Ray annotation에 에러 메시지를 인덱싱해 trace 검색으로 전문 조회

D) CloudWatch Metric Math로 로그 파생 메트릭을 조합해 에러 패턴을 수식 검색

**정답: B**

해설: 임의 텍스트 전문 검색은 역인덱스 엔진인 OpenSearch에 최적이다. 적재는 CloudWatch Logs에서 Subscription Filter로 실시간으로 빼내 Firehose(버퍼링·재시도)를 거쳐 OpenSearch 인덱스에 넣는 것이 표준이다. Prometheus(A)는 수치 시계열용이라 텍스트 검색에 부적합, X-Ray annotation(C)은 trace 검색으로 범위가 다르며, Metric Math(D)는 메트릭 수식이다.

---

**문제 6.** Lambda에 Active Tracing만 켰는데 함수 내부 DynamoDB·HTTP 호출 subsegment가 안 보인다. 원인은?

A) Lambda 실행 환경은 subsegment를 지원하지 않아 함수 segment까지만 기록된다

B) Active Tracing은 trace 시작·전파만 하고, 내부 호출 계측은 SDK instrumentation(`patch_all`/Powertools)을 별도로 해야 한다

C) Lambda에 X-Ray Daemon이 없어 subsegment 전송이 누락된다 — Daemon Layer 추가 필요

D) DynamoDB·HTTP 클라이언트는 X-Ray와 통합되지 않아 subsegment가 생성되지 않는다

**정답: B**

해설: Active Tracing(누가 trace를 시작하고 다운스트림에 ID를 전파하나)과 SDK instrumentation(내부를 얼마나 쪼개 보나)은 별개 스위치다. Active만 켜면 Lambda 호출 segment는 생기지만 내부 boto3·HTTP 호출을 subsegment로 잡으려면 `patch_all()`이나 Powertools Tracer로 계측해야 한다. Lambda는 subsegment를 지원하고(A 틀림) Daemon 불필요(C 틀림), DynamoDB도 X-Ray 통합된다(D 틀림).

---

**문제 7.** 한 다운스트림의 fault rate가 평소 0.1%에서 서서히 올랐지만 고정 임계값(5%) 아래라 CloudWatch 알람이 침묵했다. "절대값은 낮지만 평소 대비 비정상"을 잡으려면?

A) 알람 임계값을 1%로 하향해 더 낮은 fault rate 상승도 잡도록 민감도를 높인다

B) X-Ray Insights — baseline 학습으로 비정상 상승 탐지, EventBridge로 자동 알림

C) 샘플링 Reservoir를 확대해 더 많은 trace를 수집함으로써 미세 상승의 통계 신뢰도를 높인다

D) OpenSearch FGAC(세분화 접근 제어)로 fault 로그 접근을 강화해 이상 탐지 정확도를 개선

**정답: B**

해설: 고정 임계값은 "절대값은 낮지만 평소 대비 비정상"인 초기 열화를 놓친다. X-Ray Insights는 서비스별 정상 baseline(fault rate)을 학습해 baseline 대비 이상 상승을 탐지하고 Insight를 생성, EventBridge로 발행해 자동 알림·대응을 연결한다. 임계값 하향(A)은 정상 변동에도 거짓 알람을 폭증시킨다. baseline 탐지가 고정 임계값의 사각지대를 보완한다.

---

**문제 8.** 온프레미스 Jaeger에서 X-Ray로 추적을 옮기되, 기간 중 두 도구를 병행 검증하려면?

A) 모든 서비스를 한 번에 X-Ray SDK로 재작성하고 Jaeger를 즉시 제거해 전환을 단번에 끝낸다

B) ADOT Collector의 trace 파이프라인 exporter에 `awsxray`와 `otlp/jaeger`를 둘 다 두어 같은 trace를 양쪽에 fan-out, 검증 후 Jaeger 제거

C) 두 도구를 모두 끈 뒤 X-Ray만으로 새로 계측해 병행 부담 없이 처음부터 재구축한다

D) 각 서비스에 X-Ray Layer만 추가해 Jaeger와 무관하게 X-Ray 데이터를 별도 수집한다

**정답: B**

해설: Collector는 같은 데이터를 여러 exporter로 fan-out한다. trace 파이프라인에 `awsxray`와 `otlp/jaeger`를 함께 두면 동일 trace가 양쪽에 동시 전송되어 마이그레이션 기간 두 도구를 병행 검증할 수 있고, 검증 후 Jaeger exporter만 제거하면 무중단 전환이 된다. 한 번에 재작성(A)은 위험이 크다. exporter fan-out이 관찰성 도구 마이그레이션 위험을 극적으로 낮춘다.

---

**문제 9.** ReservoirSize를 10으로 했는데 같은 서비스가 100개 인스턴스에서 돈다. 실제 reservoir 수집량은?

A) 약 1000건/초 — 각 인스턴스가 ReservoirSize 10을 독립 적용해 100대면 10×100으로 합산

B) 약 10건/초 — reservoir는 계정·리전 전체에서 분산 조율되어 인스턴스 수와 무관하게 총합 유지

C) 약 0건 — 인스턴스가 많아 GetSamplingTargets 조율이 실패해 reservoir가 소진되지 못함

D) 인스턴스당 10건씩 독립 적용되되 X-Ray가 중복을 사후 제거해 실효 수집은 가변

**정답: B**

해설: X-Ray reservoir는 인스턴스 독립이 아니다. 각 SDK가 `GetSamplingTargets`로 X-Ray에 자기 몫의 할당량을 요청하고 X-Ray가 전체 reservoir(10)를 분배하므로, 100대가 돌아도 전체 reservoir 수집은 약 10건/초로 유지된다. 이 분산 조율을 모르면 수집량을 오해한다. 또 규칙 변경은 SDK 폴링(약 10초) 후 반영된다.

---

**문제 10.** Prometheus/AMP를 죽이는 가장 흔한 운영 사고와 단명 작업(Lambda·배치) 메트릭 누락의 해법은?

A) 카디널리티 폭발(고유값 많은 레이블); 단명 작업은 Pushgateway로 push 후 scrape

B) 디스크 부족; Lambda Layer로 해결

C) PromQL 오류; Reservoir로 해결

D) 인증 만료; UltraWarm으로 해결

**정답: A**

해설: Prometheus는 고유 레이블 조합마다 시계열을 만들어, `user_id`처럼 카디널리티가 수백만인 레이블을 넣으면 시계열이 폭발해 메모리가 터진다(CloudWatch high-cardinality 함정과 동일). 또 pull 모델이라 scrape 전에 죽는 단명 작업의 메트릭을 놓치는데, Pushgateway에 메트릭을 push해두면 Prometheus가 거기서 scrape해 회수한다. 고카디널리티 식별자는 레이블이 아니라 로그(역인덱스)로 보내야 한다.

---

**문제 11.** AWS(EKS)와 온프레미스 K8s 메트릭을 하나의 대시보드에서 회사 SSO로 보려면?

A) 두 환경을 VPN/Direct Connect로 같은 VPC에 합쳐 메트릭 수집기를 단일 네트워크에 통합

B) AMG에 AMP(AWS)와 온프레미스 Prometheus를 둘 다 데이터 소스로 연결, IAM Identity Center SSO — 둘 다 Prometheus 호환이라 같은 PromQL·대시보드 재사용

C) 온프레미스 메트릭을 CloudWatch 에이전트로 강제 적재해 CloudWatch 대시보드로 단일화

D) 온프레미스 K8s를 AWS EKS로 이전해 메트릭 소스를 AMP 하나로 통합

**정답: B**

해설: AMG(Grafana)는 백엔드 중립 시각화 계층이다. AMP와 온프레미스 Prometheus를 둘 다 데이터 소스로 연결하면, 둘 다 Prometheus 호환이라 같은 PromQL·대시보드를 재사용해 단일 화면에서 두 환경을 본다. 인증은 IAM Identity Center/SAML로 SSO. 표준(PromQL) 공유가 이질적 인프라 통합의 열쇠다. VPC 합병(A)·마이그레이션(D)은 불필요하게 과하다.

---

**문제 12.** EC2 애플리케이션이 X-Ray에 trace를 보내는 표준 경로와, Lambda가 다른 이유는?

A) 둘 다 애플리케이션이 X-Ray API(`PutTraceSegments`)를 직접 동기 호출해 segment를 전송

B) EC2는 로컬 X-Ray Daemon에 UDP로 던지고 Daemon이 배치 전송(사이드카, low overhead); Lambda는 X-Ray와 자동 통합되어 Daemon 불필요

C) 둘 다 segment를 S3에 적재하고 X-Ray가 S3를 폴링해 추적을 수집

D) EC2는 CloudTrail로 API 호출을 trace화하고 Lambda는 X-Ray API를 직접 호출

**정답: B**

해설: EC2·ECS·EKS는 애플리케이션이 로컬 X-Ray Daemon에 UDP(fire-and-forget)로 segment를 던지고 Daemon이 버퍼링·배치·재시도를 맡아 X-Ray에 전송한다 — Dapper의 low overhead 목표를 구현하는 사이드카 패턴이고, 추적 데이터의 손실 허용성 덕에 TCP가 아닌 UDP를 쓴다. Lambda는 실행 환경이 X-Ray와 자동 통합되어 Daemon이 필요 없다. 직접 동기 호출(A)은 본 요청에 네트워크 왕복을 더한다.

---

## 🔜 Week 12 예고

**인시던트 대응 자동화 — EventBridge, SSM Automation, Chatbot, Incident Manager**

Week 11에서 본 옵저버빌리티(이상을 어떻게 보느냐)는 다음 질문으로 이어진다 — **이상을 발견한 뒤 어떻게 자동으로 대응하느냐.** X-Ray Insights·CloudWatch Anomaly Detection이 만든 신호를 EventBridge가 받아 SSM Automation으로 자동 복구하고, Incident Manager로 온콜을 조율하며, Chatbot으로 ChatOps를 엮는 — 탐지에서 대응까지의 자동화 사슬을 Week 12에서 깊이 판다.

> 💪 Week 11 완료 — 옵저버빌리티의 추적·텔레메트리·백엔드를 하나의 의사결정 체계로 엮었다. Dapper의 trace 모델에서 OTel의 표준화, 역인덱스와 TSDB의 두 세계, Grafana의 중립 시각화까지. 다음은 이 신호들을 자동 대응으로 연결하는 인시던트 자동화다.
