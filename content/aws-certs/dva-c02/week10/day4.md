# Day 4 - CloudWatch 고급: 컨테이너, 합성 모니터링, 그리고 ML 이상 탐지

기본 지표와 알람은 "이미 일어난 문제"를 알려준다. CPU가 90%를 찍었을 때 알람이 울리지만, 그땐 사용자가 이미 느려진 서비스를 경험한 뒤다. 모니터링의 다음 단계는 두 방향으로 진화한다. 하나는 **더 깊게** — 가상 머신 단위가 아니라 컨테이너 하나하나, 애플리케이션 SLO 수준까지 내려가는 것이고, 다른 하나는 **더 앞서** — 문제가 사용자에게 닿기 *전에* 합성 트래픽으로 먼저 감지하고, 정적 임계값 대신 ML이 학습한 정상 범위로 미묘한 이상을 잡아내는 것이다. CloudWatch의 고급 기능들 — Container Insights, Synthetics, Anomaly Detection, Dashboards — 은 정확히 이 "더 깊게, 더 앞서"라는 두 축 위에 있다.

DVA-C02 시험에서 이 영역은 "기본 CloudWatch로는 부족한 상황"의 답으로 나온다. ECS/EKS 컨테이너 모니터링, 엔드포인트 가용성의 능동적 확인, ML 기반 자동 임계값, 다중 계정 통합 뷰가 출제 포인트다. 이번 글은 컨테이너 모니터링이 왜 EC2 모니터링과 다른지, 합성 모니터링이 어떤 모니터링 철학의 전환인지, 그리고 Anomaly Detection이 통계적으로 무엇을 하는지를 깊이 들여다본다.

## 왜 컨테이너는 별도 모니터링이 필요한가: 추상화 계층의 추가

EC2 한 대를 모니터링하는 건 비교적 단순하다 — 인스턴스 하나에 지표가 붙는다. 그런데 ECS/EKS에서는 한 EC2 인스턴스(또는 Fargate 캐파시티) 위에 여러 컨테이너가 돌고, 그 컨테이너들은 태스크(task)로 묶이고, 태스크는 서비스(service)로 묶이고, 서비스는 클러스터(cluster)에 속한다. "CPU가 높다"는 사실만으로는 부족하다 — *어느 컨테이너의* CPU인가? 같은 호스트의 다른 컨테이너는 멀쩡한가? 이 계층 구조를 무시하고 호스트 수준 지표만 보면 "전체는 30%인데 특정 컨테이너가 100%를 치고 죽는" 상황을 놓친다.

**Container Insights**는 이 컨테이너 계층 구조에 맞춰 지표를 수집·집계한다. 클러스터 → 서비스 → 태스크 → 컨테이너 각 레벨에서 CPU·메모리·네트워크·디스크를 보고, 태스크가 몇 개 떠 있는지(desired vs running) 같은 오케스트레이션 지표까지 포함한다.

```bash
aws ecs update-cluster-settings \
    --cluster my-cluster \
    --settings name=containerInsights,value=enabled
```

> 💡 **관련 이론**: 컨테이너 모니터링이 어려운 근본 이유는 컨테이너가 **수명이 짧고(ephemeral) 동적**이기 때문이다. EC2 인스턴스는 며칠~몇 달 살지만 컨테이너는 분 단위로 생겼다 사라진다. Day 1에서 본 "폴링 모델이 클라우드에 안 맞는" 문제가 컨테이너에서 극대화된다 — 모니터링 대상이 끊임없이 바뀐다. 그래서 쿠버네티스 생태계는 서비스 디스커버리와 결합한 라벨 기반 식별(컨테이너의 이름이 아니라 라벨로 "결제 서비스의 모든 컨테이너"를 묶음)을 발전시켰다. Container Insights도 이 동적 환경에 맞춰, 개별 컨테이너 ID가 아니라 서비스·태스크 정의 단위로 지표를 집계해 "컨테이너가 교체돼도 추세는 연속"이 되게 한다.

> 🔍 **더 깊이**: Container Insights와 Managed Prometheus(AMP)의 선택은 Day 1에서 본 푸시 대 풀의 연장이다. Container Insights는 CloudWatch Agent(또는 Fargate의 경우 AWS가 관리하는 수집기)가 지표를 CloudWatch로 *푸시*하고 CloudWatch에서 보는 통합형이다. AMP는 쿠버네티스 표준인 Prometheus가 컨테이너의 `/metrics` 엔드포인트를 *스크랩(풀)* 하고 Grafana(AMG)로 시각화하는, CNCF 생태계 표준을 그대로 따르는 방식이다. "AWS 안에서 간단히"면 Container Insights, "기존 Prometheus/Grafana 자산이 있거나 쿠버네티스 표준 도입"이면 AMP — 이 선택 기준이 시험에 가끔 나온다.

## 합성 모니터링: 사용자를 기다리지 않고 먼저 두드린다

전통적 모니터링은 **수동적(passive)** 이다 — 실제 트래픽이 들어와야 지표가 생기고, 그 지표로 문제를 안다. 그런데 새벽 3시에 트래픽이 없으면? 엔드포인트가 죽어 있어도 아무도 그 죽음을 모른다. 첫 사용자가 아침에 접속해 에러를 만나야 비로소 알람이 울린다. **CloudWatch Synthetics**는 이 수동성을 뒤집어, 실제 사용자가 없어도 가짜 사용자(canary)가 주기적으로 엔드포인트를 두드려 가용성을 *능동적(active)* 으로 확인한다.

```javascript
const synthetics = require('Synthetics');
const apiCanaryBlueprint = async function () {
    const response = await synthetics.executeHttpStep('Health Check', {
        hostname: 'api.myapp.com', method: 'GET',
        path: '/health', port: 443, protocol: 'https:'
    });
    if (response.statusCode !== 200) {
        throw new Error(`상태 확인 실패: ${response.statusCode}`);
    }
};
exports.handler = async () => await apiCanaryBlueprint();
```

> 💡 **관련 이론**: "카나리(canary)"라는 이름은 탄광의 카나리아에서 왔다. 광부들은 유독가스에 민감한 카나리아를 갱도에 데려가, 새가 쓰러지면 자기들이 당하기 전에 대피했다 — 사람보다 *먼저* 위험을 감지하는 조기 경보다. 합성 모니터링의 카나리도 같다. 실제 사용자가 장애를 겪기 전에 합성 카나리가 먼저 그 장애를 만나 알람을 울린다. 이 "능동적 합성 트랜잭션"은 모니터링 분야에서 black-box monitoring(시스템 내부가 아니라 외부에서 본 동작을 검증)으로 분류되며, 내부 지표만 보는 white-box monitoring과 상보적이다. 내부 지표는 "왜 고장났나"에, 합성 모니터링은 "사용자 관점에서 고장났나"에 강하다.

> ⚠️ **함정**: Synthetics와 Route 53 Health Check를 혼동하기 쉽다. Route 53 Health Check는 단순 핑/HTTP 상태 코드 확인(엔드포인트가 살아 있나)에 가깝고 주로 DNS 페일오버 트리거에 쓰인다. Synthetics는 Lambda 기반으로 *스크립트*를 실행해 다단계 사용자 흐름(로그인 → 검색 → 구매)까지 검증하고 스크린샷·끊어진 링크까지 잡는다. "단순 가용성 ping"이면 R53, "사용자 트랜잭션·다단계 흐름 검증"이면 Synthetics다. 또 Synthetics 카나리 자체가 Lambda(Node.js/Python) 위에서 돈다는 점도 출제된다.

> 📚 **사례**: Synthetics의 Blueprint들은 실무 시나리오를 그대로 반영한다 — Heartbeat(단일 URL 가용성), API canary(REST 응답 검증), Broken link checker(페이지의 죽은 링크 탐지), Visual monitoring(스크린샷 픽셀 차이로 레이아웃 깨짐 감지), Canary Recorder(브라우저 동작을 녹화해 코드 생성). 특히 Visual monitoring은 "API는 200을 반환하는데 CSS가 깨져 화면이 망가진" 상황 — 지표상으론 정상인데 사용자 눈엔 고장 — 을 잡는다. 이는 "기술적으로 작동 ≠ 사용자에게 정상"이라는 합성 모니터링의 존재 이유를 잘 보여준다.

## Anomaly Detection: 정적 임계값을 넘어선 통계적 정상 범위

"CPU 80% 초과 시 알람"이라는 정적 임계값은 단순하지만 두 가지 약점이 있다. 첫째, 트래픽이 시간대·요일에 따라 변하면 단일 임계값이 안 맞는다 — 낮엔 70%가 정상이지만 새벽엔 30%만 돼도 비정상일 수 있다. 둘째, "80%는 안 넘었지만 평소보다 비정상적으로 높은" 미묘한 이상을 못 잡는다. **CloudWatch Anomaly Detection**은 ML로 지표의 정상 패턴을 학습해, 고정된 선이 아니라 "예상 범위 밴드"를 만들고 그걸 벗어날 때 알람을 울린다.

```bash
aws cloudwatch put-anomaly-detector \
    --namespace AWS/Lambda --metric-name Duration \
    --dimensions Name=FunctionName,Value=my-function --stat Average
```

> 🔍 **더 깊이**: Anomaly Detection이 학습하는 건 지표의 **계절성(seasonality)** 과 **추세(trend)** 다. 시계열 분석에서 데이터는 보통 세 성분으로 분해된다 — 추세(장기적 증가/감소), 계절성(매일·매주 반복되는 주기), 잔차(나머지 노이즈). Anomaly Detection은 과거 데이터에서 일별·주별 반복 패턴을 학습해 "지금 이 시각·이 요일이라면 값이 대략 이 범위일 것"이라는 예측 밴드를 만든다. 그래서 새벽의 낮은 트래픽과 점심의 높은 트래픽을 각각 정상으로 인식하고, 같은 50%라도 새벽엔 이상으로 낮엔 정상으로 다르게 판단한다. 이는 Holt-Winters 지수 평활이나 SARIMA 같은 고전 시계열 예측 기법과 같은 계열의 아이디어다. 단, 패턴이 일정한 지표(주기적 트래픽)에 효과적이고, 무작위로 튀는 지표엔 밴드가 넓어져 쓸모가 줄어든다.

## 지표를 조합하고 외부로 흘리기: Metric Math와 Metric Stream

원시 지표만으로는 답이 안 나오는 질문이 있다. "성공률은 몇 %인가?"는 단일 지표가 아니라 `성공 수 / 전체 수 × 100`이라는 계산이 필요하다. **Metric Math**는 여러 지표를 수식으로 조합해 새 지표를 만든다.

```
m1 = SuccessCount
m2 = TotalRequests
expression: m1 / m2 * 100   # 성공률(%)
```

반대로 CloudWatch에 모인 지표를 *외부로 흘려보내야* 할 때도 있다. **Metric Stream**은 지표를 거의 실시간으로 Kinesis Data Firehose를 거쳐 S3·Datadog·Splunk 등 외부 도구로 스트리밍한다.

> 💡 **관련 이론**: Metric Math가 알람에서 중요한 이유는 "비율 기반 알람"이 절대값 알람보다 견고하기 때문이다. "에러 100건 초과"라는 절대 임계값은 트래픽이 10배 늘면 정상 상태에서도 쉽게 넘지만, "에러율 1% 초과"는 트래픽 규모와 무관하게 의미가 일정하다. 그래서 SRE 실무에서는 SLO를 절대 카운트가 아니라 비율(가용성 99.9%, 에러율 0.1% 미만)로 정의하고, 이걸 Metric Math로 계산해 알람에 건다. "정규화된 지표가 절대 지표보다 안정적"이라는 건 모니터링 설계의 일반 원칙이다.

> 📚 **사례**: Metric Stream은 "AWS 안에서 다 보지 말고 우리 회사 표준 모니터링 도구(Datadog 등)로 통합하라"는 조직 요구에서 나왔다. 예전엔 CloudWatch 지표를 외부로 가져가려면 `GetMetricData` API를 주기적으로 폴링해야 했고, 이건 지연·비용·API 한도 문제가 있었다. Metric Stream은 푸시 방식으로 지표가 생기는 대로 Firehose로 흘려보내, 외부 도구에 거의 실시간으로 도달하게 한다. 시험에서 "CloudWatch 지표를 외부 모니터링 도구로 거의 실시간 통합"이 보이면 Metric Stream이 정답이고, 로그를 외부로 보내는 Subscription Filter(Day 1)와 역할이 구분된다 — 전자는 지표, 후자는 로그다.

## Dashboards와 통합: 흩어진 신호를 한 화면에

마지막 축은 통합이다. **CloudWatch Dashboards**는 여러 서비스·여러 지표·알람 상태를 위젯으로 한 화면에 모은다. 더 나아가 **교차 계정·교차 리전 대시보드**는 여러 AWS 계정과 리전의 지표를 단일 뷰로 합친다 — 조직이 계정을 환경별(prod/staging)·팀별로 쪼개 운영할 때 필수다.

> 🔍 **더 깊이**: 모니터링 신호를 한 화면에 통합하는 흐름의 정점이 **CloudWatch ServiceLens**(X-Ray 추적 + 지표 + 로그를 서비스 맵 위에 결합)와 **Application Signals**(2024, 애플리케이션 SLO와 황금 신호 모니터링)다. 여기서 "황금 신호(Golden Signals)"는 Google SRE 책이 정의한 네 가지 핵심 지표 — 지연(latency), 트래픽(traffic), 에러(errors), 포화도(saturation) — 를 말한다. 이 넷만 잘 보면 대부분의 서비스 건강을 파악할 수 있다는 게 SRE의 경험칙이고, Application Signals는 OpenTelemetry 기반으로 이 황금 신호를 자동 수집해 "지표·추적·로그가 따로 노는" 파편화를 SLO 중심으로 통합한다. 모니터링의 진화 방향이 "개별 지표 나열"에서 "서비스 수준 목표(SLO) 중심"으로 옮겨가는 흐름을 보여준다.

## 정리하며

CloudWatch 고급 기능은 "더 깊게, 더 앞서"라는 두 축으로 정리된다. Container Insights는 동적이고 수명이 짧은 컨테이너 계층에 맞춰 깊이를 더하고, Synthetics는 사용자를 기다리지 않고 합성 카나리로 먼저 장애를 감지해 앞서간다. Anomaly Detection은 정적 임계값의 한계(시간대 변동, 미묘한 이상)를 ML이 학습한 계절성 밴드로 넘어서고, Metric Math는 절대값보다 견고한 비율 기반 알람을 가능케 한다. Metric Stream은 지표를 외부로, Dashboards와 ServiceLens·Application Signals는 흩어진 신호를 SLO 중심으로 통합한다 — 이 모든 게 결국 "사용자가 문제를 겪기 전에, 더 정확하게 안다"는 한 목표를 향한다.

다음 글에서는 Week 10 전체 — CloudWatch, X-Ray, CloudTrail, EventBridge — 를 시나리오 문제로 종합 점검한다.

---

## 📝 연습 문제

**문제 1.** ECS 클러스터에서 "전체 호스트 CPU는 30%인데 특정 컨테이너가 100%를 치고 재시작을 반복"하는 상황을 감지하려 한다. 적절한 것은?

A) EC2 기본 지표(호스트 CPU)만으로 충분

B) Container Insights를 활성화해 컨테이너/태스크/서비스 레벨 지표 수집

C) CloudTrail 활성화

D) X-Ray Annotation 추가

**정답: B**

해설: 호스트 수준 지표만 보면 "전체 평균 30%"에 가려 특정 컨테이너의 100% 스파이크를 놓친다. **Container Insights**는 클러스터 → 서비스 → 태스크 → 컨테이너 각 레벨로 지표를 집계해, 어느 컨테이너가 문제인지와 태스크 재시작 같은 오케스트레이션 지표까지 보여준다. 컨테이너는 수명이 짧고 동적이라 호스트 단위 모니터링으로는 부족하다는 게 핵심이다. A) 호스트 평균이 정상이라 함정에 빠진다.

---

**문제 2.** 새벽에 트래픽이 없을 때 결제 API 엔드포인트가 죽어도 아무도 모른다. 실제 사용자가 없어도 가용성을 능동적으로 확인하려면?

A) CloudWatch 기본 지표 알람

B) CloudWatch Synthetics 카나리로 주기적 합성 요청

C) CloudTrail Data Events

D) Container Insights

**정답: B**

해설: 전통적 지표 모니터링은 수동적이라 실제 트래픽이 있어야 문제를 안다. **Synthetics**는 합성 카나리(가짜 사용자)가 주기적으로 엔드포인트를 두드려, 실제 사용자가 없어도 가용성을 능동적으로 확인한다(탄광의 카나리아처럼 사람보다 먼저 감지). Lambda 기반으로 다단계 사용자 흐름·스크린샷·끊어진 링크까지 검증할 수 있다. A) 기본 지표는 트래픽이 없으면 데이터 자체가 없다.

---

**문제 3.** 트래픽이 시간대·요일별로 크게 변동하는 지표에 대해, 단일 정적 임계값 없이 "그 시각의 정상 범위"를 벗어날 때만 알람을 울리려 한다. 적절한 것은?

A) 정적 Threshold 알람을 여러 개 만든다

B) CloudWatch Anomaly Detection (ML 기반 예측 밴드)

C) Metric Filter

D) Composite Alarm

**정답: B**

해설: **Anomaly Detection**은 ML로 지표의 계절성(일별·주별 반복 패턴)과 추세를 학습해 "이 시각·이 요일이면 값이 대략 이 범위"라는 예측 밴드를 만들고, 그걸 벗어날 때 알람을 울린다. 그래서 새벽의 낮은 값과 낮의 높은 값을 각각 정상으로 인식한다. 정적 임계값은 시간대 변동을 반영 못 하고, 미묘한 이상("80%는 안 넘었지만 평소보다 비정상적으로 높음")도 못 잡는다. 단, 패턴이 일정한 지표에 효과적이다.

---

**문제 4.** "성공률 99% 미만이면 알람"을 구현하려 한다. SuccessCount와 TotalRequests 두 지표가 있다. 적절한 방법은?

A) 두 지표에 각각 알람을 건다

B) Metric Math로 `SuccessCount / TotalRequests * 100`을 계산해 그 결과에 알람

C) Anomaly Detection

D) Logs Insights 쿼리

**정답: B**

해설: 성공률은 단일 지표가 아니라 두 지표의 비율 계산이 필요하다. **Metric Math**가 여러 지표를 수식으로 조합해 새 지표(성공률)를 만들고, 거기에 알람을 건다. 비율 기반 알람은 절대값 알람보다 견고하다 — "에러 100건 초과"는 트래픽이 늘면 정상에서도 넘지만 "에러율 1% 초과"는 규모와 무관하게 의미가 일정하다. SRE가 SLO를 비율로 정의하는 이유다.

---

**문제 5.** 조직이 prod·staging·dev를 별도 AWS 계정으로 운영한다. 세 계정의 핵심 지표를 단일 화면에서 보려면?

A) 각 계정에서 따로 대시보드를 보고 수동 취합

B) CloudWatch 교차 계정(Cross-Account) 대시보드

C) 불가능, 계정마다 분리

D) 모든 지표를 S3로 내보내 직접 합친다

**정답: B**

해설: CloudWatch는 **교차 계정·교차 리전 대시보드**를 지원해, 여러 계정·리전의 지표를 단일 뷰로 통합한다(Organizations 또는 명시적 계정 공유 설정 필요). 조직이 환경·팀별로 계정을 쪼개 운영할 때 모니터링을 한 화면으로 모으는 표준 방법이다. A·D는 불필요하게 수동적이고, C는 틀렸다.

---

**문제 6.** CloudWatch 지표를 회사 표준 모니터링 도구(Datadog)로 거의 실시간 통합하려 한다. 가장 적절한 것은?

A) GetMetricData API를 주기적으로 폴링

B) Metric Stream으로 Kinesis Data Firehose를 거쳐 외부로 푸시

C) Logs Subscription Filter

D) CloudTrail

**정답: B**

해설: **Metric Stream**은 지표가 생기는 대로 푸시 방식으로 Firehose를 거쳐 외부(S3/Datadog/Splunk)로 거의 실시간 스트리밍한다. 예전의 `GetMetricData` 폴링(A)은 지연·비용·API 한도 문제가 있어 실시간 통합에 부적합하다. C) Subscription Filter는 *로그*를 외부로 보내는 것이고 Metric Stream은 *지표*를 보낸다 — 둘의 역할이 구분된다.

---

**문제 7.** 기존 쿠버네티스(EKS) 환경에 이미 Prometheus/Grafana 운영 경험과 자산이 있는 팀이 컨테이너 모니터링 표준을 정하려 한다. Container Insights 대신 고려할 옵션과 그 이유는?

A) 무조건 Container Insights가 낫다

B) Amazon Managed Prometheus(AMP) + Managed Grafana(AMG) — 쿠버네티스 표준(스크랩/풀)을 그대로 따르고 기존 자산 재활용

C) X-Ray로 대체

D) CloudTrail로 컨테이너 모니터링

**정답: B**

해설: Container Insights는 CloudWatch로 푸시·통합하는 AWS 네이티브 방식이고, **AMP+AMG**는 Prometheus가 컨테이너 `/metrics`를 스크랩(풀)하고 Grafana로 보는 CNCF 표준 방식이다. 이미 Prometheus/Grafana 자산과 경험이 있다면 AMP+AMG가 학습 곡선과 호환성에서 유리하다. "AWS 안에서 간단히"면 Container Insights, "쿠버네티스 표준·기존 Prometheus 재활용"이면 AMP — 푸시 대 풀의 선택이다.
